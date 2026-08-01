import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFavorites } from '../context/FavoritesContext';
import { useGamification } from '../context/GamificationContext';
import { levelFromXp } from '../utils/gamification';

export default function Navbar({ bgImage, setBgImage }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const genre = searchParams.get('genre') ?? '';

  const [inputVal, setInputVal] = useState(q);
  const [genreVal, setGenreVal] = useState(genre);
  const [genres, setGenres] = useState([]);
  const debounceRef = useRef(null);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const navigate = useNavigate();
  const { isLoggedIn, user, logout, setShowLoginModal } = useAuth();
  const { favorites } = useFavorites();
  const { stats } = useGamification();
  const lvl = levelFromXp(stats.xp);
  const dropRef = useRef(null);
  const fileInputRef = useRef(null);

  const favCount = Object.keys(favorites).length;

  useEffect(() => {
    fetch('/api/games/genres')
      .then(res => res.json())
      .then(data => setGenres(data))
      .catch(err => console.error("Failed to load genres", err));
  }, []);

  useEffect(() => {
    setInputVal(q);
    setGenreVal(genre);
  }, [q, genre]);

  useEffect(() => {
    function onClickOutside(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function updateSearchParams(newQ, newGenre) {
    const params = new URLSearchParams();
    if (newQ) params.set('q', newQ);
    if (newGenre) params.set('genre', newGenre);
    navigate(`/?${params.toString()}`);
  }

  function handleInput(e) {
    const val = e.target.value;
    setInputVal(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateSearchParams(val.trim(), genreVal);
    }, 400);
  }

  function handleGenreChange(e) {
    const val = e.target.value;
    setGenreVal(val);
    updateSearchParams(inputVal.trim(), val);
  }

  function handleSubmit(e) {
    e.preventDefault();
    updateSearchParams(inputVal.trim(), genreVal);
  }

  function handleClear() {
    setInputVal('');
    setGenreVal('');
    updateSearchParams('', '');
  }

  function handleLogout() {
    logout();
    setDropdownOpen(false);
    navigate('/');
  }

  function handleBgUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        const MAX_DIMENSION = 1920;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          } else {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        try {
          localStorage.setItem('gv_bg', dataUrl);
          if (setBgImage) setBgImage(dataUrl);
        } catch (err) {
          console.error("Could not save background. Image might be too large.", err);
          alert("Image is too large. Try a smaller file.");
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // reset file input
  }

  function handleBgClear() {
    localStorage.removeItem('gv_bg');
    if (setBgImage) setBgImage('');
  }

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="logo">
          <span className="logo-icon">◈</span>
          <span className="logo-text">GameVault</span>
        </Link>

        <form className="search-page-form" onSubmit={handleSubmit} style={{ display: 'flex', marginLeft: '2rem', flex: 1, maxWidth: '800px' }}>
          <div className="search-controls" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', width: '100%' }}>
            <div className="search-wrap large" style={{ flex: 1, position: 'relative' }}>
              <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                className="search-input"
                placeholder="Search games…"
                value={inputVal}
                onChange={handleInput}
                style={{ padding: '0.65rem 1.25rem 0.65rem 2.75rem', fontSize: '1rem', borderRadius: '10px' }}
              />
              {inputVal && (
                <button
                  type="button"
                  className="clear-btn"
                  onClick={handleClear}
                >
                  ✕
                </button>
              )}
            </div>
            
            <select
              className="genre-select"
              value={genreVal}
              onChange={handleGenreChange}
              style={{
                padding: '0.65rem 1rem',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--bg-card)',
                color: 'var(--text)',
                outline: 'none',
                cursor: 'pointer',
                fontSize: '1rem'
              }}
            >
              <option value="" style={{ background: 'var(--bg-card)', color: 'var(--text)' }}>All Genres</option>
              {genres.map(g => (
                <option key={g.id} value={g.id} style={{ background: 'var(--bg-card)', color: 'var(--text)' }}>{g.name}</option>
              ))}
            </select>
          </div>
        </form>

        <nav className="nav-links" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          
          {/* Theme / Background Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', marginRight: '0.5rem' }}>
            <button 
              className="nav-link" 
              title="Upload Custom Background"
              onClick={() => fileInputRef.current?.click()}
              style={{ padding: '0.4rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
            </button>
            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleBgUpload} style={{ display: 'none' }} />

            {bgImage && (
              <button 
                className="nav-link" 
                title="Clear Background" 
                onClick={handleBgClear} 
                style={{ padding: '0.4rem', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12"></path>
                </svg>
              </button>
            )}
          </div>

          <Link to="/" className="nav-link">Home</Link>
          {isLoggedIn && (
            <>
              <Link to="/favorites" className="nav-link fav-nav-link">
                ♥ Favorites
                {favCount > 0 && <span className="fav-count-badge">{favCount}</span>}
              </Link>
              <Link to="/library" className="nav-link">🎮 Library</Link>
            </>
          )}

          {isLoggedIn ? (
            <Link to="/profile" className="xp-widget" title={`Level ${lvl.level} · ${stats.xp} XP`}>
              <span className="xp-level-badge">{lvl.level}</span>
              <span className="xp-widget-body">
                <span className="xp-widget-top">
                  <span>LVL {lvl.level}</span>
                  <span>{lvl.toNext} to go</span>
                </span>
                <span className="xp-track">
                  <span className="xp-fill" style={{ width: `${lvl.pct}%` }} />
                </span>
              </span>
            </Link>
          ) : (
            <button
              className="xp-widget locked"
              title="Log in to earn XP and level up"
              onClick={() => setShowLoginModal(true)}
            >
              <span className="xp-level-badge">🔒</span>
              <span className="xp-locked-text">Log in to earn XP</span>
            </button>
          )}
        </nav>

        <div className="auth-section">
          {isLoggedIn ? (
            <div className="user-menu" ref={dropRef}>
              <button
                className="user-btn"
                onClick={() => setDropdownOpen((o) => !o)}
              >
                <div className="user-avatar">{user.username[0].toUpperCase()}</div>
                <span className="user-name">{user.username}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {dropdownOpen && (
                <div className="dropdown">
                  <Link to="/profile" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                    <span>🏆</span> My Profile
                    <span className="dropdown-count">Lv {lvl.level}</span>
                  </Link>
                  <Link to="/favorites" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                    <span>♥</span> My Favorites
                    {favCount > 0 && <span className="dropdown-count">{favCount}</span>}
                  </Link>
                  <Link to="/library" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                    <span>🎮</span> My Library
                  </Link>
                  <div className="dropdown-divider" />
                  <button className="dropdown-item dropdown-item-danger" onClick={handleLogout}>
                    <span>→</span> Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button className="login-btn" onClick={() => setShowLoginModal(true)}>
              Login
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
