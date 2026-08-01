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

// Fetch Steam owned games sorted by playtime
async function fetchSteamGames(steamId, apiKey) {
  const { data } = await axios.get(
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1&format=json`
  );
  const games = data.response?.games;
  if (!games) throw new Error('Steam library is empty or private. Set Game Details to Public in Steam Privacy Settings.');
  return games.sort((a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0));
}

// Match a batch of Steam games to IGDB via multiquery (5 games per request)
async function matchBatch(batch, headers) {
  const body = batch
    .map((g, i) => {
      const safe = g.name.replace(/"/g, '').replace(/[^\w\s\-.:&!]/g, '').trim();
      return `query games "q${i}" { search "${safe}"; fields id,name,cover.image_id,genres.name,first_release_date; where cover != null; limit 1; };`;
    })
    .join('\n');

  const { data } = await axios.post('https://api.igdb.com/v4/multiquery', body, { headers });
  return data; // [{ name: "q0", result: [...] }, ...]
}

// Enrich games with IGDB data, caching results
async function enrichWithIgdb(games, cache) {
  const headers = await getIgdbHeaders();
  const unmatched = games.filter((g) => !(`steam:${g.appid}` in cache));
  const toMatch = unmatched.slice(0, 50); // max 50 new matches per call

  const BATCH = 5;
  for (let i = 0; i < toMatch.length; i += BATCH) {
    const batch = toMatch.slice(i, i + BATCH);
    try {
      const results = await matchBatch(batch, headers);
      batch.forEach((g, idx) => {
        const hit = results.find((r) => r.name === `q${idx}`)?.result?.[0];
        cache[`steam:${g.appid}`] = hit
          ? { igdbId: hit.id, cover: hit.cover?.image_id ?? null, genres: hit.genres?.map((x) => x.name) ?? [], year: hit.first_release_date ? new Date(hit.first_release_date * 1000).getFullYear() : null }
          : null;
      });
    } catch {
      batch.forEach((g) => { cache[`steam:${g.appid}`] = null; });
    }
    if (i + BATCH < toMatch.length) await new Promise((r) => setTimeout(r, 300));
  }

  await saveCache(cache);
  return cache;
}

// ── GOG public profile ────────────────────────────────────────────────────────
async function fetchGogGames(username) {
  const { data } = await axios.get(
    `https://www.gog.com/u/${encodeURIComponent(username)}/games/stats?sort=recent_playtime&order=desc&page=1&format=json`,
    { headers: { 'User-Agent': 'GameVaultApp/1.0' }, timeout: 8000 }
  );
  const entries = data?._embedded?.items;
  if (!entries) throw new Error('GOG profile not found or is private. Make sure your GOG profile and game list are set to public.');
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
    const games = await fetchSteamGames(steamId, apiKey);
    let cache = await loadCache();
    cache = await enrichWithIgdb(games.slice(0, 200), cache);

    const result = games.slice(0, 200).map((g) => {
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

    res.json(result);
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
    const games = await fetchGogGames(gogUsername);
    res.json(games);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
