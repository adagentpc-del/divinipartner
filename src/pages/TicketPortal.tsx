import React, { useEffect, useState } from 'react';
import { apiGet, apiSend, ApiError } from '../lib/api';

/**
 * Public ticket purchase flow - Ticket Portal.
 *
 * ticket_packages (nonprofit / charity core) was CRUD-only: a nonprofit could
 * publish individual/VIP/table ticket packages for a fundraising event, but
 * there was no page where anyone could actually buy one. Mirrors
 * SponsorPortal.tsx, simplified: no agreement-signing or fulfillment ladder,
 * since a ticket purchase has nothing to fulfill beyond the seats themselves.
 *
 * One page to:
 *   - browse the ticket packages nonprofits have published
 *     (GET /ticket-portal/packages),
 *   - buy a quantity of tickets (POST /ticket-purchases),
 *   - initiate payment (reuses the platform checkout flow) or confirm a
 *     record-only payment when no processor is configured,
 *   - see purchases and cancel a still-pending one.
 *
 * Zero em dashes.
 */

type Pkg = {
  id: string;
  fundraising_event_id?: string | null;
  organization_id?: string | null;
  name?: string | null;
  type?: string | null;
  price?: string | number | null;
  seats?: number | null;
  quantity?: number | null;
  sold?: number | null;
  status?: string | null;
  event_name?: string | null;
  event_starts_at?: string | null;
};

