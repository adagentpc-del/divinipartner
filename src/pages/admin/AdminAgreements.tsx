import React, { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { apiGet, apiSend } from '../../lib/api';

/**
 * AdminAgreements - overview of every per-account agreement (custom commission /
 * partnership terms) on the platform. Admin-only. Reads
 * GET /admin/manage/agreements (no filter); supports inline edit of rate / type /
 * applies-to / terms / doc link and a deactivate / reactivate status toggle via
 * PATCH /admin/manage/agreements/:id. ZERO em dashes anywhere (hard rule).
 */

type Agreement = {
  id: string;
  organization_id: string | null;
  unclaimed_profile_id: string | null;
  subject_kind: string | null;
  agreement_type: string | null;
  commission_rate: number | null;
  applies_to: string | null;
  terms: string | null;
  doc_url: string | null;
  status: string | null;
  created_by_email: string | null;
  created_at: string;
  subject_name: string | null;
  contracting_entity: string | null;
  partner_price_cents: number | null;
  kickback_type: string | null;
  kickback_value: number | null;
  assigned_vendor_name: string | null;
  assigned_vendor_status: string | null;
  assigned_vendor_removed_reason: string | null;
  signed_status: string | null;
  signed_at: string | null;
  signed_by: string | null;
  client_total_cents: number | null;
};

type VendorOption = {
  business_name: string | null;
  profile_id: string | null;
};

const AGREEMENT_TYPES = ['partnership', 'referral', 'revenue_share', 'incentive', 'custom'] as const;
const APPLIES_TO = ['signed_contracts', 'all_bookings', 'first_booking', 'custom'] as const;
const CONTRACTING_ENTITIES = ['Divini Partners', 'Divini Group', 'Other Divini entity'] as const;
const KICKBACK_TYPES = ['none', 'percent', 'flat'] as const;

function fmtMoney(cents: number | null | undefined): string {
  if (cents == null) return '-';
  return `$${(cents / 100).toFixed(2)}`;
}

/** Mirror the server pricing math for a live readout. */
function computeClientTotalCents(
  partnerPriceCents: number,
  marginPct: number,
  kickbackType: 'percent' | 'flat' | null,
  kickbackValue: number,
): { base: number; margin: number; kickback: number; total: number } {
  const base = Math.round(partnerPriceCents);
  const margin = Math.round(base * (marginPct || 0) / 100);
  let kickback = 0;
  if (kickbackType === 'percent') kickback = Math.round(base * (kickbackValue || 0) / 100);
  else if (kickbackType === 'flat') kickback = Math.round((kickbackValue || 0) * 100);
  return { base, margin, kickback, total: base + margin + kickback };
}

const STYLES = `
.aag{--emerald:#1E5D4A;--emerald-deep:#123c2e;--emerald-mid:#174838;--gold:#C9A35B;--champagne:#D9CCB0;--ink:#2c2a26;--muted:#7d776c;--line:#e7e1d6;--ivory:#f7f4ee;background:var(--ivory);color:var(--ink);min-height:100vh;font-family:Inter,system-ui,sans-serif}
.aag .wrap{max-width:1180px;margin:0 auto;padding:26px 28px 60px}
.aag h1,.aag h2,.aag h3{font-family:'Cormorant Garamond',serif;color:var(--emerald-deep);margin:0}
.aag .top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:6px}
.aag .top h1{font-size:28px}
.aag .by{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-top:2px}
.aag .card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:18px}
.aag table{width:100%;border-collapse:collapse}
.aag th{text-align:left;font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);font-weight:600;padding:9px 10px;border-bottom:1px solid var(--line)}
.aag td{padding:10px;border-bottom:1px solid var(--line);font-size:13px;vertical-align:middle}
.aag .status{font-size:11px;color:var(--muted)}
.aag .badge{font-size:10px;font-weight:700;text-transform:uppercase;padding:3px 8px;border-radius:20px;background:#eef0ee;color:#5a6b62;border:1px solid #dde2dd}
.aag .badge.active{background:#e6f3ec;color:#1a5d42;border-color:#cfe6da}
.aag .badge.inactive{background:#f4eeee;color:#7a5454;border-color:#e6d4d4}
.aag .badge.kind{background:#f3eeda;color:#7a5e16;border-color:#e6dbb8}
.aag .btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:#fff;color:var(--emerald-deep);font-family:Inter;font-size:12px;font-weight:600;padding:6px 11px;border-radius:8px;cursor:pointer;transition:.15s;margin:0 4px 4px 0;text-decoration:none}
.aag .btn:hover{border-color:var(--emerald);background:var(--ivory)}
.aag .btn.primary{background:var(--emerald);border-color:var(--emerald);color:#fff}
.aag .btn.primary:hover{background:var(--emerald-mid)}
.aag .btn:disabled{opacity:.6;cursor:default}
.aag label{display:block;font-size:12px;color:var(--muted);font-weight:600;margin:0 0 6px}
.aag input,.aag select,.aag textarea{width:100%;padding:10px 11px;border:1px solid var(--line);border-radius:9px;font-family:Inter;font-size:13.5px;background:#fff;color:var(--ink);box-sizing:border-box}
.aag input:focus,.aag select:focus,.aag textarea:focus{outline:none;border-color:var(--emerald)}
.aag .row3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px}
.aag .agform{background:var(--ivory);border:1px solid var(--line);border-radius:11px;padding:16px}
.aag .msg{padding:10px 13px;border-radius:9px;font-size:13px;margin-top:10px}
.aag .msg.ok{background:#eef6f1;border:1px solid #cfe6da;color:var(--emerald-deep)}
.aag .msg.err{background:#fbeeee;border:1px solid #ecd2d2;color:#7a3030}
.aag .doclink{color:var(--emerald);text-decoration:underline;word-break:break-all}
.aag .badge.signed{background:#e6f3ec;color:#1a5d42;border-color:#cfe6da}
.aag .pricebox{background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin:0 0 12px}
.aag .priceline{display:flex;justify-content:space-between;font-size:13px;padding:3px 0;color:var(--ink)}
.aag .priceline .lbl{color:var(--muted)}
.aag .priceline.total{border-top:1px solid var(--line);margin-top:6px;padding-top:8px;font-weight:700;font-size:15px;color:var(--emerald-deep)}
.aag .vendorbox{background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin:0 0 12px}
.aag .vendorbox .vrow{display:flex;align-items:flex-end;gap:8px;margin-bottom:8px}
.aag .vendorbox .vrow > div{flex:1}
.aag .vmeta{font-size:12px;color:var(--muted);margin:4px 0 0}
.aag .gate{max-width:460px;margin:80px auto;text-align:center;background:#fff;border:1px solid var(--line);border-radius:16px;padding:40px}
@media(max-width:1024px){.aag .row3{grid-template-columns:1fr}}
`;

function fmtDate(s: string): string {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString();
}

export default function AdminAgreements() {
  const { isAdmin, loading } = useAuth();
  const [rows, setRows] = useState<Agreement[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // inline edit form (keyed by agreement id)
  const [editId, setEditId] = useState<string | null>(null);
  const [edType, setEdType] = useState<string>('partnership');
  const [edRate, setEdRate] = useState('');
  const [edApplies, setEdApplies] = useState<string>('signed_contracts');
  const [edTerms, setEdTerms] = useState('');
  const [edDoc, setEdDoc] = useState('');
  const [edEntity, setEdEntity] = useState<string>('Divini Partners');
  const [edPrice, setEdPrice] = useState(''); // dollars
  const [edKickType, setEdKickType] = useState<string>('none');
  const [edKickValue, setEdKickValue] = useState('');
  const [edVendor, setEdVendor] = useState(''); // assign vendor: picked vendor name (free-text fallback)
  const [edVendorPick, setEdVendorPick] = useState(''); // selected option in the vendor picker
  const [vendors, setVendors] = useState<VendorOption[]>([]);

  async function loadVendors() {
    try {
      const r = await apiGet<{ listings: VendorOption[] }>('/admin/manage/listings?kind=vendor');
      const seen = new Set<string>();
      const opts = (r.listings || []).filter((v) => {
        const name = (v.business_name || '').trim();
        if (!name || seen.has(name.toLowerCase())) return false;
        seen.add(name.toLowerCase());
        return true;
      });
      setVendors(opts);
    } catch {
      setVendors([]);
    }
  }

  async function load() {
    setLoadingRows(true);
    try {
      const r = await apiGet<{ agreements: Agreement[] }>('/admin/manage/agreements');
      setRows(r.agreements);
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to load agreements.' });
    } finally {
      setLoadingRows(false);
    }
  }

  useEffect(() => {
    if (isAdmin) {
      void load();
      void loadVendors();
    } else setLoadingRows(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  function toggleEdit(a: Agreement) {
    if (editId === a.id) {
      setEditId(null);
      return;
    }
    setEditId(a.id);
    setEdType(a.agreement_type ?? 'partnership');
    setEdRate(a.commission_rate != null ? String(a.commission_rate) : '');
    setEdApplies(a.applies_to ?? 'signed_contracts');
    setEdTerms(a.terms ?? '');
    setEdDoc(a.doc_url ?? '');
    setEdEntity(a.contracting_entity ?? 'Divini Partners');
    setEdPrice(a.partner_price_cents != null ? (a.partner_price_cents / 100).toFixed(2) : '');
    setEdKickType(a.kickback_type ?? 'none');
    setEdKickValue(a.kickback_value != null ? String(a.kickback_value) : '');
    setEdVendor('');
    setEdVendorPick('');
  }

  async function saveEdit(id: string) {
    setMsg(null);
    setBusy(`edit-${id}`);
    try {
      const rate = Number(edRate);
      if (Number.isNaN(rate) || rate < 0 || rate > 100) {
        setMsg({ kind: 'err', text: 'Commission must be a number between 0 and 100.' });
        setBusy(null);
        return;
      }
      const priceDollars = edPrice.trim() === '' ? null : Number(edPrice);
      if (priceDollars != null && (Number.isNaN(priceDollars) || priceDollars < 0)) {
        setMsg({ kind: 'err', text: 'Partner price must be a number of 0 or more.' });
        setBusy(null);
        return;
      }
      const kickType = edKickType === 'none' ? null : edKickType;
      const kickValRaw = edKickValue.trim() === '' ? null : Number(edKickValue);
      if (kickType && (kickValRaw == null || Number.isNaN(kickValRaw) || kickValRaw < 0)) {
        setMsg({ kind: 'err', text: 'Kickback value must be a number of 0 or more.' });
        setBusy(null);
        return;
      }
      await apiSend('PATCH', `/admin/manage/agreements/${id}`, {
        commissionRate: rate,
        agreementType: edType,
        appliesTo: edApplies,
        terms: edTerms || undefined,
        docUrl: edDoc || undefined,
        contractingEntity: edEntity,
        partnerPriceCents: priceDollars != null ? Math.round(priceDollars * 100) : null,
        kickbackType: kickType,
        kickbackValue: kickType ? kickValRaw : null,
      });
      setMsg({ kind: 'ok', text: 'Agreement updated.' });
      setEditId(null);
      await load();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to update agreement.' });
    } finally {
      setBusy(null);
    }
  }

  async function assignVendor(id: string) {
    // Picker drives the assignment; '__custom__' falls back to the free-text name.
    let name = '';
    let profileId: string | null = null;
    if (edVendorPick === '__custom__') {
      name = edVendor.trim();
    } else if (edVendorPick) {
      const v = vendors.find((x) => (x.profile_id || x.business_name || '') === edVendorPick);
      name = (v?.business_name || '').trim();
      profileId = v?.profile_id || null;
    }
    if (!name) {
      setMsg({ kind: 'err', text: 'Pick a vendor (or choose Other and type a name) to assign.' });
      return;
    }
    setMsg(null);
    setBusy(`assign-${id}`);
    try {
      await apiSend('POST', `/admin/manage/agreements/${id}/assign-vendor`, {
        name,
        ...(profileId ? { profileId } : {}),
      });
      setMsg({ kind: 'ok', text: 'Vendor assigned.' });
      setEdVendor('');
      setEdVendorPick('');
      await load();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to assign vendor.' });
    } finally {
      setBusy(null);
    }
  }

  async function removeVendor(id: string) {
    const reason = window.prompt('Reason for removing the assigned vendor? (breach / circumvention / performance / other)', 'performance');
    if (reason == null) return;
    const clean = reason.trim();
    if (!clean) {
      setMsg({ kind: 'err', text: 'A removal reason is required.' });
      return;
    }
    setMsg(null);
    setBusy(`remove-${id}`);
    try {
      await apiSend('POST', `/admin/manage/agreements/${id}/remove-vendor`, { reason: clean });
      setMsg({ kind: 'ok', text: 'Vendor removed.' });
      await load();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to remove vendor.' });
    } finally {
      setBusy(null);
    }
  }

  async function autoSign(id: string) {
    setMsg(null);
    setBusy(`sign-${id}`);
    try {
      await apiSend('POST', `/admin/manage/agreements/${id}/sign`);
      setMsg({ kind: 'ok', text: 'Agreement auto-signed.' });
      await load();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to sign agreement.' });
    } finally {
      setBusy(null);
    }
  }

  async function toggleStatus(a: Agreement) {
    const next = a.status === 'inactive' ? 'active' : 'inactive';
    setMsg(null);
    setBusy(`status-${a.id}`);
    try {
      await apiSend('PATCH', `/admin/manage/agreements/${a.id}`, { status: next });
      setMsg({ kind: 'ok', text: next === 'inactive' ? 'Agreement deactivated.' : 'Agreement reactivated.' });
      await load();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to update status.' });
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <div className="aag"><style>{STYLES}</style><div className="wrap"><p style={{ padding: 60 }}>Loading...</p></div></div>;
  }

  if (!isAdmin) {
    return (
      <div className="aag">
        <style>{STYLES}</style>
        <div className="gate">
          <h1>Administrators only</h1>
          <p>This page is restricted to platform administrators.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="aag">
      <style>{STYLES}</style>
      <div className="wrap">
        <div className="top">
          <div>
            <h1>Agreements</h1>
            <div className="by">Divini Partners by Divini Group</div>
          </div>
          <button className="btn" onClick={() => void load()}>Refresh</button>
        </div>

        {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}

        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Subject</th><th>Kind</th><th>Type</th><th>Margin</th><th>Client total</th><th>Vendor</th>
                <th>Signed</th><th>Status</th><th>Created</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <React.Fragment key={a.id}>
                  <tr>
                    <td style={{ fontWeight: 600 }}>{a.subject_name ?? '-'}</td>
                    <td>{a.subject_kind ? <span className="badge kind">{a.subject_kind}</span> : '-'}</td>
                    <td>{a.agreement_type ?? '-'}</td>
                    <td>{a.commission_rate != null ? `${a.commission_rate}%` : '-'}</td>
                    <td>{fmtMoney(a.client_total_cents)}</td>
                    <td>
                      {a.assigned_vendor_name
                        ? <span>{a.assigned_vendor_name}{a.assigned_vendor_status ? <span className="status"> ({a.assigned_vendor_status})</span> : null}</span>
                        : <span className="status">None</span>}
                    </td>
                    <td>
                      {a.signed_status === 'signed'
                        ? <span className="badge signed">Signed</span>
                        : <span className="status">Unsigned</span>}
                    </td>
                    <td><span className={`badge ${a.status === 'inactive' ? 'inactive' : 'active'}`}>{a.status ?? 'active'}</span></td>
                    <td>{fmtDate(a.created_at)}</td>
                    <td>
                      <button className="btn" onClick={() => toggleEdit(a)}>{editId === a.id ? 'Close' : 'Edit'}</button>
                      <button
                        className="btn"
                        disabled={busy === `status-${a.id}`}
                        onClick={() => void toggleStatus(a)}
                      >
                        {a.status === 'inactive' ? 'Reactivate' : 'Deactivate'}
                      </button>
                    </td>
                  </tr>
                  {editId === a.id && (
                    <tr>
                      <td colSpan={10} style={{ background: 'transparent' }}>
                        <div className="agform">
                          <div className="row3">
                            <div>
                              <label>Agreement type</label>
                              <select value={edType} onChange={(e) => setEdType(e.target.value)}>
                                {AGREEMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>
                            <div>
                              <label>Contracting entity</label>
                              <select value={edEntity} onChange={(e) => setEdEntity(e.target.value)}>
                                {CONTRACTING_ENTITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                            <div>
                              <label>Applies to</label>
                              <select value={edApplies} onChange={(e) => setEdApplies(e.target.value)}>
                                {APPLIES_TO.map((x) => <option key={x} value={x}>{x}</option>)}
                              </select>
                            </div>
                          </div>
                          <div className="row3">
                            <div>
                              <label>Partner contract price ($)</label>
                              <input type="number" min={0} step={0.01} value={edPrice} onChange={(e) => setEdPrice(e.target.value)} placeholder="0.00" />
                            </div>
                            <div>
                              <label>Divini margin %</label>
                              <input type="number" min={0} max={100} step={0.5} value={edRate} onChange={(e) => setEdRate(e.target.value)} placeholder="5" />
                            </div>
                            <div>
                              <label>Kickback</label>
                              <select value={edKickType} onChange={(e) => setEdKickType(e.target.value)}>
                                {KICKBACK_TYPES.map((k) => <option key={k} value={k}>{k === 'none' ? 'None' : k === 'percent' ? 'Percent' : 'Flat'}</option>)}
                              </select>
                            </div>
                          </div>
                          {edKickType !== 'none' && (
                            <div className="row3">
                              <div>
                                <label>Kickback value ({edKickType === 'percent' ? '%' : '$'})</label>
                                <input type="number" min={0} step={edKickType === 'percent' ? 0.5 : 0.01} value={edKickValue} onChange={(e) => setEdKickValue(e.target.value)} placeholder={edKickType === 'percent' ? '2' : '0.00'} />
                              </div>
                            </div>
                          )}
                          {(() => {
                            const priceCents = edPrice.trim() === '' ? 0 : Math.round(Number(edPrice || 0) * 100);
                            const marginPct = Number(edRate || 0);
                            const kType = edKickType === 'none' ? null : (edKickType as 'percent' | 'flat');
                            const kVal = Number(edKickValue || 0);
                            const calc = computeClientTotalCents(priceCents, marginPct, kType, kVal);
                            return (
                              <div className="pricebox">
                                <div className="priceline"><span className="lbl">Partner price</span><span>{fmtMoney(calc.base)}</span></div>
                                <div className="priceline"><span className="lbl">Divini margin ({marginPct || 0}%)</span><span>{fmtMoney(calc.margin)}</span></div>
                                <div className="priceline"><span className="lbl">Kickback{kType ? ` (${edKickType === 'percent' ? `${kVal}%` : fmtMoney(Math.round(kVal * 100))})` : ''}</span><span>{fmtMoney(calc.kickback)}</span></div>
                                <div className="priceline total"><span>Client total</span><span>{fmtMoney(calc.total)}</span></div>
                              </div>
                            );
                          })()}
                          <div className="vendorbox">
                            <div className="vrow">
                              <div>
                                <label>Assigned vendor</label>
                                <select value={edVendorPick} onChange={(e) => setEdVendorPick(e.target.value)}>
                                  <option value="">Select a vendor...</option>
                                  {vendors.map((v) => (
                                    <option key={(v.profile_id || v.business_name) as string} value={(v.profile_id || v.business_name) as string}>
                                      {v.business_name}
                                    </option>
                                  ))}
                                  <option value="__custom__">Other (type a name)</option>
                                </select>
                              </div>
                              <button className="btn" disabled={busy === `assign-${a.id}`} onClick={() => void assignVendor(a.id)}>Assign vendor</button>
                              {a.assigned_vendor_name && a.assigned_vendor_status !== 'removed' && (
                                <button className="btn" disabled={busy === `remove-${a.id}`} onClick={() => void removeVendor(a.id)}>Remove vendor</button>
                              )}
                            </div>
                            {edVendorPick === '__custom__' && (
                              <div style={{ marginBottom: 8 }}>
                                <input value={edVendor} onChange={(e) => setEdVendor(e.target.value)} placeholder="Vendor business name" />
                              </div>
                            )}
                            <p className="vmeta">
                              Incentive: the kickback is paid to this account from the assigned vendor (e.g. venue earns a kickback from A3 printing).
                            </p>
                            {a.assigned_vendor_name && (
                              <p className="vmeta">
                                Current: <strong>{a.assigned_vendor_name}</strong>
                                {a.assigned_vendor_status ? ` (${a.assigned_vendor_status})` : ''}
                                {a.assigned_vendor_status === 'removed' && a.assigned_vendor_removed_reason ? ` - removed: ${a.assigned_vendor_removed_reason}` : ''}
                              </p>
                            )}
                            {!a.assigned_vendor_name && <p className="vmeta">No vendor assigned yet.</p>}
                          </div>
                          <div style={{ marginBottom: 10 }}>
                            <label>Terms (optional)</label>
                            <textarea rows={3} value={edTerms} onChange={(e) => setEdTerms(e.target.value)} placeholder="Notes about this partnership..." />
                          </div>
                          <div style={{ marginBottom: 10 }}>
                            <label>Signed agreement link (optional)</label>
                            <input value={edDoc} onChange={(e) => setEdDoc(e.target.value)} placeholder="https://" />
                          </div>
                          {a.signed_status === 'signed' && (
                            <p className="vmeta">
                              <span className="badge signed">Signed</span>
                              {a.signed_by ? ` by ${a.signed_by}` : ''}{a.signed_at ? ` on ${fmtDate(a.signed_at)}` : ''}
                            </p>
                          )}
                          <div style={{ marginTop: 10 }}>
                            <button className="btn primary" disabled={busy === `edit-${a.id}`} onClick={() => void saveEdit(a.id)}>Save changes</button>
                            <button className="btn" disabled={busy === `sign-${a.id}`} onClick={() => void autoSign(a.id)}>Auto-sign &amp; Save</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {loadingRows && <tr><td colSpan={10} className="status">Loading agreements...</td></tr>}
              {!loadingRows && !rows.length && <tr><td colSpan={10} className="status">No agreements yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
