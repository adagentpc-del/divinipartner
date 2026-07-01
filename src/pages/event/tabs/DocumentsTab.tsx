import React, { useState } from 'react';
import { apiSend } from '../../../lib/api';

/**
 * Documents tab. The AI bid package generator (POST /events/:id/bid-package)
 * produces a vendor-ready document assembled from the event record. Uploaded
 * files (COI, contracts, floorplans) are managed by the shared document system
 * in another phase; this tab surfaces the generated package and links out.
 */
type BidPackage = {
  generated_at: string;
  event: { name: string; type: string | null; date_time: string | null; guest_count: number | null; budget: string | null; status: string | null };
  venue: Record<string, unknown>;
  scope: { goals: string | null; required_services: string[]; services_count: number };
  notes: string;
};

export default function DocumentsTab({ eventId }: { eventId: string }) {
  const [pkg, setPkg] = useState<BidPackage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    setErr(null);
    try {
      const r = await apiSend<{ package: BidPackage }>('POST', `/events/${eventId}/bid-package`);
      setPkg(r.package);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
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
@media (max-width: 720px) { .ew-doc-dl { grid-template-columns: 1fr; } }
`;
