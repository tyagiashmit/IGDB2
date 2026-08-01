import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const PLATFORMS = [
  { id: 'steam',   label: 'Steam',       available: true },
  { id: 'gog',     label: 'GOG',         available: true },
  { id: 'epic',    label: 'Epic Games',  available: false },
  { id: 'xbox',    label: 'Xbox',        available: false },
];

export default function Library() {
  const { isLoggedIn, authFetch, setShowLoginModal } = useAuth();
  const [activePlatform, setActivePlatform] = useState('steam');
  const [accounts, setAccounts] = useState(null);
  const [toast, setToast] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!isLoggedIn) return;
    authFetch('/api/library/accounts').then((r) => r.json()).then(setAccounts);
  }, [isLoggedIn]);

  // Handle Steam OpenID callback redirects (?steam=connected or ?error=...)
  useEffect(() => {
    if (!isLoggedIn) return;
    const steamConnected = searchParams.get('steam') === 'connected';
    const error = searchParams.get('error');
    if (steamConnected) {
      authFetch('/api/library/accounts').then((r) => r.json()).then(setAccounts);
      setToast({ type: 'success', msg: 'Steam account connected!' });
      setActivePlatform('steam');
      setSearchParams({}, { replace: true });
    } else if (error) {
      setToast({ type: 'error', msg: decodeURIComponent(error) });
      setSearchParams({}, { replace: true });
    }
  }, [isLoggedIn, searchParams]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!isLoggedIn) {
    return (
      <div className="page">
        <div className="library-login-prompt">
          <span className="library-login-icon">🎮</span>
          <h2>My Library</h2>
          <p>Log in to connect your gaming accounts and see your owned games.</p>
          <button className="btn-primary" onClick={() => setShowLoginModal(true)}>Log In</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {toast && (
        <div className={`library-toast ${toast.type}`}>{toast.msg}</div>
      )}

      <div className="library-header">
        <h1 className="library-title">My Library</h1>
        <p className="library-subtitle">Connect your gaming accounts to see your owned games.</p>
      </div>

      <div className="home-tabs">
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            className={`tab-btn ${activePlatform === p.id ? 'active' : ''}`}
            onClick={() => setActivePlatform(p.id)}
          >
            <PlatformIcon id={p.id} />
            {p.label}
            {!p.available && <span className="tab-soon">Soon</span>}
          </button>
        ))}
      </div>

      {PLATFORMS.find((p) => p.id === activePlatform)?.available ? (
        <PlatformPanel
          platform={activePlatform}
          account={accounts?.[activePlatform]}
          onAccountChange={(updated) => setAccounts((a) => ({ ...a, ...updated }))}
          authFetch={authFetch}
        />
      ) : (
        <ComingSoon platform={activePlatform} />
      )}
    </div>
  );
}

// ── Platform panel (connect form OR game grid) ────────────────────────────────

