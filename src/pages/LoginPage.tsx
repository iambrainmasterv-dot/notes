import { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { api } from '../api/client';
import { readResetTokenFromUrl } from '../auth/resetTokenFromUrl';
import { APP_VERSION } from '../version';

const RESET_TOKEN_STORAGE_KEY = 'notesapp_pw_reset_token';

/** URL wins; mirror to sessionStorage so refresh / remount still has the token after we clean the URL. */
function getInitialResetToken(): string {
  if (typeof window === 'undefined') return '';
  const fromUrl = readResetTokenFromUrl();
  if (fromUrl) {
    try {
      sessionStorage.setItem(RESET_TOKEN_STORAGE_KEY, fromUrl);
    } catch {
      /* ignore */
    }
    return fromUrl;
  }
  try {
    const s = sessionStorage.getItem(RESET_TOKEN_STORAGE_KEY)?.trim() || '';
    return s.replace(/\s+/g, '').toLowerCase();
  } catch {
    return '';
  }
}

function clearStoredResetToken() {
  try {
    sessionStorage.removeItem(RESET_TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

type LoginMode = 'signin' | 'signup' | 'forgot' | 'reset';

export function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<LoginMode>(() => (getInitialResetToken() ? 'reset' : 'signin'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [resetToken, setResetToken] = useState(getInitialResetToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPw, setConfirmNewPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [forgotExtras, setForgotExtras] = useState<{ devResetUrl?: string; mailError?: string } | null>(null);

  useEffect(() => {
    const t = readResetTokenFromUrl();
    if (!t) return;
    try {
      sessionStorage.setItem(RESET_TOKEN_STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
    setResetToken(t);
    setMode('reset');
  }, []);

  const goSignIn = () => {
    setMode('signin');
    setError(null);
    setSuccess(null);
    setForgotExtras(null);
    clearStoredResetToken();
    setResetToken('');
    setNewPassword('');
    setConfirmNewPw('');
    const path = window.location.pathname + window.location.hash;
    window.history.replaceState({}, document.title, path);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (mode === 'forgot') {
      if (!email.trim()) {
        setError('Email is required.');
        return;
      }
      setLoading(true);
      setForgotExtras(null);
      try {
        const res = await api.forgotPassword(email);
        const base = res.message || 'If an account exists for that email, we sent password reset instructions.';
        if (res.mailConfigured === false) {
          setSuccess(
            `${base}\n\nOutbound email is not configured on this server (set SMTP_HOST and related variables in the API environment). No reset email can be sent until an administrator configures SMTP.`,
          );
        } else if (res.emailSent === false) {
          setSuccess(
            `${base}\n\nThe server could not send the message (check SMTP settings and server logs). If you are running locally, a reset link may appear below.`,
          );
          if (res.devResetUrl || res.mailError) {
            setForgotExtras({ devResetUrl: res.devResetUrl, mailError: res.mailError });
          }
        } else {
          setSuccess(base);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Request failed');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === 'reset') {
      if (!resetToken) {
        setError('This reset link is invalid. Request a new one from Sign in.');
        return;
      }
      if (!newPassword.trim() || newPassword.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      if (newPassword !== confirmNewPw) {
        setError('Passwords do not match.');
        return;
      }
      setLoading(true);
      try {
        await api.resetPassword(resetToken, newPassword);
        clearStoredResetToken();
        setResetToken('');
        setNewPassword('');
        setConfirmNewPw('');
        setMode('signin');
        setSuccess('Password updated. Sign in with your new password.');
        const path = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, path);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Request failed');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }
    if (mode === 'signup' && password !== confirmPw) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    const err = mode === 'signup' ? await signUp(email, password) : await signIn(email, password);
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

        <h2 className="login-title">
          {mode === 'signup' && 'Create Account'}
          {mode === 'signin' && 'Sign In'}
          {mode === 'forgot' && 'Reset password'}
          {mode === 'reset' && 'Choose new password'}
        </h2>

        <form className="login-form" onSubmit={handleSubmit}>
          {mode !== 'reset' && (
            <div className="form-group">
              <label>Email</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus={mode === 'signin' || mode === 'signup' || mode === 'forgot'}
                placeholder="you@example.com"
                disabled={mode === 'forgot' && Boolean(success)}
              />
            </div>
          )}

          {(mode === 'signin' || mode === 'signup') && (
            <>
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
              {mode === 'signup' && (
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
            </>
          )}

          {mode === 'forgot' && !success && (
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              We’ll email you a link to set a new password if this address is registered.
            </p>
          )}

          {mode === 'reset' && (
            <>
              <div className="form-group">
                <label>New password</label>
                <input
                  className="input"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Confirm new password</label>
                <input
                  className="input"
                  type="password"
                  value={confirmNewPw}
                  onChange={(e) => setConfirmNewPw(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </>
          )}

          {error && <p className="login-error">{error}</p>}
          {success && <p className="login-success">{success}</p>}
          {mode === 'forgot' && forgotExtras?.mailError && (
            <p className="login-error login-smtp-hint">SMTP error: {forgotExtras.mailError}</p>
          )}
          {mode === 'forgot' && forgotExtras?.devResetUrl && (
            <div className="login-dev-reset">
              <p className="login-dev-reset-title">Local reset link (email failed — use within 1 hour)</p>
              <a className="login-dev-reset-link" href={forgotExtras.devResetUrl}>
                {forgotExtras.devResetUrl}
              </a>
            </div>
          )}

          {!(mode === 'forgot' && success) && (
            <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
              {loading
                ? 'Please wait…'
                : mode === 'signup'
                  ? 'Sign Up'
                  : mode === 'signin'
                    ? 'Sign In'
                    : mode === 'forgot'
                      ? 'Send reset link'
                      : 'Update password'}
            </button>
          )}
        </form>

        {mode === 'signin' && (
          <p className="login-toggle" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setMode('forgot');
                setError(null);
                setSuccess(null);
                setForgotExtras(null);
              }}
            >
              Forgot password?
            </button>
          </p>
        )}

        {mode !== 'forgot' && mode !== 'reset' && (
          <p className="login-toggle">
            {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setMode((m) => (m === 'signup' ? 'signin' : 'signup'));
                setError(null);
                setSuccess(null);
              }}
            >
              {mode === 'signup' ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
        )}

        {(mode === 'forgot' || mode === 'reset') && (
          <p className="login-toggle">
            <button type="button" className="btn-link" onClick={goSignIn}>
              Back to Sign in
            </button>
          </p>
        )}

        <p className="login-version">v{APP_VERSION}</p>
      </div>
    </div>
  );
}
