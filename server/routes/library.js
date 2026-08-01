import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import axios from 'axios';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getIgdbHeaders } from '../igdb.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_FILE  = path.join(__dirname, '../data/users.json');
const CACHE_FILE  = path.join(__dirname, '../data/library-cache.json');

async function loadUsers() {
  try { return JSON.parse(await fs.readFile(USERS_FILE, 'utf-8')); } catch { return []; }
}
async function saveUsers(u) { await fs.writeFile(USERS_FILE, JSON.stringify(u, null, 2)); }
async function loadCache() {
  try { return JSON.parse(await fs.readFile(CACHE_FILE, 'utf-8')); } catch { return {}; }
}
async function saveCache(c) { await fs.writeFile(CACHE_FILE, JSON.stringify(c, null, 2)); }

// IGDB game_type values we treat as reviewable "real games":
// 0 main_game, 4 standalone_expansion, 8 remake, 9 remaster, 10 expanded_game, 11 port.
// (Excludes DLC=1, expansion=2, bundle=3, mod=5, episode=6, season=7, pack=13, update=14.)
// IGDB's old `category` field is deprecated in favour of `game_type`.
const MAIN_CATEGORIES = '(0,4,8,9,10,11)';

// Strip edition/version suffixes so "Anno 1404: Gold Edition" matches the base game.
function cleanTitle(name = '') {
  const cleaned = name
    .replace(/®|™|©/g, '')
    .replace(/[:\-–—]?\s*(ultimate|deluxe|gold|complete|definitive|premium|enhanced|legendary|anniversary|collector'?s|special|standard|digital|game of the year|goty)\s+(edition|bundle|collection|pack)\b/gi, '')
    .replace(/[:\-–—]?\s*(game of the year|goty)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || name;
}

// Owned-list entries that aren't really games to review (soundtracks, demos, DLC…).
const JUNK_RE = /(soundtrack|\bost\b|art\s?book|artbook|wallpaper|\bdemo\b|\bsdk\b|dedicated server|season pass|\bdlc\b|bonus content|upgrade pack)/i;
function isJunk(name = '') { return JUNK_RE.test(name); }

// Collapse duplicate owned entries (base game + its editions) that resolve to the
// same IGDB game, summing playtime so nothing is lost.
function dedupeByIgdb(list) {
  const seen = new Map();
  const out = [];
  for (const g of list) {
    if (g.igdbId == null) { out.push(g); continue; }
    const existing = seen.get(g.igdbId);
    if (existing) { existing.playtime = (existing.playtime || 0) + (g.playtime || 0); continue; }
    seen.set(g.igdbId, g);
    out.push(g);
  }
  return out;
}

// Fetch Steam owned games sorted by playtime
async function fetchSteamGames(steamId, apiKey) {
  const { data } = await axios.get(
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1&format=json`
  );
  const games = data.response?.games;
  if (!games) throw new Error('Steam library is empty or private. Set Game Details to Public in Steam Privacy Settings.');
  return games.sort((a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0));
}

const norm = (s = '') => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

// Search IGDB for one title and return the single best base-game match.
// NOTE: IGDB's `search` command does NOT work inside /multiquery (it silently
// returns []), so we query the /games endpoint per title. `search` ranks by
// relevance; we then prefer an exact name match to the cleaned title so e.g.
// "ELDEN RING" picks "Elden Ring" over "Elden Ring Nightreign".
async function searchIgdbGame(rawName, headers) {
  const cleaned = cleanTitle(rawName);
  const safe = cleaned.replace(/"/g, '').replace(/[^\w\s\-.:&!]/g, '').trim();
  if (!safe) return null;

  const body = `search "${safe}"; fields id,name,cover.image_id,genres.name,first_release_date; where cover != null & game_type = ${MAIN_CATEGORIES}; limit 8;`;
  const { data } = await axios.post('https://api.igdb.com/v4/games', body, { headers });
  if (!data?.length) return null;

  const target = norm(cleaned);
  const exact = data.find((g) => norm(g.name) === target);
  return exact ?? data[0]; // exact title match, else top-ranked result
}

const toCacheEntry = (hit) => ({
  igdbId: hit.id,
  cover: hit.cover?.image_id ?? null,
  genres: hit.genres?.map((x) => x.name) ?? [],
  year: hit.first_release_date ? new Date(hit.first_release_date * 1000).getFullYear() : null,
});

// Fast path: match up to 10 titles in ONE multiquery via IGDB's case-insensitive
// EXACT name operator (`name ~ "title"`). `search` doesn't work in multiquery, but
// exact-name does — and it resolves the base game for most titles in one request.
async function matchExactBatch(chunk, nameOf, headers) {
  const body = chunk.map((g, i) => {
    // Preserve apostrophes/colons for exact matching, but strip characters that
    // would break the apicalypse query. Empty titles get a sentinel (→ no match).
    const term = cleanTitle(nameOf(g)).replace(/["\\;{}\r\n]/g, '').trim() || '__nomatch__';
    return `query games "q${i}" { fields id,name,cover.image_id,genres.name,first_release_date; where name ~ "${term}" & cover != null & game_type = ${MAIN_CATEGORIES}; limit 1; };`;
  }).join('\n');
  const { data } = await axios.post('https://api.igdb.com/v4/multiquery', body, { headers });
  return data; // [{ name: "q0", result: [...] }, ...]
}

// Run async work in rate-limited waves (≈4 IGDB requests/sec).
async function inWaves(list, size, worker) {
  for (let i = 0; i < list.length; i += size) {
    const started = Date.now();
    await Promise.all(list.slice(i, i + size).map(worker));
    if (i + size < list.length) {
      const wait = Math.max(0, 1000 - (Date.now() - started));
      if (wait) await new Promise((r) => setTimeout(r, wait));
    }
  }
}

// Enrich owned games with IGDB matches, caching each result. Two passes:
//   1) batched exact-name matching (10 games/request) — fast, handles most titles
//   2) per-game relevance `search` for the leftovers — accurate, slower
async function enrichItems(items, cache, keyOf, nameOf) {
  const headers = await getIgdbHeaders();
  const unmatched = items.filter((g) => !(keyOf(g) in cache)).slice(0, 200);
  if (!unmatched.length) return cache;

  // ── Pass 1: fast batched exact-name matching ──
  const misses = [];
  const chunks = [];
  for (let i = 0; i < unmatched.length; i += 10) chunks.push(unmatched.slice(i, i + 10));

  await inWaves(chunks, 4, async (chunk) => {
    try {
      const results = await matchExactBatch(chunk, nameOf, headers);
      chunk.forEach((g, idx) => {
        const hit = results.find((r) => r.name === `q${idx}`)?.result?.[0];
        if (hit) cache[keyOf(g)] = toCacheEntry(hit);
        else misses.push(g);
      });
    } catch {
      misses.push(...chunk); // whole batch failed → try the search fallback
    }
  });

  // ── Pass 2: accurate per-game search fallback (bounded to keep loads snappy) ──
  await inWaves(misses.slice(0, 60), 4, async (g) => {
    try {
      const hit = await searchIgdbGame(nameOf(g), headers);
      cache[keyOf(g)] = hit ? toCacheEntry(hit) : null;
    } catch {
      cache[keyOf(g)] = null;
    }
  });

  await saveCache(cache);
  return cache;
}

// ── GOG public profile ────────────────────────────────────────────────────────
// GOG's games/stats endpoint only returns JSON for browser-like XHR requests;
// plain requests get a 403 from its Cloudflare front. These headers mimic a
// real in-browser fetch so the public endpoint responds.
const GOG_HEADERS = (username) => ({
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'X-Requested-With': 'XMLHttpRequest',
  'Referer': `https://www.gog.com/u/${encodeURIComponent(username)}/games`,
});

async function fetchGogGames(username) {
  let data;
  try {
    const resp = await axios.get(
      `https://www.gog.com/u/${encodeURIComponent(username)}/games/stats?sort=recent_playtime&order=desc&page=1`,
      { headers: GOG_HEADERS(username), timeout: 10000 }
    );
    data = resp.data;
  } catch (err) {
    const status = err.response?.status;
    if (status === 403)
      throw new Error('GOG blocked the request (403). Your GOG profile AND games list must both be set to Public (gog.com → Settings → Privacy). If they already are, GOG may be rate-limiting — wait a minute and retry.');
    if (status === 404)
      throw new Error('GOG profile not found. Double-check your GOG username (it is the name in your profile URL, gog.com/u/USERNAME).');
    throw new Error('Could not reach GOG. Make sure your GOG profile and game list are set to public, then try again.');
  }

  const entries = data?._embedded?.items;
  if (!entries) throw new Error('GOG profile found, but its games list is private. Set your games list to Public in GOG privacy settings.');
  return entries.map((e) => ({
    id: e.game?.id,
    title: e.game?.title ?? 'Unknown',
    image: e.game?.image ? `https:${e.game.image}_product_card_v2_mobile_slider_639.jpg` : null,
    playtime: e.stats?.playtime ?? 0,
    url: e.game?.url ? `https://www.gog.com${e.game.url}` : null,
  }));
}

// ── OpenID nonce store (in-memory, 10 min TTL) ───────────────────────────────
const pendingAuth = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingAuth) if (v.expires < now) pendingAuth.delete(k);
}, 60_000);

