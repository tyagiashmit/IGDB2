import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from './AuthContext';
import {
  XP, loadStats, saveStats, touchStreak, reconcileBadges,
  levelFromXp, defaultStats,
} from '../utils/gamification';

const GamificationContext = createContext(null);

let toastId = 0;

export function GamificationProvider({ children }) {
  const { isLoggedIn, user } = useAuth();
  const storageKey = user?.username ? `gv_gamify_${user.username}` : null;

  const [stats, setStats] = useState(defaultStats());
  const [toasts, setToasts] = useState([]);
  const statsRef = useRef(stats);
  statsRef.current = stats;

  // Load this account's progress on login; clear it on logout.
  useEffect(() => {
    const next = isLoggedIn && storageKey ? loadStats(storageKey) : defaultStats();
    statsRef.current = next;
    setStats(next);
  }, [isLoggedIn, storageKey]);

  const pushToast = useCallback((toast) => {
    const id = ++toastId;
    setToasts((t) => [...t, { ...toast, id }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  // Core: apply a change to the raw counters, then recompute derived state.
  // XP is only earned by logged-in members — it's the incentive to sign up.
  const award = useCallback((mutate, xpGain, label) => {
    if (!isLoggedIn || !storageKey) return statsRef.current;
    const before = statsRef.current;
    const beforeLevel = levelFromXp(before.xp).level;

    let next = mutate({ ...before });
    next = touchStreak(next);
    next.xp = (next.xp || 0) + (xpGain || 0);

    const { stats: reconciled, newlyEarned } = reconcileBadges(next);
    next = reconciled;

    statsRef.current = next;
    setStats(next);
    saveStats(next, storageKey);

    if (xpGain) pushToast({ type: 'xp', icon: '✨', title: `+${xpGain} XP`, sub: label });

    const afterLevel = levelFromXp(next.xp).level;
    if (afterLevel > beforeLevel) {
      pushToast({ type: 'levelup', icon: '🎉', title: `Level ${afterLevel}!`, sub: 'You leveled up' });
    }
    for (const b of newlyEarned) {
      pushToast({ type: 'badge', icon: b.emoji, title: 'Badge unlocked', sub: b.name });
    }
    return next;
  }, [pushToast, isLoggedIn, storageKey]);

  // View a game — only counts XP the first time you see each game.
  const awardView = useCallback((gameId) => {
    const key = String(gameId);
    if (statsRef.current.viewedIds?.[key]) {
      // still refresh the streak on any visit
      award((s) => s, 0, null);
      return;
    }
    award((s) => ({
      ...s,
      viewed: (s.viewed || 0) + 1,
      viewedIds: { ...s.viewedIds, [key]: true },
    }), XP.view, 'Discovered a game');
  }, [award]);

  const awardReview = useCallback(() => {
    award((s) => ({ ...s, reviews: (s.reviews || 0) + 1 }), XP.review, 'Review published');
  }, [award]);

  const awardFavorite = useCallback(() => {
    award((s) => ({ ...s, favorites: (s.favorites || 0) + 1 }), XP.favorite, 'Added a favorite');
  }, [award]);

  const resetStats = useCallback(() => {
    const fresh = defaultStats();
    statsRef.current = fresh;
    setStats(fresh);
    if (storageKey) saveStats(fresh, storageKey);
  }, [storageKey]);

  return (
    <GamificationContext.Provider
      value={{ stats, awardView, awardReview, awardFavorite, resetStats }}
    >
      {children}
      <div className="xp-toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`xp-toast ${t.type}`}>
            <span className="xp-toast-icon">{t.icon}</span>
            <div>
              <div className="xp-toast-title">{t.title}</div>
              {t.sub && <div className="xp-toast-sub">{t.sub}</div>}
            </div>
          </div>
        ))}
      </div>
    </GamificationContext.Provider>
  );
}

export const useGamification = () => useContext(GamificationContext);
