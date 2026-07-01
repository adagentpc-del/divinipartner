import React, { useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

/**
 * Venue Intelligence (Phase 1 foundation) - Venue Twin editor.
 *
 * A venue stores its intelligence once and reuses it on every future quote. This
 * page is venue-scoped: enter the venue id, then load and edit the venue twin
 * (capacity, access, power/internet, security/insurance/union requirements,
 * install/removal windows, contacts), manage its uploaded assets, run full CRUD
 * over its branding opportunities, and add/delete structured restrictions. The
 * Quote Readiness Score (0-100) is shown live with "missing info" nudges.
 *
 * Every read/write goes through the org-scoped, IDOR-safe Phase 1 routes:
 *   /api/venue-twin/:venueId                (get / put twin)
 *   /api/venue-twin/:venueId/readiness      (score + breakdown)
 *   /api/venue-twin/:venueId/assets         (list / add / delete)
 *   /api/branding-opportunities             (list / create / patch / delete)
 *   /api/venue-restrictions                 (list / add / delete)
 * A forged venue id from another tenant is rejected server-side.
 */

// ---- Types (mirror server row shapes) --------------------------------------

type Twin = {
  id?: string;
  venue_id?: string | null;
  name?: string | null;
  type?: string | null;
  address?: string | null;
  website?: string | null;
  capacity?: number | null;
  indoor_capacity?: number | null;
  outdoor_capacity?: number | null;
  parking_capacity?: number | null;
  loading_dock?: unknown;
  freight_elevator?: unknown;
  power?: unknown;
  internet?: unknown;
  security_requirements?: unknown;
  insurance_requirements?: unknown;
  union_requirements?: unknown;
  install_windows?: unknown;
  removal_windows?: unknown;
  contacts?: unknown;
  emergency_contacts?: unknown;
  readiness_score?: number | null;
};

type ReadinessDimension = {
  key: string;
  label: string;
  weight: number;
  present: boolean;
  earned: number;
};

type Readiness = { score: number; breakdown: ReadinessDimension[] };

const ASSET_KINDS = [
  'photo',
  'video',
  'pdf',
  'floorplan',
  'cad',
  'sitemap',
  'install_guide',
  'rulebook',
  'insurance',
  'branding_guideline',
] as const;
type AssetKind = (typeof ASSET_KINDS)[number];

type Asset = {
  id: string;
  kind: AssetKind | null;
  url: string | null;
  label: string | null;
};

const APPROVAL_MODES = ['auto', 'venue_approval', 'manual_review'] as const;
type ApprovalMode = (typeof APPROVAL_MODES)[number];

type Opportunity = {
  id: string;
  venue_id?: string | null;
  name: string;
  category?: string | null;
  description?: string | null;
  width?: number | string | null;
  height?: number | string | null;
  depth?: number | string | null;
  sqft?: number | string | null;
  weight_limit?: number | string | null;
  material_type?: string | null;
  surface_type?: string | null;
  power_available?: boolean | null;
  internet_available?: boolean | null;
  rigging_available?: boolean | null;
  permit_required?: boolean | null;
  engineering_required?: boolean | null;
  fire_marshal_required?: boolean | null;
  insurance_required?: boolean | null;
  approval_mode?: string | null;
  audience_size?: number | null;
  impression_estimate?: number | null;
};

type Restriction = {
  id: string;
  rule_type: 'allowed' | 'prohibited' | null;
  category: string | null;
  value: string | null;
  notes: string | null;
  branding_opportunity_id?: string | null;
};

// ---- Helpers ---------------------------------------------------------------

/** Parse a free-text JSON field; empty -> null; invalid -> throw. */
function parseJson(raw: string): unknown {
  const t = raw.trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    throw new Error('Must be valid JSON, or leave blank.');
  }
}

function jsonText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return JSON.stringify(v, null, 2);
}

