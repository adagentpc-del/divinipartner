import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet, apiSend } from '../../lib/api';

/**
 * Venue Intelligence Addendum (Phase 6) - Event Guest Manager.
 *
 * Client-facing page for a single event:
 *   - manage the guest list (add / edit / remove / invite),
 *   - see which vendors are subscribed to guest-list updates
 *     (vendor_event_requirements where needs_guest_list / needs_headcount),
 * plus a vendor-side toggle component (VendorRequirementToggle) for a vendor to
 * opt their org into guest-list updates / deposit gating per event.
 *
 * Routes used (all under /api):
 *   GET    /guests/event/:eventId          list guests
 *   GET    /guests/event/:eventId/counts   rollups
 *   POST   /guests/event/:eventId          add a guest
 *   PATCH  /guests/:id                      edit a guest
 *   POST   /guests/:id/rsvp                 (re)send invite => sets status invited
 *   DELETE /guests/:id                      remove a guest
 *   GET    /vendor-event-requirements/event/:eventId        subscribed vendors
 *   GET    /vendor-event-requirements/event/:eventId/mine   my vendor rows
 *   POST   /vendor-event-requirements                        upsert my row
 *
 * Self-contained styling (emerald / gold / ivory). Zero em dashes.
 */

type Guest = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  rsvp_status: string | null;
  vip: boolean | null;
  guest_group: string | null;
  party_size: number | null;
};

type Counts = {
  total: number;
  heads: number;
  vip: number;
  checked_in: number;
  by_rsvp: Record<string, number>;
};

type Requirement = {
  id: string;
  event_id: string | null;
  vendor_id: string | null;
  needs_guest_list: boolean | null;
  needs_headcount: boolean | null;
  needs_deposit: boolean | null;
};

const EMPTY = { name: '', email: '', phone: '', guest_group: '', vip: false };

