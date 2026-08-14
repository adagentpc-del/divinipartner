import React, { useEffect, useState } from 'react';
import { apiGet } from '../../../lib/api';

/**
 * Procurement Pipeline (front-half completion pass, 2026-08-10): a single
 * status view across every bid on the event, so an organizer never has to
 * jump between the Bids and Quotes tabs to know where a scope stands. Every
 * field is a real derived aggregation over bids/quotes/quote_messages/
 * event_vendor_contracts (server/src/db/procurementPipeline.ts) -- no
 * fabricated status.
 *
 * Zero em dashes.
 */
type PipelineRow = {
  bid_id: string;
  category: string | null;
  scope: string | null;
  bid_status: string | null;
  budget_min: string | null;
  budget_max: string | null;
  quotes_count: number;
  stage: 'draft' | 'published' | 'bidding' | 'negotiating' | 'awarded' | 'contracted' | 'closed';
  awarded_vendor_name: string | null;
  next_action: string;
};

const STAGE_LABEL: Record<PipelineRow['stage'], string> = {
  draft: 'Draft',
  published: 'Published',
  bidding: 'Bidding',
  negotiating: 'Negotiating',
  awarded: 'Awarded',
  contracted: 'Contracted',
  closed: 'Closed',
};

function budget(row: PipelineRow): string {
  const lo = row.budget_min != null ? `$${Number(row.budget_min).toLocaleString()}` : null;
  const hi = row.budget_max != null ? `$${Number(row.budget_max).toLocaleString()}` : null;
  if (lo && hi) return `${lo} - ${hi}`;
  return lo ?? hi ?? 'Open budget';
}

export default function ProcurementPipelineTab({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<PipelineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiGet<{ pipeline: PipelineRow[] }>(`/procurement-pipeline/event/${eventId}`)
      .then((r) => setRows(r.pipeline))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [eventId]);

  if (loading) return <p className="ew-muted">Loading procurement pipeline...</p>;
  if (err) return <p className="ew-error">{err}</p>;

  return (
    <div className="ew-pp">
      <style>{PP_CSS}</style>
      {rows.length === 0 ? (
        <div className="ew-empty"><p>No bid packages posted for this event yet. Post one from the Bids tab.</p></div>
      ) : (
        <table className="ew-pp-table">
          <thead>
            <tr>
              <th>Scope</th>
              <th>Budget</th>
              <th>Quotes</th>
              <th>Stage</th>
              <th>Awarded to</th>
              <th>Next action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.bid_id}>
                <td>{r.category ?? 'General'}</td>
                <td>{budget(r)}</td>
                <td>{r.quotes_count}</td>
                <td><span className={`ew-pp-stage stage-${r.stage}`}>{STAGE_LABEL[r.stage]}</span></td>
                <td>{r.awarded_vendor_name ?? '-'}</td>
                <td className="ew-pp-action">{r.next_action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const PP_CSS = `
.ew-pp-table { width: 100%; border-collapse: collapse; }
.ew-pp-table th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: .4px; color: #9a8a5e; padding: 8px 10px; border-bottom: 1px solid #e7e1d6; }
.ew-pp-table td { padding: 10px; border-bottom: 1px solid #f0ebe0; font-size: 13px; color: #2c2a26; vertical-align: top; }
.ew-pp-action { color: #6b6459; font-size: 12px; }
.ew-pp-stage { font-size: 10.5px; text-transform: uppercase; letter-spacing: .4px; font-weight: 700; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
.stage-draft { background: #eef0ee; color: #5a6b62; }
.stage-published { background: rgba(154,142,94,.15); color: #9a8a5e; }
.stage-bidding { background: rgba(201,163,91,.2); color: #8a6d27; }
.stage-negotiating { background: rgba(180,69,31,.1); color: #b4451f; }
.stage-awarded { background: rgba(30,93,74,.12); color: #1E5D4A; }
.stage-contracted { background: rgba(18,60,46,.12); color: #123c2e; }
.stage-closed { background: #f3e9e9; color: #8a4a4a; }
@media (max-width: 720px) {
  .ew-pp-table, .ew-pp-table thead, .ew-pp-table tbody, .ew-pp-table th, .ew-pp-table td, .ew-pp-table tr { display: block; }
  .ew-pp-table thead { display: none; }
  .ew-pp-table tr { border: 1px solid #e7e1d6; border-radius: 10px; margin-bottom: 10px; padding: 8px 10px; }
  .ew-pp-table td { border-bottom: none; padding: 4px 0; }
}
`;
