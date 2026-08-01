// ── GameVault gamification engine (client-side, localStorage-backed) ──
// Tracks XP, levels, streaks, and badges to keep players coming back.

export const XP = {
  view: 5,      // discovering a game (once per game)
  favorite: 20, // adding to favorites
  review: 100,  // writing a review — the big one
};

// Cumulative XP required to *reach* a given level.
// Level 1 = 0, and each level costs a bit more than the last.
export function xpForLevel(level) {
  if (level <= 1) return 0;
  return Math.round(50 * (level - 1) * level); // L2:100, L3:300, L4:600, L5:1000 …
}

export function levelFromXp(xp) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const currentFloor = xpForLevel(level);
  const nextFloor = xpForLevel(level + 1);
  const intoLevel = xp - currentFloor;
  const span = nextFloor - currentFloor;
  return {
    level,
    intoLevel,
    span,
    toNext: nextFloor - xp,
    pct: Math.min(100, Math.round((intoLevel / span) * 100)),
  };
}

// Flavourful rank titles that change as you level up.
export function rankTitle(level) {
  if (level >= 25) return 'Legendary Curator';
  if (level >= 18) return 'Master Critic';
  if (level >= 12) return 'Veteran Reviewer';
  if (level >= 8) return 'Seasoned Gamer';
  if (level >= 5) return 'Rising Star';
  if (level >= 3) return 'Explorer';
  return 'Rookie';
}

// Badge catalogue. `check` receives the raw stats object.
export const BADGES = [
  { id: 'first_review', emoji: '📝', name: 'First Words',    desc: 'Write your first review',       check: (s) => s.reviews >= 1 },
  { id: 'critic',       emoji: '🎯', name: 'Critic',         desc: 'Write 5 reviews',               check: (s) => s.reviews >= 5 },
  { id: 'veteran',      emoji: '🏅', name: 'Veteran Critic', desc: 'Write 25 reviews',              check: (s) => s.reviews >= 25 },
  { id: 'collector',    emoji: '💎', name: 'Collector',      desc: 'Favorite 10 games',             check: (s) => s.favorites >= 10 },
  { id: 'hoarder',      emoji: '👑', name: 'Curator',        desc: 'Favorite 30 games',             check: (s) => s.favorites >= 30 },
  { id: 'explorer',     emoji: '🧭', name: 'Explorer',       desc: 'View 25 different games',        check: (s) => s.viewed >= 25 },
  { id: 'streak3',      emoji: '🔥', name: 'On Fire',        desc: 'Keep a 3-day streak',           check: (s) => s.longestStreak >= 3 },
  { id: 'streak7',      emoji: '⚡', name: 'Unstoppable',    desc: 'Keep a 7-day streak',           check: (s) => s.longestStreak >= 7 },
  { id: 'level5',       emoji: '⭐', name: 'Rising Star',    desc: 'Reach level 5',                 check: (s) => levelFromXp(s.xp).level >= 5 },
  { id: 'level10',      emoji: '🌟', name: 'Star Player',    desc: 'Reach level 10',                check: (s) => levelFromXp(s.xp).level >= 10 },
];

export function defaultStats() {
  return {
    xp: 0,
    reviews: 0,
    favorites: 0,
    viewed: 0,
    viewedIds: {},   // gameId -> true, so views only count once
    badges: [],      // earned badge ids
    streak: 0,
    longestStreak: 0,
    lastActive: null, // yyyy-mm-dd
  };
}

const KEY = 'gv_gamify';

// Progress is stored per-account so each user has their own XP/badges.
export function loadStats(key = KEY) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultStats();
    return { ...defaultStats(), ...JSON.parse(raw) };
  } catch {
    return defaultStats();
  }
}

export function saveStats(stats, key = KEY) {
  try { localStorage.setItem(key, JSON.stringify(stats)); } catch { /* quota — ignore */ }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Update the daily streak. Returns possibly-mutated stats.
export function touchStreak(stats) {
  const today = todayStr();
  if (stats.lastActive === today) return stats;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const streak = stats.lastActive === yesterday ? stats.streak + 1 : 1;
  return {
    ...stats,
    streak,
    longestStreak: Math.max(stats.longestStreak || 0, streak),
    lastActive: today,
  };
}

// Recompute which badges are earned; returns { stats, newlyEarned: [badge] }.
export function reconcileBadges(stats) {
  const earned = new Set(stats.badges);
  const newlyEarned = [];
  for (const b of BADGES) {
    if (!earned.has(b.id) && b.check(stats)) {
      earned.add(b.id);
      newlyEarned.push(b);
    }
  }
  return { stats: { ...stats, badges: [...earned] }, newlyEarned };
}
