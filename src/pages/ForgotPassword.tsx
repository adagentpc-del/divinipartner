import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/**
 * /forgot : request a password reset link. Always confirms success (no user
 * enumeration). Calls POST /api/auth/forgot.
 *
 * Zero em dashes.
 */
export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await forgotPassword(email.trim());
    } catch {
      /* no enumeration */
    } finally {
      setBusy(false);
      setSent(true);
    }
  }

  return (
    <div className="center">
      <div className="auth-card">
        <h1 style={{ fontSize: 22 }}>Reset your password</h1>
        {sent ? (
          <>
            <p className="note" style={{ marginTop: 12, lineHeight: 1.6 }}>
              If an account exists for that email, we have sent a password reset link. Check your
              inbox and spam folder.
            </p>
            <p className="note" style={{ marginTop: 14 }}>
              <Link to="/login" style={{ color: '#1E5D4A' }}>Back to sign in</Link>
            </p>
          </>
        ) : (
          <>
            <p className="note" style={{ margin: '12px 0 16px', lineHeight: 1.6 }}>
              Enter your email and we will send you a link to reset your password.
            </p>
            <form onSubmit={submit}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@business.com"
                autoComplete="email"
                style={{ width: '100%', padding: 12, border: '1px solid #e7e1d6', borderRadius: 10, fontSize: 15, marginBottom: 14, boxSizing: 'border-box' }}
              />
              <button className="btn primary block lg" disabled={busy}>
                {busy ? 'Sending...' : 'Send reset link'}
              </button>
            </form>
            <p className="note" style={{ marginTop: 14 }}>
              <Link to="/login" style={{ color: '#1E5D4A' }}>Back to sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
