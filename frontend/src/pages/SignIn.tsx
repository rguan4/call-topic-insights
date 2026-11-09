import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiRequestError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

/** Test accounts shown only in the dev build. Passwords are also in README.md. */
const TEST_ACCOUNTS = [
  { name: 'Alex Chen', role: 'Editor', detail: 'All teams, can publish taxonomy changes', email: 'alex.chen@example.com', password: 'Editor#2026' },
  { name: 'Jordan Lee', role: 'Viewer', detail: 'Money Movement only, read-only', email: 'jordan.lee@example.com', password: 'Viewer#2026' }
];

export default function SignIn() {
  const { user, signIn, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={from} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Can't reach the API. Is the backend running on port 4000?");
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="signin">
      <div className="card">
        <h1 className="page-title" style={{ fontSize: 30 }}>Sign in to Call Topic Insights</h1>
        {sessionExpired && !error && <p role="status" className="banner">Your session has ended. Sign in again to continue.</p>}
        {error && <p role="alert" className="banner error">{error}</p>}

        <form className="signin-form" onSubmit={onSubmit} noValidate>
          <label className="field">
            Email
            <input className="input" type="email" name="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
          </label>
          <div className="field">
            <label htmlFor="signin-password">Password</label>
            <span className="password-row">
              <input id="signin-password" className="input" type={showPassword ? 'text' : 'password'} name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button type="button" className="btn btn-secondary btn-sm" aria-pressed={showPassword} aria-label="Show password" onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </span>
          </div>
          <button type="submit" className="btn btn-primary signin-submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {import.meta.env.DEV && (
          <section aria-labelledby="test-accounts" className="test-accounts">
            <h2 id="test-accounts" className="group-label">Test accounts</h2>
            {TEST_ACCOUNTS.map((a) => (
              <div key={a.email} className="test-account">
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600 }}>
                    {a.name} <span className="chip chip-violet">{a.role}</span>
                  </span>
                  <span className="small muted">{a.detail}</span>
                  <span className="small mono" style={{ display: 'block' }}>{a.email} · {a.password}</span>
                </span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEmail(a.email); setPassword(a.password); setError(null); }} aria-label={`Fill in ${a.name}'s test credentials`}>
                  Use
                </button>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
