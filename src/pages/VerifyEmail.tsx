import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/**
 * /verify-email?token=... : confirm a new account.
 *
 * Calls GET /api/auth/verify, which marks the email verified and issues a
 * session (cookie + token). We store the session and route into the app (the
 * Gate sends a brand-new user without an org to /get-started).
 *
 * Zero em dashes.
 */
const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

type VerifyResponse = { ok: boolean; token: string; user: { id: string; email: string | null }; isAdmin: boolean };

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { applySessionResponse } = useAuth();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<'working' | 'ok' | 'error'>('working');
  const [msg, setMsg] = useState('Verifying your email...');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) {
      setStatus('error');
      setMsg('This verification link is missing its token.');
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${BASE}/api/auth/verify?token=${encodeURIComponent(token)}`, {
          credentials: 'include',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Verification failed.');
        await applySessionResponse(data as VerifyResponse);
        setStatus('ok');
        setMsg('Your email is verified. Taking you to your account...');
        setTimeout(() => nav('/app', { replace: true }), 1200);
      } catch (e: any) {
        setStatus('error');
        setMsg(e?.message ?? 'This verification link is invalid or has expired.');
      }
    })();
  }, [token, applySessionResponse, nav]);

  return (
    <div className="center">
      <div className="auth-card">
        <h1 style={{ fontSize: 22 }}>Verify your email</h1>
        <p className="note" style={{ marginTop: 12, lineHeight: 1.6 }}>{msg}</p>
        {status === 'error' && (
          <p className="note" style={{ marginTop: 14 }}>
            <Link to="/login" style={{ color: '#1E5D4A' }}>Back to sign in</Link>
          </p>
        )}
      </div>
    </div>
  );
}
