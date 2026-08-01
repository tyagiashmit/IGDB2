import { useAuth } from '../context/AuthContext';

/**
 * Wraps an interactive feature. Logged-in users get the real thing;
 * everyone else sees it blurred behind a "create an account" overlay —
 * visible, but locked, so it acts as an incentive to sign up.
 */
export default function LoginGate({
  children,
  title = 'Members only',
  message = 'Create a free account to unlock this feature.',
}) {
  const { isLoggedIn, setShowLoginModal } = useAuth();
  if (isLoggedIn) return children;

  return (
    <div className="login-gate">
      <div className="login-gate-content" aria-hidden="true">
        {children}
      </div>
      <div className="login-gate-overlay">
        <span className="login-gate-lock">🔒</span>
        <h4 className="login-gate-title">{title}</h4>
        <p className="login-gate-msg">{message}</p>
        <button className="btn-primary" onClick={() => setShowLoginModal(true)}>
          Create an account
        </button>
        <button className="link-btn" onClick={() => setShowLoginModal(true)}>
          or log in
        </button>
      </div>
    </div>
  );
}
