import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/**
 * Register page. Native account creation: email + password + confirm.
 *
 * On success the server creates the account UNVERIFIED and emails a verification
 * link; we show "Check your email to verify your account." No session is issued
 * until the email is verified. After verifying + signing in, the user picks their
 * role/plan in onboarding (/get-started).
 *
 * The email is prefilled from ?email= (set by claim / invite CTAs) when present.
 *
 * Zero em dashes.
 */
export default function Register() {
  const [params] = useSearchParams();
  const { createAccount, resendVerification } = useAuth();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [resent, setResent] = useState(false);
  const [agreed, setAgreed] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!email.trim()) return setErr('Enter your email address.');
    if (password.length < 8) return setErr('Password must be at least 8 characters.');
    if (password !== confirm) return setErr('Passwords do not match.');
    if (!agreed) return setErr('Please accept the Terms and Privacy Policy to continue.');
    setBusy(true);
    try {
      await createAccount(email.trim(), password, confirm);
      setDone(true);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not create your account.');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    try {
      await resendVerification(email.trim());
    } catch {
      /* no enumeration */
    }
    setResent(true);
  }

  return (
    <div className="reg">
      <style>{`
        .reg{min-height:100vh;background:#f3efe6;color:#2c2a26;font-family:Inter,system-ui,sans-serif;padding:40px 20px}
        .reg .wrap{max-width:480px;margin:0 auto}
        .reg .brand{font-family:'Cormorant Garamond',serif;font-size:24px;color:#123c2e;font-weight:700;text-align:center}
        .reg .tg{text-align:center;color:#7d776c;font-size:12px;letter-spacing:.5px;text-transform:uppercase;margin-bottom:24px}
        .reg .card{background:#fff;border:1px solid #e7e1d6;border-radius:16px;padding:28px;box-shadow:0 30px 60px -40px rgba(18,60,46,.4)}
        .reg h1{font-family:'Cormorant Garamond',serif;font-size:30px;color:#123c2e;margin:0 0 4px}
        .reg .sub{color:#7d776c;font-size:14px;margin-bottom:22px;line-height:1.5}
        .reg .lbl{font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#7d776c;margin:14px 0 8px}
        .reg input{width:100%;padding:12px;border:1px solid #e7e1d6;border-radius:10px;font-size:15px;font-family:Inter;box-sizing:border-box}
        .reg input:focus{outline:none;border-color:#1E5D4A}
        .reg .btn{width:100%;padding:14px;border:none;border-radius:12px;background:#1E5D4A;color:#fff;font-weight:700;font-size:15px;cursor:pointer;margin-top:18px}
        .reg .btn:disabled{opacity:.5;cursor:default}
        .reg .err{background:#fbe9e7;color:#a3382f;border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:14px}
        .reg .ok{background:#eef6f1;border:1px solid #cfe6da;color:#123c2e;border-radius:10px;padding:14px;font-size:14px;line-height:1.55}
        .reg .foot{font-size:13px;color:#7d776c;margin-top:14px;text-align:center}
        .reg a{color:#1E5D4A}
        .reg .link{background:none;border:none;padding:0;color:#1E5D4A;cursor:pointer;font:inherit;text-decoration:underline}
        .reg .consent{display:flex;gap:9px;align-items:flex-start;margin-top:16px;font-size:12.5px;color:#7d776c;line-height:1.5}
        .reg .consent input{width:auto;margin-top:2px}
      `}</style>
      <div className="wrap">
        <div className="brand">Divini Partners</div>
        <div className="tg">by Divini Group</div>
        <div className="card">
          {done ? (
            <>
              <h1>Check your email</h1>
              <div className="ok">
                Check your email to verify your account. We sent a verification link to{' '}
                <strong>{email}</strong>. Click it to activate your account and finish setting up.
              </div>
              <p className="foot">
                Did not get it?{' '}
                {resent ? (
                  <span>Sent again. Check your inbox and spam folder.</span>
                ) : (
                  <button type="button" className="link" onClick={resend}>Resend verification email</button>
                )}
              </p>
              <p className="foot">
                Already verified? <Link to="/login">Sign in</Link>
              </p>
            </>
          ) : (
            <>
              <h1>Create your account</h1>
              <div className="sub">Sign up with your email and a password. You will verify your email before signing in.</div>
              {err && <div className="err">{err}</div>}
              <form onSubmit={submit}>
                <div className="lbl">Email</div>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" autoComplete="email" />
                <div className="lbl">Password</div>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />
                <div className="lbl">Confirm password</div>
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter your password" autoComplete="new-password" />
                <label className="consent">
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                  <span>I am 18+ and agree to the <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>. I understand Divini Partners is a marketplace and is not a party to bookings or transactions between users; disputes are resolved directly between users, with arbitration as described in the Terms.</span>
                </label>
                <button className="btn" disabled={busy || !agreed}>{busy ? 'Creating...' : 'Create account'}</button>
              </form>
              <p className="foot">
                Already have an account? <Link to="/login">Sign in</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
