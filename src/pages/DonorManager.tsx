/**
 * Nonprofit Donor Manager (Phase 2).
 *
 * Manage a nonprofit's donors and record donations. The donor list shows
 * lifetime giving (total_given) and last gift; the donation form records a gift
 * against a donor (optional), an amount, a method, and an optional fundraising
 * event. Recording a donation triggers the backend receipt + thank-you
 * notifications. Data flows through /api/donations (org-scoped + IDOR-safe).
 * Luxury ivory/champagne theme via the shared .card/.btn/.note global classes.
 */
import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

type Donor = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  total_given: string | null;
  last_gift_at: string | null;
  notes: string | null;
};

type Donation = {
  id: string;
  fundraising_event_id: string | null;
  donor_id: string | null;
  amount: string | null;
  method: string | null;
  status: string | null;
  created_at: string;
};

type FundraisingEvent = { id: string; name: string };

const METHODS = ['cash', 'check', 'card', 'online', 'in_kind', 'pledge', 'stock'];

function money(v: string | null): string {
  const n = v == null ? 0 : Number(v);
  if (!Number.isFinite(n) || n === 0) return '$0';
  return `$${n.toLocaleString()}`;
}

function date(v: string | null): string {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
}

export default function DonorManager() {
  const [donors, setDonors] = useState<Donor[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [events, setEvents] = useState<FundraisingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // New donor form.
  const [dName, setDName] = useState('');
  const [dEmail, setDEmail] = useState('');
  const [dPhone, setDPhone] = useState('');

  // New donation form.
  const [donorId, setDonorId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('card');
  const [eventId, setEventId] = useState('');

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [dr, dn] = await Promise.all([
        apiGet<{ donors: Donor[] }>('/donations/donors'),
        apiGet<{ donations: Donation[] }>('/donations'),
      ]);
      setDonors(dr.donors ?? []);
      setDonations(dn.donations ?? []);
      try {
        const ev = await apiGet<{ events: FundraisingEvent[] }>('/fundraising-events');
        setEvents(ev.events ?? []);
      } catch {
        setEvents([]);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addDonor() {
    if (!dName.trim()) {
      setErr('Donor name is required.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await apiSend('POST', '/donations/donors', {
        name: dName.trim(),
        email: dEmail.trim() || null,
        phone: dPhone.trim() || null,
      });
      setDName('');
      setDEmail('');
      setDPhone('');
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function recordDonation() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setErr('Enter a donation amount greater than zero.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await apiSend('POST', '/donations', {
        amount: amt,
        method,
        donor_id: donorId || null,
        fundraising_event_id: eventId || null,
      });
      setAmount('');
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeDonor(id: string) {
    setBusy(true);
    setErr(null);
    try {
      await apiSend('DELETE', `/donations/donors/${id}`);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const totalRaised = donations
    .filter((d) => (d.status ?? '') !== 'refunded')
    .reduce((s, d) => s + Number(d.amount ?? 0), 0);

  const donorName = (id: string | null): string => {
    if (!id) return 'Anonymous / unassigned';
    return donors.find((d) => d.id === id)?.name ?? 'Donor';
  };
  const eventName = (id: string | null): string => {
    if (!id) return '-';
    return events.find((e) => e.id === id)?.name ?? '-';
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Donor Manager</h1>
          <div className="sub">Track donors, record gifts, and trigger receipts and thank-you notes</div>
        </div>
      </div>

      {err && (
        <div className="card" style={{ borderColor: '#c0392b', color: '#c0392b', marginBottom: 16 }}>
          {err}
        </div>
      )}

      <div className="grid cards3" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="note">Donors</div>
          <div style={{ fontSize: 28, fontWeight: 600 }}>{donors.length}</div>
        </div>
        <div className="card">
          <div className="note">Donations recorded</div>
          <div style={{ fontSize: 28, fontWeight: 600 }}>{donations.length}</div>
        </div>
        <div className="card">
          <div className="note">Total raised (donations)</div>
          <div style={{ fontSize: 28, fontWeight: 600 }}>${totalRaised.toLocaleString()}</div>
        </div>
      </div>

      <div className="grid cards2">
        <div className="card">
          <div className="sectitle">Add donor</div>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Name</div>
            <input value={dName} onChange={(e) => setDName(e.target.value)} style={{ width: '100%' }} placeholder="Jane Benefactor" />
          </label>
          <label>
            <div className="note" style={{ margin: '10px 0 6px' }}>Email</div>
            <input value={dEmail} onChange={(e) => setDEmail(e.target.value)} style={{ width: '100%' }} placeholder="jane@example.com" />
          </label>
          <label>
            <div className="note" style={{ margin: '10px 0 6px' }}>Phone</div>
            <input value={dPhone} onChange={(e) => setDPhone(e.target.value)} style={{ width: '100%' }} placeholder="(555) 123-4567" />
          </label>
          <div style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={addDonor} disabled={busy}>{busy ? 'Saving...' : 'Add donor'}</button>
          </div>
        </div>

        <div className="card">
          <div className="sectitle">Record donation</div>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Donor</div>
            <select value={donorId} onChange={(e) => setDonorId(e.target.value)} style={{ width: '100%' }}>
              <option value="">Anonymous / unassigned</option>
              {donors.map((d) => <option key={d.id} value={d.id}>{d.name ?? 'Donor'}</option>)}
            </select>
          </label>
          <label>
            <div className="note" style={{ margin: '10px 0 6px' }}>Amount</div>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: '100%' }} placeholder="500" inputMode="decimal" />
          </label>
          <label>
            <div className="note" style={{ margin: '10px 0 6px' }}>Method</div>
            <select value={method} onChange={(e) => setMethod(e.target.value)} style={{ width: '100%' }}>
              {METHODS.map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
          <label>
            <div className="note" style={{ margin: '10px 0 6px' }}>Fundraising event (optional)</div>
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} style={{ width: '100%' }}>
              <option value="">No event</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
          <div style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={recordDonation} disabled={busy}>{busy ? 'Recording...' : 'Record donation + send receipt'}</button>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="sectitle">Donors</div>
        {loading ? (
          <p className="note" style={{ margin: 0 }}>Loading donors...</p>
        ) : donors.length === 0 ? (
          <p className="note" style={{ margin: 0, lineHeight: 1.7 }}>
            No donors yet. Add your first supporter above, then record their gifts.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left' }}>
                  <th className="note" style={{ padding: '6px 8px' }}>Name</th>
                  <th className="note" style={{ padding: '6px 8px' }}>Email</th>
                  <th className="note" style={{ padding: '6px 8px' }}>Lifetime giving</th>
                  <th className="note" style={{ padding: '6px 8px' }}>Last gift</th>
                  <th className="note" style={{ padding: '6px 8px' }}></th>
                </tr>
              </thead>
              <tbody>
                {donors.map((d) => (
                  <tr key={d.id} style={{ borderTop: '1px solid rgba(0,0,0,.08)' }}>
                    <td style={{ padding: '8px' }}>{d.name ?? '-'}</td>
                    <td style={{ padding: '8px' }}>{d.email ?? '-'}</td>
                    <td style={{ padding: '8px' }}>{money(d.total_given)}</td>
                    <td style={{ padding: '8px' }}>{date(d.last_gift_at)}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>
                      <button className="btn" onClick={() => removeDonor(d.id)} disabled={busy}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="sectitle">Recent donations</div>
        {loading ? (
          <p className="note" style={{ margin: 0 }}>Loading donations...</p>
        ) : donations.length === 0 ? (
          <p className="note" style={{ margin: 0 }}>No donations recorded yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left' }}>
                  <th className="note" style={{ padding: '6px 8px' }}>Date</th>
                  <th className="note" style={{ padding: '6px 8px' }}>Donor</th>
                  <th className="note" style={{ padding: '6px 8px' }}>Amount</th>
                  <th className="note" style={{ padding: '6px 8px' }}>Method</th>
                  <th className="note" style={{ padding: '6px 8px' }}>Event</th>
                  <th className="note" style={{ padding: '6px 8px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {donations.map((d) => (
                  <tr key={d.id} style={{ borderTop: '1px solid rgba(0,0,0,.08)' }}>
                    <td style={{ padding: '8px' }}>{date(d.created_at)}</td>
                    <td style={{ padding: '8px' }}>{donorName(d.donor_id)}</td>
                    <td style={{ padding: '8px' }}>{money(d.amount)}</td>
                    <td style={{ padding: '8px' }}>{(d.method ?? '-').replace(/_/g, ' ')}</td>
                    <td style={{ padding: '8px' }}>{eventName(d.fundraising_event_id)}</td>
                    <td style={{ padding: '8px' }}>{d.status ?? 'recorded'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
