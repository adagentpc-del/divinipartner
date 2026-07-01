import React, { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { apiGet, apiSend } from '../../lib/api';

/**
 * AdminManageEvents - create events and view recent events. Admin-only.
 * Reads GET /admin/manage/events; creates via POST /admin/manage/events.
 * Optionally attaches an event to a venue (venue id, left blank if unsure).
 * The venue select is populated from GET /admin/manage/listings?kind=venue.
 * ZERO em dashes anywhere (hard rule).
 */

type EventRow = {
  id: string;
  name: string | null;
  type: string | null;
  status: string | null;
  venue_id: string | null;
  date_time: string | null;
  guest_count: number | null;
  budget: number | null;
  created_at: string;
};

type VenueListing = {
  id: string;
  business_name: string | null;
  profile_id: string | null;
};

const STYLES = `
.ame{--emerald:#1E5D4A;--emerald-deep:#123c2e;--emerald-mid:#174838;--gold:#C9A35B;--champagne:#D9CCB0;--ink:#2c2a26;--muted:#7d776c;--line:#e7e1d6;--ivory:#f7f4ee;background:var(--ivory);color:var(--ink);min-height:100vh;font-family:Inter,system-ui,sans-serif}
.ame .wrap{max-width:1180px;margin:0 auto;padding:26px 28px 60px}
.ame h1,.ame h2,.ame h3{font-family:'Cormorant Garamond',serif;color:var(--emerald-deep);margin:0}
.ame .top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:6px}
.ame .top h1{font-size:28px}
.ame .by{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-top:2px}
.ame .sectitle{font-size:12px;letter-spacing:.7px;text-transform:uppercase;color:var(--muted);font-weight:700;margin:26px 0 12px}
.ame .card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:18px}
.ame table{width:100%;border-collapse:collapse}
.ame th{text-align:left;font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);font-weight:600;padding:9px 10px;border-bottom:1px solid var(--line)}
.ame td{padding:10px;border-bottom:1px solid var(--line);font-size:13px;vertical-align:middle}
.ame .status{font-size:11px;color:var(--muted)}
.ame .badge{font-size:10px;font-weight:700;text-transform:uppercase;padding:3px 8px;border-radius:20px;background:#eef0ee;color:#5a6b62;border:1px solid #dde2dd}
.ame .btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:#fff;color:var(--emerald-deep);font-family:Inter;font-size:12px;font-weight:600;padding:6px 11px;border-radius:8px;cursor:pointer;transition:.15s;margin:0 4px 4px 0}
.ame .btn:hover{border-color:var(--emerald);background:var(--ivory)}
.ame .btn.primary{background:var(--emerald);border-color:var(--emerald);color:#fff}
.ame .btn.primary:hover{background:var(--emerald-mid)}
.ame .btn:disabled{opacity:.6;cursor:default}
.ame label{display:block;font-size:12px;color:var(--muted);font-weight:600;margin:0 0 6px}
.ame input,.ame select{width:100%;padding:10px 11px;border:1px solid var(--line);border-radius:9px;font-family:Inter;font-size:13.5px;background:#fff;color:var(--ink);box-sizing:border-box}
.ame input:focus,.ame select:focus{outline:none;border-color:var(--emerald)}
.ame .row3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px}
.ame .msg{padding:10px 13px;border-radius:9px;font-size:13px;margin-top:10px}
.ame .msg.ok{background:#eef6f1;border:1px solid #cfe6da;color:var(--emerald-deep)}
.ame .msg.err{background:#fbeeee;border:1px solid #ecd2d2;color:#7a3030}
.ame .gate{max-width:460px;margin:80px auto;text-align:center;background:#fff;border:1px solid var(--line);border-radius:16px;padding:40px}
@media(max-width:1024px){.ame .row3{grid-template-columns:1fr}}
`;

function fmtMoney(n: number | null): string {
  if (n == null) return '-';
  return `$${Number(n).toLocaleString()}`;
}
function fmtDate(s: string | null): string {
  if (!s) return '-';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString();
}

export default function AdminManageEvents() {
  const { isAdmin, loading } = useAuth();
  const [rows, setRows] = useState<EventRow[]>([]);
  const [venues, setVenues] = useState<VenueListing[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingRows, setLoadingRows] = useState(true);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [dateTime, setDateTime] = useState('');
  const [guestCount, setGuestCount] = useState('');
  const [budget, setBudget] = useState('');
  const [venueId, setVenueId] = useState('');

  async function load() {
    setLoadingRows(true);
    try {
      const [ev, vn] = await Promise.all([
        apiGet<{ events: EventRow[] }>('/admin/manage/events'),
        apiGet<{ listings: VenueListing[] }>('/admin/manage/listings?kind=venue'),
      ]);
      setRows(ev.events);
      setVenues(vn.listings);
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to load events.' });
    } finally {
      setLoadingRows(false);
    }
  }

  useEffect(() => {
    if (isAdmin) void load();
    else setLoadingRows(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      await apiSend<{ event: EventRow }>('POST', '/admin/manage/events', {
        name,
        type,
        date_time: dateTime || null,
        guest_count: guestCount ? Number(guestCount) : null,
        budget: budget ? Number(budget) : null,
        venue_id: venueId || null,
      });
      setMsg({ kind: 'ok', text: 'Event created.' });
      setName('');
      setType('');
      setDateTime('');
      setGuestCount('');
      setBudget('');
      setVenueId('');
      await load();
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Failed to create event.' });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="ame"><style>{STYLES}</style><div className="wrap"><p style={{ padding: 60 }}>Loading...</p></div></div>;
  }

  if (!isAdmin) {
    return (
      <div className="ame">
        <style>{STYLES}</style>
        <div className="gate">
          <h1>Administrators only</h1>
          <p>This page is restricted to platform administrators.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ame">
      <style>{STYLES}</style>
      <div className="wrap">
        <div className="top">
          <div>
            <h1>Manage Events</h1>
            <div className="by">Divini Partners by Divini Group</div>
          </div>
          <button className="btn" onClick={() => void load()}>Refresh</button>
        </div>

        {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}

        <div className="sectitle">Create event</div>
        <div className="card">
          <form onSubmit={create}>
            <div className="row3">
              <div>
                <label>Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <label>Type</label>
                <input value={type} onChange={(e) => setType(e.target.value)} placeholder="Wedding, gala, corporate..." />
              </div>
              <div>
                <label>Date / time</label>
                <input type="datetime-local" value={dateTime} onChange={(e) => setDateTime(e.target.value)} />
              </div>
            </div>
            <div className="row3">
              <div>
                <label>Guest count</label>
                <input type="number" min="0" value={guestCount} onChange={(e) => setGuestCount(e.target.value)} />
              </div>
              <div>
                <label>Budget</label>
                <input type="number" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} />
              </div>
              <div>
                <label>Attach to venue (optional)</label>
                <select value={venueId} onChange={(e) => setVenueId(e.target.value)}>
                  <option value="">No venue / unsure</option>
                  {venues.map((v) => (
                    <option key={v.id} value={v.profile_id ?? v.id}>{v.business_name ?? v.profile_id ?? v.id}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="btn primary" type="submit" disabled={busy}>Create event</button>
            </div>
          </form>
        </div>

        <div className="sectitle">Recent events</div>
        <div className="card">
          <table>
            <thead>
              <tr><th>Name</th><th>Type</th><th>Status</th><th>Date</th><th>Guests</th><th>Budget</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.name ?? '-'}</td>
                  <td>{r.type ?? '-'}</td>
                  <td><span className="badge">{r.status ?? '-'}</span></td>
                  <td>{fmtDate(r.date_time)}</td>
                  <td>{r.guest_count ?? '-'}</td>
                  <td>{fmtMoney(r.budget)}</td>
                </tr>
              ))}
              {loadingRows && <tr><td colSpan={6} className="status">Loading events...</td></tr>}
              {!loadingRows && !rows.length && <tr><td colSpan={6} className="status">No events yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
