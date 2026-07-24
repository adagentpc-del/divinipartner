import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

/**
 * Exhibitors tab. The event coordinator manages the sell side of "Become a
 * vendor": exhibitor and vendor packages, booth inventory, and the incoming
 * applications (orders) for this event. Data flows through the /event-landing
 * exhibitor endpoints. Zero em dashes.
 */

type Pkg = {
  id: string;
  name: string;
  price_cents: number;
  quantity: number | null;
  sold: number;
  includes_booth: boolean;
  benefits: string | null;
  is_active: boolean;
};

type Booth = {
  id: string;
  label: string;
  price_cents: number;
  status: 'available' | 'held' | 'booked';
};

type Order = {
  id: string;
  contact_name: string;
  email: string;
  company: string;
  amount_cents: number;
  status: string;
  created_at: string;
};

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function ExhibitorsTab({ eventId }: { eventId: string }) {
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [booths, setBooths] = useState<Booth[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [pkgForm, setPkgForm] = useState({ name: '', price: '', quantity: '', includes_booth: false, benefits: '' });
  const [pkgBusy, setPkgBusy] = useState(false);

  const [boothForm, setBoothForm] = useState({ label: '', price: '' });
  const [boothBusy, setBoothBusy] = useState(false);

  async function loadBundle() {
    const r = await apiGet<{ packages: Pkg[]; booths: Booth[]; orders: Order[] }>(
      `/event-landing/event/${eventId}/exhibitor`,
    );
    setPackages(r.packages);
    setBooths(r.booths);
    setOrders(r.orders);
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    loadBundle()
      .catch((e) => { if (alive) setErr((e as Error).message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function addPackage(e: React.FormEvent) {
    e.preventDefault();
    if (!pkgForm.name.trim()) return;
    const price = Number(pkgForm.price);
    if (Number.isNaN(price) || price < 0) { setErr('Enter a valid price in dollars.'); return; }
    const qtyRaw = pkgForm.quantity.trim();
    const quantity = qtyRaw === '' ? null : Number(qtyRaw);
    if (quantity !== null && (Number.isNaN(quantity) || quantity < 0)) { setErr('Enter a valid quantity or leave it blank.'); return; }
    const benefits = pkgForm.benefits.trim() === '' ? null : pkgForm.benefits.trim();
    setPkgBusy(true);
    setErr(null);
    try {
      await apiSend<{ package: Pkg }>('POST', `/event-landing/event/${eventId}/packages`, {
        name: pkgForm.name.trim(),
        price,
        quantity,
        includes_booth: pkgForm.includes_booth,
        benefits,
      });
      setPkgForm({ name: '', price: '', quantity: '', includes_booth: false, benefits: '' });
      await loadBundle();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPkgBusy(false);
    }
  }

  async function removePackage(id: string) {
    setErr(null);
    try {
      await apiSend('DELETE', `/event-landing/packages/${id}`);
      await loadBundle();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function addBooth(e: React.FormEvent) {
    e.preventDefault();
    if (!boothForm.label.trim()) return;
    const price = Number(boothForm.price);
    if (Number.isNaN(price) || price < 0) { setErr('Enter a valid price in dollars.'); return; }
    setBoothBusy(true);
    setErr(null);
    try {
      await apiSend<{ booth: Booth }>('POST', `/event-landing/event/${eventId}/booths`, {
        label: boothForm.label.trim(),
        price,
      });
      setBoothForm({ label: '', price: '' });
      await loadBundle();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBoothBusy(false);
    }
  }

  async function removeBooth(id: string) {
    setErr(null);
    try {
      await apiSend('DELETE', `/event-landing/booths/${id}`);
      await loadBundle();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (loading) {
    return (
      <div>
        <style>{EX_CSS}</style>
        <p className="ew-muted">Loading exhibitor packages...</p>
      </div>
    );
  }

  return (
    <div>
      <style>{EX_CSS}</style>
      {err ? <p className="ew-error">{err}</p> : null}

      <p className="ew-muted ex-helper">These appear on the event's public page under Become a vendor.</p>

      <div className="ex-section">
        <div className="ex-secttitle">Packages</div>

        <form className="ex-add" onSubmit={addPackage}>
          <input
            className="ex-in"
            placeholder="Package name"
            value={pkgForm.name}
            onChange={(e) => setPkgForm({ ...pkgForm, name: e.target.value })}
          />
          <input
            className="ex-in ex-innum"
            type="number"
            min="0"
            step="0.01"
            placeholder="Price ($)"
            value={pkgForm.price}
            onChange={(e) => setPkgForm({ ...pkgForm, price: e.target.value })}
          />
          <input
            className="ex-in ex-innum"
            type="number"
            min="0"
            step="1"
            placeholder="Qty (blank = unlimited)"
            value={pkgForm.quantity}
            onChange={(e) => setPkgForm({ ...pkgForm, quantity: e.target.value })}
          />
          <input
            className="ex-in"
            placeholder="Benefits (optional)"
            value={pkgForm.benefits}
            onChange={(e) => setPkgForm({ ...pkgForm, benefits: e.target.value })}
          />
          <label className="ex-check">
            <input
              type="checkbox"
              checked={pkgForm.includes_booth}
              onChange={(e) => setPkgForm({ ...pkgForm, includes_booth: e.target.checked })}
            />
            <span>Includes a booth</span>
          </label>
          <button type="submit" className="ew-btn sm" disabled={pkgBusy}>Add package</button>
        </form>

        {packages.length === 0 ? (
          <div className="ew-empty"><p>No packages yet. Add a package above so vendors can sign up.</p></div>
        ) : (
          <table className="ew-table">
            <thead>
              <tr>
                <th>Package</th>
                <th>Price</th>
                <th>Sold / Quantity</th>
                <th>Booth</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {packages.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.name}
                    {!p.is_active ? <span className="ex-flag">Inactive</span> : null}
                    {p.benefits ? <div className="ex-benefits">{p.benefits}</div> : null}
                  </td>
                  <td>{money(p.price_cents)}</td>
                  <td>{p.sold} / {p.quantity === null ? 'Unlimited' : p.quantity}</td>
                  <td>{p.includes_booth ? <span className="ex-booth-yes">Booth included</span> : <span className="ew-muted">No</span>}</td>
                  <td className="ex-rowaction">
                    <button type="button" className="ex-del" onClick={() => removePackage(p.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="ex-section">
        <div className="ex-secttitle">Booths</div>

        <form className="ex-add" onSubmit={addBooth}>
          <input
            className="ex-in"
            placeholder="Booth label"
            value={boothForm.label}
            onChange={(e) => setBoothForm({ ...boothForm, label: e.target.value })}
          />
          <input
            className="ex-in ex-innum"
            type="number"
            min="0"
            step="0.01"
            placeholder="Price ($)"
            value={boothForm.price}
            onChange={(e) => setBoothForm({ ...boothForm, price: e.target.value })}
          />
          <button type="submit" className="ew-btn sm" disabled={boothBusy}>Add booth</button>
        </form>

        {booths.length === 0 ? (
          <div className="ew-empty"><p>No booths yet. Add booth inventory above to assign to exhibitors.</p></div>
        ) : (
          <table className="ew-table">
            <thead>
              <tr>
                <th>Booth</th>
                <th>Price</th>
                <th>Status</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {booths.map((b) => (
                <tr key={b.id}>
                  <td>{b.label}</td>
                  <td>{money(b.price_cents)}</td>
                  <td><span className={`ex-badge ex-badge-${b.status}`}>{b.status}</span></td>
                  <td className="ex-rowaction">
                    <button type="button" className="ex-del" onClick={() => removeBooth(b.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="ex-section">
        <div className="ex-secttitle">Applications <span className="ex-count">{orders.length}</span></div>
        {orders.length === 0 ? (
          <div className="ew-empty"><p>No vendor applications yet.</p></div>
        ) : (
          <table className="ew-table">
            <thead>
              <tr>
                <th>Contact</th>
                <th>Company</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{o.contact_name}</td>
                  <td>{o.company}</td>
                  <td>{money(o.amount_cents)}</td>
                  <td><span className="ex-flag ex-flag-plain">{o.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const EX_CSS = `
.ex-helper { margin: 0 0 18px; }
.ex-section { margin-bottom: 24px; }
.ex-secttitle { font-size: 10.5px; letter-spacing: .5px; text-transform: uppercase; color: #7d776c; font-weight: 600; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
.ex-count { font-size: 10px; font-weight: 700; color: #123c2e; background: rgba(201,163,91,.2); border-radius: 999px; padding: 1px 8px; }
.ex-add { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 14px; }
.ex-in { font: inherit; font-size: 13px; padding: 8px 11px; border: 1px solid #e7e1d6; border-radius: 8px; background: #fff; color: #2c2a26; flex: 1 1 160px; min-width: 0; }
.ex-innum { flex: 0 0 150px; }
.ex-check { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: #2c2a26; cursor: pointer; flex: 0 0 auto; }
.ex-check input { width: 15px; height: 15px; accent-color: #1E5D4A; }
.ex-flag { font-size: 9px; font-weight: 700; letter-spacing: .5px; color: #8a3a3a; background: rgba(138,58,58,.12); border-radius: 4px; padding: 1px 5px; margin-left: 6px; text-transform: uppercase; }
.ex-flag-plain { color: #123c2e; background: rgba(18,60,46,.1); margin-left: 0; }
.ex-benefits { font-size: 11.5px; color: #7d776c; margin-top: 3px; }
.ex-booth-yes { font-size: 11px; font-weight: 600; color: #1E5D4A; }
.ex-badge { font-size: 10px; font-weight: 700; letter-spacing: .4px; text-transform: capitalize; border-radius: 999px; padding: 2px 9px; }
.ex-badge-available { color: #1E5D4A; background: rgba(30,93,74,.14); }
.ex-badge-held { color: #8a6a1e; background: rgba(201,163,91,.22); }
.ex-badge-booked { color: #6a655c; background: rgba(109,101,88,.15); }
.ex-rowaction { text-align: right; }
.ex-del { font: inherit; font-size: 11px; color: #8a3a3a; background: transparent; border: 0; cursor: pointer; }
.ex-del:hover { text-decoration: underline; }
@media (max-width: 720px) { .ex-innum { flex: 1 1 120px; } }
`;
