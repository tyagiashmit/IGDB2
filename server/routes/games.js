import express from 'express';
import axios from 'axios';
import { getIgdbHeaders } from '../igdb.js';

const router = express.Router();
const IGDB = 'https://api.igdb.com/v4';

const LIST_FIELDS = `
  fields id, name, cover.image_id, rating, aggregated_rating,
         rating_count, genres.name, platforms.abbreviation,
         first_release_date;
`.trim();

router.get('/top', async (req, res) => {
  try {
    const headers = await getIgdbHeaders();
    const { data } = await axios.post(
      `${IGDB}/games`,
      `${LIST_FIELDS}
       where rating != null & cover != null & rating_count > 30;
       sort rating desc;
       limit 20;`,
      { headers }
    );
    res.json(data);
  } catch (err) {
    console.error('IGDB /top error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/trending', async (req, res) => {
  try {
    const headers = await getIgdbHeaders();
    const oneYearAgo = Math.floor(Date.now() / 1000) - 365 * 24 * 3600;
    const { data } = await axios.post(
      `${IGDB}/games`,
      `${LIST_FIELDS}
       where first_release_date > ${oneYearAgo} & cover != null;
       sort first_release_date desc;
       limit 20;`,
      { headers }
    );
    res.json(data);
  } catch (err) {
    console.error('IGDB /trending error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/latest', async (req, res) => {
  try {
    const headers = await getIgdbHeaders();
    const threeMonthsAgo = Math.floor(Date.now() / 1000) - 90 * 24 * 3600;
    const now = Math.floor(Date.now() / 1000);
    const { data } = await axios.post(
      `${IGDB}/games`,
      `${LIST_FIELDS}
       where first_release_date > ${threeMonthsAgo} & first_release_date < ${now} & cover != null;
       sort first_release_date desc;
       limit 20;`,
      { headers }
    );
    res.json(data);
  } catch (err) {
    console.error('IGDB /latest error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/search', async (req, res) => {
  const { q, genre } = req.query;
  if (!q?.trim() && !genre) return res.json([]);
  try {
    const headers = await getIgdbHeaders();
    let queryBody = LIST_FIELDS;
    let conditions = ['cover != null'];

    if (q?.trim()) {
      const safe = q.replace(/"/g, '');
      queryBody += `\nsearch "${safe}";`;
    }

    if (genre) {
      conditions.push(`genres = [${genre}]`);
    }

    queryBody += `\nwhere ${conditions.join(' & ')};\nlimit 24;`;

    const { data } = await axios.post(
      `${IGDB}/games`,
      queryBody,
      { headers }
    );
    res.json(data);
  } catch (err) {
    console.error('IGDB /search error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/genres', async (req, res) => {
  try {
    const headers = await getIgdbHeaders();
    const { data } = await axios.post(
      `${IGDB}/genres`,
      `fields name; limit 100; sort name asc;`,
      { headers }
    );
    res.json(data);
  } catch (err) {
    console.error('IGDB /genres error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/batch', async (req, res) => {
  const raw = req.query.ids ?? '';
  const ids = raw.split(',').map(Number).filter((n) => !isNaN(n) && n > 0);
  if (!ids.length) return res.json([]);
  try {
    const headers = await getIgdbHeaders();
    const { data } = await axios.post(
      `${IGDB}/games`,
      `${LIST_FIELDS}
       where id = (${ids.join(',')});
       limit 50;`,
      { headers }
    );
    res.json(data);
  } catch (err) {
    console.error('IGDB /batch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const headers = await getIgdbHeaders();
    const { data } = await axios.post(
      `${IGDB}/games`,
      `fields id, name, cover.image_id, rating, aggregated_rating, rating_count,
              genres.name, platforms.id, platforms.name, platforms.abbreviation,
              release_dates.human, release_dates.platform.abbreviation,
              summary, screenshots.image_id,
              involved_companies.company.name, involved_companies.developer,
              involved_companies.publisher,
              first_release_date, game_modes.name, themes.name,
              websites.url, videos.name, videos.video_id;
       where id = ${id};`,
      { headers }
    );
    if (!data.length) return res.status(404).json({ error: 'Game not found' });
    res.json(data[0]);
  } catch (err) {
    console.error('IGDB /:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
