import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

// Module 2 - Platform Referral Program + Platform Credits.
//
// A universal, per-user dashboard: your referral link + code, how many
// referrals you have sent and converted, and your credit ledger totals (earned,
// redeemed, current balance). Credits are non-cash and redeemable only toward a
// Divini Partners subscription. Reads /api/referrals/me + /api/credits/me; an
// invite action posts to /api/referrals/track. IDOR-safe on the server (every
// call is scoped to the signed-in user).

type ReferralRow = {
  id: string;
  referred_email: string | null;
  status: 'pending' | 'converted' | 'expired';
  created_at: string;
  converted_at: string | null;
};

type ReferralMe = {
  code: string;
  link: string;
  referralsSent: number;
  referralsConverted: number;
  referralsPending: number;
  referrals: ReferralRow[];
};

type CreditMe = {
  balanceCents: number;
  earnedCents: number;
  redeemedCents: number;
  expiredCents: number;
  pendingCents: number;
};

function usd(cents: number): string {
  return `$${((cents || 0) / 100).toFixed(2)}`;
}

function absoluteLink(link: string): string {
  if (/^https?:\/\//i.test(link)) return link;
  if (typeof window !== 'undefined') return `${window.location.origin}${link}`;
  return link;
}

export default function ReferralDashboard() {
  const [ref, setRef] = useState<ReferralMe | null>(null);
  const [credits, setCredits] = useState<CreditMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [r, c] = await Promise.all([
        apiGet<ReferralMe>('/referrals/me'),
        apiGet<CreditMe>('/credits/me'),
      ]);
      setRef(r);
      setCredits(c);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function copyLink() {
    if (!ref) return;
    const url = absoluteLink(ref.link);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Could not copy. Select the link and copy manually.');
    }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    setInviting(true);
    setInviteMsg(null);
    try {
      await apiSend('POST', '/referrals/track', { referredEmail: email });
      setInviteEmail('');
      setInviteMsg('Invite tracked. Share your link with them to convert.');
      await load();
    } catch (err) {
      setInviteMsg((err as Error).message);
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="rd">
      <style>{CSS}</style>

      <header className="rd-head">
        <span className="rd-kicker">Member Program</span>
        <h1 className="rd-title">Referrals and Credits</h1>
        <p className="rd-sub">
          Invite venues, vendors, and planners you trust. When they join and subscribe, you earn
          platform credit toward your own Divini Partners membership, and they get 50% off their
          first two months. Credits apply to subscriptions only and are non-transferable.
        </p>
      </header>

      {error && <div className="rd-error">{error}</div>}

      {loading ? (
        <div className="rd-empty">Loading your referral program.</div>
      ) : !ref || !credits ? (
        <div className="rd-empty">Your referral program is not available right now.</div>
      ) : (
        <>
          <section className="rd-linkcard">
            <div className="rd-linkcard-main">
              <span className="rd-label">Your referral link</span>
              <code className="rd-link">{absoluteLink(ref.link)}</code>
              <span className="rd-codeline">
                Code <strong>{ref.code}</strong>
              </span>
            </div>
            <button type="button" className="rd-btn" onClick={copyLink}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </section>

          <section className="rd-stats">
            <div className="rd-stat">
              <span className="rd-stat-n">{ref.referralsSent}</span>
              <span className="rd-stat-l">Referrals sent</span>
            </div>
            <div className="rd-stat">
              <span className="rd-stat-n">{ref.referralsConverted}</span>
              <span className="rd-stat-l">Converted</span>
            </div>
            <div className="rd-stat rd-accent">
              <span className="rd-stat-n">{usd(credits.balanceCents)}</span>
              <span className="rd-stat-l">Current balance</span>
            </div>
            <div className="rd-stat">
              <span className="rd-stat-n">{usd(credits.earnedCents)}</span>
              <span className="rd-stat-l">Credits earned</span>
            </div>
            <div className="rd-stat">
              <span className="rd-stat-n">{usd(credits.redeemedCents)}</span>
              <span className="rd-stat-l">Credits redeemed</span>
            </div>
          </section>

          <section className="rd-invite">
            <form onSubmit={sendInvite} className="rd-invite-form">
              <label>
                Invite by email
                <input
                  type="email"
                  value={inviteEmail}
                  placeholder="partner@email.com"
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </label>
              <button type="submit" className="rd-btn" disabled={inviting || !inviteEmail.trim()}>
                {inviting ? 'Sending.' : 'Track invite'}
              </button>
            </form>
            {inviteMsg && <p className="rd-invite-msg">{inviteMsg}</p>}
          </section>

          <section className="rd-list-wrap">
            <h2 className="rd-h2">Your referrals</h2>
            {ref.referrals.length === 0 ? (
              <div className="rd-empty">
                No referrals yet. Share your link to start earning credit.
              </div>
            ) : (
              <table className="rd-table">
                <thead>
                  <tr>
                    <th>Referred</th>
                    <th>Status</th>
                    <th>Sent</th>
                    <th>Converted</th>
                  </tr>
                </thead>
                <tbody>
                  {ref.referrals.map((r) => (
                    <tr key={r.id}>
                      <td>{r.referred_email || '-'}</td>
                      <td>
                        <span className={`rd-badge rd-${r.status}`}>{r.status}</span>
                      </td>
                      <td>{r.created_at ? new Date(r.created_at).toLocaleDateString() : '-'}</td>
                      <td>{r.converted_at ? new Date(r.converted_at).toLocaleDateString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <p className="rd-fine">
            Platform credits are a non-cash benefit redeemable only toward Divini Partners
            subscriptions and memberships. They are non-transferable and cannot be withdrawn or
            cashed out.
          </p>
        </>
      )}
    </div>
  );
}

const CSS = `
.rd { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --iv:#F7F4EE; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:1100px; }
.rd *,.rd *::before,.rd *::after { box-sizing:border-box; }
.rd h1,.rd h2 { font-family:'Cormorant Garamond',Georgia,serif; margin:0; }
.rd-head { margin-bottom:20px; }
.rd-kicker { font-size:10.5px; letter-spacing:1.4px; text-transform:uppercase; color:var(--g); font-weight:600; }
.rd-title { font-size:28px; color:var(--e); line-height:1.1; }
.rd-sub { font-size:13px; color:var(--mut); margin:6px 0 0; max-width:720px; line-height:1.55; }
.rd-error { background:#fff3f1; border:1px solid #e7b7ab; color:#9a3a28; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.rd-empty { padding:36px; text-align:center; color:var(--mut); border:1px dashed var(--ln); border-radius:14px; background:rgba(247,244,238,.55); }
.rd-linkcard { display:flex; justify-content:space-between; align-items:center; gap:16px; background:var(--e); color:#fff; border-radius:16px; padding:18px 22px; flex-wrap:wrap; margin-bottom:18px; }
.rd-linkcard-main { display:flex; flex-direction:column; gap:6px; min-width:0; }
.rd-label { font-size:10.5px; letter-spacing:1.2px; text-transform:uppercase; color:var(--g); font-weight:600; }
.rd-link { font-size:14px; color:#fff; word-break:break-all; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
.rd-codeline { font-size:12.5px; color:rgba(255,255,255,.78); }
.rd-codeline strong { color:var(--g); letter-spacing:1px; }
.rd-stats { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; margin-bottom:18px; }
.rd-stat { background:#fff; border:1px solid var(--ln); border-radius:14px; padding:16px; display:flex; flex-direction:column; gap:4px; }
.rd-stat.rd-accent { border-color:var(--g); background:rgba(201,163,91,.08); }
.rd-stat-n { font-family:'Cormorant Garamond',Georgia,serif; font-size:26px; color:var(--e); line-height:1; }
.rd-stat-l { font-size:11.5px; color:var(--mut); letter-spacing:.3px; }
.rd-invite { margin-bottom:22px; }
.rd-invite-form { display:flex; align-items:flex-end; gap:12px; flex-wrap:wrap; }
.rd-invite-form label { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--mut); font-weight:600; flex:1 1 280px; }
.rd-invite-form input { font:inherit; font-size:13px; color:var(--ink); padding:9px 11px; border:1px solid var(--ln); border-radius:9px; background:#fff; }
.rd-invite-msg { font-size:12.5px; color:var(--e2); margin:8px 0 0; }
.rd-btn { background:var(--g); color:var(--e); border:0; border-radius:9px; font:inherit; font-size:12.5px; font-weight:700; padding:10px 18px; cursor:pointer; white-space:nowrap; }
.rd-btn:hover { filter:brightness(1.04); }
.rd-btn:disabled { opacity:.6; cursor:default; }
.rd-list-wrap { margin-bottom:18px; }
.rd-h2 { font-size:22px; color:var(--e); margin-bottom:12px; }
.rd-table { width:100%; border-collapse:collapse; background:#fff; border:1px solid var(--ln); border-radius:14px; overflow:hidden; font-size:13px; }
.rd-table th { text-align:left; font-size:11px; letter-spacing:.5px; text-transform:uppercase; color:var(--mut); padding:11px 14px; background:rgba(247,244,238,.7); border-bottom:1px solid var(--ln); }
.rd-table td { padding:11px 14px; border-bottom:1px solid var(--ln); color:var(--ink); }
.rd-table tr:last-child td { border-bottom:0; }
.rd-badge { font-size:11px; letter-spacing:.4px; text-transform:uppercase; padding:3px 10px; border-radius:999px; font-weight:700; }
.rd-pending { background:rgba(125,119,108,.15); color:var(--mut); }
.rd-converted { background:rgba(30,93,74,.16); color:var(--e2); }
.rd-expired { background:#fbecea; color:#9a3a28; }
.rd-fine { font-size:11.5px; color:var(--mut); line-height:1.5; max-width:720px; margin:6px 0 0; }
@media (max-width:860px){ .rd-stats { grid-template-columns:repeat(2,1fr); } }
@media (max-width:480px){ .rd-stats { grid-template-columns:1fr; } }
`;
