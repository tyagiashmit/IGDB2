import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import StarRating from '../components/StarRating';
import ReviewForm from '../components/ReviewForm';
import ReviewList from '../components/ReviewList';
import FavoriteButton from '../components/FavoriteButton';
import PlatformTagger from '../components/PlatformTagger';
import { useAuth } from '../context/AuthContext';
import { useFavorites } from '../context/FavoritesContext';
import { coverUrl, screenshotUrl, heroUrl } from '../utils/igdb';

export default function GameDetail() {
  const { id } = useParams();
  const [game, setGame] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState(null);
  const [trailerVideoId, setTrailerVideoId] = useState(null);
  const { isLoggedIn } = useAuth();
  const { isFavorited } = useFavorites();

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError('');
      try {
        const [gameRes, reviewRes] = await Promise.all([
          fetch(`/api/games/${id}`),
          fetch(`/api/reviews/${id}`),
        ]);
        if (!gameRes.ok) throw new Error('Game not found');
        const [gameData, reviewData] = await Promise.all([
          gameRes.json(),
          reviewRes.json(),
        ]);
        setGame(gameData);
        setReviews(reviewData);
      } catch (err) {
        setError(err.message || 'Failed to load game.');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    window.scrollTo(0, 0);
  }, [id]);

  if (loading) return <div className="page"><div className="loading-spinner" /></div>;
  if (error) return (
    <div className="page">
      <div className="error-banner">{error}</div>
      <Link to="/" className="btn-secondary" style={{ marginTop: '1rem', display: 'inline-block' }}>← Back to Home</Link>
    </div>
  );
  if (!game) return null;

  const cover = game.cover?.image_id ? coverUrl(game.cover.image_id) : null;
  const hero = game.screenshots?.[0]?.image_id ? heroUrl(game.screenshots[0].image_id) : null;
  const year = game.first_release_date ? new Date(game.first_release_date * 1000).getFullYear() : null;
  const developer = game.involved_companies?.find((c) => c.developer)?.company?.name;
  const publisher = game.involved_companies?.find((c) => c.publisher)?.company?.name;
  const avgUserRating = reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : null;

  const favorited = isFavorited(id);

  function getBestTrailerId(videos) {
    if (!videos || !videos.length) return null;
    const lowerNames = videos.map(v => ({ id: v.video_id, name: v.name.toLowerCase() }));
    
    // Prioritize official/launch trailers, then gameplay trailers, then anything with 'trailer'
    const official = lowerNames.find(v => v.name.includes('official trailer') || v.name.includes('launch trailer'));
    if (official) return official.id;
    
    const gameplay = lowerNames.find(v => v.name.includes('gameplay trailer') || v.name.includes('gameplay'));
    if (gameplay) return gameplay.id;
    
    const trailer = lowerNames.find(v => v.name.includes('trailer'));
    if (trailer) return trailer.id;
    
    return videos[0].video_id; // Fallback
  }

  const bestTrailerId = game.videos ? getBestTrailerId(game.videos) : null;

  return (
    <div className="detail-page">
      <div className="detail-hero" style={hero ? { backgroundImage: `url(${hero})` } : {}}>
        <div className="hero-overlay" />
        <div className="hero-blur" style={hero ? { backgroundImage: `url(${hero})` } : {}} />
      </div>

      <div className="detail-main">
        {/* Sidebar */}
        <aside className="detail-sidebar">
          <div className="detail-cover">
            {cover ? <img src={cover} alt={game.name} /> : <div className="no-cover-large"><span>◈</span></div>}
          </div>

          <div className="detail-meta">
            {avgUserRating && (
              <div className="meta-item">
                <span className="meta-label">User Score</span>
                <div className="score-badge rating-user">
                  {avgUserRating}<span className="score-unit">/5</span>
                </div>
              </div>
            )}
            {year && <MetaRow label="Released" value={year} />}
            {developer && <MetaRow label="Developer" value={developer} />}
            {publisher && publisher !== developer && <MetaRow label="Publisher" value={publisher} />}
            {game.platforms?.length > 0 && (
              <div className="meta-item">
                <span className="meta-label">Platforms</span>
                <div className="badge-group">
                  {game.platforms.map((p) => {
                    let href = `https://www.google.com/search?q=${encodeURIComponent(`Buy ${game.name} on ${p.name}`)}`;
                    
                    if (game.websites) {
                      if (p.id === 6) { // PC
                        const pcStore = game.websites.find(w => w.url && (w.url.includes('steampowered.com') || w.url.includes('epicgames.com') || w.url.includes('gog.com')));
                        if (pcStore) href = pcStore.url;
                      } else if (p.name.includes('Xbox')) {
                        const xboxStore = game.websites.find(w => w.url && w.url.includes('xbox.com'));
                        if (xboxStore) href = xboxStore.url;
                      } else if (p.name.includes('PlayStation')) {
                        const psStore = game.websites.find(w => w.url && w.url.includes('store.playstation.com'));
                        if (psStore) href = psStore.url;
                      } else if (p.name.includes('Nintendo')) {
                        const nintendoStore = game.websites.find(w => w.url && w.url.includes('nintendo.com'));
                        if (nintendoStore) href = nintendoStore.url;
                      }
                    }

                    return (
                      <a 
                        key={p.name} 
                        href={href} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="badge badge-link"
                        title={`Buy on ${p.name}`}
                        style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                      >
                        {p.abbreviation ?? p.name}
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
            {game.game_modes?.length > 0 && (
              <div className="meta-item">
                <span className="meta-label">Modes</span>
                <div className="badge-group">
                  {game.game_modes.map((m) => (
                    <span key={m.name} className="badge badge-outline">{m.name}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main content */}
        <div className="detail-content">
          <Link to="/" className="back-link">← Back</Link>

          <div className="detail-genres">
            {game.genres?.map((g) => (
              <span key={g.name} className="genre-tag">{g.name}</span>
            ))}
          </div>

          <div className="detail-title-row" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
            <h1 className="detail-title" style={{ margin: 0 }}>{game.name}</h1>
            <FavoriteButton gameId={String(id)} size="lg" />
            {bestTrailerId && (
              <button 
                onClick={() => setTrailerVideoId(bestTrailerId)}
                className="btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                title="Watch Official Trailer"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="#ef4444">
                  <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
                </svg>
                Watch Trailer
              </button>
            )}
          </div>

          {/* Platform Tagger — only shown when game is favorited and user is logged in */}
          {isLoggedIn && favorited && game.platforms?.length > 0 && (
            <div className="detail-section">
              <h2 className="section-heading">
                <span>🎮</span> My Platforms
              </h2>
              <PlatformTagger gameId={String(id)} gamePlatforms={game.platforms} gameWebsites={game.websites} />
            </div>
          )}

          {/* Prompt to login for platform tagging */}
          {!isLoggedIn && (
            <div className="detail-section">
              <div className="platform-login-prompt">
                <span>♡</span>
                <p>Log in to favorite this game and tag your platforms</p>
              </div>
            </div>
          )}

          {game.summary && (
            <div className="detail-section">
              <h2 className="section-heading">About</h2>
              <p className="detail-summary">{game.summary}</p>
            </div>
          )}

          {game.screenshots?.length > 0 && (
            <div className="detail-section">
              <h2 className="section-heading">Screenshots</h2>
              <div className="screenshots-grid">
                {game.screenshots.slice(0, 8).map((s, i) => (
                  <button key={s.image_id} className="screenshot-thumb" onClick={() => setLightbox(s.image_id)}>
                    <img src={screenshotUrl(s.image_id)} alt={`Screenshot ${i + 1}`} loading="lazy" />
                    <div className="screenshot-overlay">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="detail-section reviews-section">
            <div className="reviews-header">
              <h2 className="section-heading">
                Community Reviews
                {reviews.length > 0 && <span className="review-count">{reviews.length}</span>}
              </h2>
              {avgUserRating && (
                <div className="avg-rating">
                  <StarRating value={Math.round(avgUserRating)} readOnly />
                  <span>{avgUserRating} / 5</span>
                </div>
              )}
            </div>
            <ReviewForm gameId={id} onSubmitted={(r) => setReviews((prev) => [r, ...prev])} />
            <ReviewList reviews={reviews} />
          </div>
        </div>
      </div>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <button className="lightbox-close" onClick={() => setLightbox(null)}>✕</button>
          <img src={heroUrl(lightbox)} alt="Screenshot" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {trailerVideoId && (
        <div className="lightbox" onClick={() => setTrailerVideoId(null)}>
          <button className="lightbox-close" onClick={() => setTrailerVideoId(null)}>✕</button>
          <div className="video-container" onClick={(e) => e.stopPropagation()} style={{ width: '90%', maxWidth: '900px', aspectRatio: '16/9', background: '#000' }}>
            <iframe
              width="100%"
              height="100%"
              src={`https://www.youtube.com/embed/${trailerVideoId}?autoplay=1`}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          </div>
        </div>
      )}
    </div>
  );
}

function MetaRow({ label, value }) {
  return (
    <div className="meta-item">
      <span className="meta-label">{label}</span>
      <span className="meta-value">{value}</span>
    </div>
  );
}