function PlatformPanel({ platform, account, onAccountChange, authFetch }) {
  const [games, setGames]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (account) loadGames();
  }, [account]);

  async function loadGames() {
    setLoading(true);
    setError('');
    try {
      const res = await authFetch(`/api/library/${platform}/games`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGames(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    await authFetch(`/api/library/${platform}`, { method: 'DELETE' });
    setGames(null);
    onAccountChange({ [platform]: undefined });
  }

  if (!account) {
    return (
      <ConnectForm
        platform={platform}
        authFetch={authFetch}
        onConnected={(acc) => onAccountChange({ [platform]: acc })}
      />
    );
  }

  return (
    <div className="library-panel">
      <div className="library-panel-header">
        <span className="library-connected-label">
          <span className="connected-dot" />
          {platform === 'steam' ? `Steam ID: ${account.steamId}` : `GOG: ${account.username}`}
        </span>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button className="btn-ghost" onClick={loadGames} disabled={loading}>↺ Refresh</button>
          <button className="btn-ghost btn-ghost-danger" onClick={disconnect}>Disconnect</button>
        </div>
      </div>

      {error && (
        <div className="error-banner" style={{ marginBottom: '1.5rem' }}>
          <span>{error}</span>
          <button className="retry-btn" onClick={loadGames}>Retry</button>
        </div>
      )}

      {loading && (
        <>
          <p className="library-loading-note">Fetching library and matching games to IGDB…</p>
          <div className="loading-grid">
            {Array.from({ length: 12 }).map((_, i) => <div key={i} className="skeleton-card" />)}
          </div>
        </>
      )}

      {!loading && games && (
        <>
          <p className="library-count">{games.length} game{games.length !== 1 ? 's' : ''} in library</p>
          <div className="games-grid">
            {games.map((g) => (
              <LibraryCard key={g.appid ?? g.id} game={g} platform={platform} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Connect form ──────────────────────────────────────────────────────────────

function ConnectForm({ platform, authFetch, onConnected }) {
  const [value, setValue]       = useState('');
  const [error, setError]       = useState('');
  const [connecting, setConnecting] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { if (platform !== 'steam') inputRef.current?.focus(); }, [platform]);

  // Steam: OpenID redirect flow
  async function handleSteamLogin() {
    setConnecting(true);
    setError('');
    try {
      const res  = await authFetch('/api/library/steam/auth-init', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.href = data.redirectUrl; // full-page redirect to Steam
    } catch (err) {
      setError(err.message);
      setConnecting(false);
    }
  }

  // GOG: username-based
  async function handleGogSubmit(e) {
    e.preventDefault();
    if (!value.trim()) return;
    setConnecting(true);
    setError('');
    try {
      const res = await authFetch('/api/library/gog', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gogUsername: value.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onConnected(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setConnecting(false);
    }
  }

  if (platform === 'steam') {
    return (
      <div className="connect-panel">
        <div className="connect-card">
          <div className="connect-icon"><PlatformIcon id="steam" size={40} /></div>
          <h2 className="connect-title">Connect Steam</h2>
          <p className="connect-desc">
            You'll be redirected to Steam's official login page. We never see your password.
          </p>
          <p className="connect-api-note">
            Requires <code>STEAM_API_KEY</code> in <code>server/.env</code> to fetch your library.
            Get a free key at <strong>steamcommunity.com/dev/apikey</strong>. Your Steam profile and
            Game Details must be set to <strong>Public</strong>.
          </p>
          {error && <p className="connect-error">{error}</p>}
          <button className="btn-steam" onClick={handleSteamLogin} disabled={connecting}>
            {connecting ? 'Redirecting…' : (
              <><PlatformIcon id="steam" size={18} /> Login with Steam</>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="connect-panel">
      <div className="connect-card">
        <div className="connect-icon"><PlatformIcon id={platform} size={40} /></div>
        <h2 className="connect-title">Connect GOG</h2>
        <p className="connect-desc">
          Enter your GOG username. Your GOG profile and game list must be set to <strong>Public</strong>.
        </p>
        <form className="connect-form" onSubmit={handleGogSubmit}>
          <label className="form-label">GOG Username</label>
          <input
            ref={inputRef}
            type="text"
            className="form-input"
            placeholder="your-gog-username"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={connecting}
          />
          {error && <p className="connect-error">{error}</p>}
          <button type="submit" className="btn-primary" disabled={connecting || !value.trim()}>
            {connecting ? 'Connecting…' : 'Connect GOG Account'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Library game card ─────────────────────────────────────────────────────────

function LibraryCard({ game, platform }) {
  const [imgFailed, setImgFailed] = useState(false);
  const hours = game.playtime != null ? (game.playtime / 60).toFixed(1) : null;
  const displayHours = hours && parseFloat(hours) > 0 ? `${hours}h` : null;

  const coverSrc = imgFailed
    ? null
    : (game.coverUrl ?? game.image ?? null);

  const inner = (
    <>
      <div className="card-cover">
        {coverSrc ? (
          <img src={coverSrc} alt={game.name ?? game.title} loading="lazy" onError={() => setImgFailed(true)} />
        ) : (
          <div className="card-no-cover"><span>◈</span></div>
        )}
        {displayHours && (
          <div className="library-playtime">{displayHours}</div>
        )}
      </div>
      <div className="card-body">
        <h3 className="card-title">{game.name ?? game.title}</h3>
        <div className="card-meta">
          {game.year && <span className="card-year">{game.year}</span>}
          {game.genres?.slice(0, 2).map((g) => (
            <span key={g} className="badge">{g}</span>
          ))}
        </div>
      </div>
    </>
  );

  // Link to IGDB game detail if matched, else to store page
  if (game.igdbId) {
    return (
      <div className="game-card-wrap">
        <Link to={`/game/${game.igdbId}`} className="game-card">{inner}</Link>
      </div>
    );
  }

  const externalUrl = platform === 'steam'
    ? `https://store.steampowered.com/app/${game.appid}`
    : (game.url ?? '#');

  return (
    <div className="game-card-wrap">
      <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="game-card">{inner}</a>
    </div>
  );
}

// ── Coming Soon placeholder ────────────────────────────────────────────────────

function ComingSoon({ platform }) {
  const info = {
    epic: { note: 'Epic Games Store requires OAuth authentication. OAuth integration coming soon.' },
    xbox: { note: 'Xbox Live requires Microsoft OAuth. OAuth integration coming soon.' },
  }[platform] ?? {};

  return (
    <div className="connect-panel">
      <div className="connect-card">
        <div className="connect-icon"><PlatformIcon id={platform} size={40} /></div>
        <h2 className="connect-title">Coming Soon</h2>
        <p className="connect-desc">{info.note}</p>
      </div>
    </div>
  );
}

// ── Platform icons ────────────────────────────────────────────────────────────

function PlatformIcon({ id, size = 16 }) {
  if (id === 'steam') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.187.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.606 0 11.979 0z"/>
    </svg>
  );
  if (id === 'gog') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 4c4.411 0 8 3.589 8 8s-3.589 8-8 8-8-3.589-8-8 3.589-8 8-8zm0 2C8.686 6 6 8.686 6 12s2.686 6 6 6 6-2.686 6-6-2.686-6-6-6z"/>
    </svg>
  );
  if (id === 'epic') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 0v24l4.5-4.5V4.5L12 9l4.5-4.5V24L21 24V0H3z"/>
    </svg>
  );
  if (id === 'xbox') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.102 21.033C6.211 22.881 8.977 24 12 24c3.026 0 5.789-1.119 7.902-2.967 1.877-1.934-4.514-8.127-7.902-10.848-3.388 2.721-9.777 8.914-7.898 10.848zm11.16-14.406c2.5 2.961 7.484 10.313 6.076 12.912C23.002 17.48 24 14.861 24 12c0-3.34-1.365-6.362-3.57-8.536 0 0-2.01 1.35-5.168 3.163zm-6.522 0C5.578 4.814 3.568 3.464 3.568 3.464 1.365 5.638 0 8.66 0 12c0 2.861.998 5.48 2.64 7.539-1.401-2.6 3.579-9.951 6.1-12.912zM12 0C9.18 0 6.67.977 4.693 2.572c.1.085 7.225 4.96 7.307 5.02.082-.06 7.207-4.935 7.307-5.02C17.33.977 14.822 0 12 0z"/>
    </svg>
  );
  return null;
}
