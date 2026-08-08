import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

/**
 * Public Page tab. The event coordinator configures the event's public landing
 * page: attend mode (off / free / ticketed), ticket tiers, the "Become a vendor"
 * CTA, headline and description, plus a copy-link shortcut. Data flows through the
 * /event-landing endpoints. Zero em dashes.
 */

type AttendMode = 'off' | 'free' | 'ticketed';

type Settings = {
  event_id: string;
  attend_mode: AttendMode;
  vendor_cta_enabled: boolean;
  headline: string | null;
  description: string | null;
};

type Tier = {
  id: string;
  name: string;
  price_cents: number;
  quantity: number | null;
  sold: number;
  is_active: boolean;
  sort_order: number | null;
};

type Registration = {
  id: string;
  attendee_name: string;
  email: string;
  ticket_type: string;
  quantity: number;
  amount_cents: number;
  order_status: string;
  created_at: string;
};

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function PublicPageTab({ eventId }: { eventId: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [regCount, setRegCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const [tierForm, setTierForm] = useState({ name: '', price: '', quantity: '' });
  const [tierBusy, setTierBusy] = useState(false);

  async function loadSettings() {
    const r = await apiGet<{ settings: Settings; tiers: Tier[] }>(`/event-landing/event/${eventId}`);
    setSettings(r.settings);
    setTiers(r.tiers);
  }

  async function loadRegistrations() {
    try {
      const r = await apiGet<{ registrations: Registration[] }>(`/event-landing/event/${eventId}/registrations`);
      setRegCount(r.registrations.length);
    } catch {
      /* best effort, ignore errors */
    }
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    loadSettings()
      .then(() => { if (alive) void loadRegistrations(); })
      .catch((e) => { if (alive) setErr((e as Error).message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  function patchSettings(patch: Partial<Settings>) {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    setSaved(false);
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    setErr(null);
    setSaved(false);
    try {
      const r = await apiSend<{ settings: Settings }>('PUT', `/event-landing/event/${eventId}`, {
        attend_mode: settings.attend_mode,
        vendor_cta_enabled: settings.vendor_cta_enabled,
        headline: settings.headline,
        description: settings.description,
      });
      setSettings(r.settings);
      setSaved(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function addTier(e: React.FormEvent) {
    e.preventDefault();
    if (!tierForm.name.trim()) return;
    const price = Number(tierForm.price);
    if (Number.isNaN(price) || price < 0) { setErr('Enter a valid price in dollars.'); return; }
    const qtyRaw = tierForm.quantity.trim();
    const quantity = qtyRaw === '' ? null : Number(qtyRaw);
    if (quantity !== null && (Number.isNaN(quantity) || quantity < 0)) { setErr('Enter a valid quantity or leave it blank.'); return; }
    setTierBusy(true);
    setErr(null);
    try {
      await apiSend<{ tier: Tier }>('POST', `/event-landing/event/${eventId}/tiers`, {
        name: tierForm.name.trim(),
        price,
        quantity,
      });
      setTierForm({ name: '', price: '', quantity: '' });
      await loadSettings();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setTierBusy(false);
    }
  }

  async function removeTier(id: string) {
    setErr(null);
    try {
      await apiSend('DELETE', `/event-landing/tiers/${id}`);
      await loadSettings();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function copyLink() {
    const link = `${window.location.origin}/event/${eventId}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (loading) {
    return (
      <div>
        <style>{PP2_CSS}</style>
        <p className="ew-muted">Loading public page settings...</p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div>
        <style>{PP2_CSS}</style>
        {err ? <p className="ew-error">{err}</p> : <p className="ew-muted">No settings available.</p>}
      </div>
    );
  }

  const modes: { key: AttendMode; label: string }[] = [
    { key: 'off', label: 'Off' },
    { key: 'free', label: 'Free' },
    { key: 'ticketed', label: 'Ticketed' },
  ];

  return (
    <div>
      <style>{PP2_CSS}</style>
      {err ? <p className="ew-error">{err}</p> : null}

      <div className="pp2-linkbar">
        <div>
          <div className="pp2-linklabel">Public link</div>
          <code className="pp2-link">{`${window.location.origin}/event/${eventId}`}</code>
        </div>
        <div className="pp2-linkactions">
          {regCount !== null ? <span className="pp2-count">{regCount} registered</span> : null}
          <button type="button" className="ew-btn ghost sm" onClick={copyLink}>
            {copied ? 'Copied' : 'Copy public link'}
          </button>
        </div>
      </div>

      <div className="pp2-section">
        <div className="pp2-secttitle">Attendance</div>
        <div className="pp2-modes" role="group" aria-label="Attend mode">
          {modes.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`pp2-mode${settings.attend_mode === m.key ? ' is-active' : ''}`}
              onClick={() => patchSettings({ attend_mode: m.key })}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="ew-muted pp2-hint">
          Off hides attendee registration. Free collects RSVPs at no cost. Ticketed sells tiers below.
        </p>
      </div>

      <div className="pp2-section">
        <label className="pp2-check">
          <input
            type="checkbox"
            checked={settings.vendor_cta_enabled}
            onChange={(e) => patchSettings({ vendor_cta_enabled: e.target.checked })}
          />
          <span>Show the "Become a vendor" call to action on the public page</span>
        </label>
      </div>

      <div className="pp2-section">
        <div className="pp2-secttitle">Page content</div>
        <label className="pp2-field">
          <span className="pp2-fieldlabel">Headline</span>
          <input
            className="pp2-in"
            placeholder="Headline for the public page"
            value={settings.headline ?? ''}
            onChange={(e) => patchSettings({ headline: e.target.value })}
          />
        </label>
        <label className="pp2-field">
          <span className="pp2-fieldlabel">Description</span>
          <textarea
            className="pp2-in pp2-textarea"
            placeholder="Describe the event for visitors"
            value={settings.description ?? ''}
            onChange={(e) => patchSettings({ description: e.target.value })}
          />
        </label>
      </div>

      <div className="pp2-saverow">
        <button type="button" className="ew-btn" onClick={save} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        {saved ? <span className="pp2-saved">Saved</span> : null}
      </div>

      {settings.attend_mode === 'ticketed' ? (
        <div className="pp2-section pp2-tiers">
          <div className="pp2-secttitle">Ticket tiers</div>

          <form className="pp2-tieradd" onSubmit={addTier}>
            <input
              className="pp2-in"
              placeholder="Tier name"
              value={tierForm.name}
              onChange={(e) => setTierForm({ ...tierForm, name: e.target.value })}
            />
            <input
              className="pp2-in pp2-innum"
              type="number"
              min="0"
              step="0.01"
              placeholder="Price ($)"
              value={tierForm.price}
              onChange={(e) => setTierForm({ ...tierForm, price: e.target.value })}
            />
            <input
              className="pp2-in pp2-innum"
              type="number"
              min="0"
              step="1"
              placeholder="Qty (blank = unlimited)"
              value={tierForm.quantity}
              onChange={(e) => setTierForm({ ...tierForm, quantity: e.target.value })}
            />
            <button type="submit" className="ew-btn sm" disabled={tierBusy}>Add tier</button>
          </form>

          {tiers.length === 0 ? (
            <div className="ew-empty"><p>No ticket tiers yet. Add a tier above so attendees can buy tickets.</p></div>
          ) : (
            <table className="ew-table pp2-tiertable">
              <thead>
                <tr>
                  <th>Tier</th>
                  <th>Price</th>
                  <th>Sold / Quantity</th>
                  <th aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}{!t.is_active ? <span className="pp2-inactive">Inactive</span> : null}</td>
                    <td>{money(t.price_cents)}</td>
                    <td>{t.sold} / {t.quantity === null ? 'Unlimited' : t.quantity}</td>
                    <td className="pp2-rowaction">
                      <button type="button" className="pp2-del" onClick={() => removeTier(t.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </div>
  );
}

const PP2_CSS = `
.pp2-linkbar { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; background: rgba(247,244,238,.6); border: 1px solid #e7e1d6; border-radius: 12px; padding: 12px 14px; margin-bottom: 18px; }
.pp2-linklabel { font-size: 10.5px; letter-spacing: .5px; text-transform: uppercase; color: #b3aa99; font-weight: 600; margin-bottom: 3px; }
.pp2-link { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #123c2e; }
.pp2-linkactions { display: flex; align-items: center; gap: 12px; }
.pp2-count { font-size: 11.5px; color: #6b6459; }
.pp2-section { margin-bottom: 20px; }
.pp2-secttitle { font-size: 10.5px; letter-spacing: .5px; text-transform: uppercase; color: #6b6459; font-weight: 600; margin-bottom: 8px; }
.pp2-modes { display: inline-flex; border: 1px solid #e7e1d6; border-radius: 10px; overflow: hidden; background: #fff; }
.pp2-mode { font: inherit; font-size: 12.5px; color: #6b6459; background: transparent; border: 0; padding: 8px 18px; cursor: pointer; border-right: 1px solid #e7e1d6; }
.pp2-mode:last-child { border-right: 0; }
.pp2-mode:hover { background: rgba(18,60,46,.04); color: #123c2e; }
.pp2-mode.is-active { background: #123c2e; color: #fff; font-weight: 600; }
.pp2-hint { margin: 8px 0 0; }
.pp2-check { display: flex; align-items: center; gap: 9px; font-size: 13px; color: #2c2a26; cursor: pointer; }
.pp2-check input { width: 15px; height: 15px; accent-color: #1E5D4A; }
.pp2-field { display: block; margin-bottom: 12px; }
.pp2-fieldlabel { display: block; font-size: 11.5px; color: #6b6459; margin-bottom: 4px; }
.pp2-in { font: inherit; font-size: 13px; padding: 8px 11px; border: 1px solid #e7e1d6; border-radius: 8px; background: #fff; color: #2c2a26; width: 100%; }
.pp2-textarea { min-height: 74px; resize: vertical; }
.pp2-saverow { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.pp2-saved { font-size: 12px; color: #1E5D4A; font-weight: 600; }
.pp2-tiers { margin-top: 24px; border-top: 1px solid #f0ebe0; padding-top: 20px; }
.pp2-tieradd { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 14px; }
.pp2-tieradd .pp2-in { flex: 1 1 160px; width: auto; min-width: 0; }
.pp2-innum { flex: 0 0 150px; }
.pp2-tiertable { margin-top: 4px; }
.pp2-inactive { font-size: 9px; font-weight: 700; letter-spacing: .5px; color: #8a3a3a; background: rgba(138,58,58,.12); border-radius: 4px; padding: 1px 5px; margin-left: 6px; }
.pp2-rowaction { text-align: right; }
.pp2-del { font: inherit; font-size: 11px; color: #8a3a3a; background: transparent; border: 0; cursor: pointer; }
.pp2-del:hover { text-decoration: underline; }
@media (max-width: 720px) { .pp2-innum { flex: 1 1 120px; } }
`;
