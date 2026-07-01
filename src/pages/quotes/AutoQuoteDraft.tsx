import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { apiSend, apiGet } from '../../lib/api';
import { pricingV2Active, setPricingV2FromServer, platformFeeRate, feeLineLabel } from '../../lib/pricing';

// Phase 4 - Auto-Quote draft (blueprint 17 + 18). Triggers the auto-quote engine
// for a bid or event, then shows the editable draft: accept/edit line items,
// add/remove, apply a discount, add notes, and submit. Quote-intelligence flags
// surface advisory guidance computed from the data.

type LineItem = {
  inventory_item_id?: string;
  name: string;
  category?: string | null;
  quantity: number;
  unit_price: number;
  unit: string;
  line_total: number;
};

type Draft = {
  currency: string;
  format: string;
  event_id?: string;
  bid_id?: string;
  recommended_items: LineItem[];
  labor: { hours: number; rate: number; total: number };
  fees: { delivery: number; install: number; rush: number; travel: number; rush_multiplier: number };
  add_ons: { name: string; price: number }[];
  exclusions: string[];
  subtotal: number;
  discount: number;
  fees_total: number;
  platform_fee: number;
  total: number;
  expiration_date: string;
};

type Flag = { level: 'info' | 'warning' | 'opportunity'; code: string; message: string };

