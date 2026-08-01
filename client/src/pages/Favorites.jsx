import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFavorites } from '../context/FavoritesContext';
import { coverUrl } from '../utils/igdb';

export default function Favorites() {
  const { isLoggedIn, setShowLoginModal } = useAuth();
  const { favorites, loading: favLoading } = useFavorites();
  const [games, setGames] = useState({});
  const [fetching, setFetching] = useState(false);

  const favIds = Object.keys(favorites);

  useEffect(() => {
    if (!isLoggedIn || !favIds.length) { setGames({}); return; }
    setFetching(true);
    fetch(`/api/games/batch?ids=${favIds.join(',')}`)
      .then((r) => r.json())
      .then((data) => {
        const map = {};
        data.forEach((g) => { map[String(g.id)] = g; });
        setGames(map);
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [favIds.join(','), isLoggedIn]);

  if (!isLoggedIn) {
    return (
      <div className="page">
        <div className="empty-state" style={{ paddingTop: '6rem' }}>
          <div className="empty-icon">♡</div>
          <p>Sign in to see your favorite games</p>
          <button className="btn-primary" style={{ marginTop: '1.5rem' }} onClick={() => setShowLoginModal(true)}>
            Login / Register
          </button>
        </div>
      </div>
    );
  }

  const isLoading = favLoading || fetching;

  return (
    <div className="page">
      <div className="search-page-header">
        <h1 className="page-title">My Favorites</h1>
        {!isLoading && favIds.length > 0 && (
          <p style={{ color: 'var(--text-2)', fontSize: '0.875rem' }}>
            {favIds.length} game{favIds.length !== 1 ? 's' : ''} saved
          </p>
        )}
      </div>

      {isLoading && (
        <div className="loading-grid">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton-card" />)}
        </div>
      )}

      {!isLoading && !favIds.length && (
        <div className="empty-state">
          <div className="empty-icon">◈</div>
          <p>No favorites yet</p>
          <p className="empty-sub">Click the ♡ on any game to add it here.</p>
          <Link to="/" className="btn-primary" style={{ marginTop: '1.5rem', display: 'inline-block' }}>
            Browse Games
          </Link>
        </div>
      )}

      {!isLoading && favIds.length > 0 && (
        <div className="fav-list">
          {favIds.map((gid) => {
            const game = games[gid];
            const fav = favorites[gid];
            return (
              <FavCard key={gid} gameId={gid} game={game} fav={fav} />
            );
          })}
        </div>
      )}
    </div>
  );
}

function FavCard({ gameId, game, fav }) {
  const cover = game?.cover?.image_id ? coverUrl(game.cover.image_id) : null;
  const year = game?.first_release_date
    ? new Date(game.first_release_date * 1000).getFullYear()
    : null;
  return (
    <div className="fav-card">
      <Link to={`/game/${gameId}`} className="fav-card-cover">
        {cover ? (
          <img src={cover} alt={game?.name ?? 'Game'} />
        ) : (
          <div className="fav-no-cover">◈</div>
        )}
      </Link>

      <div className="fav-card-body">
        <div className="fav-card-top">
          <div>
            <Link to={`/game/${gameId}`} className="fav-card-title">
              {game?.name ?? `Game #${gameId}`}
            </Link>
            <div className="fav-card-meta">
              {year && <span className="card-year">{year}</span>}
              {game?.genres?.slice(0, 2).map((g) => (
                <span key={g.name} className="badge">{g.name}</span>
              ))}
            </div>
          </div>
          <span className="fav-added">
            Added {new Date(fav.addedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>

        <div className="fav-platforms-row">
          <span className="fav-platforms-label">Your platforms:</span>
          {fav.platforms?.length ? (
            <div className="badge-group">
              {fav.platforms.map((p) => (
                <span key={p} className="badge badge-platform">{p}</span>
              ))}
            </div>
          ) : (
            <Link to={`/game/${gameId}`} className="fav-no-platforms">
              Tag your platforms →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
