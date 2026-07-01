import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { apiGet, apiSend } from '../../lib/api';

/**
 * AdminClaimProfiles - viewer for all claim profile accounts (venues, vendors,
 * and anything else surfaced by the claim engine). Admin-only. Reads
 * GET /admin/manage/listings (no kind filter -> all). Searchable and filterable
 * by category and claim status, with per-row resend invite and a link to the
 * public claim page. ZERO em dashes anywhere (hard rule).
 */

type Listing = {
  id: string;
  business_name: string | null;
  category: string | null;
  public_email: string | null;
  city: string | null;
  region: string | null;
  discovery_status: string | null;
  profile_id: string | null;
  profile_slug: string | null;
  claim_status: string | null;
  agreement_rate: number | null;
  agreement_type: string | null;
  created_at: string;
};

const AGREEMENT_TYPES = ['partnership', 'referral', 'revenue_share', 'custom'] as const;
const APPLIES_TO = ['signed_contracts', 'all_bookings', 'first_booking', 'custom'] as const;

const STYLES = `
.acl{--emerald:#1E5D4A;--emerald-deep:#123c2e;--emerald-mid:#174838;--gold:#C9A35B;--champagne:#D9CCB0;--ink:#2c2a26;--muted:#7d776c;--line:#e7e1d6;--ivory:#f7f4ee;background:var(--ivory);color:var(--ink);min-height:100vh;font-family:Inter,system-ui,sans-serif}
.acl .wrap{max-width:1180px;margin:0 auto;padding:26px 28px 60px}
.acl h1,.acl h2,.acl h3{font-family:'Cormorant Garamond',serif;color:var(--emerald-deep);margin:0}
.acl .top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:6px}
.acl .top h1{font-size:28px}
.acl .by{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-top:2px}
.acl .card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:18px}
.acl .filters{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;margin-bottom:16px}
.acl table{width:100%;border-collapse:collapse}
.acl th{text-align:left;font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);font-weight:600;padding:9px 10px;border-bottom:1px solid var(--line)}
.acl td{padding:10px;border-bottom:1px solid var(--line);font-size:13px;vertical-align:middle}
.acl .status{font-size:11px;color:var(--muted)}
.acl .badge{font-size:10px;font-weight:700;text-transform:uppercase;padding:3px 8px;border-radius:20px;background:#eef0ee;color:#5a6b62;border:1px solid #dde2dd}
.acl .badge.claimed,.acl .badge.verified{background:#e6f3ec;color:#1a5d42;border-color:#cfe6da}
.acl .badge.pending{background:#f6f1e6;color:#8a6a1f;border-color:#ecdfbf}
.acl .badge.agreement{background:#f3eeda;color:#7a5e16;border-color:#e6dbb8}
.acl .nodeal{font-size:11px;color:var(--muted)}
.acl textarea{width:100%;padding:10px 11px;border:1px solid var(--line);border-radius:9px;font-family:Inter;font-size:13.5px;background:#fff;color:var(--ink);box-sizing:border-box}
.acl textarea:focus{outline:none;border-color:var(--emerald)}
.acl .agform{background:var(--ivory);border:1px solid var(--line);border-radius:11px;padding:16px}
.acl .row3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px}
.acl .btn.primary{background:var(--emerald);border-color:var(--emerald);color:#fff}
.acl .btn.primary:hover{background:var(--emerald-mid)}
.acl .btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:#fff;color:var(--emerald-deep);font-family:Inter;font-size:12px;font-weight:600;padding:6px 11px;border-radius:8px;cursor:pointer;transition:.15s;margin:0 4px 4px 0;text-decoration:none}
.acl .btn:hover{border-color:var(--emerald);background:var(--ivory)}
.acl .btn:disabled{opacity:.6;cursor:default}
.acl label{display:block;font-size:12px;color:var(--muted);font-weight:600;margin:0 0 6px}
.acl input,.acl select{width:100%;padding:10px 11px;border:1px solid var(--line);border-radius:9px;font-family:Inter;font-size:13.5px;background:#fff;color:var(--ink);box-sizing:border-box}
.acl input:focus,.acl select:focus{outline:none;border-color:var(--emerald)}
.acl .msg{padding:10px 13px;border-radius:9px;font-size:13px;margin-top:10px}
.acl .msg.ok{background:#eef6f1;border:1px solid #cfe6da;color:var(--emerald-deep)}
.acl .msg.err{background:#fbeeee;border:1px solid #ecd2d2;color:#7a3030}
.acl .gate{max-width:460px;margin:80px auto;text-align:center;background:#fff;border:1px solid var(--line);border-radius:16px;padding:40px}
@media(max-width:1024px){.acl .filters{grid-template-columns:1fr}.acl .row3{grid-template-columns:1fr}}
`;

