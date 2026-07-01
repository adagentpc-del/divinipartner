import React, { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { apiGet, apiSend } from '../../lib/api';

/**
 * AdminManageVenues - create venue claim profiles and invite owners to claim
 * them. Admin-only. Reads GET /admin/manage/listings?kind=venue; creates via
 * POST /admin/manage/listings; resends invites via the per-profile invite
 * endpoint. ZERO em dashes anywhere (hard rule).
 */

type Listing = {
  id: string;
  business_name: string | null;
  category: string | null;
  public_email: string | null;
  city: string | null;
  state: string | null;
  region: string | null;
  discovery_status: string | null;
  profile_id: string | null;
  profile_slug: string | null;
  claim_status: string | null;
  agreement_rate: number | null;
  agreement_type: string | null;
  created_at: string;
};

type CreateResult = { profile: { id: string; slug: string }; claimUrl: string; invited: boolean };
type ExtractResult = {
  available: boolean;
  name: string | null;
  description: string | null;
  services: string[];
  tags: string[];
};

const AGREEMENT_TYPES = ['partnership', 'referral', 'revenue_share', 'custom'] as const;
const APPLIES_TO = ['signed_contracts', 'all_bookings', 'first_booking', 'custom'] as const;

const STYLES = `
.aml{--emerald:#1E5D4A;--emerald-deep:#123c2e;--emerald-mid:#174838;--gold:#C9A35B;--champagne:#D9CCB0;--ink:#2c2a26;--muted:#7d776c;--line:#e7e1d6;--ivory:#f7f4ee;background:var(--ivory);color:var(--ink);min-height:100vh;font-family:Inter,system-ui,sans-serif}
.aml .wrap{max-width:1180px;margin:0 auto;padding:26px 28px 60px}
.aml h1,.aml h2,.aml h3{font-family:'Cormorant Garamond',serif;color:var(--emerald-deep);margin:0}
.aml .top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:6px}
.aml .top h1{font-size:28px}
.aml .by{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-top:2px}
.aml .sectitle{font-size:12px;letter-spacing:.7px;text-transform:uppercase;color:var(--muted);font-weight:700;margin:26px 0 12px}
.aml .card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:18px}
.aml table{width:100%;border-collapse:collapse}
.aml th{text-align:left;font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);font-weight:600;padding:9px 10px;border-bottom:1px solid var(--line)}
.aml td{padding:10px;border-bottom:1px solid var(--line);font-size:13px;vertical-align:middle}
.aml .status{font-size:11px;color:var(--muted)}
.aml .badge{font-size:10px;font-weight:700;text-transform:uppercase;padding:3px 8px;border-radius:20px;background:#eef0ee;color:#5a6b62;border:1px solid #dde2dd}
.aml .badge.claimed,.aml .badge.verified{background:#e6f3ec;color:#1a5d42;border-color:#cfe6da}
.aml .badge.pending{background:#f6f1e6;color:#8a6a1f;border-color:#ecdfbf}
.aml .btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:#fff;color:var(--emerald-deep);font-family:Inter;font-size:12px;font-weight:600;padding:6px 11px;border-radius:8px;cursor:pointer;transition:.15s;margin:0 4px 4px 0;text-decoration:none}
.aml .btn:hover{border-color:var(--emerald);background:var(--ivory)}
.aml .btn.primary{background:var(--emerald);border-color:var(--emerald);color:#fff}
.aml .btn.primary:hover{background:var(--emerald-mid)}
.aml .btn:disabled{opacity:.6;cursor:default}
.aml .badge.agreement{background:#f3eeda;color:#7a5e16;border-color:#e6dbb8}
.aml .nodeal{font-size:11px;color:var(--muted)}
.aml label{display:block;font-size:12px;color:var(--muted);font-weight:600;margin:0 0 6px}
.aml input,.aml select,.aml textarea{width:100%;padding:10px 11px;border:1px solid var(--line);border-radius:9px;font-family:Inter;font-size:13.5px;background:#fff;color:var(--ink);box-sizing:border-box}
.aml input:focus,.aml select:focus,.aml textarea:focus{outline:none;border-color:var(--emerald)}
.aml .agform{background:var(--ivory);border:1px solid var(--line);border-radius:11px;padding:16px}
.aml .row3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px}
.aml .check{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink);font-weight:500;margin:6px 0 0}
.aml .check input{width:auto}
.aml .msg{padding:10px 13px;border-radius:9px;font-size:13px;margin-top:10px}
.aml .msg.ok{background:#eef6f1;border:1px solid #cfe6da;color:var(--emerald-deep)}
.aml .msg.err{background:#fbeeee;border:1px solid #ecd2d2;color:#7a3030}
.aml .claimurl{word-break:break-all;font-family:ui-monospace,monospace;font-size:12px}
.aml .seg{display:inline-flex;border:1px solid var(--line);border-radius:9px;overflow:hidden;margin:0 0 14px}
.aml .seg button{border:0;background:#fff;color:var(--emerald-deep);font-family:Inter;font-size:13px;font-weight:600;padding:9px 16px;cursor:pointer;transition:.15s}
.aml .seg button + button{border-left:1px solid var(--line)}
.aml .seg button.on{background:var(--emerald);color:#fff}
.aml .seghint{font-size:12px;color:var(--muted);margin:0 0 12px}
.aml .claimbox{background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px;margin-bottom:18px}
.aml .claimbox .crow{display:flex;align-items:flex-end;gap:8px}
.aml .claimbox .crow > div{flex:1}
.aml .claimbox input{font-family:ui-monospace,monospace;font-size:12px}
.aml .claimbox .cmeta{font-size:12px;color:var(--muted);margin:8px 0 0}
.aml .gate{max-width:460px;margin:80px auto;text-align:center;background:#fff;border:1px solid var(--line);border-radius:16px;padding:40px}
@media(max-width:1024px){.aml .row3{grid-template-columns:1fr}}
`;

export default function AdminManageVenues() {
  const { isAdmin, loading, session } = useAuth();
  const [rows, setRows] = useState<Listing[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadingRows, setLoadingRows] = useState(true);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [businessName, setBusinessName] = useState('');
  const [category, setCategory] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [creatorEmail, setCreatorEmail] = useState('');
  const [city, setCity] = useState('');
  const [usState, setUsState] = useState('');
  const [region, setRegion] = useState('');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');
  const [invite, setInvite] = useState(false);
  const [setupMode, setSetupMode] = useState<'create' | 'claim'>('create');
  const [lastResult, setLastResult] = useState<CreateResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [aiDraft, setAiDraft] = useState(false);

  function chooseMode(mode: 'create' | 'claim') {
    setSetupMode(mode);
    setInvite(mode === 'claim');
  }

  async function copyClaimLink() {
    if (!lastResult) return;
    const abs = window.location.origin + lastResult.claimUrl;
    try {
      await navigator.clipboard.writeText(abs);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setMsg({ kind: 'err', text: 'Could not copy to clipboard. Copy the link manually.' });
    }
  }

  async function pullFromWebsite() {
    if (!website.trim()) {
      setMsg({ kind: 'err', text: 'Enter a website URL first.' });
      return;
    }
    setMsg(null);
    setExtracting(true);
    try {
      const out = await apiSend<ExtractResult>('POST', '/admin/manage/extract', { url: website.trim() });
      if (!out.available) {
        setMsg({
          kind: 'err',
          text: 'Could not auto-read this website. Write the category and description manually.',
        });
        return;
      }
      if (out.name && !businessName.trim()) setBusinessName(out.name);
      if (out.tags && out.tags.length > 0 && !category.trim()) setCategory(out.tags.join(', '));
      else if (out.services && out.services.length > 0 && !category.trim()) setCategory(out.services.join(', '));
      if (out.description) {
        setDescription(out.description);
        setAiDraft(true);
      }
      setMsg({ kind: 'ok', text: 'Draft pulled from the website. Review and edit before saving.' });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to read website.' });
    } finally {
      setExtracting(false);
    }
  }

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

  useEffect(() => {
    if (session?.user?.email && !creatorEmail) setCreatorEmail(session.user.email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function load() {
    setLoadingRows(true);
    try {
      const r = await apiGet<{ listings: Listing[] }>('/admin/manage/listings?kind=venue');
      setRows(r.listings);
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to load venues.' });
    } finally {
      setLoadingRows(false);
    }
  }

  useEffect(() => {
    if (isAdmin) void load();
    else setLoadingRows(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy('create');
    try {
      const out = await apiSend<CreateResult>('POST', '/admin/manage/listings', {
        kind: 'venue',
        businessName,
        category,
        contactEmail,
        creatorEmail,
        city,
        state: usState,
        region,
        website,
        description,
        invite,
      });
      setLastResult(out);
      setCopied(false);
      setMsg({
        kind: 'ok',
        text: `Venue profile created.${out.invited ? ' Invite sent to the venue.' : ' No invite sent.'}`,
      });
      setBusinessName('');
      setCategory('');
      setContactEmail('');
      setCity('');
      setUsState('');
      setRegion('');
      setWebsite('');
      setDescription('');
      setAiDraft(false);
      setInvite(setupMode === 'claim');
      await load();
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Failed to create venue.' });
    } finally {
      setBusy(null);
    }
  }

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

  async function saveAgreement(profileId: string) {
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
        subjectKind: 'venue',
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
    return <div className="aml"><style>{STYLES}</style><div className="wrap"><p style={{ padding: 60 }}>Loading...</p></div></div>;
  }

  if (!isAdmin) {
    return (
      <div className="aml">
        <style>{STYLES}</style>
        <div className="gate">
          <h1>Administrators only</h1>
          <p>This page is restricted to platform administrators.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="aml">
      <style>{STYLES}</style>
      <div className="wrap">
        <div className="top">
          <div>
            <h1>Manage Venues</h1>
            <div className="by">Divini Partners by Divini Group</div>
          </div>
          <button className="btn" onClick={() => void load()}>Refresh</button>
        </div>

        {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}

        <div className="sectitle">Create venue</div>
        <div className="card">
          <label>How do you want to set this up?</label>
          <div className="seg">
            <button type="button" className={setupMode === 'create' ? 'on' : ''} onClick={() => chooseMode('create')}>Create the page</button>
            <button type="button" className={setupMode === 'claim' ? 'on' : ''} onClick={() => chooseMode('claim')}>Send claim link</button>
          </div>
          <p className="seghint">
            {setupMode === 'create'
              ? 'You build out the venue page. No invite is sent by default.'
              : 'The venue claims their own page. An invite email is sent by default.'}
          </p>
          <form onSubmit={create}>
            <div className="row3">
              <div>
                <label>Venue name</label>
                <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
              </div>
              <div>
                <label>Category / type</label>
                <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ballroom, hotel, estate..." />
              </div>
              <div>
                <label>Contact email (theirs)</label>
                <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} required />
              </div>
            </div>
            <div className="row3">
              <div>
                <label>Your email (creator)</label>
                <input type="email" value={creatorEmail} onChange={(e) => setCreatorEmail(e.target.value)} />
              </div>
              <div>
                <label>City</label>
                <input value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div>
                <label>State</label>
                <input value={usState} onChange={(e) => setUsState(e.target.value)} placeholder="CA, NY, TX..." />
              </div>
            </div>
            <div className="row3">
              <div>
                <label>Region</label>
                <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Bay Area, Tri-State..." />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label>Website</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                  <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
                  <button type="button" className="btn" style={{ whiteSpace: 'nowrap' }} disabled={extracting} onClick={() => void pullFromWebsite()}>
                    {extracting ? 'Reading...' : 'Pull from website'}
                  </button>
                </div>
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label>Description{aiDraft ? ' (AI draft, edit before saving)' : ''}</label>
              <textarea rows={4} value={description} onChange={(e) => { setDescription(e.target.value); setAiDraft(false); }} placeholder="Short public description of this venue. Use Pull from website to auto-draft, then edit." />
            </div>
            <label className="check">
              <input type="checkbox" checked={invite} onChange={(e) => setInvite(e.target.checked)} />
              Send invite to claim their profile
            </label>
            <div style={{ marginTop: 12 }}>
              <button className="btn primary" type="submit" disabled={busy === 'create'}>Create venue</button>
            </div>
          </form>
        </div>

        {lastResult && (
          <div className="claimbox">
            <div className="crow">
              <div>
                <label>Claim link (copy to send manually)</label>
                <input readOnly value={window.location.origin + lastResult.claimUrl} onFocus={(e) => e.target.select()} />
              </div>
              <button type="button" className="btn" onClick={() => void copyClaimLink()}>{copied ? 'Copied' : 'Copy link'}</button>
            </div>
            <p className="cmeta">{lastResult.invited ? 'Invite email was sent to the venue.' : 'No invite email was sent. Share the link above.'}</p>
          </div>
        )}

        <div className="sectitle">Existing venues</div>
        <div className="card">
          <table>
            <thead>
              <tr><th>Venue</th><th>Category</th><th>Email</th><th>Location</th><th>Claim status</th><th>Agreement</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <React.Fragment key={r.id}>
                  <tr>
                    <td style={{ fontWeight: 600 }}>{r.business_name ?? '-'}</td>
                    <td>{r.category ?? '-'}</td>
                    <td>{r.public_email ?? '-'}</td>
                    <td>{[r.city, r.state, r.region].filter(Boolean).join(', ') || '-'}</td>
                    <td><span className={`badge ${r.claim_status ?? ''}`}>{r.claim_status ?? 'unclaimed'}</span></td>
                    <td>
                      {r.agreement_rate != null
                        ? <span className="badge agreement">{r.agreement_rate}% {r.agreement_type ?? 'agreement'}</span>
                        : <span className="nodeal">No agreement</span>}
                    </td>
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
                      <td colSpan={7} style={{ background: 'transparent' }}>
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
                          <button className="btn primary" disabled={busy === `ag-${r.profile_id}`} onClick={() => saveAgreement(r.profile_id as string)}>Save agreement</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {loadingRows && <tr><td colSpan={7} className="status">Loading venues...</td></tr>}
              {!loadingRows && !rows.length && <tr><td colSpan={7} className="status">No venues yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
