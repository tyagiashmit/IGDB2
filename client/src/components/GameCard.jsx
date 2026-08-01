import { Link } from 'react-router-dom';
import { coverUrl } from '../utils/igdb';
import FavoriteButton from './FavoriteButton';

export default function GameCard({ game }) {
  const cover = game.cover?.image_id ? coverUrl(game.cover.image_id) : null;
  const year = game.first_release_date
    ? new Date(game.first_release_date * 1000).getFullYear()
    : null;

  return (
    <div className="game-card-wrap">
      <Link to={`/game/${game.id}`} className="game-card">
        <div className="card-cover">
          {cover ? (
            <img src={cover} alt={game.name} loading="lazy" />
          ) : (
            <div className="card-no-cover">
              <span>◈</span>
            </div>
          )}
          {game.communityRating != null && (
            <div className="card-rating rating-user">
              ★ {game.communityRating.toFixed(1)}
            </div>
          )}
          <span className="card-quickview">View Game →</span>
        </div>
        <div className="card-body">
          <h3 className="card-title">{game.name}</h3>
          <div className="card-meta">
            {year && <span className="card-year">{year}</span>}
            {game.genres?.slice(0, 2).map((g) => (
              <span key={g.name} className="badge">{g.name}</span>
            ))}
          </div>
          {game.communityRating != null && (
            <div>
              <div className="card-score-row">
                <span>Community</span>
                <strong>★ {game.communityRating.toFixed(1)}</strong>
                <span>/10</span>
              </div>
              <div className="card-ratingbar">
                <div className="card-ratingbar-fill" style={{ width: `${(game.communityRating / 10) * 100}%` }} />
              </div>
            </div>
          )}
        </div>
      </Link>
      <FavoriteButton gameId={String(game.id)} size="sm" className="card-fav-btn" />
    </div>
  );
}

