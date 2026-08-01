import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFavorites } from '../context/FavoritesContext';

export default function FavoriteButton({ gameId, size = 'md', className = '' }) {
  const { isLoggedIn, setShowLoginModal } = useAuth();
  const { isFavorited, addFavorite, removeFavorite } = useFavorites();
  const [pending, setPending] = useState(false);
  const favorited = isFavorited(gameId);

  async function toggle(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoggedIn) { setShowLoginModal(true); return; }
    if (pending) return;
    setPending(true);
    try {
      if (favorited) await removeFavorite(gameId);
      else await addFavorite(gameId);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      className={`fav-btn fav-btn-${size} ${favorited ? 'favorited' : ''} ${pending ? 'pending' : ''} ${className}`}
      onClick={toggle}
      title={favorited ? 'Remove from favorites' : 'Add to favorites'}
      aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
    >
      {favorited ? '♥' : '♡'}
    </button>
  );
}
