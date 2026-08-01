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

// Enrich a list of owned games with IGDB matches, caching each result.
// `keyOf` builds the cache key, `nameOf` extracts the title to search.
// Requests are throttled to stay within IGDB's 4 req/sec limit.
async function enrichItems(items, cache, keyOf, nameOf) {
  const headers = await getIgdbHeaders();
  const unmatched = items.filter((g) => !(keyOf(g) in cache));
  const toMatch = unmatched.slice(0, 50); // cap new matches per call; rest resolve on later loads

  const BATCH = 4; // 4 concurrent + ~1s spacing ≈ 4 req/sec
  for (let i = 0; i < toMatch.length; i += BATCH) {
    const batch = toMatch.slice(i, i + BATCH);
    await Promise.all(batch.map(async (g) => {
      try {
        const hit = await searchIgdbGame(nameOf(g), headers);
        cache[keyOf(g)] = hit
          ? { igdbId: hit.id, cover: hit.cover?.image_id ?? null, genres: hit.genres?.map((x) => x.name) ?? [], year: hit.first_release_date ? new Date(hit.first_release_date * 1000).getFullYear() : null }
          : null;
      } catch {
        cache[keyOf(g)] = null;
      }
    }));
    if (i + BATCH < toMatch.length) await new Promise((r) => setTimeout(r, 1100));
  }

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

export default router;
