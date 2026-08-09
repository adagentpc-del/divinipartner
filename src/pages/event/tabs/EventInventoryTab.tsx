import React, { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend, ApiError } from '../../../lib/api';

/**
 * Event Inventory (live-ops phase, Part 17-20): items, locations
 * (hierarchical zones), transfers, and thresholded alerts. Distinct from
 * the pre-existing supplier warehouse catalog (a different Inventory tab
 * already in this workspace) -- this tracks day-of physical inventory at
 * THIS event: what arrived, where it currently is, and where it moved.
 * Every quantity here comes from the server's movement ledger
 * (server/src/db/eventInventory.ts), never a locally-computed guess.
 *
 * Zero em dashes.
 */

type Location = { id: string; name: string; parent_id: string | null; notes: string | null };
type InventoryItem = {
  id: string;
  name: string;
  category: string;
  unit: string;
  expected_quantity: string | null;
  status: string;
  current_total: number;
  by_location: Array<{ location_id: string; quantity: number }>;
};
type Alert = { severity: string; message: string };

const CATEGORIES = ['consumables', 'rentals', 'production', 'decor', 'guest_materials', 'sponsor_inventory'];

export default function EventInventoryTab({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const [showItemForm, setShowItemForm] = useState(false);
  const [itemForm, setItemForm] = useState({ name: '', category: 'consumables', unit: 'unit', expected_quantity: '' });
  const [showLocForm, setShowLocForm] = useState(false);
  const [locForm, setLocForm] = useState({ name: '', parent_id: '' });
  const [transferForm, setTransferForm] = useState<{ item_id: string; quantity: string; from: string; to: string; reason: string }>({
    item_id: '', quantity: '', from: '', to: '', reason: '',
  });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiGet<{ items: InventoryItem[] }>(`/event-inventory/event/${eventId}/items`),
      apiGet<{ locations: Location[] }>(`/event-inventory/event/${eventId}/locations`),
      apiGet<{ alerts: Alert[] }>(`/event-inventory/event/${eventId}/alerts`).catch(() => ({ alerts: [] })),
    ])
      .then(([i, l, a]) => { setItems(i.items); setLocations(l.locations); setAlerts(a.alerts); })
      .catch((e) => setError(e?.message ?? 'Failed to load inventory'))
      .finally(() => setLoading(false));
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  async function addItem() {
    if (!itemForm.name.trim()) { setActionErr('Item name is required.'); return; }
    setBusy(true);
    setActionErr(null);
    try {
      await apiSend('POST', `/event-inventory/event/${eventId}/items`, {
        name: itemForm.name.trim(),
        category: itemForm.category,
        unit: itemForm.unit.trim() || 'unit',
        expected_quantity: itemForm.expected_quantity ? Number(itemForm.expected_quantity) : null,
      });
      setItemForm({ name: '', category: 'consumables', unit: 'unit', expected_quantity: '' });
      setShowItemForm(false);
      load();
    } catch (e) {
      setActionErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addLocation() {
    if (!locForm.name.trim()) { setActionErr('Location name is required.'); return; }
    setBusy(true);
    setActionErr(null);
    try {
      await apiSend('POST', `/event-inventory/event/${eventId}/locations`, {
        name: locForm.name.trim(),
        parent_id: locForm.parent_id || null,
      });
      setLocForm({ name: '', parent_id: '' });
      setShowLocForm(false);
      load();
    } catch (e) {
      setActionErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function transfer() {
    if (!transferForm.item_id || !transferForm.quantity) { setActionErr('Item and quantity are required.'); return; }
    setBusy(true);
    setActionErr(null);
    try {
      await apiSend('POST', `/event-inventory/event/${eventId}/movements`, {
        item_id: transferForm.item_id,
        quantity: Number(transferForm.quantity),
        from_location_id: transferForm.from || null,
        to_location_id: transferForm.to || null,
        reason: transferForm.reason.trim() || null,
      });
      setTransferForm({ item_id: '', quantity: '', from: '', to: '', reason: '' });
      load();
    } catch (e) {
      setActionErr(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function locationName(id: string): string {
    return locations.find((l) => l.id === id)?.name ?? id.slice(0, 8);
  }

  if (loading) return <p className="ew-muted">Loading inventory...</p>;
  if (error) return <p className="ew-error">{error}</p>;

  return (
    <div className="ew-inv">
      <style>{INV_CSS}</style>
      {actionErr ? <p className="ew-error">{actionErr}</p> : null}

      {alerts.length > 0 ? (
        <div className="ew-inv-alerts">
          {alerts.map((a, i) => (
            <div key={i} className={`ew-inv-alert sev-${a.severity}`}>{a.message}</div>
          ))}
        </div>
      ) : null}

      <div className="ew-inv-toolbar">
        <button type="button" className="ew-btn sm" onClick={() => setShowItemForm((s) => !s)}>
          {showItemForm ? 'Cancel' : 'Add item'}
        </button>
        <button type="button" className="ew-btn ghost sm" onClick={() => setShowLocForm((s) => !s)}>
          {showLocForm ? 'Cancel' : 'Add location'}
        </button>
      </div>

      {showItemForm ? (
        <div className="ew-inv-form">
          <input className="ew-inv-input" placeholder="Item name (e.g. Champagne)" value={itemForm.name} onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))} />
          <div className="ew-inv-formrow">
            <select className="ew-inv-input" value={itemForm.category} onChange={(e) => setItemForm((f) => ({ ...f, category: e.target.value }))}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
            </select>
            <input className="ew-inv-input" placeholder="Unit (e.g. bottle)" value={itemForm.unit} onChange={(e) => setItemForm((f) => ({ ...f, unit: e.target.value }))} />
            <input className="ew-inv-input" type="number" placeholder="Expected qty" value={itemForm.expected_quantity} onChange={(e) => setItemForm((f) => ({ ...f, expected_quantity: e.target.value }))} />
          </div>
          <button type="button" className="ew-btn sm" onClick={() => void addItem()} disabled={busy}>Add</button>
        </div>
      ) : null}

      {showLocForm ? (
        <div className="ew-inv-form">
          <input className="ew-inv-input" placeholder="Location name (e.g. VIP Bar)" value={locForm.name} onChange={(e) => setLocForm((f) => ({ ...f, name: e.target.value }))} />
          <select className="ew-inv-input" value={locForm.parent_id} onChange={(e) => setLocForm((f) => ({ ...f, parent_id: e.target.value }))}>
            <option value="">No parent (top-level)</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <button type="button" className="ew-btn sm" onClick={() => void addLocation()} disabled={busy}>Add</button>
        </div>
      ) : null}

      {items.length > 0 && locations.length > 0 ? (
        <div className="ew-inv-form">
          <h3>Transfer inventory</h3>
          <div className="ew-inv-formrow">
            <select className="ew-inv-input" value={transferForm.item_id} onChange={(e) => setTransferForm((f) => ({ ...f, item_id: e.target.value }))}>
              <option value="">Item</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <input className="ew-inv-input" type="number" placeholder="Quantity" value={transferForm.quantity} onChange={(e) => setTransferForm((f) => ({ ...f, quantity: e.target.value }))} />
          </div>
          <div className="ew-inv-formrow">
            <select className="ew-inv-input" value={transferForm.from} onChange={(e) => setTransferForm((f) => ({ ...f, from: e.target.value }))}>
              <option value="">From (blank = new arrival)</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <select className="ew-inv-input" value={transferForm.to} onChange={(e) => setTransferForm((f) => ({ ...f, to: e.target.value }))}>
              <option value="">To (blank = departed)</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <input className="ew-inv-input" placeholder="Reason" value={transferForm.reason} onChange={(e) => setTransferForm((f) => ({ ...f, reason: e.target.value }))} />
          <button type="button" className="ew-btn sm" onClick={() => void transfer()} disabled={busy}>Move</button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="ew-empty"><p>No inventory items tracked for this event yet.</p></div>
      ) : (
        <div className="ew-inv-list">
          {items.map((item) => (
            <div key={item.id} className="ew-inv-card">
              <div className="ew-inv-top">
                <span className="ew-inv-name">{item.name}</span>
                <span className="ew-inv-cat">{item.category.replace(/_/g, ' ')}</span>
              </div>
              <div className="ew-inv-nums">
                <span>{item.current_total} {item.unit}(s) on site</span>
                {item.expected_quantity ? <span>of {item.expected_quantity} expected</span> : null}
              </div>
              {item.by_location.length > 0 ? (
                <ul className="ew-inv-locs">
                  {item.by_location.map((bl) => (
                    <li key={bl.location_id}>{locationName(bl.location_id)}: {bl.quantity}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const INV_CSS = `
.ew-inv-alerts { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.ew-inv-alert { font-size: 12.5px; padding: 8px 12px; border-radius: 8px; border: 1px solid; }
.ew-inv-alert.sev-warning { background: rgba(201,163,91,.12); border-color: rgba(201,163,91,.4); color: #8a5a12; }
.ew-inv-alert.sev-critical { background: rgba(155,44,44,.1); border-color: rgba(155,44,44,.35); color: #9b2c2c; }
.ew-inv-toolbar { display: flex; gap: 8px; margin-bottom: 14px; }
.ew-inv-form { display: flex; flex-direction: column; gap: 8px; background: #fff; border: 1px solid #e7e1d6; border-radius: 12px; padding: 14px 16px; margin-bottom: 14px; }
.ew-inv-form h3 { margin: 0 0 4px; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 17px; color: #123c2e; }
.ew-inv-formrow { display: flex; gap: 8px; }
.ew-inv-input { font: inherit; font-size: 13.5px; padding: 8px 10px; border: 1px solid #e7e1d6; border-radius: 8px; flex: 1; }
.ew-inv-list { display: flex; flex-direction: column; gap: 12px; }
.ew-inv-card { background: #fff; border: 1px solid #e7e1d6; border-radius: 14px; padding: 16px 18px; }
.ew-inv-top { display: flex; align-items: center; justify-content: space-between; }
.ew-inv-name { font-weight: 700; color: #123c2e; }
.ew-inv-cat { font-size: 11px; text-transform: uppercase; letter-spacing: .4px; color: #6b6459; }
.ew-inv-nums { display: flex; gap: 10px; font-size: 12.5px; color: #6b6459; margin-top: 4px; }
.ew-inv-locs { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: #2c2a26; }
.ew-inv-locs li { background: #F7F4EE; border-radius: 999px; padding: 2px 10px; }
`;
