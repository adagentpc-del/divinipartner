import React, { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend, ApiError } from '../../../lib/api';

/**
 * Post-Event Report (live-ops phase, Part 32-38): a single read-only
 * digest over systems that already exist and already self-scope their
 * own visibility (vendor performance, sponsor fulfillment, incidents,
 * reconciliation, activity). Distinct from the pre-existing, GLOBAL
 * "Divini Vendor Scorecard" page -- this is per-event only. Also carries
 * a small event-scoped review composer (Part 34): the generic Reviews
 * tab has no event filter by design, so this lists which vendors from
 * THIS event have not yet been reviewed and lets an owner/planner rate
 * them without hunting through the org-wide composer.
 *
 * Zero em dashes.
 */

type VendorPerformance = {
  vendor_org_id: string;
  vendor_name: string;
  completion_status: string;
  completion_notes: string | null;
  review_count: number;
  review_avg_rating: number | null;
  open_inventory_issues: number;
};

type Digest = {
  event_name: string;
  event_status: string | null;
  vendor_performance: VendorPerformance[];
  sponsor_fulfillment: {
    summary: { total_sponsors: number; activations_total: number; activations_complete: number; activations_issue: number };
    avg_completion_minutes: number | null;
  };
  incidents: { total: number; open: number; high_priority: number };
  reconciliation: { state: string; totals: { invoiced_total: number; paid_total: number; outstanding_total: number } } | null;
  recent_activity: Array<{ at: string; label: string; kind: string }>;
};

