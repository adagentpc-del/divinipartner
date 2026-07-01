/**
 * Public invite landing page (/join/:token).
 *
 * A vendor or client who was invited by a venue or partner lands here. We read
 * the invite (public endpoint, no auth), show who invited them and the free
 * value message, and route them to free registration with the token attached so
 * the referral is credited.
 *
 * Self-contained, brand-consistent styling. Zero em dashes.
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGet } from '../../lib/api';
import { useAuth } from '../../lib/auth';

type InvitePublic = {
  token: string;
  role: string;
  invitee_email: string;
  invitee_name?: string | null;
  message?: string | null;
  status: string;
  inviter_name?: string | null;
};

export default function JoinInvite() {
  const { token = '' } = useParams();
  const nav = useNavigate();
  const { session } = useAuth();

  const [invite, setInvite] = useState<InvitePublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await apiGet<{ invite: InvitePublic }>(`/invites/token/${token}`);
        if (live) setInvite(r.invite);
      } catch (e: any) {
        if (live) setErr(e?.message ?? 'This invite could not be found.');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [token]);

  function accept() {
    // Carry the token through so registration credits the referral. We stash the
    // token so it survives account creation + email verification, then the
    // /get-started org-setup step reads it back.
    try {
      sessionStorage.setItem('divini.invite', token);
    } catch {
      /* storage may be unavailable */
    }
    // Already signed in: go straight to org setup with the invite attached.
    if (session) {
      nav(`/get-started?invite=${encodeURIComponent(token)}`);
      return;
    }
    // New user: create an account with email + password (prefill the invite
    // email), verify, then finish setup. The stashed invite token is applied at
    // /get-started.
    const email = invite?.invitee_email ?? '';
    nav(`/register${email ? `?email=${encodeURIComponent(email)}` : ''}`);
  }

  const inviter = invite?.inviter_name || 'A Divini Partners member';
  const roleWord = invite?.role === 'client' ? 'client' : invite?.role || 'partner';

  return (
    <div className="ji">
      <style>{CSS}</style>
      <div className="ji-wrap">
        <div className="ji-brand">Divini Partners</div>
        <div className="ji-by">by Divini Group</div>

        <div className="ji-card">
          {loading ? (
            <div className="ji-loading">Loading your invitation…</div>
          ) : err ? (
            <>
              <h1>Invitation unavailable</h1>
              <p className="ji-sub">{err}</p>
              <button type="button" className="ji-btn ghost" onClick={() => nav('/')}>
                Go to Divini Partners
              </button>
            </>
          ) : invite?.status === 'accepted' ? (
            <>
              <div className="ji-kicker">Invitation accepted</div>
              <h1>You are already on Divini Partners</h1>
              <p className="ji-sub">This invitation has already been used to create a profile.</p>
              <button type="button" className="ji-btn" onClick={() => nav('/login')}>
                Sign in
              </button>
            </>
          ) : (
            <>
              <div className="ji-kicker">You are invited</div>
              <h1>{inviter} invited you to join Divini Partners</h1>
              <p className="ji-sub">
                You have been invited to create your free {roleWord} profile. Divini Partners is
                where venues, vendors, planners, and clients work together on events.
              </p>

              {invite?.message ? (
                <blockquote className="ji-msg">
                  <span className="ji-msglbl">A note from {inviter}</span>
                  {invite.message}
                </blockquote>
              ) : null}

              <ul className="ji-points">
                <li>Creating your profile is completely free.</li>
                <li>Get discovered by clients, venues, and planners on the platform.</li>
                <li>Quote, book, and get paid in one place.</li>
              </ul>

              <button type="button" className="ji-btn" onClick={accept}>
                Create my free profile
              </button>
              <p className="ji-fine">
                Inviting as <strong>{invite?.invitee_email}</strong>. No payment required to join.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const CSS = `
.ji{--em:#123c2e;--em2:#1E5D4A;--gold:#C9A35B;--ink:#2c2a26;--muted:#7d776c;--line:#e7e1d6;
  min-height:100vh;background:#f3efe6;color:var(--ink);font-family:Inter,system-ui,sans-serif;
  display:grid;place-items:center;padding:40px 20px}
.ji *,.ji *::before,.ji *::after{box-sizing:border-box}
.ji-wrap{max-width:520px;width:100%}
.ji-brand{font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;color:var(--em);font-weight:700;text-align:center}
.ji-by{text-align:center;color:var(--muted);font-size:11px;letter-spacing:.6px;text-transform:uppercase;margin-bottom:22px}
.ji-card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:30px 28px;
  box-shadow:0 40px 80px -50px rgba(18,60,46,.45)}
.ji-card h1{font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:600;color:var(--em);
  margin:0 0 10px;line-height:1.12}
.ji-kicker{font-size:10.5px;letter-spacing:1.4px;text-transform:uppercase;color:var(--gold);font-weight:700;margin-bottom:8px}
.ji-sub{font-size:14px;color:var(--muted);line-height:1.55;margin:0 0 18px}
.ji-msg{margin:0 0 18px;border-left:3px solid var(--gold);background:#fbf7ee;border-radius:0 10px 10px 0;
  padding:12px 14px;font-size:13.5px;color:var(--ink);line-height:1.5;font-style:italic}
.ji-msglbl{display:block;font-style:normal;font-size:10.5px;letter-spacing:.5px;text-transform:uppercase;
  color:var(--muted);font-weight:700;margin-bottom:5px}
.ji-points{list-style:none;margin:0 0 22px;padding:0;display:flex;flex-direction:column;gap:9px}
.ji-points li{position:relative;padding-left:24px;font-size:13.5px;color:var(--ink);line-height:1.45}
.ji-points li::before{content:'';position:absolute;left:0;top:6px;width:13px;height:13px;border-radius:50%;
  background:rgba(201,163,91,.25);border:1px solid var(--gold)}
.ji-btn{width:100%;background:var(--em);color:#fff;border:0;border-radius:12px;font:inherit;font-size:15px;
  font-weight:700;padding:14px;cursor:pointer;transition:background .15s ease}
.ji-btn:hover{background:var(--em2)}
.ji-btn.ghost{background:transparent;color:var(--em);border:1px solid var(--line)}
.ji-btn.ghost:hover{border-color:var(--em);background:rgba(18,60,46,.04)}
.ji-fine{font-size:12px;color:var(--muted);text-align:center;margin:12px 0 0;line-height:1.5}
.ji-loading{color:var(--muted);font-size:14px;text-align:center;padding:24px 0}
`;
