import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { APP_VERSION } from '../version';

export function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }
    if (isSignUp && password !== confirmPw) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    const err = isSignUp ? await signUp(email, password) : await signIn(email, password);
    setLoading(false);

    if (err) {
      setError(err);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-mark">N</div>
          <span className="brand-text">NoteTasks</span>
        </div>

        <h2 className="login-title">{isSignUp ? 'Create Account' : 'Sign In'}</h2>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              placeholder="you@example.com"
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {isSignUp && (
            <div className="form-group">
              <label>Confirm Password</label>
              <input
                className="input"
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          )}

          {error && <p className="login-error">{error}</p>}
          {success && <p className="login-success">{success}</p>}

          <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
            {loading ? 'Please wait…' : isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
        </form>

        <p className="login-toggle">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            className="btn-link"
            type="button"
            onClick={() => { setIsSignUp((p) => !p); setError(null); setSuccess(null); }}
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </p>

        <p className="login-version">v{APP_VERSION}</p>
      </div>
    </div>
  );
}
