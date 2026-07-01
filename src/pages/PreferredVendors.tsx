import React, { useState } from 'react';
import { apiGet, apiSend } from '../lib/api';
import PreferredWhy from './components/PreferredWhy';
import VerifiedBadges, {
  fetchBadgesBatch,
  type VerifiedBadgeData,
} from '../components/VerifiedBadges';

// Phase 4 (Venue Intelligence addendum) - Preferred Vendor System. A venue
// curates the vendors it trusts, assigning each a tier (preferred, approved,
// exclusive, recommended) and optional preloaded pricing. Marketplace ranking
// boosts these vendors via the server's marketplaceRankingScore helper. The page
// is venue-scoped: enter the venue id, then manage that venue's preferred list.
// Reads/writes go through /api/preferred-vendors (org-scoped + IDOR-safe server
// side, so a forged venue id from another tenant is rejected).

type PreferredVendor = {
  id: string;
  venue_id?: string | null;
  vendor_id?: string | null;
  tier?: Tier | null;
  preloaded_pricing?: unknown;
  created_at?: string;
};

type Tier = 'exclusive' | 'preferred' | 'recommended' | 'approved';

const TIERS: { key: Tier; label: string; note: string }[] = [
  { key: 'exclusive', label: 'Exclusive', note: 'Sole vendor for this venue. Ranks highest.' },
  { key: 'preferred', label: 'Preferred', note: 'First-choice vendor the venue actively promotes.' },
  { key: 'recommended', label: 'Recommended', note: 'Vetted vendor the venue is happy to suggest.' },
  { key: 'approved', label: 'Approved', note: 'Cleared to work the venue with no extra vetting.' },
];

const EMPTY: { vendor_id: string; tier: Tier; preloaded_pricing: string } = {
  vendor_id: '',
  tier: 'preferred',
  preloaded_pricing: '',
};

function tierLabel(t?: Tier | null): string {
  return TIERS.find((x) => x.key === t)?.label ?? (t ?? 'Untiered');
}

