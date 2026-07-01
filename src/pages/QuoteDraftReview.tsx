import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { apiGet, apiSend } from '../lib/api';

// Venue Intelligence Phase 3 - Draft Quote review.
// A draft is auto-assembled from the venue twin + a branding opportunity + the
// vendor's pricing rules (server: quoteAutomation + draftQuote + pricingEngine).
// The vendor reviews the auto-populated venue intelligence, edits the scope,
// install/removal/compliance notes and price, then approves. Once approved the
// event owner can deliver it to the client.

type Restriction = {
  id: string;
  rule_type: 'allowed' | 'prohibited' | null;
  category: string | null;
  value: string | null;
  notes: string | null;
};

type Prefill = {
  opportunity: { id: string; name: string; category: string | null; description: string | null; approval_mode: string | null };
  measurements: {
    width: number | null; height: number | null; depth: number | null; sqft: number | null;
    weight_limit: number | null; material_type: string | null; surface_type: string | null;
  };
  restrictions: { allowed: Restriction[]; prohibited: Restriction[] };
  power: { power_available: boolean; internet_available: boolean; rigging_available: boolean };
  compliance: { permit_required: boolean; engineering_required: boolean; fire_marshal_required: boolean; insurance_required: boolean };
  access: { loading_dock: unknown; freight_elevator: unknown; install_windows: unknown; removal_windows: unknown };
  service_category: string | null;
  missing: string[];
};

type TimelineStep = { key: string; phase: string; title: string; detail: string | null };

type Draft = {
  id: string;
  event_id: string | null;
  venue_id: string | null;
  branding_opportunity_id: string | null;
  vendor_id: string | null;
  prefilled: Prefill | null;
  scope_of_work: string | null;
  install_notes: string | null;
  removal_notes: string | null;
  compliance_notes: string | null;
  timeline: { steps: TimelineStep[] } | null;
  computed_price: string | null;
  status: string;
};

// A list row is the same persisted draft shape the GET / endpoint returns.
type DraftListItem = {
  id: string;
  event_id: string | null;
  venue_id: string | null;
  prefilled: Prefill | null;
  computed_price: string | null;
  status: string;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  vendor_review: 'Vendor review',
  vendor_approved: 'Vendor approved',
  client_delivered: 'Delivered to client',
  declined: 'Declined',
};

function money(n?: string | number | null) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '(not set)';
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function yn(b?: boolean) {
  return b ? 'Yes' : 'No';
}

