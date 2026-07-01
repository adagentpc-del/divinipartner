/**
 * Nonprofit / Charity core - tiered Sponsorship Packages builder (Workstream B).
 *
 * Build tiered sponsorship packages (presenting / gold / silver / bronze /
 * in-kind / vendor) for a selected fundraising event. Each package carries a
 * price, a benefits checklist (logo placement, tickets, booth, speaking, social
 * mentions, signage, program inclusion), tickets included, quantity, and a
 * fulfillment checklist (the steps the nonprofit owes the sponsor). Data flows
 * through /api/fundraising-events (to pick an event) and
 * /api/sponsorship-packages (org-scoped + IDOR-safe). Shared .card/.btn/.note
 * theme classes.
 */
import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

type FundraisingEvent = { id: string; name: string };

type SponsorshipPackage = {
  id: string;
  tier: string | null;
  name: string | null;
  price: string | null;
  benefits: Record<string, boolean> | null;
  tickets_included: number | null;
  quantity: number | null;
  sold: number | null;
  fulfillment_checklist: { label: string; done?: boolean }[] | null;
  status: string | null;
};

const TIERS = ['presenting', 'gold', 'silver', 'bronze', 'in_kind', 'vendor'];

const BENEFIT_KEYS: { key: string; label: string }[] = [
  { key: 'logo_placement', label: 'Logo placement' },
  { key: 'tickets', label: 'Event tickets' },
  { key: 'booth', label: 'Booth / table' },
  { key: 'speaking', label: 'Speaking opportunity' },
  { key: 'social_mentions', label: 'Social mentions' },
  { key: 'signage', label: 'On-site signage' },
  { key: 'program_inclusion', label: 'Program inclusion' },
];

const DEFAULT_FULFILLMENT = [
  'Collect sponsor logo + brand assets',
  'Add logo to event signage',
  'Add logo to program + website',
  'Schedule social mention posts',
  'Confirm booth / table assignment',
  'Reserve included tickets',
  'Send post-event recap + impact report',
];

type EditState = {
  id: string | null;
  tier: string;
  name: string;
  price: string;
  tickets_included: string;
  quantity: string;
  sold: string;
  status: string;
  benefits: Record<string, boolean>;
  fulfillment: { label: string; done: boolean }[];
};

function blank(): EditState {
  return {
    id: null,
    tier: 'gold',
    name: '',
    price: '',
    tickets_included: '',
    quantity: '1',
    sold: '0',
    status: 'open',
    benefits: Object.fromEntries(BENEFIT_KEYS.map((b) => [b.key, false])),
    fulfillment: DEFAULT_FULFILLMENT.map((label) => ({ label, done: false })),
  };
}

function money(v: string | null): string {
  const n = v == null ? 0 : Number(v);
  if (!Number.isFinite(n) || n === 0) return '-';
  return `$${n.toLocaleString()}`;
}