type ReviewRow = { reviewee_org_id: string | null };

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function PostEventReportTab({ eventId }: { eventId: string }) {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [reviewedOrgIds, setReviewedOrgIds] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviewForm, setReviewForm] = useState<{ orgId: string; rating: number; body: string } | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const [d, r] = await Promise.all([
        apiGet<{ digest: Digest }>(`/post-event/event/${eventId}/digest`),
        apiGet<{ reviews: ReviewRow[] }>(`/reviews/event/${eventId}`).catch(() => ({ reviews: [] })),
      ]);
      setDigest(d.digest);
      setReviewedOrgIds(new Set(r.reviews.map((rv) => rv.reviewee_org_id).filter((x): x is string => !!x)));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitReview() {
    if (!reviewForm) return;
    setReviewBusy(true);
    setErr(null);
    try {
      await apiSend('POST', '/reviews', {
        relationship: 'planner_to_vendor',
        event_id: eventId,
        reviewee_org_id: reviewForm.orgId,
        rating: reviewForm.rating,
        body: reviewForm.body.trim() || null,
      });
      setReviewForm(null);
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setReviewBusy(false);
    }
  }

  if (busy && !digest) return <p className="ew-empty"><p>Loading post-event report...</p></p>;
  if (err && !digest) return <p className="ew-error">{err}</p>;
  if (!digest) return null;

  return (
    <div className="ew-per">
      <style>{PER_CSS}</style>
      {err ? <p className="ew-error">{err}</p> : null}

      <section className="ew-per-cat">
        <h3>Vendor performance</h3>
        {digest.vendor_performance.length === 0 ? (
          <div className="ew-empty"><p>No vendor performance data for this event.</p></div>
        ) : (
          <ul>
            {digest.vendor_performance.map((v) => (
              <li key={v.vendor_org_id} className="ew-per-vrow">
                <div className="ew-per-vhead">
                  <span className="ew-per-vname">{v.vendor_name}</span>
                  <span className={`ew-per-vstatus status-${v.completion_status}`}>{v.completion_status}</span>
                </div>
                <div className="ew-per-vmeta">
                  <span>{v.review_count > 0 ? `${v.review_avg_rating?.toFixed(1)} / 5 (${v.review_count} review${v.review_count === 1 ? '' : 's'})` : 'No reviews yet'}</span>
                  {v.open_inventory_issues > 0 ? <span className="ew-per-warn">{v.open_inventory_issues} open inventory issue{v.open_inventory_issues === 1 ? '' : 's'}</span> : null}
                  {v.completion_notes ? <span className="ew-per-notes">"{v.completion_notes}"</span> : null}
                </div>
                {!reviewedOrgIds.has(v.vendor_org_id) ? (
                  reviewForm?.orgId === v.vendor_org_id ? (
                    <div className="ew-per-reviewform">
                      <select value={reviewForm.rating} onChange={(e) => setReviewForm({ ...reviewForm, rating: Number(e.target.value) })}>
                        {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n === 1 ? '' : 's'}</option>)}
                      </select>
                      <input placeholder="Optional note" value={reviewForm.body} onChange={(e) => setReviewForm({ ...reviewForm, body: e.target.value })} />
                      <button type="button" className="ew-btn sm" onClick={() => void submitReview()} disabled={reviewBusy}>Submit</button>
                      <button type="button" className="ew-btn ghost sm" onClick={() => setReviewForm(null)} disabled={reviewBusy}>Cancel</button>
                    </div>
                  ) : (
                    <button type="button" className="ew-btn ghost sm" onClick={() => setReviewForm({ orgId: v.vendor_org_id, rating: 5, body: '' })}>
                      Leave a review
                    </button>
                  )
                ) : (
                  <span className="ew-per-reviewed">Reviewed</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ew-per-cat">
        <h3>Sponsor fulfillment</h3>
        <ul className="ew-per-stats">
          <li><span>Sponsors</span><span>{digest.sponsor_fulfillment.summary.total_sponsors}</span></li>
          <li><span>Activation items complete</span><span>{digest.sponsor_fulfillment.summary.activations_complete} / {digest.sponsor_fulfillment.summary.activations_total}</span></li>
          <li><span>Items with an issue flagged</span><span>{digest.sponsor_fulfillment.summary.activations_issue}</span></li>
          {digest.sponsor_fulfillment.avg_completion_minutes != null ? (
            <li><span>Avg time to complete</span><span>{Math.round(digest.sponsor_fulfillment.avg_completion_minutes)} min</span></li>
          ) : null}
        </ul>
      </section>

      <section className="ew-per-cat">
        <h3>Incidents</h3>
        <ul className="ew-per-stats">
          <li><span>Total reported</span><span>{digest.incidents.total}</span></li>
          <li><span>Still open</span><span>{digest.incidents.open}</span></li>
          <li><span>High priority open</span><span>{digest.incidents.high_priority}</span></li>
        </ul>
      </section>

      {digest.reconciliation ? (
        <section className="ew-per-cat">
          <h3>Financials</h3>
          <ul className="ew-per-stats">
            <li><span>Invoiced</span><span>{fmtMoney(digest.reconciliation.totals.invoiced_total)}</span></li>
            <li><span>Paid</span><span>{fmtMoney(digest.reconciliation.totals.paid_total)}</span></li>
            <li><span>Outstanding</span><span>{fmtMoney(digest.reconciliation.totals.outstanding_total)}</span></li>
          </ul>
        </section>
      ) : null}

      <section className="ew-per-cat">
        <h3>Recent activity</h3>
        {digest.recent_activity.length === 0 ? (
          <div className="ew-empty"><p>No activity recorded.</p></div>
        ) : (
          <ul className="ew-per-activity">
            {digest.recent_activity.map((a, i) => (
              <li key={i}><span className="ew-per-atime">{new Date(a.at).toLocaleString()}</span><span>{a.label}</span></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const PER_CSS = `
.ew-per { display: flex; flex-direction: column; gap: 18px; }
.ew-per-cat h3 { margin: 0 0 10px; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 19px; color: #123c2e; }
.ew-per-cat ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.ew-per-vrow { padding: 12px 14px; border-radius: 10px; border: 1px solid #e7e1d6; background: #fff; display: flex; flex-direction: column; gap: 8px; }
.ew-per-vhead { display: flex; align-items: center; justify-content: space-between; }
.ew-per-vname { font-size: 13.5px; font-weight: 600; color: #2c2a26; }
.ew-per-vstatus { font-size: 10.5px; text-transform: uppercase; letter-spacing: .4px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: rgba(154,142,94,.15); color: #9a8a5e; }
.ew-per-vstatus.status-complete { background: rgba(18,60,46,.1); color: #123c2e; }
.ew-per-vstatus.status-issue { background: rgba(155,44,44,.1); color: #9b2c2c; }
.ew-per-vmeta { display: flex; flex-wrap: wrap; gap: 10px; font-size: 12px; color: #6b6459; }
.ew-per-warn { color: #9b2c2c; }
.ew-per-notes { font-style: italic; }
.ew-per-reviewform { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.ew-per-reviewform select, .ew-per-reviewform input { font: inherit; font-size: 12.5px; padding: 6px 8px; border: 1px solid #e7e1d6; border-radius: 7px; }
.ew-per-reviewed { font-size: 11px; color: #1E5D4A; font-weight: 600; }
.ew-per-stats li { display: flex; justify-content: space-between; padding: 8px 12px; border-radius: 10px; border: 1px solid #e7e1d6; background: #fff; font-size: 13px; color: #2c2a26; }
.ew-per-activity li { display: flex; gap: 10px; padding: 6px 0; font-size: 12.5px; color: #2c2a26; border-top: 1px solid #f0ece2; }
.ew-per-activity li:first-child { border-top: none; }
.ew-per-atime { color: #9a8a5e; white-space: nowrap; }
`;