export default function PreferredVendors() {
  const [venueId, setVenueId] = useState('');
  const [activeVenue, setActiveVenue] = useState('');
  const [rows, setRows] = useState<PreferredVendor[]>([]);
  // Verified badges (U5) for the listed vendors, batch-fetched once per load so
  // each row shows its verified badge without a per-row request (no N+1).
  const [badges, setBadges] = useState<Record<string, VerifiedBadgeData[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<typeof EMPTY | null>(null);
  const [saving, setSaving] = useState(false);

  async function load(id: string) {
    if (!id) return;
    setLoading(true);
    try {
      const res = await apiGet<{ preferred: PreferredVendor[] }>(`/preferred-vendors/${id}`);
      setRows(res.preferred || []);
      setActiveVenue(id);
      // One batch request for all listed vendors' verified badges.
      setBadges(await fetchBadgesBatch('company', (res.preferred || []).map((r) => r.vendor_id)));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!editing || !activeVenue) return;
    setSaving(true);
    try {
      let pricing: unknown = undefined;
      const raw = editing.preloaded_pricing.trim();
      if (raw) {
        try {
          pricing = JSON.parse(raw);
        } catch {
          throw new Error('Preloaded pricing must be valid JSON.');
        }
      }
      await apiSend('POST', `/preferred-vendors/${activeVenue}`, {
        vendor_id: editing.vendor_id.trim(),
        tier: editing.tier,
        ...(pricing !== undefined ? { preloaded_pricing: pricing } : {}),
      });
      setEditing(null);
      await load(activeVenue);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(vendorId?: string | null) {
    if (!activeVenue || !vendorId) return;
    if (!window.confirm('Remove this vendor from the preferred list?')) return;
    try {
      await apiSend('DELETE', `/preferred-vendors/${activeVenue}/${vendorId}`);
      await load(activeVenue);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="pv">
      <style>{CSS}</style>

      <header className="pv-head">
        <div>
          <span className="pv-kicker">Venue Workspace</span>
          <h1 className="pv-title">Preferred Vendors</h1>
          <p className="pv-sub">
            Curate the vendors your venue trusts. Tiered vendors rank higher in the marketplace and
            can carry preloaded pricing for faster quotes.
          </p>
        </div>
      </header>

      <form
        className="pv-venuebar"
        onSubmit={(e) => {
          e.preventDefault();
          load(venueId.trim());
        }}
      >
        <label>
          Venue ID
          <input
            value={venueId}
            placeholder="Paste your venue id"
            onChange={(e) => setVenueId(e.target.value)}
          />
        </label>
        <button type="submit" className="pv-btn">Load preferred vendors</button>
        {activeVenue && (
          <button
            type="button"
            className="pv-btn"
            onClick={() => setEditing({ ...EMPTY })}
          >
            Add vendor
          </button>
        )}
      </form>

      {error && <div className="pv-error">{error}</div>}

      {!activeVenue ? (
        <div className="pv-empty">Enter a venue id above to manage its preferred vendors.</div>
      ) : loading ? (
        <div className="pv-empty">Loading preferred vendors.</div>
      ) : rows.length === 0 ? (
        <div className="pv-empty">No preferred vendors yet. Add your first trusted vendor.</div>
      ) : (
        <div className="pv-list">
          {rows.map((r) => (
            <article key={r.id} className="pv-card">
              <div className="pv-card-main">
                <span className={`pv-badge pv-${r.tier ?? 'untiered'}`}>{tierLabel(r.tier)}</span>
                <div className="pv-vendor">
                  <strong>Vendor</strong>
                  <code>{r.vendor_id || '-'}</code>
                </div>
                {r.preloaded_pricing != null &&
                  (Array.isArray(r.preloaded_pricing)
                    ? r.preloaded_pricing.length > 0
                    : Object.keys(r.preloaded_pricing as Record<string, unknown>).length > 0) && (
                    <span className="pv-pill">Preloaded pricing</span>
                  )}
              </div>
              {r.vendor_id && (
                <div className="pv-why">
                  <VerifiedBadges badges={badges[r.vendor_id]} only={['company']} />
                  <PreferredWhy vendorId={r.vendor_id} compact />
                </div>
              )}
              <div className="pv-actions">
                <button
                  type="button"
                  className="pv-btn ghost"
                  onClick={() =>
                    setEditing({
                      vendor_id: r.vendor_id || '',
                      tier: (r.tier as Tier) || 'preferred',
                      preloaded_pricing: r.preloaded_pricing
                        ? JSON.stringify(r.preloaded_pricing, null, 2)
                        : '',
                    })
                  }
                >
                  Edit
                </button>
                <button type="button" className="pv-btn danger" onClick={() => remove(r.vendor_id)}>
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <div className="pv-modal" role="dialog" aria-modal="true">
          <div className="pv-modal-card">
            <h2>{rows.some((r) => r.vendor_id === editing.vendor_id) ? 'Update vendor' : 'Add vendor'}</h2>
            <div className="pv-form">
              <label className="pv-full">
                Vendor ID
                <input
                  value={editing.vendor_id}
                  placeholder="Vendor id to prefer"
                  onChange={(e) => setEditing({ ...editing, vendor_id: e.target.value })}
                />
              </label>
              <label className="pv-full">
                Tier
                <select
                  value={editing.tier}
                  onChange={(e) => setEditing({ ...editing, tier: e.target.value as Tier })}
                >
                  {TIERS.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="pv-tiernote">{TIERS.find((t) => t.key === editing.tier)?.note}</p>
              <label className="pv-full">
                Preloaded pricing (JSON, optional)
                <textarea
                  value={editing.preloaded_pricing}
                  placeholder='{ "setup_fee": 500, "per_hour": 120 }'
                  onChange={(e) => setEditing({ ...editing, preloaded_pricing: e.target.value })}
                />
              </label>
            </div>
            <div className="pv-modal-actions">
              <button type="button" className="pv-btn ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="pv-btn"
                disabled={saving || !editing.vendor_id.trim()}
                onClick={save}
              >
                {saving ? 'Saving.' : 'Save vendor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
.pv { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --iv:#F7F4EE; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:1180px; }
.pv *,.pv *::before,.pv *::after { box-sizing:border-box; }
.pv h1,.pv h2,.pv h3 { font-family:'Cormorant Garamond',Georgia,serif; margin:0; }
.pv-head { margin-bottom:18px; }
.pv-kicker { font-size:10.5px; letter-spacing:1.4px; text-transform:uppercase; color:var(--g); font-weight:600; }
.pv-title { font-size:28px; color:var(--e); line-height:1.1; }
.pv-sub { font-size:13px; color:var(--mut); margin:4px 0 0; max-width:680px; line-height:1.5; }
.pv-venuebar { display:flex; align-items:flex-end; gap:12px; flex-wrap:wrap; margin-bottom:18px; }
.pv-venuebar label { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--mut); font-weight:600; flex:1 1 280px; }
.pv-venuebar input { font:inherit; font-size:13px; color:var(--ink); padding:8px 10px; border:1px solid var(--ln); border-radius:9px; background:#fff; }
.pv-error { background:#fff3f1; border:1px solid #e7b7ab; color:#9a3a28; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.pv-empty { padding:40px; text-align:center; color:var(--mut); border:1px dashed var(--ln); border-radius:14px; background:rgba(247,244,238,.55); }
.pv-list { display:flex; flex-direction:column; gap:12px; }
.pv-card { display:flex; justify-content:space-between; align-items:center; gap:16px; background:#fff; border:1px solid var(--ln); border-radius:14px; padding:14px 18px; flex-wrap:wrap; }
.pv-card-main { display:flex; align-items:center; gap:14px; flex-wrap:wrap; min-width:0; }
.pv-vendor { display:flex; flex-direction:column; gap:2px; }
.pv-vendor strong { font-size:11px; letter-spacing:.5px; text-transform:uppercase; color:var(--mut); }
.pv-vendor code { font-size:12.5px; color:var(--ink); word-break:break-all; }
.pv-badge { font-size:11px; letter-spacing:.5px; text-transform:uppercase; padding:3px 12px; border-radius:999px; font-weight:700; white-space:nowrap; }
.pv-exclusive { background:var(--e); color:#fff; }
.pv-preferred { background:rgba(201,163,91,.22); color:#7a5a17; }
.pv-recommended { background:rgba(30,93,74,.14); color:var(--e2); }
.pv-approved { background:rgba(125,119,108,.16); color:var(--mut); }
.pv-untiered { background:rgba(125,119,108,.12); color:var(--mut); }
.pv-pill { background:rgba(201,163,91,.18); color:var(--e); padding:2px 10px; border-radius:999px; font-weight:600; font-size:11.5px; }
.pv-why { flex:1 1 100%; order:3; }
.pv-actions { display:flex; gap:8px; }
.pv-btn { background:var(--e); color:#fff; border:0; border-radius:9px; font:inherit; font-size:12.5px; font-weight:600; padding:9px 16px; cursor:pointer; }
.pv-btn:hover { background:var(--e2); }
.pv-btn.ghost { background:transparent; color:var(--e); border:1px solid var(--ln); }
.pv-btn.ghost:hover { border-color:var(--e); }
.pv-btn.danger { background:transparent; color:#9a3a28; border:1px solid #e7b7ab; }
.pv-btn:disabled { opacity:.6; cursor:default; }
.pv-modal { position:fixed; inset:0; background:rgba(18,60,46,.4); display:grid; place-items:center; padding:20px; z-index:50; }
.pv-modal-card { background:#fff; border-radius:16px; padding:24px; width:100%; max-width:520px; max-height:90vh; overflow:auto; }
.pv-modal-card h2 { font-size:24px; color:var(--e); margin-bottom:16px; }
.pv-form { display:flex; flex-direction:column; gap:12px; }
.pv-form label { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--mut); font-weight:600; }
.pv-form input,.pv-form select,.pv-form textarea { font:inherit; font-size:13px; color:var(--ink); padding:8px 10px; border:1px solid var(--ln); border-radius:9px; background:#fff; }
.pv-form textarea { min-height:96px; resize:vertical; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; }
.pv-tiernote { font-size:12px; color:var(--mut); margin:-4px 0 0; line-height:1.4; }
.pv-modal-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:18px; }
@media (max-width:680px){ .pv-card { flex-direction:column; align-items:flex-start; } }
`;