export default function SponsorshipPackages() {
  const [events, setEvents] = useState<FundraisingEvent[]>([]);
  const [eventId, setEventId] = useState<string>('');
  const [packages, setPackages] = useState<SponsorshipPackage[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadEvents() {
    setLoadingEvents(true);
    try {
      const r = await apiGet<{ events: FundraisingEvent[] }>('/fundraising-events');
      setEvents(r.events ?? []);
      if ((r.events ?? []).length && !eventId) setEventId(r.events[0].id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoadingEvents(false);
    }
  }

  async function loadPackages(id: string) {
    if (!id) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await apiGet<{ packages: SponsorshipPackage[] }>(`/sponsorship-packages/event/${id}`);
      setPackages(r.packages ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (eventId) void loadPackages(eventId);
    else setPackages([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  function startCreate() {
    setEditing(blank());
  }

  function startEdit(p: SponsorshipPackage) {
    const benefits = Object.fromEntries(BENEFIT_KEYS.map((b) => [b.key, !!p.benefits?.[b.key]]));
    const fulfillment = (p.fulfillment_checklist && p.fulfillment_checklist.length
      ? p.fulfillment_checklist
      : DEFAULT_FULFILLMENT.map((label) => ({ label, done: false }))
    ).map((f) => ({ label: f.label, done: !!f.done }));
    setEditing({
      id: p.id,
      tier: p.tier ?? 'gold',
      name: p.name ?? '',
      price: p.price != null ? String(Number(p.price)) : '',
      tickets_included: p.tickets_included != null ? String(p.tickets_included) : '',
      quantity: p.quantity != null ? String(p.quantity) : '1',
      sold: p.sold != null ? String(p.sold) : '0',
      status: p.status ?? 'open',
      benefits,
      fulfillment,
    });
  }

  async function save() {
    if (!editing || !eventId) return;
    setBusy(true);
    setErr(null);
    try {
      const body = {
        tier: editing.tier,
        name: editing.name.trim() || null,
        price: editing.price ? Number(editing.price) : 0,
        benefits: editing.benefits,
        tickets_included: editing.tickets_included ? Number(editing.tickets_included) : 0,
        quantity: editing.quantity ? Number(editing.quantity) : 1,
        sold: editing.sold ? Number(editing.sold) : 0,
        fulfillment_checklist: editing.fulfillment,
        status: editing.status || 'open',
      };
      if (editing.id) {
        await apiSend('PATCH', `/sponsorship-packages/${editing.id}`, body);
      } else {
        await apiSend('POST', `/sponsorship-packages/event/${eventId}`, body);
      }
      setEditing(null);
      await loadPackages(eventId);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setErr(null);
    try {
      await apiSend('DELETE', `/sponsorship-packages/${id}`);
      await loadPackages(eventId);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Sponsorship Packages</h1>
          <div className="sub">Tiered sponsorship offerings for your fundraising event</div>
        </div>
        {eventId && <button className="btn primary" onClick={startCreate}>+ Add package</button>}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <label style={{ display: 'block' }}>
          <div className="note" style={{ marginBottom: 6 }}>Fundraising event</div>
          {loadingEvents ? (
            <p className="note" style={{ margin: 0 }}>Loading your fundraising events...</p>
          ) : events.length === 0 ? (
            <p className="note" style={{ margin: 0 }}>
              No fundraising events yet. Create one in the Fundraising Event Builder first.
            </p>
          ) : (
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} style={{ width: '100%' }}>
              {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
          )}
        </label>
      </div>

      {err && (
        <div className="card" style={{ borderColor: '#c0392b', color: '#c0392b', marginBottom: 16 }}>
          {err}
        </div>
      )}

      {!eventId ? null : loading ? (
        <div className="card"><p className="note" style={{ margin: 0 }}>Loading packages...</p></div>
      ) : packages.length === 0 ? (
        <div className="card">
          <p className="note" style={{ margin: 0, lineHeight: 1.7 }}>
            No sponsorship packages yet. Add a presenting, gold, silver, or bronze tier
            with its benefits and fulfillment steps.
          </p>
        </div>
      ) : (
        <div className="grid cards2">
          {packages.map((p) => {
            const enabled = BENEFIT_KEYS.filter((b) => p.benefits?.[b.key]);
            return (
              <div className="card" key={p.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <h3 style={{ margin: 0 }}>{p.name || (p.tier ?? 'Package')}</h3>
                  <span className="note" style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '.5px' }}>
                    {(p.tier ?? '').replace(/_/g, ' ')}
                  </span>
                </div>
                <div style={{ margin: '8px 0', fontWeight: 600 }}>{money(p.price)}</div>
                <div className="note" style={{ lineHeight: 1.8 }}>
                  <div>Tickets included: {p.tickets_included ?? 0}</div>
                  <div>Sold: {p.sold ?? 0} of {p.quantity ?? 1}</div>
                  <div>Benefits: {enabled.length ? enabled.map((b) => b.label).join(', ') : '-'}</div>
                  <div>Fulfillment steps: {p.fulfillment_checklist?.length ?? 0}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn" onClick={() => startEdit(p)}>Edit</button>
                  <button className="btn" onClick={() => remove(p.id)} disabled={busy}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="sectitle">{editing.id ? 'Edit sponsorship package' : 'New sponsorship package'}</div>
          <div className="grid cards2" style={{ gap: 12 }}>
            <label>
              <div className="note" style={{ marginBottom: 6 }}>Tier</div>
              <select value={editing.tier} onChange={(e) => setEditing({ ...editing, tier: e.target.value })} style={{ width: '100%' }}>
                {TIERS.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </label>
            <label>
              <div className="note" style={{ marginBottom: 6 }}>Package name</div>
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} style={{ width: '100%' }} placeholder="Presenting Sponsor" />
            </label>
            <label>
              <div className="note" style={{ marginBottom: 6 }}>Price</div>
              <input value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} style={{ width: '100%' }} placeholder="25000" inputMode="decimal" />
            </label>
            <label>
              <div className="note" style={{ marginBottom: 6 }}>Tickets included</div>
              <input value={editing.tickets_included} onChange={(e) => setEditing({ ...editing, tickets_included: e.target.value })} style={{ width: '100%' }} placeholder="10" inputMode="numeric" />
            </label>
            <label>
              <div className="note" style={{ marginBottom: 6 }}>Quantity available</div>
              <input value={editing.quantity} onChange={(e) => setEditing({ ...editing, quantity: e.target.value })} style={{ width: '100%' }} placeholder="1" inputMode="numeric" />
            </label>
            <label>
              <div className="note" style={{ marginBottom: 6 }}>Sold</div>
              <input value={editing.sold} onChange={(e) => setEditing({ ...editing, sold: e.target.value })} style={{ width: '100%' }} placeholder="0" inputMode="numeric" />
            </label>
          </div>

          <div className="sectitle" style={{ marginTop: 16 }}>Benefits</div>
          <div className="grid cards2" style={{ gap: 6 }}>
            {BENEFIT_KEYS.map((b) => (
              <label key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={!!editing.benefits[b.key]}
                  onChange={(e) => setEditing({ ...editing, benefits: { ...editing.benefits, [b.key]: e.target.checked } })}
                />
                <span>{b.label}</span>
              </label>
            ))}
          </div>

          <div className="sectitle" style={{ marginTop: 16 }}>Fulfillment checklist</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {editing.fulfillment.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={f.done}
                  onChange={(e) => {
                    const next = [...editing.fulfillment];
                    next[i] = { ...next[i], done: e.target.checked };
                    setEditing({ ...editing, fulfillment: next });
                  }}
                />
                <input
                  value={f.label}
                  onChange={(e) => {
                    const next = [...editing.fulfillment];
                    next[i] = { ...next[i], label: e.target.value };
                    setEditing({ ...editing, fulfillment: next });
                  }}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn"
                  type="button"
                  onClick={() => setEditing({ ...editing, fulfillment: editing.fulfillment.filter((_, j) => j !== i) })}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              className="btn"
              type="button"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => setEditing({ ...editing, fulfillment: [...editing.fulfillment, { label: '', done: false }] })}
            >
              + Add step
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
            <button className="btn" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