function money(n?: number) {
  if (n == null || Number.isNaN(Number(n))) return '$0.00';
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AutoQuoteDraft() {
  const params = useParams();
  const [search] = useSearchParams();
  const bidId = params.bidId || search.get('bidId') || undefined;
  const eventId = params.eventId || search.get('eventId') || undefined;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [discountPct, setDiscountPct] = useState('0');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [v2, setV2] = useState<boolean>(pricingV2Active());

  async function generate() {
    if (!bidId && !eventId) {
      setError('A bid or event is required to generate a quote.');
      return;
    }
    setLoading(true);
    setSubmitted(false);
    try {
      const res = await apiSend<{ draft: Draft; flags: Flag[] }>('POST', '/autoquote/generate', { bidId, eventId });
      setDraft(res.draft);
      setItems(res.draft.recommended_items.map((li) => ({ ...li })));
      setFlags(res.flags || []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { generate(); /* eslint-disable-next-line */ }, [bidId, eventId]);

  useEffect(() => {
    let on = true;
    apiGet<{ pricing_v2?: boolean; platform_fee_rate?: number }>('/payments/processors')
      .then((r) => { if (!on) return; setPricingV2FromServer(r); setV2(pricingV2Active()); })
      .catch(() => { /* keep the build-time default */ });
    return () => { on = false; };
  }, []);

  function updateItem(idx: number, patch: Partial<LineItem>) {
    setItems((arr) => {
      const next = [...arr];
      const merged = { ...next[idx], ...patch };
      merged.line_total = Math.round((Number(merged.unit_price) || 0) * (Number(merged.quantity) || 0) * 100) / 100;
      next[idx] = merged;
      return next;
    });
  }

  function removeItem(idx: number) {
    setItems((arr) => arr.filter((_, i) => i !== idx));
  }

  function addItem() {
    setItems((arr) => [...arr, { name: 'New line', quantity: 1, unit_price: 0, unit: 'per_unit', line_total: 0 }]);
  }

  const itemsTotal = items.reduce((s, li) => s + (Number(li.line_total) || 0), 0);
  const laborTotal = draft?.labor.total || 0;
  const feesTotal = draft?.fees_total || 0;
  const subtotal = itemsTotal + laborTotal;
  const discount = Math.round(subtotal * (Number(discountPct) / 100) * 100) / 100;
  // Pricing V2: flat 5% platform fee ADDED ON TOP of the taxable base (the
  // vendor's price). The vendor receives the full taxable base; the client total
  // = base + fee. Legacy: the rate implied by the engine draft (unchanged).
  const legacyRate = draft && draft.subtotal > 0
    ? draft.platform_fee / Math.max(draft.subtotal - draft.discount + draft.fees_total, 1)
    : 0;
  const platformRate = v2 ? platformFeeRate() : legacyRate;
  const taxableBase = subtotal - discount + feesTotal;
  const platformFee = Math.round(taxableBase * platformRate * 100) / 100;
  const grandTotal = Math.round((taxableBase + platformFee) * 100) / 100;

  async function submit() {
    if (!draft) return;
    setSubmitting(true);
    try {
      const lineItems = items.map((li) => ({
        inventory_item_id: li.inventory_item_id,
        name: li.name,
        quantity: li.quantity,
        unit_price: li.unit_price,
        unit: li.unit,
        line_total: li.line_total,
      }));
      const payload = {
        bid_id: draft.bid_id,
        event_id: draft.event_id,
        line_items: lineItems,
        labor: draft.labor,
        fees: draft.fees,
        discount,
        subtotal,
        platform_fee: platformFee,
        total: grandTotal,
        notes,
        expiration_date: draft.expiration_date,
        format: draft.format,
        source: 'auto_quote',
      };
      // The existing quote flow accepts the standardized draft. If a quotes
      // endpoint is mounted, this submits; otherwise the caller can wire it.
      await apiSend('POST', '/quotes', payload);
      setSubmitted(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="aq">
      <style>{CSS}</style>

      <header className="aq-head">
        <div>
          <span className="aq-kicker">Vendor Workspace</span>
          <h1 className="aq-title">Auto-Quote Draft</h1>
          <p className="aq-sub">
            {bidId ? `For bid ${bidId.slice(0, 8)}` : eventId ? `For event ${eventId.slice(0, 8)}` : 'No bid or event selected'}
          </p>
        </div>
        <button type="button" className="aq-btn ghost" onClick={generate} disabled={loading}>{loading ? 'Generating.' : 'Regenerate'}</button>
      </header>

      {error && <div className="aq-error">{error}</div>}
      {submitted && <div className="aq-ok">Quote submitted. It is now in your quotes pipeline.</div>}

      {flags.length > 0 && (
        <section className="aq-flags">
          {flags.map((f, i) => (
            <div key={i} className={`aq-flag ${f.level}`}>
              <span className="aq-flag-dot" aria-hidden="true" />
              <span>{f.message}</span>
            </div>
          ))}
        </section>
      )}

      {loading ? (
        <div className="aq-empty">Generating draft.</div>
      ) : !draft ? (
        <div className="aq-empty">No draft yet.</div>
      ) : (
        <>
          <section className="aq-section">
            <div className="aq-section-head">
              <h2>Recommended line items</h2>
              <button type="button" className="aq-btn ghost sm" onClick={addItem}>Add line</button>
            </div>
            <div className="aq-table">
              <div className="aq-tr aq-th">
                <span>Item</span><span>Qty</span><span>Unit price</span><span>Unit</span><span>Total</span><span></span>
              </div>
              {items.length === 0 && <div className="aq-muted">No line items. The engine found no matching inventory.</div>}
              {items.map((li, idx) => (
                <div key={idx} className="aq-tr">
                  <input value={li.name} onChange={(e) => updateItem(idx, { name: e.target.value })} />
                  <input type="number" value={li.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} />
                  <input type="number" value={li.unit_price} onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })} />
                  <input value={li.unit} onChange={(e) => updateItem(idx, { unit: e.target.value })} />
                  <span className="aq-cell-total">{money(li.line_total)}</span>
                  <button type="button" className="aq-x" onClick={() => removeItem(idx)} aria-label="Remove">x</button>
                </div>
              ))}
            </div>
          </section>

          <div className="aq-cols">
            <section className="aq-section">
              <h2>Labor and fees</h2>
              <div className="aq-kv"><span>Labor ({draft.labor.hours}h @ {money(draft.labor.rate)})</span><strong>{money(laborTotal)}</strong></div>
              <div className="aq-kv"><span>Delivery</span><strong>{money(draft.fees.delivery)}</strong></div>
              <div className="aq-kv"><span>Install</span><strong>{money(draft.fees.install)}</strong></div>
              <div className="aq-kv"><span>Rush (x{draft.fees.rush_multiplier})</span><strong>{money(draft.fees.rush)}</strong></div>
              <div className="aq-kv"><span>Travel</span><strong>{money(draft.fees.travel)}</strong></div>
              {draft.add_ons.length > 0 && (
                <>
                  <div className="aq-subhead">Optional add-ons</div>
                  {draft.add_ons.map((a, i) => (
                    <div key={i} className="aq-kv aq-muted"><span>{a.name}</span><span>{money(a.price)}</span></div>
                  ))}
                </>
              )}
            </section>

            <section className="aq-section aq-summary">
              <h2>Quote summary</h2>
              <div className="aq-kv"><span>Items</span><strong>{money(itemsTotal)}</strong></div>
              <div className="aq-kv"><span>Labor</span><strong>{money(laborTotal)}</strong></div>
              <div className="aq-kv"><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
              <div className="aq-kv">
                <span>Discount
                  <input className="aq-pct" type="number" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} />%
                </span>
                <strong>- {money(discount)}</strong>
              </div>
              <div className="aq-kv"><span>Fees</span><strong>{money(feesTotal)}</strong></div>
              {v2 ? (
                <div className="aq-kv aq-vendornet"><span>You receive (your full quote)</span><strong>{money(taxableBase)}</strong></div>
              ) : null}
              <div className="aq-kv"><span>{v2 ? feeLineLabel() : 'Platform fee'}</span><strong>{v2 ? `+ ${money(platformFee)}` : money(platformFee)}</strong></div>
              <div className="aq-kv aq-grand"><span>{v2 ? 'Client pays' : 'Suggested total'}</span><strong>{money(grandTotal)}</strong></div>
              {v2 ? (
                <p className="aq-vendormsg">You receive your full quote of {money(taxableBase)}. The {feeLineLabel().toLowerCase()} is added on top and paid by the client.</p>
              ) : null}
              <p className="aq-expiry">Valid until {new Date(draft.expiration_date).toLocaleDateString()}</p>
            </section>
          </div>

          <section className="aq-section">
            <h2>Exclusions</h2>
            <ul className="aq-excl">
              {draft.exclusions.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </section>

          <section className="aq-section">
            <h2>Notes to client</h2>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add a personal note, terms, or context for this quote." />
          </section>

          <div className="aq-actions">
            <button type="button" className="aq-btn" disabled={submitting} onClick={submit}>{submitting ? 'Submitting.' : 'Submit quote'}</button>
          </div>
        </>
      )}
    </div>
  );
}

const CSS = `
.aq { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --iv:#F7F4EE; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:1180px; }
.aq *,.aq *::before,.aq *::after { box-sizing:border-box; }
.aq h1,.aq h2 { font-family:'Cormorant Garamond',Georgia,serif; margin:0; }
.aq-head { display:flex; justify-content:space-between; align-items:flex-end; gap:16px; margin-bottom:18px; flex-wrap:wrap; }
.aq-kicker { font-size:10.5px; letter-spacing:1.4px; text-transform:uppercase; color:var(--g); font-weight:600; }
.aq-title { font-size:28px; color:var(--e); line-height:1.1; }
.aq-sub { font-size:13px; color:var(--mut); margin:4px 0 0; }
.aq-error { background:#fff3f1; border:1px solid #e7b7ab; color:#9a3a28; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.aq-ok { background:rgba(30,93,74,.1); border:1px solid rgba(30,93,74,.3); color:var(--e2); padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.aq-empty { padding:40px; text-align:center; color:var(--mut); border:1px dashed var(--ln); border-radius:14px; background:rgba(247,244,238,.55); }
.aq-flags { display:flex; flex-direction:column; gap:8px; margin-bottom:16px; }
.aq-flag { display:flex; align-items:center; gap:10px; padding:10px 14px; border-radius:10px; font-size:12.5px; border:1px solid var(--ln); background:#fff; }
.aq-flag-dot { width:8px; height:8px; border-radius:50%; flex:0 0 8px; }
.aq-flag.warning { background:#fff8ef; border-color:#e7cfa5; }
.aq-flag.warning .aq-flag-dot { background:#c98a2b; }
.aq-flag.opportunity { background:rgba(30,93,74,.07); border-color:rgba(30,93,74,.25); }
.aq-flag.opportunity .aq-flag-dot { background:var(--e2); }
.aq-flag.info .aq-flag-dot { background:var(--mut); }
.aq-section { background:#fff; border:1px solid var(--ln); border-radius:14px; padding:18px; margin-bottom:14px; }
.aq-section h2 { font-size:20px; color:var(--e); margin-bottom:12px; }
.aq-section-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
.aq-section-head h2 { margin-bottom:0; }
.aq-table { display:flex; flex-direction:column; gap:8px; }
.aq-tr { display:grid; grid-template-columns:1fr 70px 110px 90px 100px 28px; gap:8px; align-items:center; }
.aq-th { font-size:11px; color:var(--mut); text-transform:uppercase; letter-spacing:.5px; font-weight:600; }
.aq-tr input { font:inherit; font-size:12.5px; padding:7px 9px; border:1px solid var(--ln); border-radius:8px; background:#fff; min-width:0; }
.aq-cell-total { font-size:12.5px; font-weight:600; color:var(--e); text-align:right; }
.aq-x { background:transparent; border:1px solid var(--ln); border-radius:8px; cursor:pointer; color:var(--mut); width:28px; height:30px; }
.aq-muted { color:var(--mut); font-size:12.5px; }
.aq-cols { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.aq-kv { display:flex; justify-content:space-between; align-items:center; gap:10px; font-size:13px; padding:6px 0; border-bottom:1px dashed var(--ln); }
.aq-kv:last-child { border-bottom:0; }
.aq-kv strong { color:var(--ink); }
.aq-subhead { font-size:11px; text-transform:uppercase; letter-spacing:.5px; color:var(--mut); font-weight:600; margin-top:10px; }
.aq-pct { width:54px; font:inherit; font-size:12px; padding:4px 6px; border:1px solid var(--ln); border-radius:6px; margin:0 4px; }
.aq-summary .aq-grand { font-size:15px; border-top:2px solid var(--ln); border-bottom:0; margin-top:6px; padding-top:10px; }
.aq-summary .aq-grand strong { color:var(--e); font-size:18px; }
.aq-vendornet strong { color:var(--e); }
.aq-vendormsg { font-size:11.5px; color:var(--mut); margin:8px 0 0; line-height:1.5; }
.aq-expiry { font-size:11.5px; color:var(--mut); margin:8px 0 0; }
.aq-excl { margin:0; padding-left:18px; font-size:12.5px; color:var(--mut); display:flex; flex-direction:column; gap:4px; }
.aq-section textarea { width:100%; min-height:80px; font:inherit; font-size:13px; padding:10px 12px; border:1px solid var(--ln); border-radius:9px; background:var(--iv); resize:vertical; }
.aq-actions { display:flex; justify-content:flex-end; }
.aq-btn { background:var(--e); color:#fff; border:0; border-radius:9px; font:inherit; font-size:13px; font-weight:600; padding:10px 24px; cursor:pointer; }
.aq-btn:hover { background:var(--e2); }
.aq-btn.ghost { background:transparent; color:var(--e); border:1px solid var(--ln); }
.aq-btn.ghost.sm { padding:6px 14px; font-size:12px; }
.aq-btn:disabled { opacity:.6; cursor:default; }
@media (max-width:860px){ .aq-cols { grid-template-columns:1fr; } .aq-tr { grid-template-columns:1fr 60px 90px 70px 80px 26px; } }
`;
