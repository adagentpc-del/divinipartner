import React, { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { apiGet, apiSend } from '../../lib/api';

/**
 * AdminAccounts (blueprint 44) - manage / approve accounts. Admin-only.
 * Reads GET /api/admin/accounts; approves / rejects via verification status and
 * suspends / reactivates via subscription status. (Account merge is surfaced as
 * a guided note rather than a destructive automated action.)
 */
type Account = {
  id: string;
  name: string;
  type: string | null;
  tier: string | null;
  verification_status: string | null;
  white_label_status: string | null;
  subscription_status: string | null;
  user_count: number;
  created_at: string;
};

export default function AdminAccounts() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<Account[]>([]);
  const [filter, setFilter] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const qs = filter ? `?verification_status=${encodeURIComponent(filter)}` : '';
      const r = await apiGet<{ accounts: Account[] }>(`/admin/accounts${qs}`);
      setRows(r.accounts);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { if (isAdmin) void load(); else setLoading(false); /* eslint-disable-next-line */ }, [isAdmin, filter]);

  async function verify(id: string, status: string) {
    setBusy(id);
    try {
      await apiSend('POST', `/admin/accounts/${id}/verification`, { status });
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  async function subscribe(id: string, status: string) {
    setBusy(id);
    try {
      await apiSend('POST', `/admin/accounts/${id}/subscription`, { status });
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }

  if (!isAdmin) {
    return <div className="aa"><style>{AA_CSS}</style><p className="aa-guard">This page is restricted to platform administrators.</p></div>;
  }

  return (
    <div className="aa">
      <style>{AA_CSS}</style>
      <header className="aa-head">
        <div>
          <span className="aa-kicker">Super Admin</span>
          <h1 className="aa-title">Accounts</h1>
          <p className="aa-sub">Approve, verify, suspend, and reactivate organizations.</p>
        </div>
        <select className="aa-filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All verification states</option>
          <option value="draft">Draft</option>
          <option value="pending">Pending</option>
          <option value="submitted">Submitted</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Suspended</option>
        </select>
      </header>

      {err ? <p className="aa-err">{err}</p> : null}

      {loading ? (
        <p className="aa-muted">Loading accounts...</p>
      ) : rows.length === 0 ? (
        <div className="aa-empty"><p>No accounts match this filter.</p></div>
      ) : (
        <div className="aa-table">
          <div className="aa-tr aa-th">
            <span>Organization</span><span>Type</span><span>Tier</span><span>Verification</span><span>Members</span><span>Actions</span>
          </div>
          {rows.map((a) => (
            <div key={a.id} className="aa-tr">
              <span className="aa-org">{a.name}{a.white_label_status === 'active' ? <em className="aa-wl">White label</em> : null}</span>
              <span className="aa-cap">{a.type ?? '-'}</span>
              <span className="aa-cap">{a.tier ?? '-'}</span>
              <span><span className={`aa-badge st-${a.verification_status ?? 'draft'}`}>{a.verification_status ?? 'draft'}</span></span>
              <span>{a.user_count}</span>
              <span className="aa-actions">
                <button type="button" className="aa-btn" disabled={busy === a.id} onClick={() => verify(a.id, 'verified')}>Approve</button>
                <button type="button" className="aa-btn ghost" disabled={busy === a.id} onClick={() => verify(a.id, 'rejected')}>Reject</button>
                {a.subscription_status === 'suspended' ? (
                  <button type="button" className="aa-btn ghost" disabled={busy === a.id} onClick={() => subscribe(a.id, 'active')}>Reactivate</button>
                ) : (
                  <button type="button" className="aa-btn warn" disabled={busy === a.id} onClick={() => subscribe(a.id, 'suspended')}>Suspend</button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="aa-note">To merge duplicate accounts, suspend the duplicate and reassign its members from the primary organization. Automated merge is intentionally a manual, audited step.</p>
    </div>
  );
}

const AA_CSS = `
.aa {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--dp-ink);
}
.aa *, .aa *::before, .aa *::after { box-sizing: border-box; }
.aa h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }
.aa-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; margin-bottom: 18px; flex-wrap: wrap; }
.aa-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--dp-gold); font-weight: 600; }
.aa-title { font-size: 32px; color: var(--dp-emerald); line-height: 1.05; }
.aa-sub { margin: 4px 0 0; font-size: 13px; color: var(--dp-muted); }
.aa-filter { font: inherit; padding: 9px 12px; border: 1px solid var(--dp-line); border-radius: 8px; background: #fff; }
.aa-guard { background: #f6eaea; border: 1px solid #e2caca; color: #8a3a3a; border-radius: 10px; padding: 14px 16px; font-size: 13px; }
.aa-muted { color: var(--dp-muted); font-size: 13px; }
.aa-err { color: #8a3a3a; background: #f6eaea; border: 1px solid #e2caca; border-radius: 8px; padding: 9px 12px; font-size: 12.5px; }
.aa-empty { border: 1px dashed var(--dp-line); border-radius: 12px; padding: 36px; background: rgba(247,244,238,.55); text-align: center; }
.aa-empty p { margin: 0; font-size: 13px; color: var(--dp-muted); }
.aa-table { display: flex; flex-direction: column; border: 1px solid var(--dp-line); border-radius: 12px; overflow: hidden; background: #fff; }
.aa-tr { display: grid; grid-template-columns: 2fr 1fr 1fr 1.2fr .8fr 2.4fr; gap: 10px; align-items: center; padding: 11px 14px; border-bottom: 1px solid var(--dp-line); font-size: 13px; }
.aa-tr:last-child { border-bottom: 0; }
.aa-th { background: rgba(18,60,46,.04); font-size: 10.5px; letter-spacing: .5px; text-transform: uppercase; color: var(--dp-muted); font-weight: 600; }
.aa-org { font-weight: 600; color: var(--dp-emerald); }
.aa-wl { display: inline-block; font-style: normal; font-size: 10px; margin-left: 8px; color: #8a6d27; background: rgba(201,163,91,.2); border: 1px solid rgba(201,163,91,.5); border-radius: 999px; padding: 1px 7px; }
.aa-cap { text-transform: capitalize; color: var(--dp-ink); }
.aa-badge { font-size: 10px; letter-spacing: .4px; text-transform: uppercase; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: #eef0ee; color: #5a6b62; border: 1px solid #dde2dd; }
.aa-badge.st-verified { background: rgba(30,93,74,.12); color: #1E5D4A; border-color: rgba(30,93,74,.3); }
.aa-badge.st-rejected, .aa-badge.st-suspended { background: #f3e9e9; color: #8a4a4a; border-color: #e2caca; }
.aa-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.aa-btn { background: var(--dp-emerald); color: #fff; border: 0; border-radius: 8px; font: inherit; font-size: 12px; font-weight: 600; padding: 6px 12px; cursor: pointer; }
.aa-btn:hover { background: var(--dp-emerald-2); }
.aa-btn:disabled { opacity: .6; cursor: default; }
.aa-btn.ghost { background: transparent; color: var(--dp-emerald); border: 1px solid var(--dp-line); }
.aa-btn.warn { background: #a86b6b; }
.aa-note { margin-top: 16px; font-size: 12px; color: var(--dp-muted); line-height: 1.6; }
@media (max-width: 900px) { .aa-tr { grid-template-columns: 1fr 1fr; } .aa-th { display: none; } }
`;
