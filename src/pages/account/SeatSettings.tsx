/**
 * Team seat management. Partners add or remove extra team seats and pay for the
 * active ones at the per-seat monthly price. Route: /account/seats. Zero em
 * dashes. Visual style mirrors PayoutSettings (brand, kicker, cards, badges).
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiSend } from '../../lib/api';

type Seat = {
  id: string;
  member_email: string;
  member_name: string | null;
  status: 'active' | 'invited' | 'removed';
};
type SeatsResp = {
  seats: Seat[];
  billable: number;
  monthly_cost: number;
  seat_price: number;
};

const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);

export default function SeatSettings() {
  const nav = useNavigate();
  const [data, setData] = useState<SeatsResp | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiGet<SeatsResp>('/seats');
      setData(r);
    } catch (e) {
      setErr((e as Error)?.message ?? 'Could not load team seats');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addSeat(e: React.FormEvent) {
    e.preventDefault();
    setBusy('add'); setErr(null); setMsg(null);
    try {
      await apiSend('POST', '/seats', { email: email.trim(), name: name.trim() || undefined });
      setEmail(''); setName('');
      setMsg('Seat added.');
      await load();
    } catch (e2) {
      setErr((e2 as Error)?.message ?? 'Could not add seat');
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id); setErr(null); setMsg(null);
    try {
      await apiSend('DELETE', `/seats/${id}`);
      await load();
    } catch (e2) {
      setErr((e2 as Error)?.message ?? 'Could not remove seat');
    } finally {
      setBusy(null);
    }
  }

  async function payForSeats() {
    setBusy('pay'); setErr(null); setMsg(null);
    try {
      const r = await apiSend<{ redirect_url?: string; recorded?: boolean; note?: string }>(
        'POST',
        '/seats/checkout',
        {},
      );
      if (r.redirect_url) {
        window.location.href = r.redirect_url;
        return;
      }
      setMsg(r.note ?? 'Seat billing recorded.');
    } catch (e2) {
      setErr((e2 as Error)?.message ?? 'Could not start seat billing');
    } finally {
      setBusy(null);
    }
  }

  const billable = data?.billable ?? 0;
  const seatPrice = data?.seat_price ?? 0;
  const monthly = data?.monthly_cost ?? 0;
  const seats = data?.seats ?? [];

  const badge = (status: Seat['status']) => {
    const ok = status === 'active';
    const label = status === 'active' ? 'Active' : status === 'invited' ? 'Invited' : 'Removed';
    return <span className={'dss-badge ' + (ok ? 'ok' : 'pend')}>{label}</span>;
  };

  return (
    <div className="dss">
      <style>{CSS}</style>
      <div className="dss-wrap">
        <button className="dss-link" onClick={() => nav('/payments')}>Back to payments</button>
        <span className="dss-kicker">Divini Partners</span>
        <h1>Team seats</h1>
        <p className="dss-lead">
          Your account includes one seat free. Add a seat for each extra person on
          your team at {money(seatPrice)} per month per seat. Remove a seat at any
          time and it stops billing.
        </p>
        {err ? <div className="dss-alert err">{err}</div> : null}
        {msg ? <div className="dss-alert ok">{msg}</div> : null}

        <div className="dss-grid">
          {/* Seats list */}
          <div className="dss-card">
            <div className="dss-card-head">
              <h2>Your team</h2>
              <span className="dss-count">{billable} active</span>
            </div>
            {seats.length === 0 ? (
              <div className="dss-muted">No team seats yet. Add your first one on the right.</div>
            ) : (
              <ul className="dss-list">
                {seats.map((s) => (
                  <li key={s.id} className="dss-row">
                    <div className="dss-who">
                      <span className="dss-name">{s.member_name || s.member_email}</span>
                      {s.member_name ? <span className="dss-email">{s.member_email}</span> : null}
                    </div>
                    <div className="dss-row-end">
                      {badge(s.status)}
                      <button
                        className="dss-btn ghost"
                        disabled={busy === s.id}
                        onClick={() => remove(s.id)}
                      >
                        {busy === s.id ? 'Removing...' : 'Remove'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Add a seat */}
          <div className="dss-card">
            <div className="dss-card-head">
              <h2>Add a seat</h2>
            </div>
            <p>Invite a teammate by email. The seat is active and billable right away.</p>
            <form className="dss-form" onSubmit={addSeat}>
              <input
                type="text"
                placeholder="Name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                type="email"
                placeholder="teammate@yourbusiness.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button className="dss-btn primary" type="submit" disabled={busy === 'add' || !email.trim()}>
                {busy === 'add' ? 'Adding...' : 'Add seat'}
              </button>
            </form>
          </div>
        </div>

        {/* Billing summary */}
        <div className="dss-bill">
          <div className="dss-bill-figures">
            <div>
              <span className="dss-bill-label">Billable seats</span>
              <span className="dss-bill-value">{billable}</span>
            </div>
            <div>
              <span className="dss-bill-label">Per seat</span>
              <span className="dss-bill-value">{money(seatPrice)}</span>
            </div>
            <div>
              <span className="dss-bill-label">Monthly total</span>
              <span className="dss-bill-value strong">{money(monthly)}</span>
            </div>
          </div>
          <button
            className="dss-btn primary"
            disabled={busy === 'pay' || billable <= 0}
            onClick={payForSeats}
          >
            {busy === 'pay' ? 'Starting...' : 'Pay for seats'}
          </button>
        </div>

        <div className="dss-note">
          Your monthly seat charge is {money(monthly)} for {billable} active seat{billable === 1 ? '' : 's'}.
          Removed seats are not billed. When no payment processor is connected yet, seat billing is tracked
          and charged once payments are enabled.
        </div>
      </div>
    </div>
  );
}

const CSS = `
.dss{--em:#123c2e;--em2:#1E5D4A;--gold:#C9A35B;--ivory:#F7F4EE;--ink:#2c2a26;--mut:#7d776c;--line:#e7e1d6;background:var(--ivory);min-height:100vh;font-family:Inter,system-ui,sans-serif;color:var(--ink)}
.dss-wrap{max-width:880px;margin:0 auto;padding:40px 24px 80px}
.dss-link{background:none;border:none;color:var(--em);font:inherit;font-size:13px;font-weight:600;cursor:pointer;padding:0;margin-bottom:18px}
.dss-kicker{display:block;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--gold);margin-bottom:6px}
.dss h1{font-family:'Cormorant Garamond',Georgia,serif;font-size:38px;color:var(--em);margin:0 0 8px;font-weight:600}
.dss-lead{font-size:15.5px;color:var(--mut);line-height:1.6;max-width:640px;margin:0 0 24px}
.dss-alert{border-radius:11px;padding:11px 15px;font-size:13.5px;margin-bottom:16px}
.dss-alert.err{background:#fbeceb;color:#b3261e}
.dss-alert.ok{background:#e7f3ec;color:#1f7a4d}
.dss-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.dss-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:24px 22px;display:flex;flex-direction:column;gap:12px}
.dss-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.dss-card h2{font-size:19px;color:var(--em);margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-weight:600}
.dss-card p{font-size:13.5px;color:var(--mut);line-height:1.55;margin:0}
.dss-count{font-size:12px;font-weight:700;color:var(--em2);background:#eef3ef;border-radius:20px;padding:4px 11px;white-space:nowrap}
.dss-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.dss-row{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--line);border-radius:11px;padding:11px 13px}
.dss-who{display:flex;flex-direction:column;gap:2px;min-width:0}
.dss-name{font-size:14px;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dss-email{font-size:12px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dss-row-end{display:flex;align-items:center;gap:10px;flex-shrink:0}
.dss-form{display:flex;flex-direction:column;gap:9px;margin-top:2px}
.dss-form input{font:inherit;font-size:14px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#fff}
.dss-form input:focus{outline:none;border-color:var(--em2)}
.dss-badge{font-size:10.5px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;padding:4px 10px;border-radius:20px;white-space:nowrap}
.dss-badge.ok{background:#e7f3ec;color:#1f7a4d}
.dss-badge.pend{background:#f4ece0;color:#8a6d1a}
.dss-btn{font:inherit;font-size:13.5px;font-weight:600;padding:11px 18px;border-radius:11px;cursor:pointer;border:1px solid transparent}
.dss-btn.primary{background:var(--em);color:#fff}
.dss-btn.primary:disabled{opacity:.55;cursor:not-allowed}
.dss-btn.ghost{background:transparent;color:var(--em);border-color:var(--line);padding:8px 14px;font-size:12.5px}
.dss-btn.ghost:disabled{opacity:.55;cursor:not-allowed}
.dss-muted{font-size:13px;color:var(--mut);font-style:italic}
.dss-bill{margin-top:22px;background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px;display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap}
.dss-bill-figures{display:flex;gap:34px;flex-wrap:wrap}
.dss-bill-figures>div{display:flex;flex-direction:column;gap:4px}
.dss-bill-label{font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--mut)}
.dss-bill-value{font-size:22px;font-weight:600;color:var(--em);font-family:'Cormorant Garamond',Georgia,serif}
.dss-bill-value.strong{color:var(--gold)}
.dss-note{margin-top:22px;font-size:12.5px;color:var(--mut);line-height:1.6;background:#fff;border:1px dashed var(--line);border-radius:12px;padding:14px 16px}
@media(max-width:720px){.dss-grid{grid-template-columns:1fr}}
`;
