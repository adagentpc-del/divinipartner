import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { apiSend } from '../lib/api';

/**
 * /reset?token=... : set a new password from a reset link. Calls POST
 * /api/auth/reset, which sets the password and issues a session, then routes
 * into the app.
 *
 * Zero em dashes.
 */
type ResetResponse = { ok: boolean; token: string; user: { id: string; email: string | null }; isAdmin: boolean };

export default function ResetPassword() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { applySessionResponse } = useAuth();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!token) return setErr('This reset link is missing its token.');
    if (password.length < 8) return setErr('Password must be at least 8 characters.');
    if (password !== confirm) return setErr('Passwords do not match.');
    setBusy(true);
    try {
      const resp = await apiSend<ResetResponse>('POST', '/auth/reset', { token, password });
      await applySessionResponse(resp);
      nav('/app', { replace: true });
    } catch (e: any) {
      setErr(e?.message ?? 'Could not reset your password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <div className="auth-card">
        <h1 style={{ fontSize: 22 }}>Choose a new password</h1>
        {err && (
          <div style={{ background: '#fbe9e7', color: '#a3382f', borderRadius: 10, padding: '10px 12px', fontSize: 13, margin: '12px 0' }}>
            {err}
          </div>
        )}
        <form onSubmit={submit} style={{ marginTop: 12 }}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password (at least 8 characters)"
            autoComplete="new-password"
            style={{ width: '100%', padding: 12, border: '1px solid #e7e1d6', borderRadius: 10, fontSize: 15, marginBottom: 12, boxSizing: 'border-box' }}
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            autoComplete="new-password"
            style={{ width: '100%', padding: 12, border: '1px solid #e7e1d6', borderRadius: 10, fontSize: 15, marginBottom: 16, boxSizing: 'border-box' }}
          />
          <button className="btn primary block lg" disabled={busy}>
            {busy ? 'Saving...' : 'Set new password'}
          </button>
        </form>
        <p className="note" style={{ marginTop: 14 }}>
          <Link to="/login" style={{ color: '#1E5D4A' }}>Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