const FRONTEND = 'http://localhost:5173';
const BACKEND  = 'http://localhost:3001';

// ── Routes ────────────────────────────────────────────────────────────────────

router.get('/accounts', requireAuth, async (req, res) => {
  const users = await loadUsers();
  const user  = users.find((u) => u.id === req.user.id);
  res.json(user?.connectedAccounts ?? {});
});

// ── Steam OpenID ──────────────────────────────────────────────────────────────

// POST /api/library/steam/auth-init — returns Steam OpenID redirect URL
router.post('/steam/auth-init', requireAuth, (req, res) => {
  if (!process.env.STEAM_API_KEY)
    return res.status(503).json({ error: 'STEAM_API_KEY is not set in server/.env — get one at steamcommunity.com/dev/apikey' });

  const nonce = randomBytes(16).toString('hex');
  pendingAuth.set(nonce, { userId: req.user.id, expires: Date.now() + 600_000 });

  const returnTo = `${BACKEND}/api/library/steam/callback?nonce=${nonce}`;
  const params = new URLSearchParams({
    'openid.ns':         'http://specs.openid.net/auth/2.0',
    'openid.mode':       'checkid_setup',
    'openid.return_to':  returnTo,
    'openid.realm':      BACKEND,
    'openid.identity':   'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });

  res.json({ redirectUrl: `https://steamcommunity.com/openid/login?${params}` });
});

// GET /api/library/steam/callback — Steam redirects here after login
router.get('/steam/callback', async (req, res) => {
  const { nonce, ...openidParams } = req.query;
  const auth = pendingAuth.get(nonce);
  if (!auth || auth.expires < Date.now()) {
    return res.redirect(`${FRONTEND}/library?error=Login+session+expired.+Please+try+again.`);
  }
  pendingAuth.delete(nonce);

  // Verify the assertion with Steam
  try {
    const verifyParams = new URLSearchParams({ ...openidParams, 'openid.mode': 'check_authentication' });
    const { data } = await axios.post(
      'https://steamcommunity.com/openid/login',
      verifyParams.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    if (!data.includes('is_valid:true')) throw new Error('invalid');
  } catch {
    return res.redirect(`${FRONTEND}/library?error=Steam+login+could+not+be+verified.`);
  }

  // Extract SteamID64 from the claimed_id URL
  const steamId = req.query['openid.claimed_id']
    ?.match(/https:\/\/steamcommunity\.com\/openid\/id\/(\d+)/)?.[1];
  if (!steamId) return res.redirect(`${FRONTEND}/library?error=Could+not+read+Steam+ID.`);

  // Save to user account
  const users = await loadUsers();
  const idx = users.findIndex((u) => u.id === auth.userId);
  if (idx === -1) return res.redirect(`${FRONTEND}/library?error=User+not+found.`);
  users[idx].connectedAccounts ??= {};
  users[idx].connectedAccounts.steam = { steamId, connectedAt: new Date().toISOString() };
  await saveUsers(users);

  res.redirect(`${FRONTEND}/library?steam=connected`);
});

// DELETE /api/library/steam — disconnect
router.delete('/steam', requireAuth, async (req, res) => {
  const users = await loadUsers();
  const idx = users.findIndex((u) => u.id === req.user.id);
  if (idx !== -1) {
    delete users[idx].connectedAccounts?.steam;
    await saveUsers(users);
  }
  res.json({ ok: true });
});

router.get('/steam/games', requireAuth, async (req, res) => {
  const apiKey = process.env.STEAM_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'STEAM_API_KEY is not set in server .env' });

  const users = await loadUsers();
  const user  = users.find((u) => u.id === req.user.id);
  const steamId = user?.connectedAccounts?.steam?.steamId;
  if (!steamId) return res.status(400).json({ error: 'Steam account not connected' });

  try {
    const games = (await fetchSteamGames(steamId, apiKey)).filter((g) => !isJunk(g.name));
    let cache = await loadCache();
    cache = await enrichItems(games.slice(0, 200), cache, (g) => `steam:${g.appid}`, (g) => g.name);

    const mapped = games.slice(0, 200).map((g) => {
      const match = cache[`steam:${g.appid}`];
      return {
        appid: g.appid,
        name: g.name,
        playtime: g.playtime_forever ?? 0,
        coverUrl: match?.cover
          ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${match.cover}.jpg`
          : `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/library_600x900.jpg`,
        igdbId: match?.igdbId ?? null,
        genres: match?.genres ?? [],
        year: match?.year ?? null,
      };
    });

    res.json(dedupeByIgdb(mapped));
  } catch (err) {
    console.error('steam/games error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GOG ───────────────────────────────────────────────────────────────────────
router.put('/gog', requireAuth, async (req, res) => {
  const { gogUsername } = req.body;
  if (!gogUsername?.trim()) return res.status(400).json({ error: 'GOG username is required' });

  // Validate the username resolves to a real public profile
  try {
    await fetchGogGames(gogUsername.trim());
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const users = await loadUsers();
  const idx = users.findIndex((u) => u.id === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });
  users[idx].connectedAccounts ??= {};
  users[idx].connectedAccounts.gog = { username: gogUsername.trim(), connectedAt: new Date().toISOString() };
  await saveUsers(users);
  res.json({ username: gogUsername.trim() });
});

router.delete('/gog', requireAuth, async (req, res) => {
  const users = await loadUsers();
  const idx = users.findIndex((u) => u.id === req.user.id);
  if (idx !== -1) {
    delete users[idx].connectedAccounts?.gog;
    await saveUsers(users);
  }
  res.json({ ok: true });
});

router.get('/gog/games', requireAuth, async (req, res) => {
  const users = await loadUsers();
  const user  = users.find((u) => u.id === req.user.id);
  const gogUsername = user?.connectedAccounts?.gog?.username;
  if (!gogUsername) return res.status(400).json({ error: 'GOG account not connected' });

  try {
    const games = (await fetchGogGames(gogUsername)).filter((g) => !isJunk(g.title));
    let cache = await loadCache();
    cache = await enrichItems(games.slice(0, 200), cache, (g) => `gog:${g.id}`, (g) => g.title);

    const mapped = games.slice(0, 200).map((g) => {
      const match = cache[`gog:${g.id}`];
      const igdbCover = match?.cover
        ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${match.cover}.jpg`
        : null;
      return {
        id: g.id,
        title: g.title,
        playtime: g.playtime,
        url: g.url,
        image: igdbCover ?? g.image,
        coverUrl: igdbCover ?? g.image,
        igdbId: match?.igdbId ?? null,
        genres: match?.genres ?? [],
        year: match?.year ?? null,
      };
    });

    res.json(dedupeByIgdb(mapped));
  } catch (err) {
    console.error('gog/games error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Xbox (via OpenXBL / xbl.io) ────────────────────────────────────────────────
// Xbox Live has no public API for third parties, so we use OpenXBL: each user
// signs in at xbl.io with their Microsoft account and pastes their personal key.
const XBL = 'https://xbl.io/api/v2';
const xblHeaders = (key) => ({ 'X-Authorization': key, Accept: 'application/json' });
// OpenXBL wraps every payload as { content: <actual>, code: <n> }.
const xblUnwrap = (data) => (data && typeof data === 'object' && 'content' in data && 'code' in data) ? data.content : data;

async function fetchXboxAccount(apiKey) {
  const { data } = await axios.get(`${XBL}/account`, { headers: xblHeaders(apiKey), timeout: 10000 });
  const payload = xblUnwrap(data);
  const u = payload?.profileUsers?.[0] ?? (payload?.id ? payload : null);
  if (!u) {
    const detail = typeof payload === 'string' ? payload : JSON.stringify(payload ?? data).slice(0, 250);
    throw new Error(`OpenXBL: ${detail}`);
  }
  const gamertag = u.settings?.find((s) => s.id === 'Gamertag')?.value ?? u.gamertag ?? 'Xbox Player';
  return { xuid: u.id, gamertag };
}

async function fetchXboxTitles(apiKey) {
  const { data } = await axios.get(`${XBL}/player/titleHistory`, { headers: xblHeaders(apiKey), timeout: 15000 });
  const payload = xblUnwrap(data);
  return (payload?.titles ?? [])
    .filter((t) => !t.type || t.type === 'Game')
    .map((t) => ({
      titleId: t.titleId,
      name: t.name,
      image: t.displayImage ?? t.images?.find?.((i) => i.type === 'BoxArt')?.url ?? null,
    }));
}

router.put('/xbox', requireAuth, async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey?.trim()) return res.status(400).json({ error: 'OpenXBL API key is required' });

  let profile;
  try {
    profile = await fetchXboxAccount(apiKey.trim());
  } catch (err) {
    const status = err.response?.status;
    console.error('xbox connect error:', status, err.message, JSON.stringify(err.response?.data)?.slice(0, 300));
    if (status === 401 || status === 403)
      return res.status(400).json({ error: 'Invalid OpenXBL API key. Sign in at xbl.io and copy your key.' });
    if (status === 429)
      return res.status(400).json({ error: 'OpenXBL rate limit reached. Wait a minute and try again.' });
    return res.status(400).json({ error: `Could not connect to OpenXBL (${status ?? err.code ?? 'unknown'}). ${err.message}` });
  }

  const users = await loadUsers();
  const idx = users.findIndex((u) => u.id === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });
  users[idx].connectedAccounts ??= {};
  users[idx].connectedAccounts.xbox = { apiKey: apiKey.trim(), xuid: profile.xuid, gamertag: profile.gamertag, connectedAt: new Date().toISOString() };
  await saveUsers(users);
  res.json({ gamertag: profile.gamertag });
});

router.delete('/xbox', requireAuth, async (req, res) => {
  const users = await loadUsers();
  const idx = users.findIndex((u) => u.id === req.user.id);
  if (idx !== -1) { delete users[idx].connectedAccounts?.xbox; await saveUsers(users); }
  res.json({ ok: true });
});

router.get('/xbox/games', requireAuth, async (req, res) => {
  const users = await loadUsers();
  const user  = users.find((u) => u.id === req.user.id);
  const xbox  = user?.connectedAccounts?.xbox;
  if (!xbox?.apiKey) return res.status(400).json({ error: 'Xbox account not connected' });

  try {
    const titles = (await fetchXboxTitles(xbox.apiKey)).filter((t) => t.name && !isJunk(t.name));
    let cache = await loadCache();
    cache = await enrichItems(titles.slice(0, 200), cache, (g) => `xbox:${g.titleId}`, (g) => g.name);

    const mapped = titles.slice(0, 200).map((g) => {
      const match = cache[`xbox:${g.titleId}`];
      const igdbCover = match?.cover ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${match.cover}.jpg` : null;
      return {
        id: g.titleId,
        title: g.name,
        url: null,
        image: igdbCover ?? g.image,
        coverUrl: igdbCover ?? g.image,
        igdbId: match?.igdbId ?? null,
        genres: match?.genres ?? [],
        year: match?.year ?? null,
      };
    });

    res.json(dedupeByIgdb(mapped));
  } catch (err) {
    console.error('xbox/games error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Epic Games (unofficial launcher auth, à la Legendary/Heroic) ────────────────
// Epic has no public library API. We use the launcher's public client creds:
// the user pastes an authorizationCode (from an Epic login URL), we exchange it
// for tokens, then read owned assets and resolve them via the catalog service.
const EPIC_CLIENT_ID = '34a02cf8f4414e29b15921876da36f9a';
const EPIC_CLIENT_SECRET = 'daafbccc737745039dffe53d94fc76cf';
const EPIC_BASIC = 'Basic ' + Buffer.from(`${EPIC_CLIENT_ID}:${EPIC_CLIENT_SECRET}`).toString('base64');
const EPIC_OAUTH = 'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token';

async function epicToken(params) {
  const { data } = await axios.post(EPIC_OAUTH, new URLSearchParams(params).toString(), {
    headers: { Authorization: EPIC_BASIC, 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 12000,
  });
  return data;
}

// Run an async worker over items with a fixed concurrency (no inter-item delay).
async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await worker(items[i]);
      }
    })
  );
  return results;
}

// Resolve one namespace + id-chunk to game entries via Epic's catalog service.
async function epicCatalogChunk(ns, ids, accessToken) {
  const qs = ids.map((id) => `id=${id}`).join('&');
  const out = [];
  try {
    const { data: items } = await axios.get(
      `https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace/${ns}/bulk/items?${qs}&country=US&locale=en-US&includeMainGameDetails=true`,
      { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 }
    );
    for (const [catId, item] of Object.entries(items ?? {})) {
      const cats = (item.categories ?? []).map((c) => c.path);
      const isGame = cats.some((c) => c === 'games' || c.startsWith('games/'));
      const isAddon = cats.some((c) => c === 'addons' || c.startsWith('addons/')) || !!item.mainGameItem;
      if (!isGame || isAddon) continue;
      if (/^unreal engine/i.test(item.title ?? '')) continue;
      const img = (item.keyImages ?? []).find((k) => ['DieselStoreFrontTall', 'OfferImageTall', 'Thumbnail'].includes(k.type)) ?? item.keyImages?.[0];
      out.push({ id: catId, title: item.title, image: img?.url ?? null });
    }
  } catch { /* skip this chunk */ }
  return out;
}

async function epicFetchLibrary(accessToken) {
  const { data: assets } = await axios.get(
    'https://launcher-public-service-prod06.ol.epicgames.com/launcher/api/public/assets/Windows?label=Live',
    { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 }
  );

  // Epic gives most games their own namespace, so we group ids by namespace and
  // chunk them, then resolve every chunk CONCURRENTLY (this was the slow part —
  // it used to run one namespace at a time, sequentially).
  const byNs = {};
  for (const a of assets ?? []) {
    if (!a.namespace || !a.catalogItemId || a.namespace === 'ue') continue;
    (byNs[a.namespace] ??= new Set()).add(a.catalogItemId);
  }
  const tasks = [];
  for (const [ns, idSet] of Object.entries(byNs)) {
    const ids = [...idSet];
    for (let i = 0; i < ids.length; i += 40) tasks.push({ ns, ids: ids.slice(i, i + 40) });
  }

  const chunks = await mapPool(tasks, 12, (t) => epicCatalogChunk(t.ns, t.ids, accessToken));
  return chunks.flat();
}

router.put('/epic', requireAuth, async (req, res) => {
  const { authorizationCode } = req.body;
  if (!authorizationCode?.trim()) return res.status(400).json({ error: 'Epic authorization code is required' });

  let token;
  try {
    token = await epicToken({ grant_type: 'authorization_code', code: authorizationCode.trim(), token_type: 'eg1' });
  } catch {
    return res.status(400).json({ error: 'Invalid or expired Epic authorization code. Get a fresh code and try again (it expires within minutes).' });
  }

  const users = await loadUsers();
  const idx = users.findIndex((u) => u.id === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });
  users[idx].connectedAccounts ??= {};
  users[idx].connectedAccounts.epic = {
    accountId: token.account_id,
    displayName: token.displayName ?? 'Epic Player',
    refreshToken: token.refresh_token,
    connectedAt: new Date().toISOString(),
  };
  await saveUsers(users);
  res.json({ displayName: token.displayName ?? 'Epic Player' });
});

router.delete('/epic', requireAuth, async (req, res) => {
  const users = await loadUsers();
  const idx = users.findIndex((u) => u.id === req.user.id);
  if (idx !== -1) { delete users[idx].connectedAccounts?.epic; await saveUsers(users); }
  res.json({ ok: true });
});

router.get('/epic/games', requireAuth, async (req, res) => {
  const users = await loadUsers();
  const idx = users.findIndex((u) => u.id === req.user.id);
  const epic = users[idx]?.connectedAccounts?.epic;
  if (!epic?.refreshToken) return res.status(400).json({ error: 'Epic account not connected' });

  let accessToken;
  try {
    const token = await epicToken({ grant_type: 'refresh_token', refresh_token: epic.refreshToken, token_type: 'eg1' });
    accessToken = token.access_token;
    // Persist the rotated refresh token so future refreshes keep working.
    users[idx].connectedAccounts.epic.refreshToken = token.refresh_token;
    await saveUsers(users);
  } catch {
    return res.status(400).json({ error: 'Epic session expired. Please reconnect your Epic account.' });
  }

  try {
    const owned = (await epicFetchLibrary(accessToken)).filter((g) => g.title && !isJunk(g.title));
    let cache = await loadCache();
    cache = await enrichItems(owned.slice(0, 200), cache, (g) => `epic:${g.id}`, (g) => g.title);

    const mapped = owned.slice(0, 200).map((g) => {
      const match = cache[`epic:${g.id}`];
      const igdbCover = match?.cover ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${match.cover}.jpg` : null;
      return {
        id: g.id,
        title: g.title,
        url: null,
        image: igdbCover ?? g.image,
        coverUrl: igdbCover ?? g.image,
        igdbId: match?.igdbId ?? null,
        genres: match?.genres ?? [],
        year: match?.year ?? null,
      };
    });

    res.json(dedupeByIgdb(mapped));
  } catch (err) {
    console.error('epic/games error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