function shortDate(s?: string | null) {
  if (!s) return '-';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// List view: shown at /quote-drafts (no :id). Fetches the actor's drafts from
// the org-scoped, IDOR-safe GET / endpoint and renders clickable rows that
// navigate to /quote-drafts/:id (the detail/review view below).
function QuoteDraftList() {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<DraftListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await apiGet<{ drafts: DraftListItem[] }>('/quote-drafts');
        if (alive) { setDrafts(res.drafts || []); setError(null); }
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="qd">
      <style>{CSS}</style>
      <header className="qd-head">
        <div>
          <span className="qd-kicker">Venue Intelligence</span>
          <h1 className="qd-title">Draft Quotes</h1>
          <p className="qd-sub">Select a draft to review, edit, approve, or deliver.</p>
        </div>
      </header>

      {error && <div className="qd-error">{error}</div>}

      {loading ? (
        <div className="qd-empty">Loading drafts.</div>
      ) : drafts.length === 0 ? (
        <div className="qd-empty">No draft quotes yet. Generate one from an event to get started.</div>
      ) : (
        <div className="qd-list" role="list">
          {drafts.map((d) => (
            <button
              key={d.id}
              type="button"
              role="listitem"
              className="qd-row"
              onClick={() => navigate(`/quote-drafts/${d.id}`)}
            >
              <span className="qd-row-main">
                <strong>{d.prefilled?.opportunity?.name || `Draft ${d.id.slice(0, 8)}`}</strong>
                <span className="qd-row-meta">
                  {d.venue_id ? `Venue ${d.venue_id.slice(0, 8)}` : 'No venue'}
                  {' · '}
                  {shortDate(d.created_at)}
                </span>
              </span>
              <span className="qd-row-price">{money(d.computed_price)}</span>
              <span className={`qd-status ${d.status}`}>{STATUS_LABEL[d.status] ?? d.status}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function QuoteDraftReview() {
  const params = useParams();
  const [search] = useSearchParams();
  const draftId = params.id || search.get('id') || undefined;

  // No id selected: render the list of the actor's drafts instead of dead-ending.
  if (!draftId) return <QuoteDraftList />;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [scope, setScope] = useState('');
  const [installNotes, setInstallNotes] = useState('');
  const [removalNotes, setRemovalNotes] = useState('');
  const [complianceNotes, setComplianceNotes] = useState('');
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function hydrate(d: Draft) {
    setDraft(d);
    setScope(d.scope_of_work ?? '');
    setInstallNotes(d.install_notes ?? '');
    setRemovalNotes(d.removal_notes ?? '');
    setComplianceNotes(d.compliance_notes ?? '');
    setPrice(d.computed_price != null ? String(d.computed_price) : '');
  }

  async function load() {
    if (!draftId) { setError('No draft selected.'); return; }
    setLoading(true);
    try {
      const res = await apiGet<{ draft: Draft }>(`/quote-drafts/${draftId}`);
      hydrate(res.draft);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [draftId]);

  async function save() {
    if (!draft) return;
    setBusy(true); setOk(null);
    try {
      const res = await apiSend<{ draft: Draft }>('PATCH', `/quote-drafts/${draft.id}`, {
        scope_of_work: scope,
        install_notes: installNotes,
        removal_notes: removalNotes,
        compliance_notes: complianceNotes,
        computed_price: price === '' ? null : Number(price),
        status: draft.status === 'draft' ? 'vendor_review' : undefined,
      });
      hydrate(res.draft);
      setOk('Saved.');
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function act(path: string, label: string) {
    if (!draft) return;
    setBusy(true); setOk(null);
    try {
      const res = await apiSend<{ draft: Draft }>('POST', `/quote-drafts/${draft.id}/${path}`, {});
      hydrate(res.draft);
      setOk(label);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const pf = draft?.prefilled ?? null;
  const m = pf?.measurements;

  return (
    <div className="qd">
      <style>{CSS}</style>

      <header className="qd-head">
        <div>
          <span className="qd-kicker">Venue Intelligence</span>
          <h1 className="qd-title">Draft Quote Review</h1>
          <p className="qd-sub">
            {pf?.opportunity?.name ? `${pf.opportunity.name}` : draftId ? `Draft ${draftId.slice(0, 8)}` : 'No draft selected'}
          </p>
        </div>
        {draft && <span className={`qd-status ${draft.status}`}>{STATUS_LABEL[draft.status] ?? draft.status}</span>}
      </header>

      {error && <div className="qd-error">{error}</div>}
      {ok && <div className="qd-ok">{ok}</div>}

      {loading ? (
        <div className="qd-empty">Loading draft.</div>
      ) : !draft ? (
        <div className="qd-empty">No draft to review.</div>
      ) : (
        <>
          {pf && (
            <section className="qd-section">
              <h2>Auto-populated venue intelligence</h2>
              <p className="qd-note">Pulled once from the venue twin and this branding opportunity. Confirm anything marked not recorded.</p>

              <div className="qd-grid">
                <div className="qd-panel">
                  <div className="qd-panel-h">Measurements</div>
                  <div className="qd-kv"><span>Width</span><strong>{m?.width ?? '-'}</strong></div>
                  <div className="qd-kv"><span>Height</span><strong>{m?.height ?? '-'}</strong></div>
                  <div className="qd-kv"><span>Depth</span><strong>{m?.depth ?? '-'}</strong></div>
                  <div className="qd-kv"><span>Sqft</span><strong>{m?.sqft ?? '-'}</strong></div>
                  <div className="qd-kv"><span>Weight limit</span><strong>{m?.weight_limit ?? '-'}</strong></div>
                  <div className="qd-kv"><span>Surface</span><strong>{m?.surface_type ?? '-'}</strong></div>
                  <div className="qd-kv"><span>Material</span><strong>{m?.material_type ?? '-'}</strong></div>
                </div>

                <div className="qd-panel">
                  <div className="qd-panel-h">On-site services</div>
                  <div className="qd-kv"><span>Power</span><strong>{yn(pf.power.power_available)}</strong></div>
                  <div className="qd-kv"><span>Internet</span><strong>{yn(pf.power.internet_available)}</strong></div>
                  <div className="qd-kv"><span>Rigging</span><strong>{yn(pf.power.rigging_available)}</strong></div>
                  <div className="qd-panel-h" style={{ marginTop: 10 }}>Compliance</div>
                  <div className="qd-kv"><span>Permit</span><strong>{yn(pf.compliance.permit_required)}</strong></div>
                  <div className="qd-kv"><span>Engineering</span><strong>{yn(pf.compliance.engineering_required)}</strong></div>
                  <div className="qd-kv"><span>Fire marshal</span><strong>{yn(pf.compliance.fire_marshal_required)}</strong></div>
                  <div className="qd-kv"><span>Insurance</span><strong>{yn(pf.compliance.insurance_required)}</strong></div>
                </div>

                <div className="qd-panel">
                  <div className="qd-panel-h">Restrictions</div>
                  {pf.restrictions.prohibited.length === 0 && pf.restrictions.allowed.length === 0 && (
                    <div className="qd-muted">None recorded.</div>
                  )}
                  {pf.restrictions.prohibited.map((r) => (
                    <div key={r.id} className="qd-chip prohibited">{[r.category, r.value].filter(Boolean).join(': ') || 'Prohibited'}</div>
                  ))}
                  {pf.restrictions.allowed.map((r) => (
                    <div key={r.id} className="qd-chip allowed">{[r.category, r.value].filter(Boolean).join(': ') || 'Allowed'}</div>
                  ))}
                </div>
              </div>

              {pf.missing.length > 0 && (
                <div className="qd-missing">Not recorded on the twin: {pf.missing.join(', ')}. Confirm with the venue before quoting.</div>
              )}
            </section>
          )}

          {draft.timeline?.steps?.length ? (
            <section className="qd-section">
              <h2>Install and removal timeline</h2>
              <ol className="qd-timeline">
                {draft.timeline.steps.map((s) => (
                  <li key={s.key}>
                    <strong>{s.title}</strong>
                    {s.detail && <span>{s.detail}</span>}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <section className="qd-section">
            <h2>Scope of work</h2>
            <textarea value={scope} onChange={(e) => setScope(e.target.value)} placeholder="Scope of work." />
          </section>

          <div className="qd-cols">
            <section className="qd-section">
              <h2>Install notes</h2>
              <textarea value={installNotes} onChange={(e) => setInstallNotes(e.target.value)} placeholder="Install notes." />
            </section>
            <section className="qd-section">
              <h2>Removal notes</h2>
              <textarea value={removalNotes} onChange={(e) => setRemovalNotes(e.target.value)} placeholder="Removal notes." />
            </section>
          </div>

          <section className="qd-section">
            <h2>Compliance notes</h2>
            <textarea value={complianceNotes} onChange={(e) => setComplianceNotes(e.target.value)} placeholder="Compliance notes." />
          </section>

          <section className="qd-section qd-price-row">
            <div>
              <h2>Quote price</h2>
              <p className="qd-note">Auto-computed from the vendor pricing rules. Edit before approving.</p>
            </div>
            <div className="qd-price">
              <span>$</span>
              <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
              <span className="qd-price-display">{money(price)}</span>
            </div>
          </section>

          <div className="qd-actions">
            <button type="button" className="qd-btn ghost" disabled={busy} onClick={save}>{busy ? 'Saving.' : 'Save edits'}</button>
            <button type="button" className="qd-btn" disabled={busy || draft.status === 'declined'} onClick={() => act('approve', 'Approved.')}>Approve</button>
            <button type="button" className="qd-btn ghost" disabled={busy} onClick={() => act('decline', 'Declined.')}>Decline</button>
            <button type="button" className="qd-btn gold" disabled={busy || draft.status !== 'vendor_approved'} onClick={() => act('deliver', 'Delivered to client.')}>Deliver to client</button>
          </div>
        </>
      )}
    </div>
  );
}

const CSS = `
.qd { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --iv:#F7F4EE; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:1180px; }
.qd *,.qd *::before,.qd *::after { box-sizing:border-box; }
.qd h1,.qd h2 { font-family:'Cormorant Garamond',Georgia,serif; margin:0; }
.qd-head { display:flex; justify-content:space-between; align-items:flex-end; gap:16px; margin-bottom:18px; flex-wrap:wrap; }
.qd-kicker { font-size:10.5px; letter-spacing:1.4px; text-transform:uppercase; color:var(--g); font-weight:600; }
.qd-title { font-size:28px; color:var(--e); line-height:1.1; }
.qd-sub { font-size:13px; color:var(--mut); margin:4px 0 0; }
.qd-status { font-size:11px; font-weight:600; padding:6px 12px; border-radius:999px; text-transform:uppercase; letter-spacing:.5px; border:1px solid var(--ln); background:#fff; color:var(--mut); }
.qd-status.vendor_approved { background:rgba(30,93,74,.1); border-color:rgba(30,93,74,.3); color:var(--e2); }
.qd-status.client_delivered { background:rgba(201,163,91,.15); border-color:rgba(201,163,91,.4); color:#8a6a1f; }
.qd-status.declined { background:#fff3f1; border-color:#e7b7ab; color:#9a3a28; }
.qd-error { background:#fff3f1; border:1px solid #e7b7ab; color:#9a3a28; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.qd-ok { background:rgba(30,93,74,.1); border:1px solid rgba(30,93,74,.3); color:var(--e2); padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.qd-empty { padding:40px; text-align:center; color:var(--mut); border:1px dashed var(--ln); border-radius:14px; background:rgba(247,244,238,.55); }
.qd-section { background:#fff; border:1px solid var(--ln); border-radius:14px; padding:18px; margin-bottom:14px; }
.qd-section h2 { font-size:20px; color:var(--e); margin-bottom:8px; }
.qd-note { font-size:12px; color:var(--mut); margin:0 0 12px; }
.qd-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
.qd-panel { border:1px solid var(--ln); border-radius:10px; padding:12px; background:var(--iv); }
.qd-panel-h { font-size:11px; text-transform:uppercase; letter-spacing:.5px; color:var(--e2); font-weight:600; margin-bottom:8px; }
.qd-kv { display:flex; justify-content:space-between; gap:10px; font-size:12.5px; padding:4px 0; border-bottom:1px dashed var(--ln); }
.qd-kv:last-child { border-bottom:0; }
.qd-muted { color:var(--mut); font-size:12.5px; }
.qd-chip { display:inline-block; font-size:11.5px; padding:4px 9px; border-radius:999px; margin:0 4px 4px 0; border:1px solid var(--ln); }
.qd-chip.prohibited { background:#fff3f1; border-color:#e7b7ab; color:#9a3a28; }
.qd-chip.allowed { background:rgba(30,93,74,.08); border-color:rgba(30,93,74,.25); color:var(--e2); }
.qd-missing { margin-top:12px; font-size:12px; color:#8a6a1f; background:#fff8ef; border:1px solid #e7cfa5; padding:9px 12px; border-radius:9px; }
.qd-timeline { margin:0; padding-left:18px; display:flex; flex-direction:column; gap:8px; }
.qd-timeline li { font-size:12.5px; }
.qd-timeline li strong { color:var(--e); display:block; }
.qd-timeline li span { color:var(--mut); }
.qd-section textarea { width:100%; min-height:90px; font:inherit; font-size:13px; padding:10px 12px; border:1px solid var(--ln); border-radius:9px; background:var(--iv); resize:vertical; }
.qd-cols { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.qd-price-row { display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap; }
.qd-price { display:flex; align-items:center; gap:8px; }
.qd-price input { width:140px; font:inherit; font-size:15px; padding:8px 10px; border:1px solid var(--ln); border-radius:8px; }
.qd-price-display { font-size:18px; font-weight:600; color:var(--e); font-family:'Cormorant Garamond',Georgia,serif; }
.qd-actions { display:flex; justify-content:flex-end; gap:10px; flex-wrap:wrap; }
.qd-btn { background:var(--e); color:#fff; border:0; border-radius:9px; font:inherit; font-size:13px; font-weight:600; padding:10px 22px; cursor:pointer; }
.qd-btn:hover { background:var(--e2); }
.qd-btn.ghost { background:transparent; color:var(--e); border:1px solid var(--ln); }
.qd-btn.gold { background:var(--g); color:#2c2410; }
.qd-btn:disabled { opacity:.5; cursor:default; }
.qd-list { display:flex; flex-direction:column; gap:10px; }
.qd-row { display:flex; align-items:center; gap:14px; width:100%; text-align:left; background:#fff; border:1px solid var(--ln); border-radius:12px; padding:14px 16px; cursor:pointer; font:inherit; }
.qd-row:hover { border-color:var(--g); box-shadow:0 1px 6px rgba(18,60,46,.08); }
.qd-row-main { display:flex; flex-direction:column; gap:3px; flex:1 1 auto; min-width:0; }
.qd-row-main strong { font-size:14.5px; color:var(--e); }
.qd-row-meta { font-size:12px; color:var(--mut); }
.qd-row-price { font-size:14px; font-weight:600; color:var(--e); font-family:'Cormorant Garamond',Georgia,serif; white-space:nowrap; }
@media (max-width:860px){ .qd-grid { grid-template-columns:1fr; } .qd-cols { grid-template-columns:1fr; } .qd-row { flex-wrap:wrap; } }
`;
