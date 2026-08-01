import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_FILE = path.join(__dirname, '../data/users.json');

async function loadUsers() {
  try { return JSON.parse(await fs.readFile(USERS_FILE, 'utf-8')); }
  catch { return []; }
}

async function saveUsers(users) {
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
}

const sign = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username?.trim() || !password)
    return res.status(400).json({ error: 'Username and password are required' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const users = await loadUsers();
  if (users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase()))
    return res.status(409).json({ error: 'Username already taken' });

  const hash = await bcrypt.hash(password, 10);
  const user = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    username: username.trim(),
    password: hash,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await saveUsers(users);

  res.status(201).json({
    token: sign({ id: user.id, username: user.username }),
    username: user.username,
    id: user.id,
  });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password are required' });

  const users = await loadUsers();
  const user = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid username or password' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid username or password' });

  res.json({
    token: sign({ id: user.id, username: user.username }),
    username: user.username,
    id: user.id,
  });
});

export default router;
