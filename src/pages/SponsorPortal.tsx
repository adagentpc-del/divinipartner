import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

/**
 * Workstream C - Sponsor Portal.
 *
 * One page for a sponsor to:
 *   - browse the sponsorship packages nonprofits have published
 *     (GET /sponsor-portal/packages),
 *   - express interest (POST /sponsor-purchases),
 *   - see their purchases and where each one is in the lifecycle,
 *   - sign the agreement (attach a document url -> agreed),
 *   - initiate payment (reuses the platform checkout flow) or confirm a
 *     record-only payment when no processor is configured,
 *   - upload a logo and ad artwork (url convention, like the rest of the app),
 *   - add guest names up to the package allotment,
 *   - and view fulfillment task status per purchase.
 *
 * Read/empty/loading/error states are all handled. Luxury ivory + champagne
 * theme, self-contained styles so the page needs no shared CSS.
 *
 * Zero em dashes.
 */

type Pkg = {
  id: string;
  fundraising_event_id?: string | null;
  organization_id?: string | null;
  tier?: string | null;
  name?: string | null;
  price?: string | number | null;
  benefits?: unknown;
  tickets_included?: number | null;
  quantity?: number | null;
  sold?: number | null;
  status?: string | null;
  event_name?: string | null;
  event_starts_at?: string | null;
};

type Purchase = {
  id: string;
  sponsorship_package_id?: string | null;
  fundraising_event_id?: string | null;
  sponsor_org_id?: string | null;
  status: string;
  agreement_doc_id?: string | null;
  logo_url?: string | null;
  ad_file_url?: string | null;
  guest_allotment?: number | null;
  payment_id?: string | null;
  amount?: string | number | null;
  created_at?: string;
};

type Task = {
  id: string;
  label?: string | null;
  status: string;
  due_date?: string | null;
  completed_at?: string | null;
};

type Guest = { id: string; name?: string | null; email?: string | null };

type Detail = { purchase: Purchase; tasks: Task[]; guests: Guest[]; guest_count: number };

const STATUS_LABEL: Record<string, string> = {
  interested: 'Interested',
  agreed: 'Agreement signed',
  paid: 'Paid',
  fulfilled: 'Fulfilled',
  cancelled: 'Cancelled',
};

const TASK_LABEL: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  waiting_on_sponsor: 'Waiting on you',
  completed: 'Completed',
  issue: 'Issue',
};

