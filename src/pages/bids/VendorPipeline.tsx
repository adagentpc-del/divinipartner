import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiSend } from '../../lib/api';

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

type QuoteMessage = {
  id: string;
  author_side: string;
  body: string;
  proposed_amount: string | null;
  counter_status: 'open' | 'accepted' | 'declined' | null;
  created_at: string;
};

export default function VendorPipeline() {
  const [rows, setRows] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openQuoteId, setOpenQuoteId] = useState<string | null>(null);
  const [thread, setThread] = useState<QuoteMessage[]>([]);
  const [threadBusy, setThreadBusy] = useState(false);

  function load() {
    apiGet<{ opportunities: Opportunity[] }>('/procurement-pipeline/mine')
      .then((r) => setRows(r.opportunities))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function openThread(quoteId: string) {
    setOpenQuoteId(quoteId);
    try {
      const r = await apiGet<{ messages: QuoteMessage[] }>(`/quotes/${quoteId}/messages`);
      setThread(r.messages);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function respond(quoteId: string, messageId: string, action: 'accept' | 'decline') {
    setThreadBusy(true);
    try {
      await apiSend('POST', `/quotes/${quoteId}/counteroffer/${messageId}/respond`, { action });
      await openThread(quoteId);
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setThreadBusy(false);
    }
  }

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
                  <div key={r.bid_id}>
                    <button
                      type="button"
                      className="vp-row"
                      disabled={!r.quote_id}
                      onClick={() => r.quote_id && (openQuoteId === r.quote_id ? setOpenQuoteId(null) : openThread(r.quote_id))}
                    >
                      <div>
                        <div className="vp-cat">{r.category ?? 'General'}</div>
                        <div className="vp-event">{r.event_name ?? 'Event'}</div>
                      </div>
                      {r.quote_total ? <div className="vp-amount">${Number(r.quote_total).toLocaleString()}</div> : null}
                    </button>
                    {openQuoteId === r.quote_id ? (
                      <div className="vp-thread">
                        {thread.length === 0 ? (
                          <p className="vp-threadempty">No messages yet.</p>
                        ) : (
                          thread.map((m) => (
                            <div key={m.id} className="vp-msg">
                              <div className="vp-msgmeta">{m.author_side === 'vendor' ? 'You' : 'Client'}</div>
                              <div className="vp-msgbody">{m.body}</div>
                              {m.proposed_amount ? (
                                <div className="vp-counter">
                                  <span>Counteroffer: ${Number(m.proposed_amount).toLocaleString()}</span>
                                  <span className={`vp-tag counter-${m.counter_status}`}>{m.counter_status}</span>
                                  {m.counter_status === 'open' ? (
                                    m.author_side === 'vendor' ? (
                                      <span className="vp-counterwait">Waiting on the client</span>
                                    ) : (
                                      <span className="vp-counteracts">
                                        <button type="button" className="vp-btn sm" disabled={threadBusy} onClick={() => respond(r.quote_id!, m.id, 'accept')}>Accept</button>
                                        <button type="button" className="vp-btn ghost sm" disabled={threadBusy} onClick={() => respond(r.quote_id!, m.id, 'decline')}>Decline</button>
                                      </span>
                                    )
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                    ) : null}
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
.vp-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #fff; border: 1px solid #e7e1d6; border-radius: 10px; padding: 12px 14px; width: 100%; text-align: left; font: inherit; cursor: pointer; }
.vp-row:disabled { cursor: default; opacity: .85; }
.vp-thread { background: #faf8f3; border: 1px solid #e7e1d6; border-top: none; border-radius: 0 0 10px 10px; margin-top: -8px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.vp-threadempty { margin: 0; font-size: 12px; color: #6b6459; }
.vp-msg { font-size: 12.5px; color: #2c2a26; border-top: 1px solid #eee7d9; padding-top: 8px; }
.vp-msg:first-child { border-top: none; padding-top: 0; }
.vp-msgmeta { font-weight: 600; font-size: 11px; color: #6b6459; margin-bottom: 2px; }
.vp-counter { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 6px; font-size: 12px; }
.vp-counteracts { display: flex; gap: 6px; }
.vp-counterwait { font-size: 11.5px; color: #9a8a5e; font-style: italic; }
.vp-tag { font-size: 10px; letter-spacing: .4px; text-transform: uppercase; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
.vp-tag.counter-open { background: rgba(201,163,91,.2); color: #8a6d27; }
.vp-tag.counter-accepted { background: rgba(30,93,74,.12); color: #1E5D4A; }
.vp-tag.counter-declined { background: #f3e9e9; color: #8a4a4a; }
.vp-btn { font: inherit; padding: 6px 12px; border-radius: 7px; border: 1px solid #123c2e; background: #123c2e; color: #fff; cursor: pointer; font-size: 12px; }
.vp-btn.ghost { background: transparent; color: #123c2e; }
.vp-btn.sm { padding: 5px 10px; }
.vp-cat { font-size: 13.5px; font-weight: 600; color: #2c2a26; }
.vp-event { font-size: 12px; color: #6b6459; }
.vp-amount { font-size: 13px; font-weight: 600; color: #1E5D4A; white-space: nowrap; }
.vp-muted { padding: 24px; color: #6b6459; }
.vp-error { padding: 24px; color: #9b2c2c; }
.vp-empty { padding: 24px; color: #6b6459; }
`;
