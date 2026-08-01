import { Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FavoritesProvider } from './context/FavoritesContext';
import AuthModal from './components/AuthModal';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import GameDetail from './pages/GameDetail';
import Favorites from './pages/Favorites';
import Library from './pages/Library';

import { useState, useEffect } from 'react';

function AppShell() {
  const { showLoginModal, setShowLoginModal } = useAuth();
  const [bgImage, setBgImage] = useState(() => localStorage.getItem('gv_bg') || '');

  return (
    <div className="app">
      {bgImage && <div className="app-bg-layer" style={{ backgroundImage: `url(${bgImage})` }} />}
      <Navbar bgImage={bgImage} setBgImage={setBgImage} />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/game/:id" element={<GameDetail />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/library" element={<Library />} />
        </Routes>
      </main>
      {showLoginModal && <AuthModal onClose={() => setShowLoginModal(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <FavoritesProvider>
        <AppShell />
      </FavoritesProvider>
    </AuthProvider>
  );
}
