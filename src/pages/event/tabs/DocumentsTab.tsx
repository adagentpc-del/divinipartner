import React, { useState } from 'react';
import { apiSend } from '../../../lib/api';

/**
 * Documents tab. The AI bid package generator (POST /events/:id/bid-package)
 * produces a vendor-ready summary assembled from the event record. Uploaded
 * files (COI, contracts, floorplans) are managed by the shared document system
 * in another phase; this tab surfaces the generated package.
 *
 * The package used to be a dead-end read-only view: there was no way to edit
 * it or turn it into anything vendors could actually respond to. It is now a
 * review step before publishing: "Edit details" reveals the fields a real bid
 * needs (services -> one bid category per line, scope, budget, tier), and
 * "Publish to bid board" posts one bid per service via the existing, already-
 * working POST /api/bids (same call BidsTab.tsx uses), so the AI-drafted
 * package turns into real, vendor-visible bids instead of just a summary the
 * user has to manually retype into the Bids tab.
 */
type BidPackage = {
  generated_at: string;
  event: { name: string; type: string | null; date_time: string | null; guest_count: number | null; budget: string | null; status: string | null };
  venue: Record<string, unknown>;
  scope: { goals: string | null; required_services: string[]; services_count: number };
  notes: string;
};

const TIER_OPTIONS = ['premier', 'partner', 'free', 'private'];

