import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { getIgdbHeaders } from '../igdb.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB = path.join(__dirname, '../data/reviews.json');

const LIST_FIELDS = `
  fields id, name, cover.image_id, rating, aggregated_rating,
         rating_count, genres.name, platforms.abbreviation,
         first_release_date;
`.trim();

async function load() {
  try {
    return JSON.parse(await fs.readFile(DB, 'utf-8'));
  } catch {
    return {};
  }
}

async function save(data) {
  await fs.writeFile(DB, JSON.stringify(data, null, 2));
}

// GET /api/reviews/top-games — games ranked by community average rating
router.get('/top-games', async (req, res) => {
  try {
    const db = await load();

    // Compute avg rating + count per gameId
    const stats = Object.entries(db)
      .map(([gameId, reviews]) => {
        if (!reviews.length) return null;
        const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
        return { gameId, avg: Math.round(avg * 10) / 10, count: reviews.length };
      })
      .filter(Boolean)
      .sort((a, b) => b.avg - a.avg || b.count - a.count);

    if (!stats.length) return res.json([]);

    // Batch-fetch game data from IGDB
    const ids = stats.map((s) => s.gameId).join(',');
    const headers = await getIgdbHeaders();
    const { data: games } = await axios.post(
      'https://api.igdb.com/v4/games',
      `${LIST_FIELDS} where id = (${ids}); limit 50;`,
      { headers }
    );

    // Attach community stats and re-sort by avg rating
    const statsMap = Object.fromEntries(stats.map((s) => [s.gameId, s]));
    const result = games
      .map((g) => ({ ...g, communityRating: statsMap[String(g.id)]?.avg, reviewCount: statsMap[String(g.id)]?.count }))
      .sort((a, b) => (b.communityRating ?? 0) - (a.communityRating ?? 0));

    res.json(result);
  } catch (err) {
    console.error('reviews /top-games error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:gameId', async (req, res) => {
  const db = await load();
  res.json(db[req.params.gameId] ?? []);
});

router.post('/:gameId', async (req, res) => {
  const { author, rating, content } = req.body;
  if (!author?.trim() || !content?.trim() || !rating) {
    return res.status(400).json({ error: 'author, rating, and content are required' });
  }
  const r = Number(rating);
  if (r < 1 || r > 5) return res.status(400).json({ error: 'rating must be 1–5' });

  const db = await load();
  const gid = req.params.gameId;
  if (!db[gid]) db[gid] = [];

  const review = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    author: author.trim(),
    rating: r,
    content: content.trim(),
    createdAt: new Date().toISOString(),
  };

  db[gid].unshift(review);
  await save(db);
  res.status(201).json(review);
});

router.delete('/:gameId/:reviewId', async (req, res) => {
  const db = await load();
  const { gameId, reviewId } = req.params;
  if (!db[gameId]) return res.status(404).json({ error: 'Not found' });
  db[gameId] = db[gameId].filter((r) => r.id !== reviewId);
  await save(db);
  res.json({ ok: true });
});

export default router;
