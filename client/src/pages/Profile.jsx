import { useGamification } from '../context/GamificationContext';
import { useFavorites } from '../context/FavoritesContext';
import { useAuth } from '../context/AuthContext';
import LoginGate from '../components/LoginGate';
import { levelFromXp, rankTitle, BADGES } from '../utils/gamification';

export default function Profile() {
  const { stats, resetStats } = useGamification();
  const { favorites } = useFavorites();
  const { isLoggedIn } = useAuth();

  const lvl = levelFromXp(stats.xp);
  const rank = rankTitle(lvl.level);
  const earned = new Set(stats.badges);
  const earnedCount = BADGES.filter((b) => earned.has(b.id)).length;
  const liveFavCount = Object.keys(favorites || {}).length || stats.favorites;

  const tiles = [
    { icon: '⚡', value: stats.xp.toLocaleString(), label: 'Total XP' },
    { icon: '📝', value: stats.reviews, label: 'Reviews Written' },
    { icon: '💜', value: liveFavCount, label: 'Favorites' },
    { icon: '🧭', value: stats.viewed, label: 'Games Explored' },
    { icon: '🔥', value: stats.streak, label: 'Day Streak', streak: true },
    { icon: '🏅', value: `${earnedCount}/${BADGES.length}`, label: 'Badges Earned' },
  ];

  return (
    <div className="page">
      <LoginGate
        title="Unlock your Player Profile"
        message="Create a free account to earn XP, level up, keep daily streaks, and unlock achievement badges."
      >
      <div className="profile-hero">
        <div className="level-ring" style={{ '--pct': lvl.pct }}>
          <div className="level-ring-inner">
            <div>
              <div className="level-ring-num">{lvl.level}</div>
              <div className="level-ring-label">Level</div>
            </div>
          </div>
        </div>
        <div className="profile-hero-body">
          <h1 className="profile-title">Your Player Profile</h1>
          <div className="profile-rank">{rank}</div>
          <div className="profile-xp-track">
            <div className="profile-xp-fill" style={{ width: `${lvl.pct}%` }} />
          </div>
          <p className="profile-xp-caption">
            {lvl.intoLevel.toLocaleString()} / {lvl.span.toLocaleString()} XP &middot;{' '}
            <strong style={{ color: 'var(--text)' }}>{lvl.toNext.toLocaleString()} XP</strong> to level {lvl.level + 1}
          </p>
        </div>
      </div>

      <div className="stat-grid">
        {tiles.map((t) => (
          <div key={t.label} className="stat-tile">
            <div className="stat-tile-icon">{t.icon}</div>
            <div className={`stat-tile-value ${t.streak ? 'streak' : ''}`}>{t.value}</div>
            <div className="stat-tile-label">{t.label}</div>
          </div>
        ))}
      </div>

      <h2 className="profile-section-title">🏆 Achievements</h2>
      <div className="badge-grid">
        {BADGES.map((b) => {
          const has = earned.has(b.id);
          return (
            <div key={b.id} className={`badge-tile ${has ? 'earned' : 'locked'}`}>
              {has && <span className="badge-check">✓</span>}
              <span className="badge-emoji">{has ? b.emoji : '🔒'}</span>
              <div className="badge-name">{b.name}</div>
              <div className="badge-desc">{b.desc}</div>
            </div>
          );
        })}
      </div>

      {isLoggedIn && (
        <div style={{ marginTop: '2.5rem' }}>
          <button
            className="btn-ghost btn-ghost-danger"
            onClick={() => { if (confirm('Reset all your progress, XP, and badges?')) resetStats(); }}
          >
            Reset progress
          </button>
        </div>
      )}
      </LoginGate>
    </div>
  );
}
