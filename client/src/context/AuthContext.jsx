import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('gv_auth');
      if (saved) {
        const { user: u, token: t } = JSON.parse(saved);
        setUser(u);
        setToken(t);
      }
    } catch {
      localStorage.removeItem('gv_auth');
    }
  }, []);

  function login(userData, tokenValue) {
    setUser(userData);
    setToken(tokenValue);
    localStorage.setItem('gv_auth', JSON.stringify({ user: userData, token: tokenValue }));
    setShowLoginModal(false);
  }

  function logout() {
    setUser(null);
    setToken(null);
    localStorage.removeItem('gv_auth');
  }

  function authFetch(url, options = {}) {
    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        authFetch,
        isLoggedIn: !!user,
        showLoginModal,
        setShowLoginModal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
