import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { coverUrl, heroUrl } from '../utils/igdb';

const AUTO_MS = 6000;

export default function Spotlight() {
  const [games, setGames] = useState([]);
  const [index, setIndex] = useState(0);
  const timerRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    fetch('/api/games/trending')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!alive) return;
        // Prefer games that have artwork to show off.
        const withArt = (data || []).filter((g) => g.screenshots?.length || g.cover?.image_id);
        setGames(withArt.slice(0, 5));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (games.length <= 1) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIndex((i) => (i + 1) % games.length), AUTO_MS);
    return () => clearTimeout(timerRef.current);
  }, [index, games.length]);

  if (!games.length) return null;

  const go = (i) => setIndex((i + games.length) % games.length);

  return (
    <div className="spotlight">
      {games.map((game, i) => {
        const bg = game.screenshots?.[0]?.image_id
          ? heroUrl(game.screenshots[0].image_id)
          : game.cover?.image_id ? coverUrl(game.cover.image_id) : null;
        const cover = game.cover?.image_id ? coverUrl(game.cover.image_id) : null;
        const year = game.first_release_date
          ? new Date(game.first_release_date * 1000).getFullYear() : null;
        const score = game.communityRating ?? (game.aggregated_rating ? game.aggregated_rating / 10 : null);

        return (
          <div key={game.id} className={`spotlight-slide ${i === index ? 'active' : ''}`}>
            {bg && <div className="spotlight-bg" style={{ backgroundImage: `url(${bg})` }} />}
            <div className="spotlight-scrim" />
            <div className="spotlight-inner">
              {cover && (
                <div className="spotlight-cover">
                  <img src={cover} alt={game.name} />
                </div>
              )}
              <div className="spotlight-body">
                <span className="spotlight-eyebrow">🔥 Trending Now</span>
                <h2 className="spotlight-title">{game.name}</h2>
                <div className="spotlight-meta">
                  {score != null && (
                    <span className="spotlight-score">{score.toFixed(1)}<small>/10</small></span>
                  )}
                  {year && <span className="badge badge-outline">{year}</span>}
                  {game.genres?.slice(0, 2).map((g) => (
                    <span key={g.name} className="badge">{g.name}</span>
                  ))}
                </div>
                {game.summary && <p className="spotlight-summary">{game.summary}</p>}
                <div className="spotlight-cta">
                  <button className="btn-primary" onClick={() => navigate(`/game/${game.id}`)}>
                    View Game →
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {games.length > 1 && (
        <>
          <button className="spotlight-arrow prev" onClick={() => go(index - 1)} aria-label="Previous">‹</button>
          <button className="spotlight-arrow next" onClick={() => go(index + 1)} aria-label="Next">›</button>
          <div className="spotlight-dots">
            {games.map((_, i) => (
              <button
                key={i}
                className={`spotlight-dot ${i === index ? 'active' : ''}`}
                onClick={() => go(i)}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
