import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

type EventVendor = {
  id: string;
  organization_id: string;
  vendor_id: string | null;
  role: string | null;
  status: string | null;
  created_at: string;
};

export default function VendorsTab({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<EventVendor[]>([]);
  const [orgId, setOrgId] = useState('');
  const [role, setRole] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [capNote, setCapNote] = useState(false);

  function toggleSelect(vendorId: string) {
    setSelected((prev) => {
      if (prev.includes(vendorId)) {
        setCapNote(false);
        return prev.filter((v) => v !== vendorId);
      }
      if (prev.length >= 5) {
        setCapNote(true);
        return prev;
      }
      setCapNote(false);
      return [...prev, vendorId];
    });
  }

  function openCompare() {
    window.open(`/compare/vendors?ids=${selected.join(',')}`, '_blank');
  }

  async function load() {
    try {
      const r = await apiGet<{ vendors: EventVendor[] }>(`/events/${eventId}/vendors`);
      setRows(r.vendors);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [eventId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await apiSend('POST', `/events/${eventId}/vendors`, {
        organization_id: orgId.trim(),
        role: role.trim() || null,
      });
      setOrgId('');
      setRole('');
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await apiSend('DELETE', `/events/${eventId}/vendors/${id}`);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <style>{V_CSS}</style>
      {err ? <p className="ew-error">{err}</p> : null}

      <form className="ew-v-add" onSubmit={add}>
        <input
          placeholder="Vendor organization id"
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
        />
        <input
          placeholder="Role (e.g. florist)"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        />
        <button type="submit" className="ew-btn" disabled={busy}>Add vendor</button>
      </form>

      {rows.length === 0 ? (
        <div className="ew-empty">
          <p>No vendors attached to this event yet. Add a vendor organization to start collaborating.</p>
        </div>
      ) : (
        <>
          <div className="ew-v-compare">
            <button
              type="button"
              className="ew-btn"
              onClick={openCompare}
              disabled={selected.length < 2 || selected.length > 5}
            >
              Compare ({selected.length})
            </button>
            <span className="ew-v-hint">Select 2 to 5 vendors to compare side by side.</span>
            {capNote ? <span className="ew-v-cap">Select up to 5</span> : null}
          </div>
          <table className="ew-table">
            <thead>
              <tr><th></th><th>Organization</th><th>Role</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={r.vendor_id !== null && selected.includes(r.vendor_id)}
                      disabled={r.vendor_id === null}
                      onChange={() => { if (r.vendor_id !== null) toggleSelect(r.vendor_id); }}
                    />
                  </td>
                  <td className="ew-mono">{r.organization_id}</td>
                  <td>{r.role ?? '-'}</td>
                  <td>{r.status ?? '-'}</td>
                  <td>
                    <button type="button" className="ew-btn ghost sm" onClick={() => remove(r.id)} disabled={busy}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

const V_CSS = `
.ew-v-add { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 18px; }
.ew-v-add input { font: inherit; padding: 9px 12px; border: 1px solid #e7e1d6; border-radius: 8px; background: #fff; min-width: 200px; flex: 1 1 auto; }
.ew-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; color: #6a655c; }
.ew-v-compare { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.ew-v-hint { font-size: 12.5px; color: #6a655c; }
.ew-v-cap { font-size: 12.5px; color: #b4451f; }
`;
