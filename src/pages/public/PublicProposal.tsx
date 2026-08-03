/**
 * Public shareable proposal page (/p/:token).
 *
 * A client who received a Divini Proposal Studio link opens it with no
 * account, sees a clear breakdown of what is being proposed, and can accept
 * or decline. No AI copy, no generated pricing -- the numbers shown are
 * exactly what the sender entered. Self-contained styling. Zero em dashes.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet, apiSend } from '../../lib/api';

type LineItem = { description: string; quantity: number; unit_price_cents: number };
type Totals = { subtotal_cents: number; discount_cents: number; tax_cents: number; total_cents: number };
type PublicProposalView = {
  title: string;
  client_name: string | null;
  status: string;
  currency: string;
  valid_until: string | null;
  notes: string | null;
  line_items: LineItem[];
  totals: Totals;
};

function money(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function PublicProposal() {
  const { token = '' } = useParams();
  const [view, setView] = useState<PublicProposalView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [showDecline, setShowDecline] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const r = await apiGet<{ proposal: PublicProposalView }>(`/public/proposals/${encodeURIComponent(token)}`);
      setView(r.proposal);
    } catch {
      setError('This proposal link is no longer available.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, [token]);

  async function respond(decision: 'accept' | 'decline') {
    setBusy(true);
    setError('');
    try {
      await apiSend('POST', `/public/proposals/${encodeURIComponent(token)}/respond`, {
        decision,
        decline_reason: decision === 'decline' ? declineReason.trim() || null : undefined,
      });
      await load();
      setShowDecline(false);
    } catch (e) {
      setError((e as Error).message || 'Could not record your response.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pp">
      <style>{CSS}</style>
      {loading && <p className="pp-muted">Loading.</p>}
      {!loading && error && <p className="pp-error">{error}</p>}
      {!loading && view && (
        <div className="pp-card">
          <span className={'pp-badge ' + view.status}>{view.status}</span>
          <h1>{view.title}</h1>
          {view.client_name && <p className="pp-for">Prepared for {view.client_name}</p>}
          {view.valid_until && <p className="pp-valid">Valid until {new Date(view.valid_until).toLocaleDateString()}</p>}

          <div className="pp-items">
            {view.line_items.map((li, i) => (
              <div className="pp-item" key={i}>
                <span className="pp-item-desc">{li.description} <span className="pp-item-qty">&times;{li.quantity}</span></span>
                <span>{money(li.quantity * li.unit_price_cents)}</span>
              </div>
            ))}
          </div>

          <div className="pp-totals">
            <div><span>Subtotal</span><span>{money(view.totals.subtotal_cents)}</span></div>
            {view.totals.discount_cents > 0 && <div><span>Discount</span><span>-{money(view.totals.discount_cents)}</span></div>}
            {view.totals.tax_cents > 0 && <div><span>Tax</span><span>{money(view.totals.tax_cents)}</span></div>}
            <div className="pp-total-row"><span>Total</span><span>{money(view.totals.total_cents)}</span></div>
          </div>

          {view.notes && <p className="pp-notes">{view.notes}</p>}

          {(view.status === 'sent' || view.status === 'viewed') && (
            <div className="pp-actions">
              {!showDecline ? (
                <>
                  <button className="pp-btn" onClick={() => respond('accept')} disabled={busy}>{busy ? 'Sending.' : 'Accept proposal'}</button>
                  <button className="pp-btn ghost" onClick={() => setShowDecline(true)} disabled={busy}>Decline</button>
                </>
              ) : (
                <div className="pp-decline">
                  <textarea rows={2} placeholder="Reason (optional)" value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} />
                  <div className="pp-decline-actions">
                    <button className="pp-btn ghost" onClick={() => setShowDecline(false)}>Back</button>
                    <button className="pp-btn danger" onClick={() => respond('decline')} disabled={busy}>{busy ? 'Sending.' : 'Confirm decline'}</button>
                  </div>
                </div>
              )}
            </div>
          )}
          {view.status === 'accepted' && <p className="pp-resolved accepted">You accepted this proposal.</p>}
          {view.status === 'declined' && <p className="pp-resolved declined">You declined this proposal.</p>}
        </div>
      )}
    </div>
  );
}

const CSS = `
.pp { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  --bg:#fbf9f4; font-family:'Inter',system-ui,sans-serif; color:var(--ink); background:var(--bg);
  min-height:100vh; padding:32px 18px; }
.pp *,.pp *::before,.pp *::after { box-sizing:border-box; }
.pp-muted { text-align:center; color:var(--mut); font-size:13px; }
.pp-error { text-align:center; color:#9a3a28; font-size:14px; margin-top:40px; }
.pp-card { max-width:480px; margin:0 auto; background:#fff; border:1px solid var(--ln); border-radius:16px; padding:26px 22px; }
.pp-card h1 { font-size:22px; color:var(--e); margin:8px 0 4px; font-weight:800; }
.pp-for { font-size:13.5px; color:var(--mut); margin:0; }
.pp-valid { font-size:12px; color:var(--mut); margin:2px 0 0; }
.pp-badge { display:inline-block; font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.3px; padding:3px 9px; border-radius:999px; background:var(--bg); color:var(--mut); border:1px solid var(--ln); }
.pp-badge.sent, .pp-badge.viewed { background:#fbf3e1; color:#8a6a1f; border-color:#eddcb0; }
.pp-badge.accepted { background:#eaf3ee; color:#1E5D4A; border-color:#c7e0d1; }
.pp-badge.declined { background:#fbe9e6; color:#9a3a28; border-color:#f0c9c1; }

.pp-items { margin-top:20px; display:flex; flex-direction:column; gap:8px; border-top:1px solid var(--ln); padding-top:14px; }
.pp-item { display:flex; justify-content:space-between; font-size:13.5px; gap:10px; }
.pp-item-qty { color:var(--mut); font-size:12px; }

.pp-totals { margin-top:14px; border-top:1px solid var(--ln); padding-top:12px; display:flex; flex-direction:column; gap:6px; }
.pp-totals > div { display:flex; justify-content:space-between; font-size:13px; }
.pp-total-row { font-weight:700; font-size:17px; color:var(--e); border-top:1px dashed var(--ln); padding-top:8px; margin-top:2px; }

.pp-notes { margin-top:16px; font-size:12.5px; color:var(--mut); white-space:pre-wrap; line-height:1.5; }

.pp-actions { margin-top:22px; display:flex; gap:10px; flex-wrap:wrap; }
.pp-btn { flex:1; background:var(--e); color:#fff; border:none; border-radius:10px; padding:12px 16px; font-size:14px; font-weight:700; cursor:pointer; }
.pp-btn.ghost { background:#fff; color:var(--e); border:1px solid var(--ln); }
.pp-btn.danger { background:#9a3a28; }
.pp-btn:disabled { opacity:.6; cursor:default; }
.pp-decline { display:flex; flex-direction:column; gap:8px; width:100%; }
.pp-decline textarea { border:1px solid var(--ln); border-radius:8px; padding:8px 11px; font-size:13.5px; font-family:inherit; width:100%; }
.pp-decline-actions { display:flex; gap:8px; }
.pp-decline-actions .pp-btn { flex:1; }

.pp-resolved { margin-top:22px; text-align:center; font-weight:700; font-size:14px; padding:12px; border-radius:10px; }
.pp-resolved.accepted { background:#eaf3ee; color:#1E5D4A; }
.pp-resolved.declined { background:#fbe9e6; color:#9a3a28; }

@media(max-width:420px){ .pp-card { padding:20px 16px; } }
`;