export default function DocumentsTab({ eventId }: { eventId: string }) {
  const [pkg, setPkg] = useState<BidPackage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState(false);
  const [servicesText, setServicesText] = useState('');
  const [scopeText, setScopeText] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [tierAccess, setTierAccess] = useState('premier');
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setErr(null);
    setPublishResult(null);
    try {
      const r = await apiSend<{ package: BidPackage }>('POST', `/events/${eventId}/bid-package`);
      setPkg(r.package);
      setServicesText(r.package.scope.required_services.join('\n'));
      setScopeText(r.package.scope.goals ?? '');
      setBudgetMax(r.package.event.budget ? String(Math.round(Number(r.package.event.budget))) : '');
      setBudgetMin('');
      setEditing(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    const services = servicesText.split('\n').map((s) => s.trim()).filter(Boolean);
    if (services.length === 0) {
      setErr('Add at least one service category before publishing.');
      return;
    }
    setPublishing(true);
    setErr(null);
    setPublishResult(null);
    try {
      for (const category of services) {
        await apiSend('POST', '/bids', {
          event_id: eventId,
          category,
          scope: scopeText || null,
          budget_min: budgetMin ? Number(budgetMin) : null,
          budget_max: budgetMax ? Number(budgetMax) : null,
          tier_access: tierAccess,
          rush: false,
          post: true,
        });
      }
      setPublishResult(`Published ${services.length} bid${services.length === 1 ? '' : 's'} to the Bid Board. Switch to the Bids tab to see and share them.`);
      setEditing(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div>
      <style>{D_CSS}</style>
      {err ? <p className="ew-error">{err}</p> : null}

      <div className="ew-doc-gen">
        <div>
          <div className="ew-doc-title">AI bid package</div>
          <p className="ew-muted">Assemble a vendor-ready package from this event's record.</p>
        </div>
        <button type="button" className="ew-btn" onClick={generate} disabled={busy}>
          {busy ? 'Generating...' : 'Generate package'}
        </button>
      </div>

      {pkg ? (
        <div className="ew-doc-pkg">
          <div className="ew-doc-pkghead">
            <span className="ew-doc-pkgname">{pkg.event.name}</span>
            <span className="ew-doc-pkgts">Generated {new Date(pkg.generated_at).toLocaleString()}</span>
          </div>
          <dl className="ew-doc-dl">
            <div><dt>Type</dt><dd>{pkg.event.type ?? 'Not set'}</dd></div>
            <div><dt>Date</dt><dd>{pkg.event.date_time ? new Date(pkg.event.date_time).toLocaleString() : 'Not scheduled'}</dd></div>
            <div><dt>Guests</dt><dd>{pkg.event.guest_count ?? 'Not set'}</dd></div>
            <div><dt>Budget</dt><dd>{pkg.event.budget ? `$${Number(pkg.event.budget).toLocaleString()}` : 'Not set'}</dd></div>
            <div><dt>Required services</dt><dd>{pkg.scope.required_services.join(', ') || 'None listed'}</dd></div>
            <div><dt>Goals</dt><dd>{pkg.scope.goals ?? 'Not captured'}</dd></div>
          </dl>
          <p className="ew-doc-note">{pkg.notes}</p>

          {publishResult ? <p className="ew-doc-success">{publishResult}</p> : null}

          {!editing ? (
            <div className="ew-doc-actions">
              <button type="button" className="ew-btn ghost" onClick={() => setEditing(true)}>Edit details</button>
              <button type="button" className="ew-btn" disabled={publishing} onClick={publish}>
                {publishing ? 'Publishing...' : 'Publish to bid board'}
              </button>
            </div>
          ) : (
            <div className="ew-doc-edit">
              <label>Service categories (one per line - each becomes a separate bid)
                <textarea
                  value={servicesText}
                  onChange={(e) => setServicesText(e.target.value)}
                  rows={Math.max(3, servicesText.split('\n').length)}
                  placeholder="e.g. Catering&#10;Florals&#10;DJ"
                />
              </label>
              <label>Scope / goals (applied to every published bid)
                <textarea value={scopeText} onChange={(e) => setScopeText(e.target.value)} rows={3} />
              </label>
              <div className="ew-doc-editrow">
                <label>Budget min ($)
                  <input value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} placeholder="optional" />
                </label>
                <label>Budget max ($)
                  <input value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} placeholder="optional" />
                </label>
                <label>Tier access
                  <select value={tierAccess} onChange={(e) => setTierAccess(e.target.value)}>
                    {TIER_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
              </div>
              <div className="ew-doc-actions">
                <button type="button" className="ew-btn ghost" onClick={() => setEditing(false)}>Cancel</button>
                <button type="button" className="ew-btn" disabled={publishing} onClick={publish}>
                  {publishing ? 'Publishing...' : 'Publish to bid board'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="ew-empty">
          <p>No package generated yet. Generate one to share event details with vendors. Uploaded files such as contracts and certificates of insurance are managed in the shared document library.</p>
        </div>
      )}
    </div>
  );
}

const D_CSS = `
.ew-doc-gen { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; background: rgba(247,244,238,.6); border: 1px dashed #e7e1d6; border-radius: 12px; padding: 16px 18px; margin-bottom: 18px; }
.ew-doc-title { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 20px; color: #123c2e; }
.ew-doc-pkg { background: #fff; border: 1px solid #e7e1d6; border-radius: 12px; padding: 18px; }
.ew-doc-pkghead { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; border-bottom: 1px solid #e7e1d6; padding-bottom: 10px; margin-bottom: 12px; }
.ew-doc-pkgname { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 22px; color: #123c2e; }
.ew-doc-pkgts { font-size: 11px; color: #b3aa99; }
.ew-doc-dl { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 18px; margin: 0; }
.ew-doc-dl div { display: flex; flex-direction: column; gap: 2px; }
.ew-doc-dl dt { font-size: 10.5px; letter-spacing: .4px; text-transform: uppercase; color: #9a8a5e; font-weight: 600; }
.ew-doc-dl dd { margin: 0; font-size: 13.5px; color: #2c2a26; }
.ew-doc-note { margin: 14px 0 0; font-size: 12px; color: #7d776c; font-style: italic; }
.ew-doc-success { margin: 14px 0 0; font-size: 12.5px; color: #1E5D4A; font-weight: 600; background: rgba(30,93,74,.08); border: 1px solid rgba(30,93,74,.25); border-radius: 9px; padding: 10px 12px; }
.ew-doc-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.ew-doc-edit { margin-top: 16px; padding-top: 16px; border-top: 1px solid #e7e1d6; display: flex; flex-direction: column; gap: 12px; }
.ew-doc-edit label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; font-weight: 600; color: #7d776c; }
.ew-doc-edit input, .ew-doc-edit select, .ew-doc-edit textarea { font: inherit; font-size: 13px; padding: 8px 10px; border: 1px solid #e7e1d6; border-radius: 8px; background: #fff; color: #2c2a26; }
.ew-doc-editrow { display: flex; gap: 14px; flex-wrap: wrap; }
.ew-doc-editrow label { flex: 1 1 160px; }
@media (max-width: 720px) { .ew-doc-dl { grid-template-columns: 1fr; } }
`;