function fmtDate(s: string): string {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString();
}

export default function AdminClaimProfiles() {
  const { isAdmin, loading } = useAuth();
  const [rows, setRows] = useState<Listing[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // per-row agreement form (keyed by profile_id)
  const [agOpenId, setAgOpenId] = useState<string | null>(null);
  const [agType, setAgType] = useState<string>('partnership');
  const [agRate, setAgRate] = useState('');
  const [agApplies, setAgApplies] = useState<string>('signed_contracts');
  const [agTerms, setAgTerms] = useState('');
  const [agDoc, setAgDoc] = useState('');

  function toggleAgreement(profileId: string) {
    if (agOpenId === profileId) {
      setAgOpenId(null);
      return;
    }
    setAgOpenId(profileId);
    setAgType('partnership');
    setAgRate('');
    setAgApplies('signed_contracts');
    setAgTerms('');
    setAgDoc('');
  }

  // Infer the subject kind from the listing category when possible, else omit.
  function inferKind(category: string | null): 'venue' | 'vendor' | undefined {
    const c = (category ?? '').toLowerCase();
    if (!c) return undefined;
    if (/(venue|ballroom|hotel|estate|hall|space|garden)/.test(c)) return 'venue';
    return 'vendor';
  }

  async function load() {
    setLoadingRows(true);
    try {
      const r = await apiGet<{ listings: Listing[] }>('/admin/manage/listings');
      setRows(r.listings);
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to load profiles.' });
    } finally {
      setLoadingRows(false);
    }
  }

  useEffect(() => {
    if (isAdmin) void load();
    else setLoadingRows(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const categories = useMemo(
    () => Array.from(new Set(rows.map((r) => r.category).filter(Boolean) as string[])).sort(),
    [rows],
  );
  const statuses = useMemo(
    () => Array.from(new Set(rows.map((r) => r.claim_status).filter(Boolean) as string[])).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (categoryFilter && r.category !== categoryFilter) return false;
      if (statusFilter && r.claim_status !== statusFilter) return false;
      if (q) {
        const hay = `${r.business_name ?? ''} ${r.public_email ?? ''} ${r.city ?? ''} ${r.region ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, categoryFilter, statusFilter]);

  async function resendInvite(profileId: string) {
    setMsg(null);
    setBusy(profileId);
    try {
      const out = await apiSend<{ sent: boolean }>('POST', `/admin/manage/listings/${profileId}/invite`);
      setMsg({ kind: out.sent ? 'ok' : 'err', text: out.sent ? 'Invite resent.' : 'Invite could not be sent.' });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to send invite.' });
    } finally {
      setBusy(null);
    }
  }

  async function saveAgreement(profileId: string, category: string | null) {
    setMsg(null);
    setBusy(`ag-${profileId}`);
    try {
      const rate = Number(agRate);
      if (Number.isNaN(rate) || rate < 0 || rate > 100) {
        setMsg({ kind: 'err', text: 'Commission must be a number between 0 and 100.' });
        setBusy(null);
        return;
      }
      await apiSend('POST', '/admin/manage/agreements', {
        profileId,
        subjectKind: inferKind(category),
        agreementType: agType,
        commissionRate: rate,
        appliesTo: agApplies,
        terms: agTerms || undefined,
        docUrl: agDoc || undefined,
      });
      setMsg({ kind: 'ok', text: 'Agreement saved.' });
      setAgOpenId(null);
      await load();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to save agreement.' });
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <div className="acl"><style>{STYLES}</style><div className="wrap"><p style={{ padding: 60 }}>Loading...</p></div></div>;
  }

  if (!isAdmin) {
    return (
      <div className="acl">
        <style>{STYLES}</style>
        <div className="gate">
          <h1>Administrators only</h1>
          <p>This page is restricted to platform administrators.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="acl">
      <style>{STYLES}</style>
      <div className="wrap">
        <div className="top">
          <div>
            <h1>Claim Profiles</h1>
            <div className="by">Divini Partners by Divini Group</div>
          </div>
          <button className="btn" onClick={() => void load()}>Refresh</button>
        </div>

        {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}

        <div className="card">
          <div className="filters">
            <div>
              <label>Search</label>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email, city..." />
            </div>
            <div>
              <label>Category</label>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label>Claim status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <table>
            <thead>
              <tr><th>Business</th><th>Category</th><th>Email</th><th>City</th><th>Claim status</th><th>Agreement</th><th>Created</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <React.Fragment key={r.id}>
                  <tr>
                    <td style={{ fontWeight: 600 }}>{r.business_name ?? '-'}</td>
                    <td>{r.category ?? '-'}</td>
                    <td>{r.public_email ?? '-'}</td>
                    <td>{r.city ?? '-'}</td>
                    <td><span className={`badge ${r.claim_status ?? ''}`}>{r.claim_status ?? 'unclaimed'}</span></td>
                    <td>
                      {r.agreement_rate != null
                        ? <span className="badge agreement">{r.agreement_rate}% {r.agreement_type ?? 'agreement'}</span>
                        : <span className="nodeal">No agreement</span>}
                    </td>
                    <td>{fmtDate(r.created_at)}</td>
                    <td>
                      {r.profile_id && (
                        <button className="btn" onClick={() => toggleAgreement(r.profile_id as string)}>{agOpenId === r.profile_id ? 'Close' : 'Agreement'}</button>
                      )}
                      {r.profile_id && (
                        <button className="btn" disabled={busy === r.profile_id} onClick={() => resendInvite(r.profile_id as string)}>Resend invite</button>
                      )}
                      {r.profile_slug && (
                        <a className="btn" href={`/claim/${r.profile_slug}`} target="_blank" rel="noreferrer">View claim page</a>
                      )}
                    </td>
                  </tr>
                  {agOpenId === r.profile_id && r.profile_id && (
                    <tr>
                      <td colSpan={8} style={{ background: 'transparent' }}>
                        <div className="agform">
                          <div className="row3">
                            <div>
                              <label>Agreement type</label>
                              <select value={agType} onChange={(e) => setAgType(e.target.value)}>
                                {AGREEMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>
                            <div>
                              <label>Commission %</label>
                              <input type="number" min={0} max={100} step={0.5} value={agRate} onChange={(e) => setAgRate(e.target.value)} placeholder="5" />
                            </div>
                            <div>
                              <label>Applies to</label>
                              <select value={agApplies} onChange={(e) => setAgApplies(e.target.value)}>
                                {APPLIES_TO.map((a) => <option key={a} value={a}>{a}</option>)}
                              </select>
                            </div>
                          </div>
                          <div style={{ marginBottom: 10 }}>
                            <label>Terms (optional)</label>
                            <textarea rows={3} value={agTerms} onChange={(e) => setAgTerms(e.target.value)} placeholder="Notes about this partnership..." />
                          </div>
                          <div style={{ marginBottom: 10 }}>
                            <label>Signed agreement link (optional)</label>
                            <input value={agDoc} onChange={(e) => setAgDoc(e.target.value)} placeholder="https://" />
                          </div>
                          <button className="btn primary" disabled={busy === `ag-${r.profile_id}`} onClick={() => saveAgreement(r.profile_id as string, r.category)}>Save agreement</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {loadingRows && <tr><td colSpan={8} className="status">Loading profiles...</td></tr>}
              {!loadingRows && !filtered.length && <tr><td colSpan={8} className="status">No profiles match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
