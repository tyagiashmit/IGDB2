import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const FavContext = createContext(null);

export function FavoritesProvider({ children }) {
  const { isLoggedIn, authFetch } = useAuth();
  const [favorites, setFavorites] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLoggedIn) {
      fetchFavorites();
    } else {
      setFavorites({});
    }
  }, [isLoggedIn]);

  async function fetchFavorites() {
    setLoading(true);
    try {
      const res = await authFetch('/api/favorites');
      if (res.ok) setFavorites(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function addFavorite(gameId) {
    const res = await authFetch(`/api/favorites/${gameId}`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setFavorites((prev) => ({ ...prev, [String(gameId)]: data }));
      return true;
    }
    return false;
  }

  async function removeFavorite(gameId) {
    const res = await authFetch(`/api/favorites/${gameId}`, { method: 'DELETE' });
    if (res.ok) {
      setFavorites((prev) => {
        const next = { ...prev };
        delete next[String(gameId)];
        return next;
      });
      return true;
    }
    return false;
  }

  async function updatePlatforms(gameId, platforms) {
    const res = await authFetch(`/api/favorites/${gameId}/platforms`, {
      method: 'PUT',
      body: JSON.stringify({ platforms }),
    });
    const data = await res.json();
    if (res.ok) {
      setFavorites((prev) => ({ ...prev, [String(gameId)]: data }));
      return { ok: true };
    }
    return { ok: false, error: data.error };
  }

  const isFavorited = (gameId) => !!favorites[String(gameId)];
  const getFavorite = (gameId) => favorites[String(gameId)];

  return (
    <FavContext.Provider
      value={{ favorites, loading, isFavorited, getFavorite, addFavorite, removeFavorite, updatePlatforms, refetch: fetchFavorites }}
    >
      {children}
    </FavContext.Provider>
  );
}

export const useFavorites = () => useContext(FavContext);
