import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getIgdbHeaders } from '../igdb.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FAV_FILE = path.join(__dirname, '../data/favorites.json');

// ── Storefront detection (mirror of client/src/utils/storefronts.js) ──
const PC_PLATFORM_ID = 6; // IGDB id for "PC (Microsoft Windows)"

// pcOnly: true  → only valid when game has a PC platform
// pcOnly: false → valid for any game with the matching URL
const STORE_URL_PATTERNS = [
  { re: /store\.steampowered\.com/,                                          name: 'Steam',           pcOnly: true },
  { re: /epicgames\.com\/store/,                                             name: 'Epic Games',      pcOnly: true },
  { re: /gog\.com\/(?:game|games|en\/game)/,                                 name: 'GOG',             pcOnly: true },
  { re: /itch\.io/,                                                          name: 'itch.io',         pcOnly: true },
  // Xbox Store = xbox.com console/ecosystem store (not PC-only)
  { re: /xbox\.com\/(?:[a-z-]+\/)?games\/store/,                             name: 'Xbox Store',      pcOnly: false },
  // Microsoft Store = Windows PC storefront (apps.microsoft.com / microsoft.com/store)
  { re: /(?:apps\.microsoft\.com|microsoft\.com\/(?:en-[a-z]+\/)?store)/,   name: 'Microsoft Store', pcOnly: true },
];

function detectStorefronts(websites, hasPCPlatform) {
  const found = new Set();
  for (const site of websites) {
    const url = site.url ?? '';
    for (const { re, name, pcOnly } of STORE_URL_PATTERNS) {
      if (re.test(url)) {
        if (!pcOnly || hasPCPlatform) found.add(name);
        break;
      }
    }
  }
  return found;
}

async function loadFavs() {
  try { return JSON.parse(await fs.readFile(FAV_FILE, 'utf-8')); }
  catch { return {}; }
}

async function saveFavs(data) {
  await fs.writeFile(FAV_FILE, JSON.stringify(data, null, 2));
}

async function fetchGameInfo(gameId) {
  const headers = await getIgdbHeaders();
  const { data } = await axios.post(
    'https://api.igdb.com/v4/games',
    `fields platforms.id, platforms.name, platforms.abbreviation, websites.url;
     where id = ${gameId};`,
    { headers }
  );
  return data[0] ?? null;
}

// GET /api/favorites
router.get('/', requireAuth, async (req, res) => {
  const all = await loadFavs();
  res.json(all[req.user.id] ?? {});
});

// POST /api/favorites/:gameId
router.post('/:gameId', requireAuth, async (req, res) => {
  const gid = req.params.gameId;
  const all = await loadFavs();
  if (!all[req.user.id]) all[req.user.id] = {};
  if (!all[req.user.id][gid]) {
    all[req.user.id][gid] = { addedAt: new Date().toISOString(), platforms: [] };
  }
  await saveFavs(all);
  res.status(201).json(all[req.user.id][gid]);
});

// DELETE /api/favorites/:gameId
router.delete('/:gameId', requireAuth, async (req, res) => {
  const gid = req.params.gameId;
  const all = await loadFavs();
  if (all[req.user.id]) {
    delete all[req.user.id][gid];
    await saveFavs(all);
  }
  res.json({ ok: true });
});

// PUT /api/favorites/:gameId/platforms — with full storefront + platform validation
router.put('/:gameId/platforms', requireAuth, async (req, res) => {
  const gid = req.params.gameId;
  const { platforms: userSelections } = req.body;

  if (!Array.isArray(userSelections))
    return res.status(400).json({ error: 'platforms must be an array' });

  // ── Fetch game data from IGDB ──
  let game;
  try {
    game = await fetchGameInfo(gid);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch game info from IGDB' });
  }
  if (!game) return res.status(404).json({ error: 'Game not found on IGDB' });

  const gamePlatforms = game.platforms ?? [];
  const gameWebsites  = game.websites  ?? [];

  const hasPCPlatform = gamePlatforms.some((p) => p.id === PC_PLATFORM_ID);

  // ── Valid console platforms (non-PC) ──
  const validConsolePlatforms = new Set();
  for (const p of gamePlatforms.filter((p) => p.id !== PC_PLATFORM_ID)) {
    if (p.abbreviation) validConsolePlatforms.add(p.abbreviation);
    validConsolePlatforms.add(p.name);
  }

  // ── Valid PC storefronts (URL-detected + Microsoft Store fallback) ──
  const validStorefronts = detectStorefronts(gameWebsites, hasPCPlatform);

  // ── Validate each user selection ──
  const invalid = userSelections.filter(
    (sel) => !validConsolePlatforms.has(sel) && !validStorefronts.has(sel)
  );

  if (invalid.length) {
    return res.status(400).json({
      error: `Not available on: ${invalid.join(', ')}`,
      validPlatforms:   [...validConsolePlatforms],
      validStorefronts: [...validStorefronts],
    });
  }

  // ── Persist ──
  const all = await loadFavs();
  if (!all[req.user.id]?.[gid])
    return res.status(404).json({ error: 'Add game to favorites first' });

  all[req.user.id][gid].platforms = userSelections;
  await saveFavs(all);
  res.json(all[req.user.id][gid]);
});

export default router;