/** Coerce a text input to a number or null (blank -> null). */
function numOrNull(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const EMPTY_OPP = {
  name: '',
  category: '',
  description: '',
  width: '',
  height: '',
  depth: '',
  sqft: '',
  weight_limit: '',
  material_type: '',
  surface_type: '',
  power_available: false,
  internet_available: false,
  rigging_available: false,
  permit_required: false,
  engineering_required: false,
  fire_marshal_required: false,
  insurance_required: false,
  approval_mode: 'venue_approval' as ApprovalMode,
  audience_size: '',
  impression_estimate: '',
};

const EMPTY_RESTRICTION = {
  rule_type: 'prohibited' as 'allowed' | 'prohibited',
  category: '',
  value: '',
  notes: '',
};

const EMPTY_ASSET = { kind: 'photo' as AssetKind, url: '', label: '' };

export default function VenueTwinEditor() {
  const [venueIdInput, setVenueIdInput] = useState('');
  const [venueId, setVenueId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Twin form state (strings for inputs; jsonb fields as JSON text).
  const [twin, setTwin] = useState<Twin | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [savingTwin, setSavingTwin] = useState(false);

  const [readiness, setReadiness] = useState<Readiness | null>(null);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [newAsset, setNewAsset] = useState({ ...EMPTY_ASSET });

  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [oppEditing, setOppEditing] = useState<(typeof EMPTY_OPP & { id?: string }) | null>(null);
  const [savingOpp, setSavingOpp] = useState(false);

  const [restrictions, setRestrictions] = useState<Restriction[]>([]);
  const [newRestriction, setNewRestriction] = useState({ ...EMPTY_RESTRICTION });

  function twinToForm(t: Twin | null): Record<string, string> {
    return {
      name: t?.name ?? '',
      type: t?.type ?? '',
      address: t?.address ?? '',
      website: t?.website ?? '',
      capacity: t?.capacity != null ? String(t.capacity) : '',
      indoor_capacity: t?.indoor_capacity != null ? String(t.indoor_capacity) : '',
      outdoor_capacity: t?.outdoor_capacity != null ? String(t.outdoor_capacity) : '',
      parking_capacity: t?.parking_capacity != null ? String(t.parking_capacity) : '',
      loading_dock: jsonText(t?.loading_dock),
      freight_elevator: jsonText(t?.freight_elevator),
      power: jsonText(t?.power),
      internet: jsonText(t?.internet),
      security_requirements: jsonText(t?.security_requirements),
      insurance_requirements: jsonText(t?.insurance_requirements),
      union_requirements: jsonText(t?.union_requirements),
      install_windows: jsonText(t?.install_windows),
      removal_windows: jsonText(t?.removal_windows),
      contacts: jsonText(t?.contacts),
      emergency_contacts: jsonText(t?.emergency_contacts),
    };
  }

  async function loadAll(id: string) {
    if (!id) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const [twinRes, readyRes, assetRes, oppRes, resRes] = await Promise.all([
        apiGet<{ twin: Twin | null }>(`/venue-twin/${id}`),
        apiGet<Readiness>(`/venue-twin/${id}/readiness`),
        apiGet<{ assets: Asset[] }>(`/venue-twin/${id}/assets`),
        apiGet<{ opportunities: Opportunity[] }>(`/branding-opportunities?venue=${encodeURIComponent(id)}`),
        apiGet<{ restrictions: Restriction[] }>(`/venue-restrictions?venue=${encodeURIComponent(id)}`),
      ]);
      setTwin(twinRes.twin);
      setForm(twinToForm(twinRes.twin));
      setReadiness(readyRes);
      setAssets(assetRes.assets || []);
      setOpps(oppRes.opportunities || []);
      setRestrictions(resRes.restrictions || []);
      setVenueId(id);
    } catch (e) {
      setError((e as Error).message);
      setTwin(null);
      setVenueId('');
    } finally {
      setLoading(false);
    }
  }

  async function refreshReadiness(id: string) {
    try {
      setReadiness(await apiGet<Readiness>(`/venue-twin/${id}/readiness`));
    } catch {
      /* non-fatal */
    }
  }

  async function saveTwin() {
    if (!venueId) return;
    setSavingTwin(true);
    setError(null);
    setNotice(null);
    try {
      const body: Twin = {
        name: form.name.trim() || null,
        type: form.type.trim() || null,
        address: form.address.trim() || null,
        website: form.website.trim() || null,
        capacity: numOrNull(form.capacity),
        indoor_capacity: numOrNull(form.indoor_capacity),
        outdoor_capacity: numOrNull(form.outdoor_capacity),
        parking_capacity: numOrNull(form.parking_capacity),
        loading_dock: parseJson(form.loading_dock),
        freight_elevator: parseJson(form.freight_elevator),
        power: parseJson(form.power),
        internet: parseJson(form.internet),
        security_requirements: parseJson(form.security_requirements),
        insurance_requirements: parseJson(form.insurance_requirements),
        union_requirements: parseJson(form.union_requirements),
        install_windows: parseJson(form.install_windows),
        removal_windows: parseJson(form.removal_windows),
        contacts: parseJson(form.contacts),
        emergency_contacts: parseJson(form.emergency_contacts),
      };
      const res = await apiSend<{ twin: Twin }>('PUT', `/venue-twin/${venueId}`, body);
      setTwin(res.twin);
      setForm(twinToForm(res.twin));
      setNotice('Venue twin saved.');
      await refreshReadiness(venueId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingTwin(false);
    }
  }

  async function addAsset() {
    if (!venueId || !newAsset.url.trim()) return;
    try {
      await apiSend('POST', `/venue-twin/${venueId}/assets`, {
        kind: newAsset.kind,
        url: newAsset.url.trim(),
        label: newAsset.label.trim() || null,
      });
      setNewAsset({ ...EMPTY_ASSET });
      const r = await apiGet<{ assets: Asset[] }>(`/venue-twin/${venueId}/assets`);
      setAssets(r.assets || []);
      await refreshReadiness(venueId);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deleteAsset(id: string) {
    if (!venueId) return;
    try {
      await apiSend('DELETE', `/venue-twin/${venueId}/assets/${id}`);
      setAssets((a) => a.filter((x) => x.id !== id));
      await refreshReadiness(venueId);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveOpp() {
    if (!oppEditing || !venueId || !oppEditing.name.trim()) return;
    setSavingOpp(true);
    setError(null);
    try {
      const payload = {
        name: oppEditing.name.trim(),
        category: oppEditing.category.trim() || null,
        description: oppEditing.description.trim() || null,
        width: numOrNull(oppEditing.width),
        height: numOrNull(oppEditing.height),
        depth: numOrNull(oppEditing.depth),
        sqft: numOrNull(oppEditing.sqft),
        weight_limit: numOrNull(oppEditing.weight_limit),
        material_type: oppEditing.material_type.trim() || null,
        surface_type: oppEditing.surface_type.trim() || null,
        power_available: oppEditing.power_available,
        internet_available: oppEditing.internet_available,
        rigging_available: oppEditing.rigging_available,
        permit_required: oppEditing.permit_required,
        engineering_required: oppEditing.engineering_required,
        fire_marshal_required: oppEditing.fire_marshal_required,
        insurance_required: oppEditing.insurance_required,
        approval_mode: oppEditing.approval_mode,
        audience_size: numOrNull(oppEditing.audience_size),
        impression_estimate: numOrNull(oppEditing.impression_estimate),
      };
      if (oppEditing.id) {
        await apiSend('PATCH', `/branding-opportunities/${oppEditing.id}`, payload);
      } else {
        await apiSend('POST', '/branding-opportunities', { venue_id: venueId, ...payload });
      }
      setOppEditing(null);
      const r = await apiGet<{ opportunities: Opportunity[] }>(
        `/branding-opportunities?venue=${encodeURIComponent(venueId)}`,
      );
      setOpps(r.opportunities || []);
      await refreshReadiness(venueId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingOpp(false);
    }
  }

  async function deleteOpp(id: string) {
    if (!window.confirm('Delete this branding opportunity?')) return;
    try {
      await apiSend('DELETE', `/branding-opportunities/${id}`);
      setOpps((o) => o.filter((x) => x.id !== id));
      await refreshReadiness(venueId);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addRestriction() {
    if (!venueId || !newRestriction.value.trim()) return;
    try {
      await apiSend('POST', '/venue-restrictions', {
        venue_id: venueId,
        rule_type: newRestriction.rule_type,
        category: newRestriction.category.trim() || null,
        value: newRestriction.value.trim(),
        notes: newRestriction.notes.trim() || null,
      });
      setNewRestriction({ ...EMPTY_RESTRICTION });
      const r = await apiGet<{ restrictions: Restriction[] }>(
        `/venue-restrictions?venue=${encodeURIComponent(venueId)}`,
      );
      setRestrictions(r.restrictions || []);
      await refreshReadiness(venueId);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deleteRestriction(id: string) {
    if (!venueId) return;
    try {
      await apiSend('DELETE', `/venue-restrictions/${id}?venue=${encodeURIComponent(venueId)}`);
      setRestrictions((r) => r.filter((x) => x.id !== id));
      await refreshReadiness(venueId);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const score = readiness?.score ?? twin?.readiness_score ?? 0;
  const missing = (readiness?.breakdown ?? []).filter((d) => !d.present);

  function setF(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <div className="vt">
      <style>{CSS}</style>

      <header className="vt-head">
        <div>
          <span className="vt-kicker">Venue Workspace</span>
          <h1 className="vt-title">Venue Digital Twin</h1>
          <p className="vt-sub">
            Store your venue intelligence once and reuse it on every quote. The more complete your
            twin, the faster vendors can quote your spaces.
          </p>
        </div>
      </header>

      <form
        className="vt-venuebar"
        onSubmit={(e) => {
          e.preventDefault();
          loadAll(venueIdInput.trim());
        }}
      >
        <label>
          Venue ID
          <input
            value={venueIdInput}
            placeholder="Paste your venue id"
            onChange={(e) => setVenueIdInput(e.target.value)}
          />
        </label>
        <button type="submit" className="vt-btn">Load venue twin</button>
      </form>

      {error && <div className="vt-error">{error}</div>}
      {notice && <div className="vt-notice">{notice}</div>}

      {!venueId ? (
        <div className="vt-empty">Enter a venue id above to load and edit its digital twin.</div>
      ) : loading ? (
        <div className="vt-empty">Loading venue twin.</div>
      ) : (
        <>
          {/* Readiness score */}
          <section className="vt-card vt-readiness">
            <div className="vt-score-ring" style={{ ['--pct' as any]: `${score}` }}>
              <span>{score}</span>
              <small>/ 100</small>
            </div>
            <div className="vt-score-body">
              <h2>Quote Readiness Score</h2>
              {missing.length === 0 ? (
                <p className="vt-score-done">Your venue twin is complete. Quotes can move fast.</p>
              ) : (
                <>
                  <p className="vt-score-note">Add the missing info below to raise your score:</p>
                  <ul className="vt-missing">
                    {missing.map((m) => (
                      <li key={m.key}>
                        <strong>{m.label}</strong> <span>+{m.weight}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </section>

          {/* Twin fields */}
          <section className="vt-card">
            <h2>Venue details</h2>
            <div className="vt-grid">
              <Field label="Name"><input value={form.name} onChange={(e) => setF('name', e.target.value)} /></Field>
              <Field label="Type"><input value={form.type} onChange={(e) => setF('type', e.target.value)} placeholder="ballroom, rooftop, ..." /></Field>
              <Field label="Address"><input value={form.address} onChange={(e) => setF('address', e.target.value)} /></Field>
              <Field label="Website"><input value={form.website} onChange={(e) => setF('website', e.target.value)} /></Field>
              <Field label="Total capacity"><input value={form.capacity} onChange={(e) => setF('capacity', e.target.value)} inputMode="numeric" /></Field>
              <Field label="Indoor capacity"><input value={form.indoor_capacity} onChange={(e) => setF('indoor_capacity', e.target.value)} inputMode="numeric" /></Field>
              <Field label="Outdoor capacity"><input value={form.outdoor_capacity} onChange={(e) => setF('outdoor_capacity', e.target.value)} inputMode="numeric" /></Field>
              <Field label="Parking capacity"><input value={form.parking_capacity} onChange={(e) => setF('parking_capacity', e.target.value)} inputMode="numeric" /></Field>
            </div>

            <h3 className="vt-h3">Access and infrastructure (JSON)</h3>
            <div className="vt-grid">
              <JsonField label="Loading dock" value={form.loading_dock} onChange={(v) => setF('loading_dock', v)} hint='{ "count": 2, "height_in": 48 }' />
              <JsonField label="Freight elevator" value={form.freight_elevator} onChange={(v) => setF('freight_elevator', v)} hint='{ "capacity_lb": 5000 }' />
              <JsonField label="Power" value={form.power} onChange={(v) => setF('power', v)} hint='{ "amps": 200, "phases": 3 }' />
              <JsonField label="Internet" value={form.internet} onChange={(v) => setF('internet', v)} hint='{ "wifi": true, "hardline": true }' />
            </div>

            <h3 className="vt-h3">Requirements and windows (JSON)</h3>
            <div className="vt-grid">
              <JsonField label="Security requirements" value={form.security_requirements} onChange={(v) => setF('security_requirements', v)} />
              <JsonField label="Insurance requirements" value={form.insurance_requirements} onChange={(v) => setF('insurance_requirements', v)} />
              <JsonField label="Union requirements" value={form.union_requirements} onChange={(v) => setF('union_requirements', v)} />
              <JsonField label="Install windows" value={form.install_windows} onChange={(v) => setF('install_windows', v)} />
              <JsonField label="Removal windows" value={form.removal_windows} onChange={(v) => setF('removal_windows', v)} />
            </div>

            <h3 className="vt-h3">Contacts (JSON)</h3>
            <div className="vt-grid">
              <JsonField label="Contacts" value={form.contacts} onChange={(v) => setF('contacts', v)} hint='[{ "name": "...", "role": "...", "email": "..." }]' />
              <JsonField label="Emergency contacts" value={form.emergency_contacts} onChange={(v) => setF('emergency_contacts', v)} />
            </div>

            <div className="vt-row-actions">
              <button type="button" className="vt-btn" disabled={savingTwin} onClick={saveTwin}>
                {savingTwin ? 'Saving.' : 'Save venue twin'}
              </button>
            </div>
          </section>

          {/* Assets */}
          <section className="vt-card">
            <h2>Venue assets</h2>
            <p className="vt-cardsub">Photos, floorplans, rulebooks, insurance, and other documents. Host the file somewhere accessible, then paste its link below.</p>
            <div className="vt-assetbar">
              <select value={newAsset.kind} onChange={(e) => setNewAsset({ ...newAsset, kind: e.target.value as AssetKind })}>
                {ASSET_KINDS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
              <input
                placeholder="Paste a hosted file URL"
                value={newAsset.url}
                onChange={(e) => setNewAsset({ ...newAsset, url: e.target.value })}
              />
              <input
                placeholder="Label (optional)"
                value={newAsset.label}
                onChange={(e) => setNewAsset({ ...newAsset, label: e.target.value })}
              />
              <button type="button" className="vt-btn" disabled={!newAsset.url.trim()} onClick={addAsset}>
                Add asset
              </button>
            </div>
            {assets.length === 0 ? (
              <div className="vt-empty sm">No assets yet.</div>
            ) : (
              <ul className="vt-assets">
                {assets.map((a) => (
                  <li key={a.id}>
                    <span className="vt-tag">{a.kind}</span>
                    <a href={a.url || '#'} target="_blank" rel="noreferrer">{a.label || a.url}</a>
                    <button type="button" className="vt-btn danger sm" onClick={() => deleteAsset(a.id)}>Delete</button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Branding opportunities */}
          <section className="vt-card">
            <div className="vt-card-head">
              <h2>Branding opportunities</h2>
              <button type="button" className="vt-btn" onClick={() => setOppEditing({ ...EMPTY_OPP })}>
                Add opportunity
              </button>
            </div>
            <p className="vt-cardsub">Brandable surfaces sponsors and brands can take over at your venue.</p>
            {opps.length === 0 ? (
              <div className="vt-empty sm">No branding opportunities yet.</div>
            ) : (
              <div className="vt-opps">
                {opps.map((o) => (
                  <article key={o.id} className="vt-opp">
                    <div className="vt-opp-main">
                      <h3>{o.name}</h3>
                      {o.category && <span className="vt-tag">{o.category}</span>}
                      {o.approval_mode && <span className="vt-pill">{o.approval_mode}</span>}
                      {o.description && <p>{o.description}</p>}
                    </div>
                    <div className="vt-actions">
                      <button
                        type="button"
                        className="vt-btn ghost sm"
                        onClick={() =>
                          setOppEditing({
                            id: o.id,
                            name: o.name || '',
                            category: o.category || '',
                            description: o.description || '',
                            width: o.width != null ? String(o.width) : '',
                            height: o.height != null ? String(o.height) : '',
                            depth: o.depth != null ? String(o.depth) : '',
                            sqft: o.sqft != null ? String(o.sqft) : '',
                            weight_limit: o.weight_limit != null ? String(o.weight_limit) : '',
                            material_type: o.material_type || '',
                            surface_type: o.surface_type || '',
                            power_available: !!o.power_available,
                            internet_available: !!o.internet_available,
                            rigging_available: !!o.rigging_available,
                            permit_required: !!o.permit_required,
                            engineering_required: !!o.engineering_required,
                            fire_marshal_required: !!o.fire_marshal_required,
                            insurance_required: !!o.insurance_required,
                            approval_mode: (APPROVAL_MODES.includes(o.approval_mode as ApprovalMode)
                              ? (o.approval_mode as ApprovalMode)
                              : 'venue_approval'),
                            audience_size: o.audience_size != null ? String(o.audience_size) : '',
                            impression_estimate: o.impression_estimate != null ? String(o.impression_estimate) : '',
                          })
                        }
                      >
                        Edit
                      </button>
                      <button type="button" className="vt-btn danger sm" onClick={() => deleteOpp(o.id)}>Delete</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Restrictions */}
          <section className="vt-card">
            <h2>Venue restrictions</h2>
            <p className="vt-cardsub">Structured allowed / prohibited rules used by quote automation.</p>
            <div className="vt-resbar">
              <select
                value={newRestriction.rule_type}
                onChange={(e) => setNewRestriction({ ...newRestriction, rule_type: e.target.value as 'allowed' | 'prohibited' })}
              >
                <option value="prohibited">Prohibited</option>
                <option value="allowed">Allowed</option>
              </select>
              <input
                placeholder="Category (material, method, anchor, ...)"
                value={newRestriction.category}
                onChange={(e) => setNewRestriction({ ...newRestriction, category: e.target.value })}
              />
              <input
                placeholder="Value"
                value={newRestriction.value}
                onChange={(e) => setNewRestriction({ ...newRestriction, value: e.target.value })}
              />
              <input
                placeholder="Notes (optional)"
                value={newRestriction.notes}
                onChange={(e) => setNewRestriction({ ...newRestriction, notes: e.target.value })}
              />
              <button type="button" className="vt-btn" disabled={!newRestriction.value.trim()} onClick={addRestriction}>
                Add rule
              </button>
            </div>
            {restrictions.length === 0 ? (
              <div className="vt-empty sm">No restrictions yet.</div>
            ) : (
              <ul className="vt-res">
                {restrictions.map((r) => (
                  <li key={r.id}>
                    <span className={`vt-rule vt-${r.rule_type ?? 'allowed'}`}>{r.rule_type}</span>
                    {r.category && <span className="vt-tag">{r.category}</span>}
                    <strong>{r.value}</strong>
                    {r.notes && <span className="vt-resnote">{r.notes}</span>}
                    <button type="button" className="vt-btn danger sm" onClick={() => deleteRestriction(r.id)}>Delete</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {/* Opportunity editor modal */}
      {oppEditing && (
        <div className="vt-modal" role="dialog" aria-modal="true">
          <div className="vt-modal-card">
            <h2>{oppEditing.id ? 'Edit opportunity' : 'Add opportunity'}</h2>
            <div className="vt-modal-form">
              <Field label="Name" full><input value={oppEditing.name} onChange={(e) => setOppEditing({ ...oppEditing, name: e.target.value })} /></Field>
              <Field label="Category"><input value={oppEditing.category} onChange={(e) => setOppEditing({ ...oppEditing, category: e.target.value })} placeholder="signage, screen, wall, ..." /></Field>
              <Field label="Surface type"><input value={oppEditing.surface_type} onChange={(e) => setOppEditing({ ...oppEditing, surface_type: e.target.value })} /></Field>
              <Field label="Description" full><textarea value={oppEditing.description} onChange={(e) => setOppEditing({ ...oppEditing, description: e.target.value })} /></Field>
              <Field label="Width"><input value={oppEditing.width} onChange={(e) => setOppEditing({ ...oppEditing, width: e.target.value })} inputMode="numeric" /></Field>
              <Field label="Height"><input value={oppEditing.height} onChange={(e) => setOppEditing({ ...oppEditing, height: e.target.value })} inputMode="numeric" /></Field>
              <Field label="Depth"><input value={oppEditing.depth} onChange={(e) => setOppEditing({ ...oppEditing, depth: e.target.value })} inputMode="numeric" /></Field>
              <Field label="Sq ft"><input value={oppEditing.sqft} onChange={(e) => setOppEditing({ ...oppEditing, sqft: e.target.value })} inputMode="numeric" /></Field>
              <Field label="Weight limit"><input value={oppEditing.weight_limit} onChange={(e) => setOppEditing({ ...oppEditing, weight_limit: e.target.value })} inputMode="numeric" /></Field>
              <Field label="Material type"><input value={oppEditing.material_type} onChange={(e) => setOppEditing({ ...oppEditing, material_type: e.target.value })} /></Field>
              <Field label="Audience size"><input value={oppEditing.audience_size} onChange={(e) => setOppEditing({ ...oppEditing, audience_size: e.target.value })} inputMode="numeric" /></Field>
              <Field label="Impression estimate"><input value={oppEditing.impression_estimate} onChange={(e) => setOppEditing({ ...oppEditing, impression_estimate: e.target.value })} inputMode="numeric" /></Field>
              <Field label="Approval mode" full>
                <select value={oppEditing.approval_mode} onChange={(e) => setOppEditing({ ...oppEditing, approval_mode: e.target.value as ApprovalMode })}>
                  {APPROVAL_MODES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="vt-checks">
              {([
                ['power_available', 'Power'],
                ['internet_available', 'Internet'],
                ['rigging_available', 'Rigging'],
                ['permit_required', 'Permit required'],
                ['engineering_required', 'Engineering required'],
                ['fire_marshal_required', 'Fire marshal required'],
                ['insurance_required', 'Insurance required'],
              ] as [keyof typeof EMPTY_OPP, string][]).map(([key, label]) => (
                <label key={key} className="vt-check">
                  <input
                    type="checkbox"
                    checked={!!oppEditing[key]}
                    onChange={(e) => setOppEditing({ ...oppEditing, [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="vt-modal-actions">
              <button type="button" className="vt-btn ghost" onClick={() => setOppEditing(null)}>Cancel</button>
              <button type="button" className="vt-btn" disabled={savingOpp || !oppEditing.name.trim()} onClick={saveOpp}>
                {savingOpp ? 'Saving.' : 'Save opportunity'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={'vt-field' + (full ? ' vt-full' : '')}>
      {label}
      {children}
    </label>
  );
}

function JsonField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="vt-field vt-json">
      {label}
      <textarea value={value} placeholder={hint || '{ }'} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

const CSS = `
.vt { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --iv:#F7F4EE; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:1180px; }
.vt *,.vt *::before,.vt *::after { box-sizing:border-box; }
.vt h1,.vt h2,.vt h3 { font-family:'Cormorant Garamond',Georgia,serif; margin:0; }
.vt-head { margin-bottom:18px; }
.vt-kicker { font-size:10.5px; letter-spacing:1.4px; text-transform:uppercase; color:var(--g); font-weight:600; }
.vt-title { font-size:28px; color:var(--e); line-height:1.1; }
.vt-sub { font-size:13px; color:var(--mut); margin:4px 0 0; max-width:680px; line-height:1.5; }
.vt-venuebar { display:flex; align-items:flex-end; gap:12px; flex-wrap:wrap; margin-bottom:18px; }
.vt-venuebar label { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--mut); font-weight:600; flex:1 1 280px; }
.vt-venuebar input { font:inherit; font-size:13px; color:var(--ink); padding:8px 10px; border:1px solid var(--ln); border-radius:9px; background:#fff; }
.vt-error { background:#fff3f1; border:1px solid #e7b7ab; color:#9a3a28; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.vt-notice { background:rgba(30,93,74,.1); border:1px solid rgba(30,93,74,.3); color:var(--e2); padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.vt-empty { padding:40px; text-align:center; color:var(--mut); border:1px dashed var(--ln); border-radius:14px; background:rgba(247,244,238,.55); }
.vt-empty.sm { padding:20px; }
.vt-card { background:#fff; border:1px solid var(--ln); border-radius:16px; padding:20px 22px; margin-bottom:16px; }
.vt-card h2 { font-size:22px; color:var(--e); margin-bottom:6px; }
.vt-card-head { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; }
.vt-cardsub { font-size:12.5px; color:var(--mut); margin:0 0 14px; }
.vt-h3 { font-size:16px; color:var(--e2); margin:18px 0 10px; }
.vt-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:12px; }
.vt-field { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--mut); font-weight:600; }
.vt-field.vt-full { grid-column:1 / -1; }
.vt-field input,.vt-field select,.vt-field textarea { font:inherit; font-size:13px; color:var(--ink); padding:8px 10px; border:1px solid var(--ln); border-radius:9px; background:#fff; }
.vt-field.vt-json textarea,.vt-modal-form textarea { min-height:74px; resize:vertical; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; }
.vt-row-actions { display:flex; justify-content:flex-end; margin-top:16px; }
.vt-readiness { display:flex; gap:22px; align-items:center; flex-wrap:wrap; }
.vt-score-ring { width:108px; height:108px; border-radius:50%; display:grid; place-items:center; flex-direction:column; flex:0 0 auto;
  background:conic-gradient(var(--g) calc(var(--pct) * 1%), var(--ln) 0); position:relative; }
.vt-score-ring::after { content:''; position:absolute; inset:10px; border-radius:50%; background:#fff; }
.vt-score-ring span { position:relative; z-index:1; font-family:'Cormorant Garamond',serif; font-size:34px; font-weight:700; color:var(--e); line-height:1; }
.vt-score-ring small { position:relative; z-index:1; font-size:11px; color:var(--mut); }
.vt-score-body { flex:1 1 280px; }
.vt-score-body h2 { font-size:22px; color:var(--e); }
.vt-score-note,.vt-score-done { font-size:13px; color:var(--mut); margin:4px 0 8px; }
.vt-score-done { color:var(--e2); font-weight:600; }
.vt-missing { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:6px; }
.vt-missing li { display:flex; justify-content:space-between; font-size:13px; background:var(--iv); border:1px solid var(--ln); border-radius:8px; padding:7px 12px; }
.vt-missing li span { color:var(--g); font-weight:700; }
.vt-assetbar,.vt-resbar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; }
.vt-assetbar input,.vt-resbar input { flex:1 1 160px; font:inherit; font-size:13px; padding:8px 10px; border:1px solid var(--ln); border-radius:9px; }
.vt-assetbar select,.vt-resbar select { font:inherit; font-size:13px; padding:8px 10px; border:1px solid var(--ln); border-radius:9px; background:#fff; }
.vt-assets,.vt-res { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:8px; }
.vt-assets li,.vt-res li { display:flex; align-items:center; gap:10px; flex-wrap:wrap; background:var(--iv); border:1px solid var(--ln); border-radius:10px; padding:8px 12px; font-size:13px; }
.vt-assets a { color:var(--e2); word-break:break-all; }
.vt-tag { font-size:11px; letter-spacing:.4px; text-transform:uppercase; background:rgba(30,93,74,.12); color:var(--e2); padding:2px 9px; border-radius:999px; font-weight:700; }
.vt-pill { font-size:11px; background:rgba(201,163,91,.2); color:#7a5a17; padding:2px 9px; border-radius:999px; font-weight:600; }
.vt-rule { font-size:11px; text-transform:uppercase; font-weight:700; padding:2px 9px; border-radius:999px; }
.vt-prohibited { background:#fff0ec; color:#9a3a28; }
.vt-allowed { background:rgba(30,93,74,.14); color:var(--e2); }
.vt-resnote { font-size:12px; color:var(--mut); }
.vt-opps { display:flex; flex-direction:column; gap:10px; }
.vt-opp { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; background:var(--iv); border:1px solid var(--ln); border-radius:12px; padding:14px 16px; flex-wrap:wrap; }
.vt-opp-main { min-width:0; display:flex; flex-direction:column; gap:6px; }
.vt-opp-main h3 { font-size:19px; color:var(--e); }
.vt-opp-main p { font-size:13px; color:var(--mut); margin:0; }
.vt-actions { display:flex; gap:8px; }
.vt-btn { background:var(--e); color:#fff; border:0; border-radius:9px; font:inherit; font-size:12.5px; font-weight:600; padding:9px 16px; cursor:pointer; }
.vt-btn:hover { background:var(--e2); }
.vt-btn.ghost { background:transparent; color:var(--e); border:1px solid var(--ln); }
.vt-btn.ghost:hover { border-color:var(--e); }
.vt-btn.danger { background:transparent; color:#9a3a28; border:1px solid #e7b7ab; }
.vt-btn.sm { padding:6px 12px; font-size:11.5px; }
.vt-btn:disabled { opacity:.6; cursor:default; }
.vt-modal { position:fixed; inset:0; background:rgba(18,60,46,.4); display:grid; place-items:center; padding:20px; z-index:50; }
.vt-modal-card { background:#fff; border-radius:16px; padding:24px; width:100%; max-width:680px; max-height:90vh; overflow:auto; }
.vt-modal-card h2 { font-size:24px; color:var(--e); margin-bottom:16px; }
.vt-modal-form { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:12px; }
.vt-modal-form .vt-field.vt-full { grid-column:1 / -1; }
.vt-checks { display:flex; flex-wrap:wrap; gap:14px; margin-top:14px; }
.vt-check { display:flex; align-items:center; gap:6px; font-size:12.5px; color:var(--ink); font-weight:500; }
.vt-modal-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:18px; }
@media (max-width:680px){ .vt-opp { flex-direction:column; } }
`;