export default function EventGuestManager() {
  const { id = '' } = useParams();
  const eventId = id;

  const [guests, setGuests] = useState<Guest[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [subscribed, setSubscribed] = useState<Requirement[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [editing, setEditing] = useState<Guest | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      const [g, c, r] = await Promise.all([
        apiGet<{ guests: Guest[] }>(`/guests/event/${eventId}`),
        apiGet<{ counts: Counts }>(`/guests/event/${eventId}/counts`),
        apiGet<{ requirements: Requirement[] }>(
          `/vendor-event-requirements/event/${eventId}`,
        ).catch(() => ({ requirements: [] as Requirement[] })),
      ]);
      setGuests(g.guests);
      setCounts(c.counts);
      setSubscribed(
        r.requirements.filter((x) => x.needs_guest_list || x.needs_headcount),
      );
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => {
    void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [eventId]);

  async function addGuest(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      await apiSend('POST', `/guests/event/${eventId}`, form);
      setForm({ ...EMPTY });
      setOk('Guest added. Subscribed vendors were notified.');
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setErr(null);
    try {
      await apiSend('PATCH', `/guests/${editing.id}`, {
        name: editing.name,
        email: editing.email,
        phone: editing.phone,
        guest_group: editing.guest_group,
        vip: editing.vip,
      });
      setEditing(null);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function invite(g: Guest) {
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      await apiSend('POST', `/guests/${g.id}/rsvp`, { status: 'invited' });
      setOk(`Invite recorded for ${g.name || 'guest'}.`);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(g: Guest) {
    setBusy(true);
    setErr(null);
    try {
      await apiSend('DELETE', `/guests/${g.id}`);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="egm">
      <header className="egm-head">
        <h1>Guest Manager</h1>
        <p>
          Add, edit, invite, and remove guests. Vendors who opted into guest-list
          updates are notified automatically when the list changes.
        </p>
      </header>

      {err && <div className="egm-alert egm-err">{err}</div>}
      {ok && <div className="egm-alert egm-ok">{ok}</div>}

      {counts && (
        <div className="egm-counts">
          <Stat label="Guests" value={counts.total} />
          <Stat label="Heads" value={counts.heads} />
          <Stat label="VIP" value={counts.vip} />
          <Stat label="Checked in" value={counts.checked_in} />
          <Stat label="Confirmed" value={counts.by_rsvp?.confirmed ?? 0} />
        </div>
      )}

      <section className="egm-panel">
        <h2>Add a guest</h2>
        <form className="egm-form" onSubmit={addGuest}>
          <input
            placeholder="Full name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <input
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <input
            placeholder="Group (family, vip, ...)"
            value={form.guest_group}
            onChange={(e) => setForm({ ...form, guest_group: e.target.value })}
          />
          <label className="egm-check">
            <input
              type="checkbox"
              checked={form.vip}
              onChange={(e) => setForm({ ...form, vip: e.target.checked })}
            />
            VIP
          </label>
          <button className="egm-btn" type="submit" disabled={busy}>
            Add guest
          </button>
        </form>
      </section>

      <section className="egm-panel">
        <h2>Guest list ({guests.length})</h2>
        {guests.length === 0 ? (
          <p className="egm-empty">No guests yet. Add the first one above.</p>
        ) : (
          <table className="egm-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Group</th>
                <th>RSVP</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {guests.map((g) => (
                <tr key={g.id}>
                  <td>
                    {g.name || 'Unnamed'} {g.vip ? <span className="egm-vip">VIP</span> : null}
                  </td>
                  <td>{g.email || g.phone || '-'}</td>
                  <td>{g.guest_group || '-'}</td>
                  <td>{g.rsvp_status || 'no_response'}</td>
                  <td className="egm-actions">
                    <button className="egm-link" onClick={() => invite(g)} disabled={busy}>
                      Invite
                    </button>
                    <button className="egm-link" onClick={() => setEditing(g)} disabled={busy}>
                      Edit
                    </button>
                    <button
                      className="egm-link egm-danger"
                      onClick={() => remove(g)}
                      disabled={busy}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {editing && (
        <section className="egm-panel egm-edit">
          <h2>Edit guest</h2>
          <form className="egm-form" onSubmit={saveEdit}>
            <input
              placeholder="Full name"
              value={editing.name ?? ''}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <input
              placeholder="Email"
              value={editing.email ?? ''}
              onChange={(e) => setEditing({ ...editing, email: e.target.value })}
            />
            <input
              placeholder="Phone"
              value={editing.phone ?? ''}
              onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
            />
            <input
              placeholder="Group"
              value={editing.guest_group ?? ''}
              onChange={(e) => setEditing({ ...editing, guest_group: e.target.value })}
            />
            <label className="egm-check">
              <input
                type="checkbox"
                checked={!!editing.vip}
                onChange={(e) => setEditing({ ...editing, vip: e.target.checked })}
              />
              VIP
            </label>
            <button className="egm-btn" type="submit" disabled={busy}>
              Save
            </button>
            <button className="egm-btn egm-ghost" type="button" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </form>
        </section>
      )}

      <section className="egm-panel">
        <h2>Vendors subscribed to guest-list updates</h2>
        {subscribed.length === 0 ? (
          <p className="egm-empty">
            No vendors are subscribed yet. A vendor opts in from their side below.
          </p>
        ) : (
          <ul className="egm-subs">
            {subscribed.map((r) => (
              <li key={r.id}>
                <span className="egm-mono">{r.vendor_id?.slice(0, 8) ?? 'vendor'}</span>
                {r.needs_guest_list ? <span className="egm-tag">guest list</span> : null}
                {r.needs_headcount ? <span className="egm-tag">headcount</span> : null}
                {r.needs_deposit ? <span className="egm-tag egm-gold">deposit</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <VendorRequirementToggle eventId={eventId} onChange={load} />

      <style>{`
        .egm { max-width: 920px; margin: 0 auto; padding: 1.5rem; color: #123c2e;
          font-family: 'Inter', system-ui, sans-serif; }
        .egm-head h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 2rem;
          margin: 0 0 .25rem; color: #1E5D4A; }
        .egm-head p { margin: 0 0 1rem; color: #4a5d54; }
        .egm-alert { padding: .65rem .9rem; border-radius: 8px; margin: .5rem 0 1rem; font-size: .9rem; }
        .egm-err { background: #fbeaea; color: #8a2222; }
        .egm-ok { background: #e8f3ec; color: #1E5D4A; }
        .egm-counts { display: flex; flex-wrap: wrap; gap: .75rem; margin-bottom: 1.25rem; }
        .egm-stat { background: #fffdf7; border: 1px solid #e6dcc4; border-radius: 10px;
          padding: .6rem 1rem; min-width: 92px; }
        .egm-stat .v { font-size: 1.5rem; font-weight: 700; color: #1E5D4A; }
        .egm-stat .l { font-size: .72rem; text-transform: uppercase; letter-spacing: .04em; color: #8a7a52; }
        .egm-panel { background: #fffdf7; border: 1px solid #e6dcc4; border-radius: 12px;
          padding: 1.1rem 1.25rem; margin-bottom: 1.25rem; }
        .egm-panel h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 1.4rem;
          margin: 0 0 .8rem; color: #1E5D4A; }
        .egm-form { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; }
        .egm-form input[type=text], .egm-form input[type=email], .egm-form input:not([type]) {
          flex: 1 1 160px; padding: .55rem .7rem; border: 1px solid #d8cdb0; border-radius: 8px;
          font: inherit; }
        .egm-check { display: inline-flex; align-items: center; gap: .35rem; font-size: .9rem; }
        .egm-btn { background: #1E5D4A; color: #fff; border: none; border-radius: 8px;
          padding: .55rem 1.1rem; font: inherit; font-weight: 600; cursor: pointer; }
        .egm-btn:disabled { opacity: .55; cursor: default; }
        .egm-ghost { background: transparent; color: #1E5D4A; border: 1px solid #1E5D4A; }
        .egm-table { width: 100%; border-collapse: collapse; font-size: .9rem; }
        .egm-table th { text-align: left; font-size: .72rem; text-transform: uppercase;
          letter-spacing: .04em; color: #8a7a52; border-bottom: 1px solid #e6dcc4; padding: .4rem .5rem; }
        .egm-table td { padding: .55rem .5rem; border-bottom: 1px solid #f0e9d8; }
        .egm-actions { white-space: nowrap; }
        .egm-link { background: none; border: none; color: #1E5D4A; cursor: pointer;
          font: inherit; padding: 0 .4rem; }
        .egm-danger { color: #8a2222; }
        .egm-vip { background: #C9A35B; color: #1b1b1b; font-size: .66rem; font-weight: 700;
          padding: .05rem .35rem; border-radius: 5px; margin-left: .35rem; }
        .egm-empty { color: #6b7a72; font-style: italic; margin: 0; }
        .egm-subs { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .5rem; }
        .egm-subs li { display: flex; align-items: center; gap: .5rem; }
        .egm-mono { font-family: 'SFMono-Regular', Menlo, monospace; font-size: .82rem; color: #4a5d54; }
        .egm-tag { background: #e8f3ec; color: #1E5D4A; font-size: .7rem; padding: .12rem .45rem;
          border-radius: 5px; }
        .egm-gold { background: #f6edd6; color: #8a6d20; }
      `}</style>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="egm-stat">
      <div className="v">{value}</div>
      <div className="l">{label}</div>
    </div>
  );
}

/**
 * Vendor-side opt-in control. A vendor enters their vendor id (their own org's
 * vendor profile) and toggles whether they need the guest list, headcount, and
 * a deposit gate for this event. Upserts the vendor_event_requirements row; the
 * server rejects a vendor id that does not belong to the actor's organization.
 */
export function VendorRequirementToggle({
  eventId,
  onChange,
}: {
  eventId: string;
  onChange?: () => void;
}) {
  const [vendorId, setVendorId] = useState('');
  const [needsGuestList, setNeedsGuestList] = useState(false);
  const [needsHeadcount, setNeedsHeadcount] = useState(false);
  const [needsDeposit, setNeedsDeposit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Prefill from the actor's own vendor rows on this event, if any.
  useEffect(() => {
    apiGet<{ requirements: Requirement[] }>(
      `/vendor-event-requirements/event/${eventId}/mine`,
    )
      .then((r) => {
        const mine = r.requirements[0];
        if (mine?.vendor_id) {
          setVendorId(mine.vendor_id);
          setNeedsGuestList(!!mine.needs_guest_list);
          setNeedsHeadcount(!!mine.needs_headcount);
          setNeedsDeposit(!!mine.needs_deposit);
        }
      })
      .catch(() => undefined);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [eventId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!vendorId.trim()) {
      setErr('Enter your vendor id to opt in.');
      return;
    }
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      await apiSend('POST', `/vendor-event-requirements`, {
        event_id: eventId,
        vendor_id: vendorId.trim(),
        needs_guest_list: needsGuestList,
        needs_headcount: needsHeadcount,
        needs_deposit: needsDeposit,
      });
      setOk('Preferences saved.');
      onChange?.();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="egm-panel">
      <h2>Vendor: subscribe to this event</h2>
      <p className="egm-empty">
        Vendors only. Opt your org in to guest-list updates and set deposit gating
        for this event.
      </p>
      {err && <div className="egm-alert egm-err">{err}</div>}
      {ok && <div className="egm-alert egm-ok">{ok}</div>}
      <form className="egm-form" onSubmit={save}>
        <input
          placeholder="Your vendor id"
          value={vendorId}
          onChange={(e) => setVendorId(e.target.value)}
        />
        <label className="egm-check">
          <input
            type="checkbox"
            checked={needsGuestList}
            onChange={(e) => setNeedsGuestList(e.target.checked)}
          />
          Guest list updates
        </label>
        <label className="egm-check">
          <input
            type="checkbox"
            checked={needsHeadcount}
            onChange={(e) => setNeedsHeadcount(e.target.checked)}
          />
          Headcount updates
        </label>
        <label className="egm-check">
          <input
            type="checkbox"
            checked={needsDeposit}
            onChange={(e) => setNeedsDeposit(e.target.checked)}
          />
          Deposit gate
        </label>
        <button className="egm-btn" type="submit" disabled={busy}>
          Save preferences
        </button>
      </form>
    </section>
  );
}
