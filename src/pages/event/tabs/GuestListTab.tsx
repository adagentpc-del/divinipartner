import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

/**
 * Phase 6 - Guest List tab (blueprint 14.2). Manage guests, RSVP, bulk paste,
 * VIP, meal + accessibility, check-in, and live counts.
 */
type Guest = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  rsvp_status: string | null;
  plus_one: boolean | null;
  party_size: number | null;
  meal_preference: string | null;
  table_assignment: string | null;
  vip: boolean | null;
  guest_group: string | null;
  notes: string | null;
  accessibility_needs: string | null;
  checked_in: boolean | null;
};
type Meta = { rsvp_statuses: { key: string; label: string }[]; meal_preferences: string[] };
type Counts = {
  total: number; heads: number; vip: number; plus_ones: number; checked_in: number;
  accessibility: number; by_rsvp: Record<string, number>; by_meal: Record<string, number>;
};

const EMPTY = { name: '', email: '', phone: '', guest_group: '', vip: false, plus_one: false };

export default function GuestListTab({ eventId }: { eventId: string }) {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [bulk, setBulk] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const [g, m, c] = await Promise.all([
        apiGet<{ guests: Guest[] }>(`/guests/event/${eventId}`),
        apiGet<Meta>(`/guests/meta`),
        apiGet<{ counts: Counts }>(`/guests/event/${eventId}/counts`),
      ]);
      setGuests(g.guests);
      setMeta(m);
      setCounts(c.counts);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [eventId]);

  async function refresh() {
    const [g, c] = await Promise.all([
      apiGet<{ guests: Guest[] }>(`/guests/event/${eventId}`),
      apiGet<{ counts: Counts }>(`/guests/event/${eventId}/counts`),
    ]);
    setGuests(g.guests);
    setCounts(c.counts);
  }

  async function addGuest(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true); setErr(null);
    try {
      await apiSend('POST', `/guests/event/${eventId}`, form);
      setForm({ ...EMPTY });
      await refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function importBulk() {
    const rows = bulk.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
      const [name, email, phone, guest_group] = line.split(/\t|,/).map((s) => s?.trim() ?? '');
      return { name, email: email || null, phone: phone || null, guest_group: guest_group || null };
    });
    if (rows.length === 0) return;
    setBusy(true); setErr(null);
    try {
      await apiSend('POST', `/guests/event/${eventId}/bulk`, { guests: rows });
      setBulk(''); setShowBulk(false);
      await refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function setRsvp(id: string, status: string) {
    try { await apiSend('POST', `/guests/${id}/rsvp`, { status }); await refresh(); }
    catch (e) { setErr((e as Error).message); }
  }
  async function toggleVip(g: Guest) {
    try { await apiSend('PATCH', `/guests/${g.id}`, { vip: !g.vip }); await refresh(); }
    catch (e) { setErr((e as Error).message); }
  }
  async function toggleCheckIn(g: Guest) {
    try { await apiSend('POST', `/guests/${g.id}/check-in`, { checked_in: !g.checked_in }); await refresh(); }
    catch (e) { setErr((e as Error).message); }
  }
  async function remove(id: string) {
    try { await apiSend('DELETE', `/guests/${id}`); await refresh(); }
    catch (e) { setErr((e as Error).message); }
  }

  const rsvpLabel = (k: string | null) =>
    meta?.rsvp_statuses.find((s) => s.key === k)?.label ?? k ?? 'Invited';

  return (
    <div>
      <style>{G_CSS}</style>
      {err ? <p className="ew-error">{err}</p> : null}

      {counts ? (
        <div className="gl-stats">
          <Stat n={counts.total} l="Guests" />
          <Stat n={counts.heads} l="Total heads" />
          <Stat n={counts.by_rsvp.confirmed ?? 0} l="Confirmed" accent />
          <Stat n={counts.by_rsvp.declined ?? 0} l="Declined" />
          <Stat n={counts.vip} l="VIP" />
          <Stat n={counts.checked_in} l="Checked in" />
          <Stat n={counts.accessibility} l="Accessibility" />
        </div>
      ) : null}

      <form className="gl-add" onSubmit={addGuest}>
        <input className="gl-in" placeholder="Guest name" value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="gl-in" placeholder="Email" value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="gl-in" placeholder="Phone" value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input className="gl-in" placeholder="Group" value={form.guest_group}
          onChange={(e) => setForm({ ...form, guest_group: e.target.value })} />
        <label className="gl-chk"><input type="checkbox" checked={form.vip}
          onChange={(e) => setForm({ ...form, vip: e.target.checked })} /> VIP</label>
        <label className="gl-chk"><input type="checkbox" checked={form.plus_one}
          onChange={(e) => setForm({ ...form, plus_one: e.target.checked })} /> +1</label>
        <button type="submit" className="ew-btn sm" disabled={busy}>Add guest</button>
        <button type="button" className="ew-btn ghost sm" onClick={() => setShowBulk((v) => !v)}>
          {showBulk ? 'Hide bulk' : 'Bulk add'}
        </button>
      </form>

      {showBulk ? (
        <div className="gl-bulk">
          <p className="ew-muted">One guest per line: name, email, phone, group (comma or tab separated).</p>
          <textarea className="gl-ta" rows={5} value={bulk} onChange={(e) => setBulk(e.target.value)}
            placeholder="Jane Doe, jane@example.com, 555-1234, Family" />
          <button type="button" className="ew-btn sm" onClick={importBulk} disabled={busy}>Import list</button>
        </div>
      ) : null}

      {guests.length === 0 ? (
        <div className="ew-empty"><p>No guests yet. Add guests above or paste a list with bulk add.</p></div>
      ) : (
        <table className="ew-table gl-table">
          <thead>
            <tr><th>Name</th><th>RSVP</th><th>Group</th><th>Meal</th><th>Table</th><th>Flags</th><th></th></tr>
          </thead>
          <tbody>
            {guests.map((g) => (
              <tr key={g.id}>
                <td>
                  <div className="gl-name">{g.name || 'Unnamed'}{g.vip ? <span className="gl-vip">VIP</span> : null}</div>
                  <div className="gl-sub">{g.email || g.phone || ''}{g.plus_one ? ' · +1' : ''}</div>
                </td>
                <td>
                  <select className="gl-sel" value={g.rsvp_status ?? 'invited'} onChange={(e) => setRsvp(g.id, e.target.value)}>
                    {meta?.rsvp_statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </td>
                <td>{g.guest_group || '-'}</td>
                <td>{g.meal_preference || '-'}</td>
                <td>{g.table_assignment || '-'}</td>
                <td className="gl-flags">
                  <button type="button" className={`gl-flag${g.vip ? ' on' : ''}`} onClick={() => toggleVip(g)}>VIP</button>
                  <button type="button" className={`gl-flag${g.checked_in ? ' on' : ''}`} onClick={() => toggleCheckIn(g)}>In</button>
                </td>
                <td><button type="button" className="gl-del" onClick={() => remove(g.id)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <span className="ew-muted gl-foot">{rsvpLabel('confirmed')} guests are counted toward final headcount.</span>
    </div>
  );
}

function Stat({ n, l, accent }: { n: number; l: string; accent?: boolean }) {
  return (
    <div className={`gl-stat${accent ? ' is-accent' : ''}`}>
      <span className="gl-statn">{n}</span>
      <span className="gl-statl">{l}</span>
    </div>
  );
}

const G_CSS = `
.gl-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 10px; margin-bottom: 18px; }
.gl-stat { background: #fff; border: 1px solid #e7e1d6; border-radius: 12px; padding: 12px 10px; text-align: center; }
.gl-stat.is-accent { border-color: rgba(201,163,91,.6); background: rgba(201,163,91,.08); }
.gl-statn { display: block; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 26px; color: #123c2e; line-height: 1; }
.gl-statl { display: block; font-size: 10px; letter-spacing: .5px; text-transform: uppercase; color: #9a8a5e; margin-top: 4px; font-weight: 600; }
.gl-add { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; background: rgba(247,244,238,.6); border: 1px dashed #e7e1d6; border-radius: 12px; padding: 12px 14px; margin-bottom: 14px; }
.gl-in { font: inherit; font-size: 12.5px; padding: 7px 10px; border: 1px solid #e7e1d6; border-radius: 8px; background: #fff; color: #2c2a26; flex: 1 1 130px; min-width: 0; }
.gl-chk { display: flex; align-items: center; gap: 4px; font-size: 12px; color: #7d776c; }
.gl-bulk { background: #fff; border: 1px solid #e7e1d6; border-radius: 12px; padding: 14px; margin-bottom: 16px; }
.gl-ta { width: 100%; font: inherit; font-size: 12.5px; padding: 9px; border: 1px solid #e7e1d6; border-radius: 8px; margin: 8px 0; box-sizing: border-box; resize: vertical; }
.gl-table td { vertical-align: top; }
.gl-name { font-size: 13px; color: #2c2a26; display: flex; align-items: center; gap: 6px; }
.gl-vip { font-size: 9px; font-weight: 700; letter-spacing: .5px; color: #123c2e; background: rgba(201,163,91,.3); border-radius: 4px; padding: 1px 5px; }
.gl-sub { font-size: 11px; color: #b3aa99; margin-top: 2px; }
.gl-sel { font: inherit; font-size: 12px; padding: 4px 7px; border: 1px solid #e7e1d6; border-radius: 7px; background: #fff; color: #2c2a26; }
.gl-flags { display: flex; gap: 5px; }
.gl-flag { font: inherit; font-size: 10.5px; font-weight: 600; padding: 3px 8px; border: 1px solid #e7e1d6; border-radius: 999px; background: #fff; color: #9a8a5e; cursor: pointer; }
.gl-flag.on { background: #1E5D4A; border-color: #1E5D4A; color: #fff; }
.gl-del { font: inherit; font-size: 11px; color: #8a3a3a; background: transparent; border: 0; cursor: pointer; padding: 4px 6px; }
.gl-del:hover { text-decoration: underline; }
.gl-foot { display: block; margin-top: 12px; font-style: italic; }
`;
