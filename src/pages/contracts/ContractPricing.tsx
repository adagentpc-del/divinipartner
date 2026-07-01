/**
 * Contract Pricing Partnerships (blueprint section 22). Route: /contract-pricing.
 *
 * Premier-gated management of preferential pricing partnerships between two orgs:
 * discount %, fixed rate, or volume tier, scoped to categories + venues, over a
 * date range, with an approval status. When the org is not Premier the page shows
 * an upsell. Self-contained styles. Zero em dashes.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../../lib/api';

type Contract = {
  id: string;
  name: string | null;
  partner_type: string | null;
  pricing_type: string | null;
  discount_pct: string | null;
  fixed_rate: string | null;
  volume_tier: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  approval_status: string | null;
  applicable_categories: string[] | null;
};

const PARTNER_TYPE_LABELS: Record<string, string> = {
  venue_vendor: 'Venue and vendor',
  vendor_vendor: 'Vendor and vendor',
  planner_vendor: 'Planner and vendor',
  venue_planner: 'Venue and planner',
  supplier_vendor: 'Supplier and vendor',
  preferred_network: 'Preferred network',
};

function pricingSummary(c: Contract): string {
  if (c.pricing_type === 'discount' && c.discount_pct != null) return `${(Number(c.discount_pct) * 100).toFixed(1)}% discount`;
  if (c.pricing_type === 'fixed_rate' && c.fixed_rate != null) {
    return `Fixed ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(c.fixed_rate))}`;
  }
  if (c.pricing_type === 'volume_tier') return `Volume tier ${c.volume_tier ?? ''}`.trim();
  return c.pricing_type ?? '-';
}

export default function ContractPricing() {
  const [rows, setRows] = useState<Contract[]>([]);
  const [premier, setPremier] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    apiGet<{ contracts: Contract[]; premier: boolean }>('/contract-pricing')
      .then((r) => { if (on) { setRows(r.contracts ?? []); setPremier(!!r.premier); } })
      .catch(() => { /* empty state */ })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, []);

  return (
    <div className="dpcp">
      <style>{CSS}</style>

      <header className="dpcp-head">
        <div>
          <span className="dpcp-kicker">Premier feature</span>
          <h1 className="dpcp-title">Contract pricing partnerships</h1>
          <p className="dpcp-sub">Lock in preferential pricing with partner organizations.</p>
        </div>
        {premier ? <button type="button" className="dpcp-btn primary">New partnership</button> : null}
      </header>

      {loading ? (
        <div className="dpcp-empty">Loading partnerships...</div>
      ) : !premier ? (
        <div className="dpcp-upsell">
          <span className="dpcp-lock" aria-hidden="true">P</span>
          <h2 className="dpcp-upsell-title">Premier required</h2>
          <p>Contract pricing partnerships let you set discounts, fixed rates, and volume tiers with trusted partners. Upgrade to Premier to create and manage partnerships.</p>
          <button type="button" className="dpcp-btn primary">Upgrade to Premier</button>
        </div>
      ) : rows.length === 0 ? (
        <div className="dpcp-empty">
          <p>No partnerships yet. Create one to offer or receive preferential pricing with a partner organization.</p>
        </div>
      ) : (
        <div className="dpcp-grid">
          {rows.map((c) => (
            <div key={c.id} className="dpcp-card">
              <div className="dpcp-card-top">
                <h3>{c.name ?? PARTNER_TYPE_LABELS[c.partner_type ?? ''] ?? 'Partnership'}</h3>
                <span className={`dpcp-pill ap-${c.approval_status ?? 'pending'}`}>{c.approval_status ?? 'pending'}</span>
              </div>
              <div className="dpcp-pricing">{pricingSummary(c)}</div>
              <div className="dpcp-meta">{PARTNER_TYPE_LABELS[c.partner_type ?? ''] ?? c.partner_type}</div>
              {c.start_date || c.end_date ? (
                <div className="dpcp-dates">
                  {c.start_date ? new Date(c.start_date).toLocaleDateString() : 'open'}
                  {' to '}
                  {c.end_date ? new Date(c.end_date).toLocaleDateString() : 'ongoing'}
                </div>
              ) : null}
              {c.applicable_categories?.length ? (
                <div className="dpcp-cats">
                  {c.applicable_categories.map((cat, i) => <span key={i} className="dpcp-cat">{cat}</span>)}
                </div>
              ) : null}
              <div className="dpcp-signrow">
                <Link
                  className="dpcp-sign"
                  to={`/sign/contract_pricing_agreement?related_object_type=contract_pricing&related_object_id=${encodeURIComponent(c.id)}&title=${encodeURIComponent(c.name ?? 'Contract Pricing Agreement')}`}
                >
                  Sign agreement
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const CSS = `
.dpcp {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--dp-ink);
}
.dpcp h1, .dpcp h2, .dpcp h3 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }
.dpcp-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
.dpcp-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--dp-gold); font-weight: 600; }
.dpcp-title { font-size: 30px; color: var(--dp-emerald); line-height: 1.1; margin-top: 2px; }
.dpcp-sub { font-size: 13px; color: var(--dp-muted); margin: 4px 0 0; }

.dpcp-btn { font: inherit; font-size: 13px; font-weight: 600; padding: 9px 16px; border-radius: 10px; cursor: pointer; border: 1px solid transparent; }
.dpcp-btn.primary { background: var(--dp-emerald); color: #fff; }
.dpcp-btn.primary:hover { background: var(--dp-emerald-2); }

.dpcp-empty { background: #fff; border: 1px dashed var(--dp-line); border-radius: 14px; padding: 26px; color: var(--dp-muted); font-size: 13.5px; line-height: 1.55; }

.dpcp-upsell { background: linear-gradient(120deg, var(--dp-emerald), var(--dp-emerald-2)); color: var(--dp-ivory); border: 1px solid rgba(201,163,91,.4); border-radius: 16px; padding: 30px; text-align: center; }
.dpcp-lock { display: inline-flex; align-items: center; justify-content: center; width: 46px; height: 46px; border-radius: 12px; background: linear-gradient(135deg, var(--dp-gold), #b58e44); color: var(--dp-emerald); font-weight: 800; font-size: 22px; margin-bottom: 12px; }
.dpcp-upsell-title { font-size: 24px; color: #fff; margin-bottom: 8px; }
.dpcp-upsell p { font-size: 13px; color: rgba(247,244,238,.85); line-height: 1.6; max-width: 460px; margin: 0 auto 18px; }

.dpcp-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.dpcp-card { background: #fff; border: 1px solid var(--dp-line); border-radius: 14px; padding: 18px 20px; display: flex; flex-direction: column; gap: 7px; }
.dpcp-card-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.dpcp-card h3 { font-size: 19px; color: var(--dp-emerald); }
.dpcp-pricing { font-size: 14px; font-weight: 600; color: var(--dp-ink); }
.dpcp-meta { font-size: 12px; color: var(--dp-muted); }
.dpcp-dates { font-size: 11.5px; color: var(--dp-muted); }
.dpcp-cats { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.dpcp-cat { font-size: 11px; background: var(--dp-ivory); border: 1px solid var(--dp-line); border-radius: 999px; padding: 2px 9px; color: var(--dp-ink); }
.dpcp-pill { font-size: 10.5px; font-weight: 600; padding: 2px 9px; border-radius: 999px; border: 1px solid var(--dp-line); background: var(--dp-ivory); color: var(--dp-muted); text-transform: capitalize; }
.dpcp-pill.ap-approved { background: rgba(30,93,74,.12); color: var(--dp-emerald-2); border-color: rgba(30,93,74,.3); }
.dpcp-pill.ap-declined, .dpcp-pill.ap-expired { background: rgba(155,44,44,.1); color: #9b2c2c; border-color: rgba(155,44,44,.35); }
.dpcp-pill.ap-pending { background: rgba(201,163,91,.16); color: #8a5a12; border-color: rgba(201,163,91,.45); }
.dpcp-signrow { display: flex; justify-content: flex-end; margin-top: 8px; }
.dpcp-sign { font-size: 12.5px; font-weight: 600; text-decoration: none; padding: 7px 14px; border-radius: 9px; background: var(--dp-emerald); color: #fff; }
.dpcp-sign:hover { background: var(--dp-emerald-2); }

@media (max-width: 1024px) { .dpcp-grid { grid-template-columns: 1fr; } }
`;