function money(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function benefitList(b: unknown): string[] {
  if (Array.isArray(b)) return b.map((x) => (typeof x === 'string' ? x : String((x as { label?: string })?.label ?? ''))).filter(Boolean);
  if (b && typeof b === 'object') return Object.values(b as Record<string, unknown>).map(String).filter(Boolean);
  return [];
}

export default function SponsorPortal() {
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [pkgs, mine] = await Promise.all([
        apiGet<{ packages: Pkg[] }>('/sponsor-portal/packages').catch(() => ({ packages: [] })),
        apiGet<{ purchases: Purchase[] }>('/sponsor-purchases').catch(() => ({ purchases: [] })),
      ]);
      setPackages(pkgs.packages ?? []);
      setPurchases(mine.purchases ?? []);
    } catch (e) {
      setError((e as Error).message || 'Could not load the sponsor portal.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadAll(); }, []);

  async function openDetail(id: string) {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const d = await apiGet<Detail>(`/sponsor-purchases/${id}`);
      setDetail(d);
    } catch (e) {
      setError((e as Error).message || 'Could not load this sponsorship.');
    } finally {
      setDetailLoading(false);
    }
  }

  async function expressInterest(pkg: Pkg) {
    setNotice(null);
    try {
      await apiSend('POST', '/sponsor-purchases', { sponsorship_package_id: pkg.id });
      setNotice(`Interest submitted for ${pkg.name ?? 'this package'}. The organizer has been notified.`);
      await loadAll();
    } catch (e) {
      setError((e as Error).message || 'Could not submit interest.');
    }
  }

  async function refreshDetail(id: string) {
    try {
      const d = await apiGet<Detail>(`/sponsor-purchases/${id}`);
      setDetail(d);
    } catch { /* keep prior */ }
    await loadAll();
  }

  if (loading) {
    return (
      <Frame>
        <div className="sp-loading"><div className="sp-spin" aria-hidden="true" /><p>Loading the sponsor portal</p></div>
      </Frame>
    );
  }

  return (
    <Frame>
      {error ? <div className="sp-alert sp-alert-err">{error}</div> : null}
      {notice ? <div className="sp-alert sp-alert-ok">{notice}</div> : null}

      <section className="sp-section">
        <h2 className="sp-h2">Available sponsorships</h2>
        <p className="sp-sub">Browse packages from nonprofit fundraising events and express your interest.</p>
        {packages.length === 0 ? (
          <Empty glyph="P" text="No sponsorship packages are published yet. Check back soon, or contact an organizer directly." />
        ) : (
          <div className="sp-grid">
            {packages.map((p) => {
              const benefits = benefitList(p.benefits);
              const remaining = p.quantity != null ? Math.max(0, Number(p.quantity) - Number(p.sold ?? 0)) : null;
              return (
                <article key={p.id} className="sp-card">
                  <div className="sp-card-top">
                    <div>
                      {p.tier ? <span className="sp-tier">{p.tier}</span> : null}
                      <h3 className="sp-card-title">{p.name ?? 'Sponsorship package'}</h3>
                      <p className="sp-card-event">{p.event_name ?? 'Fundraising event'}</p>
                    </div>
                    <div className="sp-price">{money(p.price)}</div>
                  </div>
                  {benefits.length > 0 ? (
                    <ul className="sp-benefits">
                      {benefits.slice(0, 5).map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                  ) : null}
                  <div className="sp-card-meta">
                    {p.tickets_included != null ? <span>{p.tickets_included} guest seats</span> : null}
                    {remaining != null ? <span>{remaining} remaining</span> : null}
                  </div>
                  <button type="button" className="sp-btn" onClick={() => void expressInterest(p)}>Express interest</button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="sp-section">
        <h2 className="sp-h2">Your sponsorships</h2>
        <p className="sp-sub">Track each sponsorship from interest through fulfillment.</p>
        {purchases.length === 0 ? (
          <Empty glyph="S" text="You have no sponsorships yet. Express interest in a package above to get started." />
        ) : (
          <div className="sp-list">
            {purchases.map((p) => (
              <div key={p.id} className="sp-row">
                <button type="button" className="sp-rowhead" onClick={() => void openDetail(p.id)}>
                  <span className={`sp-status sp-status-${p.status}`}>{STATUS_LABEL[p.status] ?? p.status}</span>
                  <span className="sp-rowamt">{money(p.amount)}</span>
                  <span className="sp-rowid">Sponsorship {p.id.slice(0, 8)}</span>
                  <span className="sp-chev" aria-hidden="true">{openId === p.id ? '-' : '+'}</span>
                </button>
                {openId === p.id ? (
                  <div className="sp-detail">
                    {detailLoading || !detail ? (
                      <p className="sp-muted">Loading details</p>
                    ) : (
                      <PurchaseDetail
                        detail={detail}
                        onChange={() => void refreshDetail(p.id)}
                        onError={(m) => setError(m)}
                        onNotice={(m) => setNotice(m)}
                      />
                    )}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </Frame>
  );
}

function PurchaseDetail({
  detail,
  onChange,
  onError,
  onNotice,
}: {
  detail: Detail;
  onChange: () => void;
  onError: (m: string) => void;
  onNotice: (m: string) => void;
}) {
  const p = detail.purchase;
  const [agreementUrl, setAgreementUrl] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [adUrl, setAdUrl] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const allotment = Number(p.guest_allotment ?? 0);
  const used = detail.guest_count ?? detail.guests.length;
  const guestsFull = allotment > 0 && used >= allotment;

  async function act(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try {
      await fn();
      if (ok) onNotice(ok);
      onChange();
    } catch (e) {
      onError((e as Error).message || 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sp-detail-grid">
      <div className="sp-detail-col">
        <h4 className="sp-h4">Agreement</h4>
        {p.agreement_doc_id ? (
          <p className="sp-ok-line">Agreement on file.</p>
        ) : (
          <div className="sp-field">
            <input className="sp-input" placeholder="Signed agreement URL" value={agreementUrl} onChange={(e) => setAgreementUrl(e.target.value)} />
            <button type="button" className="sp-btn sm" disabled={busy || !agreementUrl} onClick={() => void act(() => apiSend('POST', `/sponsor-purchases/${p.id}/agreement`, { file_url: agreementUrl }), 'Agreement attached.')}>Sign</button>
          </div>
        )}

        <h4 className="sp-h4">Payment</h4>
        {p.status === 'paid' || p.status === 'fulfilled' ? (
          <p className="sp-ok-line">Payment recorded.</p>
        ) : (
          <div className="sp-pay">
            <button type="button" className="sp-btn sm" disabled={busy} onClick={() => void act(async () => {
              const r = await apiSend<{ redirect_url?: string; record_only?: boolean }>('POST', `/sponsor-purchases/${p.id}/checkout`, { processor: 'stripe', amount: Number(p.amount ?? 0) });
              if (r.redirect_url) { window.location.href = r.redirect_url; return; }
              // No processor configured: record-only confirmation.
              await apiSend('POST', `/sponsor-purchases/${p.id}/paid`, { amount: Number(p.amount ?? 0) });
            }, 'Payment step completed.')}>Pay with card</button>
            <button type="button" className="sp-btn sm ghost" disabled={busy} onClick={() => void act(() => apiSend('POST', `/sponsor-purchases/${p.id}/paid`, { amount: Number(p.amount ?? 0) }), 'Marked paid.')}>Record payment</button>
          </div>
        )}

        <h4 className="sp-h4">Brand assets</h4>
        <div className="sp-field">
          <input className="sp-input" placeholder={p.logo_url ? 'Replace logo URL' : 'Logo URL'} value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
          <button type="button" className="sp-btn sm" disabled={busy || !logoUrl} onClick={() => void act(() => apiSend('POST', `/sponsor-purchases/${p.id}/assets`, { kind: 'logo', url: logoUrl }), 'Logo saved.')}>Save</button>
        </div>
        <div className="sp-field">
          <input className="sp-input" placeholder={p.ad_file_url ? 'Replace ad URL' : 'Ad artwork URL'} value={adUrl} onChange={(e) => setAdUrl(e.target.value)} />
          <button type="button" className="sp-btn sm" disabled={busy || !adUrl} onClick={() => void act(() => apiSend('POST', `/sponsor-purchases/${p.id}/assets`, { kind: 'ad', url: adUrl }), 'Ad artwork saved.')}>Save</button>
        </div>
        <p className="sp-assetstate">
          Logo {p.logo_url ? 'received' : 'missing'} | Ad {p.ad_file_url ? 'received' : 'missing'}
        </p>
      </div>

      <div className="sp-detail-col">
        <h4 className="sp-h4">Guests {allotment > 0 ? <span className="sp-muted">({used}/{allotment})</span> : null}</h4>
        {detail.guests.length === 0 ? (
          <p className="sp-muted">No guests added yet.</p>
        ) : (
          <ul className="sp-guests">
            {detail.guests.map((g) => <li key={g.id}>{g.name ?? 'Guest'}{g.email ? <span className="sp-muted"> ({g.email})</span> : null}</li>)}
          </ul>
        )}
        {guestsFull ? (
          <p className="sp-muted">Guest allotment is full.</p>
        ) : (
          <div className="sp-field sp-field-col">
            <input className="sp-input" placeholder="Guest name" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
            <input className="sp-input" placeholder="Guest email (optional)" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} />
            <button type="button" className="sp-btn sm" disabled={busy || !guestName.trim()} onClick={() => void act(async () => {
              await apiSend('POST', `/sponsor-purchases/${p.id}/guests`, { name: guestName.trim(), email: guestEmail || null });
              setGuestName(''); setGuestEmail('');
            }, 'Guest added.')}>Add guest</button>
          </div>
        )}

        <h4 className="sp-h4">Fulfillment</h4>
        {detail.tasks.length === 0 ? (
          <p className="sp-muted">Fulfillment tasks appear here once your sponsorship is confirmed.</p>
        ) : (
          <ul className="sp-tasks">
            {detail.tasks.map((t) => (
              <li key={t.id} className="sp-task">
                <span className={`sp-tstatus sp-tstatus-${t.status}`}>{TASK_LABEL[t.status] ?? t.status}</span>
                <span className="sp-tlabel">{t.label ?? 'Deliverable'}</span>
                {t.due_date ? <span className="sp-muted">{new Date(t.due_date).toLocaleDateString()}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Empty({ glyph, text }: { glyph: string; text: string }) {
  return (
    <div className="sp-empty">
      <span className="sp-empty-glyph" aria-hidden="true">{glyph}</span>
      <p>{text}</p>
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="sp-wrap">
      <style>{CSS}</style>
      <header className="sp-header">
        <span className="sp-kicker">Divini Partners</span>
        <h1 className="sp-title">Sponsor Portal</h1>
        <p className="sp-lede">Discover sponsorships, manage your commitments, and track fulfillment.</p>
      </header>
      {children}
    </div>
  );
}

const CSS = `
.sp-wrap {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  max-width: 1120px; margin: 0 auto; padding: 30px 26px 60px;
  background: var(--dp-ivory); color: var(--dp-ink);
  font-family: 'Inter', system-ui, -apple-system, sans-serif; min-height: 100vh;
}
.sp-wrap *, .sp-wrap *::before, .sp-wrap *::after { box-sizing: border-box; }
.sp-header { margin-bottom: 26px; }
.sp-kicker { font-size: 10.5px; letter-spacing: 1.6px; text-transform: uppercase; color: var(--dp-gold); font-weight: 700; }
.sp-title { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 38px; color: var(--dp-emerald); margin: 4px 0 6px; font-weight: 600; }
.sp-lede { color: var(--dp-muted); font-size: 14px; margin: 0; }
.sp-section { margin-top: 30px; }
.sp-h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 24px; color: var(--dp-emerald); margin: 0; font-weight: 600; }
.sp-sub { color: var(--dp-muted); font-size: 13px; margin: 3px 0 16px; }
.sp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
.sp-card { background: #fff; border: 1px solid var(--dp-line); border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
.sp-card-top { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.sp-tier { font-size: 10px; letter-spacing: .6px; text-transform: uppercase; font-weight: 700; color: var(--dp-emerald); background: rgba(201,163,91,.22); border: 1px solid rgba(201,163,91,.5); padding: 2px 8px; border-radius: 999px; display: inline-block; margin-bottom: 6px; }
.sp-card-title { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 21px; color: var(--dp-emerald); margin: 0; font-weight: 600; }
.sp-card-event { font-size: 12px; color: var(--dp-muted); margin: 2px 0 0; }
.sp-price { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 26px; color: var(--dp-emerald); font-weight: 600; white-space: nowrap; }
.sp-benefits { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 3px; font-size: 12.5px; color: var(--dp-ink); }
.sp-card-meta { display: flex; gap: 12px; font-size: 11.5px; color: var(--dp-muted); }
.sp-list { display: flex; flex-direction: column; gap: 10px; }
.sp-row { background: #fff; border: 1px solid var(--dp-line); border-radius: 13px; overflow: hidden; }
.sp-rowhead { display: flex; align-items: center; gap: 14px; width: 100%; text-align: left; background: transparent; border: 0; cursor: pointer; font: inherit; padding: 14px 18px; }
.sp-rowamt { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 19px; color: var(--dp-emerald); }
.sp-rowid { font-size: 12.5px; color: var(--dp-muted); }
.sp-chev { margin-left: auto; font-size: 18px; color: var(--dp-gold); font-weight: 700; }
.sp-status { font-size: 10.5px; letter-spacing: .5px; text-transform: uppercase; font-weight: 700; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--dp-line); }
.sp-status-interested { color: #8a6d1f; background: rgba(201,163,91,.16); border-color: rgba(201,163,91,.4); }
.sp-status-agreed { color: var(--dp-emerald-2); background: rgba(30,93,74,.1); }
.sp-status-paid { color: #fff; background: var(--dp-emerald); }
.sp-status-fulfilled { color: #fff; background: var(--dp-gold); }
.sp-status-cancelled { color: var(--dp-muted); background: rgba(125,119,108,.12); }
.sp-detail { border-top: 1px solid var(--dp-line); padding: 16px 18px; background: rgba(247,244,238,.6); }
.sp-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.sp-detail-col { display: flex; flex-direction: column; gap: 8px; }
.sp-h4 { font-size: 11.5px; letter-spacing: .8px; text-transform: uppercase; color: var(--dp-muted); font-weight: 700; margin: 12px 0 2px; }
.sp-h4:first-child { margin-top: 0; }
.sp-field { display: flex; gap: 8px; align-items: center; }
.sp-field-col { flex-direction: column; align-items: stretch; }
.sp-input { flex: 1 1 auto; font: inherit; font-size: 13px; padding: 8px 11px; border: 1px solid var(--dp-line); border-radius: 9px; background: #fff; color: var(--dp-ink); }
.sp-input:focus { outline: none; border-color: var(--dp-gold); }
.sp-pay { display: flex; gap: 8px; flex-wrap: wrap; }
.sp-ok-line { font-size: 12.5px; color: var(--dp-emerald-2); margin: 2px 0; }
.sp-assetstate { font-size: 11.5px; color: var(--dp-muted); margin: 4px 0 0; }
.sp-guests, .sp-tasks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; }
.sp-task { display: flex; align-items: center; gap: 9px; }
.sp-tlabel { flex: 1 1 auto; }
.sp-tstatus { font-size: 9.5px; letter-spacing: .4px; text-transform: uppercase; font-weight: 700; padding: 2px 7px; border-radius: 999px; background: rgba(125,119,108,.12); color: var(--dp-muted); }
.sp-tstatus-in_progress { background: rgba(30,93,74,.12); color: var(--dp-emerald-2); }
.sp-tstatus-waiting_on_sponsor { background: rgba(201,163,91,.2); color: #8a6d1f; }
.sp-tstatus-completed { background: var(--dp-emerald); color: #fff; }
.sp-tstatus-issue { background: rgba(160,60,40,.14); color: #9b3a26; }
.sp-btn { align-self: flex-start; background: var(--dp-emerald); color: #fff; border: 0; border-radius: 9px; font: inherit; font-size: 12.5px; font-weight: 600; padding: 9px 16px; cursor: pointer; transition: background .15s ease; }
.sp-btn:hover { background: var(--dp-emerald-2); }
.sp-btn:disabled { opacity: .5; cursor: not-allowed; }
.sp-btn.sm { padding: 7px 13px; font-size: 12px; }
.sp-btn.ghost { background: transparent; color: var(--dp-emerald); border: 1px solid var(--dp-line); }
.sp-btn.ghost:hover { border-color: var(--dp-emerald); background: rgba(18,60,46,.04); }
.sp-muted { color: var(--dp-muted); font-size: 12px; }
.sp-empty { display: flex; align-items: center; gap: 14px; padding: 22px; border: 1px dashed var(--dp-line); border-radius: 13px; background: rgba(247,244,238,.6); }
.sp-empty-glyph { width: 38px; height: 38px; flex: 0 0 38px; border-radius: 10px; background: rgba(201,163,91,.18); color: var(--dp-emerald); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; }
.sp-empty p { margin: 0; font-size: 13px; color: var(--dp-muted); }
.sp-alert { padding: 11px 15px; border-radius: 10px; font-size: 13px; margin-bottom: 14px; }
.sp-alert-err { background: rgba(160,60,40,.1); color: #9b3a26; border: 1px solid rgba(160,60,40,.25); }
.sp-alert-ok { background: rgba(30,93,74,.1); color: var(--dp-emerald-2); border: 1px solid rgba(30,93,74,.25); }
.sp-loading { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 80px 0; color: var(--dp-muted); }
.sp-spin { width: 30px; height: 30px; border-radius: 50%; border: 3px solid var(--dp-line); border-top-color: var(--dp-emerald); animation: spspin .8s linear infinite; }
@keyframes spspin { to { transform: rotate(360deg); } }
@media (max-width: 720px) { .sp-detail-grid { grid-template-columns: 1fr; } }
`;
