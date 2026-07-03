import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/**
 * Login page. Native email + password authentication.
 *
 * On success a session cookie is set and the bearer token is stored, then we go
 * to /app. Unverified accounts get a clear "verify your email" message with a
 * one-click resend. Links to register and forgot-password.
 *
 * Zero em dashes.
 */
export default function Login() {
  const { session, signIn, resendVerification, signOut } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem('divini.lastEmail') || ''; } catch { return ''; }
  });
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [needsVerify, setNeedsVerify] = useState(false);
  const [resent, setResent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setNeedsVerify(false);
    setResent(false);
    if (!email.trim() || !password) {
      setErr('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      try { localStorage.setItem('divini.lastEmail', email.trim()); } catch { /* ignore */ }
      nav('/app', { replace: true });
    } catch (e: any) {
      const msg = e?.message ?? 'Could not sign you in.';
      if (/verify/i.test(msg)) setNeedsVerify(true);
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    try {
      await resendVerification(email.trim());
      setResent(true);
    } catch {
      setResent(true); // no enumeration; show the same confirmation
    }
  }

  return (
    <div className="center">
      <div className="auth-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <img src="/brand/mark-emerald.png" alt="Divini Partners" style={{ width: 46, height: 46, objectFit: 'contain' }} />
          <div>
            <h1 style={{ fontSize: 24 }}>Divini Partners</h1>
            <div className="note">Event partnership marketplace</div>
          </div>
        </div>

        {session ? (
          <div>
            <div style={{ background: '#eef4f0', border: '1px solid #cfe0d6', borderRadius: 10, padding: '12px 14px', fontSize: 14, marginBottom: 14 }}>
              You are signed in as <strong>{session.user.email || 'your account'}</strong>.
            </div>
            <button className="btn primary block lg" onClick={() => nav('/app', { replace: true })}>
              Continue to your account
            </button>
            <button className="btn block" style={{ marginTop: 10 }} onClick={() => void signOut()}>
              Switch account
            </button>
          </div>
        ) : (
        <>
        {err && (
          <div style={{ background: '#fbe9e7', color: '#a3382f', borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: 14 }}>
            {err}
            {needsVerify && (
              <div style={{ marginTop: 8 }}>
                {resent ? (
                  <span>Verification email sent. Check your inbox.</span>
                ) : (
                  <button type="button" className="btn" onClick={resend} style={{ padding: '6px 12px' }}>
                    Resend verification email
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <form onSubmit={submit}>
          <label htmlFor="login-email" className="note" style={{ display: 'block', marginBottom: 6 }}>Email</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@business.com"
            autoComplete="email"
            style={{ width: '100%', padding: 12, border: '1px solid #8a8378', borderRadius: 10, fontSize: 15, marginBottom: 12, boxSizing: 'border-box' }}
          />
          <label htmlFor="login-password" className="note" style={{ display: 'block', marginBottom: 6 }}>Password</label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            autoComplete="current-password"
            style={{ width: '100%', padding: 12, border: '1px solid #8a8378', borderRadius: 10, fontSize: 15, marginBottom: 16, boxSizing: 'border-box' }}
          />
          <button className="btn primary block lg" disabled={busy}>
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="note" style={{ margin: '14px 0 0', lineHeight: 1.6 }}>
          New to Divini Partners? <Link to="/register" style={{ color: '#1E5D4A' }}>Create an account</Link>
        </p>
        <p className="note" style={{ margin: '6px 0 0', lineHeight: 1.6 }}>
          <Link to="/forgot" style={{ color: '#1E5D4A' }}>Forgot password?</Link>
        </p>
        </>
        )}
      </div>
    </div>
  );
}
