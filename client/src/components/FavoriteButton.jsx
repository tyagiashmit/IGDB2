import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFavorites } from '../context/FavoritesContext';
import { useGamification } from '../context/GamificationContext';

export default function FavoriteButton({ gameId, size = 'md', className = '' }) {
  const { isLoggedIn, setShowLoginModal } = useAuth();
  const { isFavorited, addFavorite, removeFavorite } = useFavorites();
  const { awardFavorite } = useGamification();
  const [pending, setPending] = useState(false);
  const [burst, setBurst] = useState(false);
  const favorited = isFavorited(gameId);

  async function toggle(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoggedIn) { setShowLoginModal(true); return; }
    if (pending) return;
    setPending(true);
    try {
      if (favorited) {
        await removeFavorite(gameId);
      } else {
        const ok = await addFavorite(gameId);
        if (ok) {
          awardFavorite();
          setBurst(true);
          setTimeout(() => setBurst(false), 600);
        }
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      className={`fav-btn fav-btn-${size} ${favorited ? 'favorited' : ''} ${pending ? 'pending' : ''} ${burst ? 'just-faved' : ''} ${className}`}
      onClick={toggle}
      title={favorited ? 'Remove from favorites' : 'Add to favorites'}
      aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
    >
      {favorited ? '♥' : '♡'}
    </button>
  );
}