type Purchase = {
  id: string;
  ticket_package_id?: string | null;
  fundraising_event_id?: string | null;
  buyer_org_id?: string | null;
  quantity?: number | null;
  status: string;
  payment_id?: string | null;
  amount?: string | number | null;
  created_at?: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending payment',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

const TYPE_LABEL: Record<string, string> = {
  individual: 'Individual ticket',
  vip: 'VIP ticket',
  table: 'Table',
  sponsor_table: 'Sponsor table',
};

function money(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export default function TicketPortal() {
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [qtyByPkg, setQtyByPkg] = useState<Record<string, number>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [pkgs, mine] = await Promise.all([
        apiGet<{ packages: Pkg[] }>('/ticket-portal/packages').catch(() => ({ packages: [] })),
        apiGet<{ purchases: Purchase[] }>('/ticket-purchases').catch(() => ({ purchases: [] })),
      ]);
      setPackages(pkgs.packages ?? []);
      setPurchases(mine.purchases ?? []);
    } catch (e) {
      setError((e as Error).message || 'Could not load the ticket portal.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadAll(); }, []);

  async function buy(pkg: Pkg) {
    setNotice(null);
    setError(null);
    setBusyId(pkg.id);
    try {
      const qty = Math.max(1, qtyByPkg[pkg.id] ?? 1);
      await apiSend('POST', '/ticket-purchases', { ticket_package_id: pkg.id, quantity: qty });
      setNotice(`Reserved ${qty} ${TYPE_LABEL[pkg.type ?? ''] ?? 'ticket'}${qty === 1 ? '' : 's'} for ${pkg.name ?? pkg.event_name ?? 'this event'}. Complete payment below to confirm.`);
      await loadAll();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message || 'Could not complete the purchase.');
    } finally {
      setBusyId(null);
    }
  }

  async function pay(p: Purchase) {
    setNotice(null);
    setError(null);
    setBusyId(p.id);
    try {
      const r = await apiSend<{ redirect_url?: string; record_only?: boolean }>('POST', `/ticket-purchases/${p.id}/checkout`, { processor: 'stripe', amount: Number(p.amount ?? 0) });
      if (r.redirect_url) { window.location.href = r.redirect_url; return; }
      await apiSend('POST', `/ticket-purchases/${p.id}/paid`, {});
      setNotice('Payment recorded. Your tickets are confirmed.');
      await loadAll();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message || 'Payment failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(p: Purchase) {
    setNotice(null);
    setError(null);
    setBusyId(p.id);
    try {
      await apiSend('PATCH', `/ticket-purchases/${p.id}/status`, { status: 'cancelled' });
      setNotice('Purchase cancelled.');
      await loadAll();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message || 'Could not cancel.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <Frame>
        <div className="tp-loading"><div className="tp-spin" aria-hidden="true" /><p>Loading the ticket portal</p></div>
      </Frame>
    );
  }

  return (
    <Frame>
      {error ? <div className="tp-alert tp-alert-err">{error}</div> : null}
      {notice ? <div className="tp-alert tp-alert-ok">{notice}</div> : null}

      <section className="tp-section">
        <h2 className="tp-h2">Available tickets</h2>
        <p className="tp-sub">Browse ticket and table packages from nonprofit fundraising events.</p>
        {packages.length === 0 ? (
          <Empty glyph="T" text="No ticket packages are published yet. Check back soon." />
        ) : (
          <div className="tp-grid">
            {packages.map((p) => {
              const remaining = p.quantity != null ? Math.max(0, Number(p.quantity) - Number(p.sold ?? 0)) : null;
              const soldOut = remaining != null && remaining <= 0;
              return (
                <article key={p.id} className="tp-card">
                  <div className="tp-card-top">
                    <div>
                      {p.type ? <span className="tp-type">{TYPE_LABEL[p.type] ?? p.type}</span> : null}
                      <h3 className="tp-card-title">{p.name ?? 'Ticket package'}</h3>
                      <p className="tp-card-event">{p.event_name ?? 'Fundraising event'}</p>
                    </div>
                    <div className="tp-price">{money(p.price)}</div>
                  </div>
                  <div className="tp-card-meta">
                    {p.seats != null ? <span>{p.seats} seat{p.seats === 1 ? '' : 's'} each</span> : null}
                    {remaining != null ? <span>{soldOut ? 'Sold out' : `${remaining} remaining`}</span> : null}
                  </div>
                  {!soldOut ? (
                    <div className="tp-buyrow">
                      <input
                        type="number"
                        min={1}
                        className="tp-qty"
                        value={qtyByPkg[p.id] ?? 1}
                        onChange={(e) => setQtyByPkg((s) => ({ ...s, [p.id]: Math.max(1, Number(e.target.value) || 1) }))}
                      />
                      <button type="button" className="tp-btn" disabled={busyId === p.id} onClick={() => void buy(p)}>Reserve</button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="tp-section">
        <h2 className="tp-h2">Your tickets</h2>
        <p className="tp-sub">Complete payment on a reservation to confirm it, or cancel while still pending.</p>
        {purchases.length === 0 ? (
          <Empty glyph="M" text="You have no ticket purchases yet. Reserve a package above to get started." />
        ) : (
          <div className="tp-list">
            {purchases.map((p) => (
              <div key={p.id} className="tp-row">
                <span className={`tp-status tp-status-${p.status}`}>{STATUS_LABEL[p.status] ?? p.status}</span>
                <span className="tp-rowamt">{money(p.amount)}</span>
                <span className="tp-rowqty">Qty {p.quantity ?? 1}</span>
                <span className="tp-rowid">Order {p.id.slice(0, 8)}</span>
                <span className="tp-rowactions">
                  {p.status === 'pending' ? (
                    <>
                      <button type="button" className="tp-btn sm" disabled={busyId === p.id} onClick={() => void pay(p)}>Pay</button>
                      <button type="button" className="tp-btn sm ghost" disabled={busyId === p.id} onClick={() => void cancel(p)}>Cancel</button>
                    </>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </Frame>
  );
}

function Empty({ glyph, text }: { glyph: string; text: string }) {
  return (
    <div className="tp-empty">
      <span className="tp-empty-glyph" aria-hidden="true">{glyph}</span>
      <p>{text}</p>
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="tp-wrap">
      <style>{CSS}</style>
      <header className="tp-header">
        <span className="tp-kicker">Divini Partners</span>
        <h1 className="tp-title">Ticket Portal</h1>
        <p className="tp-lede">Buy tickets and tables for nonprofit fundraising events.</p>
      </header>
      {children}
    </div>
  );
}

const CSS = `
.tp-wrap {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #6b6459; --dp-line: #e7e1d6;
  max-width: 1120px; margin: 0 auto; padding: 30px 26px 60px;
  background: var(--dp-ivory); color: var(--dp-ink);
  font-family: 'Inter', system-ui, -apple-system, sans-serif; min-height: 100vh;
}
.tp-wrap *, .tp-wrap *::before, .tp-wrap *::after { box-sizing: border-box; }
.tp-header { margin-bottom: 26px; }
.tp-kicker { font-size: 10.5px; letter-spacing: 1.6px; text-transform: uppercase; color: var(--dp-gold); font-weight: 700; }
.tp-title { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 38px; color: var(--dp-emerald); margin: 4px 0 6px; font-weight: 600; }
.tp-lede { color: var(--dp-muted); font-size: 14px; margin: 0; }
.tp-section { margin-top: 30px; }
.tp-h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 24px; color: var(--dp-emerald); margin: 0; font-weight: 600; }
.tp-sub { color: var(--dp-muted); font-size: 13px; margin: 3px 0 16px; }
.tp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.tp-card { background: #fff; border: 1px solid var(--dp-line); border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
.tp-card-top { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.tp-type { font-size: 10px; letter-spacing: .6px; text-transform: uppercase; font-weight: 700; color: var(--dp-emerald); background: rgba(201,163,91,.22); border: 1px solid rgba(201,163,91,.5); padding: 2px 8px; border-radius: 999px; display: inline-block; margin-bottom: 6px; }
.tp-card-title { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 21px; color: var(--dp-emerald); margin: 0; font-weight: 600; }
.tp-card-event { font-size: 12px; color: var(--dp-muted); margin: 2px 0 0; }
.tp-price { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 26px; color: var(--dp-emerald); font-weight: 600; white-space: nowrap; }
.tp-card-meta { display: flex; gap: 12px; font-size: 11.5px; color: var(--dp-muted); }
.tp-buyrow { display: flex; gap: 8px; align-items: center; }
.tp-qty { width: 60px; font: inherit; font-size: 13px; padding: 8px 10px; border: 1px solid var(--dp-line); border-radius: 9px; }
.tp-list { display: flex; flex-direction: column; gap: 10px; }
.tp-row { background: #fff; border: 1px solid var(--dp-line); border-radius: 13px; display: flex; align-items: center; gap: 14px; padding: 14px 18px; }
.tp-rowamt { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 19px; color: var(--dp-emerald); }
.tp-rowqty, .tp-rowid { font-size: 12.5px; color: var(--dp-muted); }
.tp-rowactions { margin-left: auto; display: flex; gap: 8px; }
.tp-status { font-size: 10.5px; letter-spacing: .5px; text-transform: uppercase; font-weight: 700; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--dp-line); }
.tp-status-pending { color: #8a6d1f; background: rgba(201,163,91,.16); border-color: rgba(201,163,91,.4); }
.tp-status-paid { color: #fff; background: var(--dp-emerald); }
.tp-status-cancelled { color: var(--dp-muted); background: rgba(125,119,108,.12); }
.tp-btn { align-self: flex-start; background: var(--dp-emerald); color: #fff; border: 0; border-radius: 9px; font: inherit; font-size: 12.5px; font-weight: 600; padding: 9px 16px; cursor: pointer; transition: background .15s ease; }
.tp-btn:hover { background: var(--dp-emerald-2); }
.tp-btn:disabled { opacity: .5; cursor: not-allowed; }
.tp-btn.sm { padding: 7px 13px; font-size: 12px; }
.tp-btn.ghost { background: transparent; color: var(--dp-emerald); border: 1px solid var(--dp-line); }
.tp-btn.ghost:hover { border-color: var(--dp-emerald); background: rgba(18,60,46,.04); }
.tp-empty { display: flex; align-items: center; gap: 14px; padding: 22px; border: 1px dashed var(--dp-line); border-radius: 13px; background: rgba(247,244,238,.6); }
.tp-empty-glyph { width: 38px; height: 38px; flex: 0 0 38px; border-radius: 10px; background: rgba(201,163,91,.18); color: var(--dp-emerald); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; }
.tp-empty p { margin: 0; font-size: 13px; color: var(--dp-muted); }
.tp-alert { padding: 11px 15px; border-radius: 10px; font-size: 13px; margin-bottom: 14px; }
.tp-alert-err { background: rgba(160,60,40,.1); color: #9b3a26; border: 1px solid rgba(160,60,40,.25); }
.tp-alert-ok { background: rgba(30,93,74,.1); color: var(--dp-emerald-2); border: 1px solid rgba(30,93,74,.25); }
.tp-loading { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 80px 0; color: var(--dp-muted); }
.tp-spin { width: 30px; height: 30px; border-radius: 50%; border: 3px solid var(--dp-line); border-top-color: var(--dp-emerald); animation: tpspin .8s linear infinite; }
@keyframes tpspin { to { transform: rotate(360deg); } }
@media (max-width: 720px) { .tp-row { flex-wrap: wrap; } .tp-rowactions { margin-left: 0; } }
`;
