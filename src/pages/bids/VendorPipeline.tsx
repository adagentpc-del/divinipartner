import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../../lib/api';

/**
 * Vendor Pipeline (front-half completion pass, 2026-08-10): a vendor org's
 * own opportunities across every event, grouped by real status --
 * invited (no quote yet), quoted, negotiating, awarded, lost. Previously a
 * vendor had no single place to see this; they had to check the Bid Board
 * and each event's Quotes tab separately. Every row is a real bid/quote
 * (server/src/db/procurementPipeline.ts::getVendorPipeline) -- no
 * fabricated status.
 *
 * Zero em dashes.
 */
type Opportunity = {
  bid_id: string;
  event_id: string;
  event_name: string | null;
  category: string | null;
  scope: string | null;
  status: 'invited' | 'quoted' | 'negotiating' | 'awarded' | 'lost' | 'closed';
  quote_id: string | null;
  quote_total: string | null;
};

const STATUS_LABEL: Record<Opportunity['status'], string> = {
  invited: 'Invited',
  quoted: 'Quote submitted',
  negotiating: 'Negotiating',
  awarded: 'Awarded',
  lost: 'Lost',
  closed: 'Closed',
};

const GROUPS: Opportunity['status'][] = ['invited', 'quoted', 'negotiating', 'awarded', 'lost', 'closed'];

export default function VendorPipeline() {
  const [rows, setRows] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ opportunities: Opportunity[] }>('/procurement-pipeline/mine')
      .then((r) => setRows(r.opportunities))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="vp-muted">Loading your pipeline...</p>;
  if (err) return <p className="vp-error">{err}</p>;

  return (
    <div className="vp">
      <style>{VP_CSS}</style>
      <header className="vp-head">
        <span className="vp-kicker">Your opportunities</span>
        <h1 className="vp-title">Vendor Pipeline</h1>
      </header>

      {rows.length === 0 ? (
        <div className="vp-empty"><p>No opportunities yet. Check the <Link to="/bids">Bid Board</Link> for open packages.</p></div>
      ) : (
        GROUPS.map((status) => {
          const group = rows.filter((r) => r.status === status);
          if (group.length === 0) return null;
          return (
            <section key={status} className="vp-group">
              <h2 className="vp-grouphead">{STATUS_LABEL[status]} ({group.length})</h2>
              <div className="vp-list">
                {group.map((r) => (
                  <div key={r.bid_id} className="vp-row">
                    <div>
                      <div className="vp-cat">{r.category ?? 'General'}</div>
                      <div className="vp-event">{r.event_name ?? 'Event'}</div>
                    </div>
                    {r.quote_total ? <div className="vp-amount">${Number(r.quote_total).toLocaleString()}</div> : null}
                  </div>
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

const VP_CSS = `
.vp { max-width: 860px; margin: 0 auto; padding: 24px 20px 60px; }
.vp-kicker { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #9a8a5e; font-weight: 600; }
.vp-title { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 32px; color: #123c2e; margin: 4px 0 20px; }
.vp-group { margin-bottom: 22px; }
.vp-grouphead { font-size: 15px; color: #123c2e; margin: 0 0 10px; }
.vp-list { display: flex; flex-direction: column; gap: 8px; }
.vp-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #fff; border: 1px solid #e7e1d6; border-radius: 10px; padding: 12px 14px; }
.vp-cat { font-size: 13.5px; font-weight: 600; color: #2c2a26; }
.vp-event { font-size: 12px; color: #6b6459; }
.vp-amount { font-size: 13px; font-weight: 600; color: #1E5D4A; white-space: nowrap; }
.vp-muted { padding: 24px; color: #6b6459; }
.vp-error { padding: 24px; color: #9b2c2c; }
.vp-empty { padding: 24px; color: #6b6459; }
`;
