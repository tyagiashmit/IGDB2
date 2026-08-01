import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import gamesRouter from './routes/games.js';
import reviewsRouter from './routes/reviews.js';
import authRouter from './routes/auth.js';
import favoritesRouter from './routes/favorites.js';
import libraryRouter from './routes/library.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/games', gamesRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/favorites', favoritesRouter);
app.use('/api/library', libraryRouter);

app.listen(PORT, () => {
  console.log(`\n  Game Review API running at http://localhost:${PORT}\n`);
});
