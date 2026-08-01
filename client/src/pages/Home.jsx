import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import GameCard from '../components/GameCard';

const TABS = [
  { id: 'top',     label: 'Top Rated',      icon: '🏆', url: '/api/reviews/top-games' },
  { id: 'trending',label: 'Trending',        icon: '🔥', url: '/api/games/trending' },
  { id: 'latest',  label: 'Latest Release',  icon: '✨', url: '/api/games/latest' },
];

export default function Home() {
  // --- Home Tabs State ---
  const [activeTab, setActiveTab] = useState('top');
  const [tabData, setTabData]     = useState({});
  const [tabError, setTabError]   = useState({});
  const [tabLoading, setTabLoading] = useState({});

  // --- Search State ---
  const [searchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const genre = searchParams.get('genre') ?? '';

  const [searchGames, setSearchGames] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searched, setSearched] = useState(false);

  // --- Home Tabs Logic ---
  async function fetchTab(tabId) {
    if (tabData[tabId] !== undefined || tabLoading[tabId]) return;
    const tab = TABS.find((t) => t.id === tabId);
    setTabLoading((p) => ({ ...p, [tabId]: true }));
    setTabError((p) => ({ ...p, [tabId]: '' }));
    try {
      const res = await fetch(tab.url);
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}));
        throw new Error(msg.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setTabData((p) => ({ ...p, [tabId]: data }));
    } catch (err) {
      setTabError((p) => ({ ...p, [tabId]: err.message || 'Failed to load.' }));
    } finally {
      setTabLoading((p) => ({ ...p, [tabId]: false }));
    }
  }

  useEffect(() => { fetchTab(activeTab); }, [activeTab]);

  // --- Search Logic ---
  useEffect(() => {
    if (!q.trim() && !genre) {
      setSearchGames([]);
      setSearched(false);
      return;
    }
    doSearch(q, genre);
  }, [q, genre]);

  async function doSearch(query, genreId) {
    setSearchLoading(true);
    setSearchError('');
    try {
      let url = `/api/games/search?`;
      if (query) url += `q=${encodeURIComponent(query)}&`;
      if (genreId) url += `genre=${encodeURIComponent(genreId)}`;
      
      const res = await fetch(url);
      if (!res.ok) throw new Error('Search failed');
      setSearchGames(await res.json());
      setSearched(true);
    } catch {
      setSearchError('Search failed. Please try again.');
    } finally {
      setSearchLoading(false);
    }
  }

  const tab     = TABS.find((t) => t.id === activeTab);
  const homeGames   = tabData[activeTab];
  const homeLoading = tabLoading[activeTab];
  const homeError   = tabError[activeTab];

  const isSearching = q || genre || searched;

  return (
    <div className="page">
      {!isSearching && (
        <section className="hero" style={{ paddingBottom: '4rem', paddingTop: '2rem' }}>
          <div className="hero-content">
            <div className="hero-badge">Discover · Review · Share</div>
            <h1 className="hero-title">
              Your Ultimate<br />
              <span className="gradient-text">Game Database</span>
            </h1>
            <p className="hero-subtitle">
              Explore thousands of games, read community reviews, and share your gaming experiences.
            </p>
          </div>
          <div className="hero-orbs">
            <div className="orb orb-1" />
            <div className="orb orb-2" />
            <div className="orb orb-3" />
          </div>
        </section>
      )}

      {isSearching ? (
        /* SEARCH RESULTS */
        <div className="search-results">
          {searchError && <div className="error-banner">{searchError}</div>}

          {searchLoading && (
            <div className="loading-grid">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="skeleton-card" />
              ))}
            </div>
          )}

          {!searchLoading && searchGames.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">◈</div>
              <p>No games found</p>
              <p className="empty-sub">Try a different title, genre, or check your spelling.</p>
            </div>
          )}

          {!searchLoading && searchGames.length > 0 && (
            <>
              <p className="result-count">{searchGames.length} result{searchGames.length !== 1 ? 's' : ''}</p>
              <div className="games-grid">
                {searchGames.map((g) => (
                  <GameCard key={g.id} game={g} />
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        /* HOME TABS (BROWSE MODE) */
        <div className="home-tabs-section">
          <div className="home-tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                <span className="tab-icon">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {homeError && (
            <div className="error-banner">
              <div>
                <strong>Could not load {tab.label}.</strong>
                <p style={{ marginTop: '0.35rem', fontSize: '0.85rem', opacity: 0.85 }}>
                  {homeError}. Make sure you ran <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1em 0.4em', borderRadius: 4 }}>npm run dev</code> from the <strong>IGDB/</strong> root folder.
                </p>
              </div>
              <button className="retry-btn" onClick={() => {
                setTabData((p) => { const n = { ...p }; delete n[activeTab]; return n; });
                fetchTab(activeTab);
              }}>Retry</button>
            </div>
          )}

          {homeLoading && (
            <div className="loading-grid">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="skeleton-card" />
              ))}
            </div>
          )}

          {!homeLoading && !homeError && homeGames?.length === 0 && activeTab === 'top' && (
            <div className="empty-tab">
              <p>No community ratings yet.</p>
              <p className="empty-tab-sub">Browse games and leave reviews — rated games will appear here.</p>
            </div>
          )}

          {!homeLoading && !homeError && homeGames?.length > 0 && (
            <div className="games-grid">
              {homeGames.map((g) => (
                <GameCard key={g.id} game={g} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
