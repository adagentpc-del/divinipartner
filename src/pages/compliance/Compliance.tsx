import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../../lib/api';

/**
 * Compliance (blueprint 30 + 29) - COI / W-9 checklist, document records,
 * e-sign (MVP), and availability windows. Reads/writes /api/compliance.
 */
type ChecklistEntry = {
  key: string;
  label: string;
  coi: boolean;
  status: string;
  document_id: string | null;
  expiration_date: string | null;
  expires_in_days: number | null;
};
type DocRow = {
  id: string;
  name: string | null;
  document_type: string | null;
  approval_status: string | null;
  expiration_date: string | null;
  carrier: string | null;
  coverage_amount: string | null;
  signed_status: string | null;
};
type EsignRow = { id: string; title: string | null; signer_email: string | null; status: string | null; created_at: string };
type AvailRow = { id: string; resource_type: string | null; start_at: string; end_at: string; status: string | null; note: string | null };

export default function Compliance() {
  const [tab, setTab] = useState<'documents' | 'esign' | 'availability'>('documents');
  const [checklist, setChecklist] = useState<ChecklistEntry[]>([]);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [esign, setEsign] = useState<EsignRow[]>([]);
  const [avail, setAvail] = useState<AvailRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // new document
  const [docType, setDocType] = useState('w9');
  const [docName, setDocName] = useState('');
  const [docExp, setDocExp] = useState('');
  const [docCarrier, setDocCarrier] = useState('');
  const [docCoverage, setDocCoverage] = useState('');
  // new e-sign
  const [esTitle, setEsTitle] = useState('');
  const [esEmail, setEsEmail] = useState('');
  // new availability
  const [avResource, setAvResource] = useState('venue');
  const [avStart, setAvStart] = useState('');
  const [avEnd, setAvEnd] = useState('');
  const [avStatus, setAvStatus] = useState('available');
  const [avNote, setAvNote] = useState('');

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [c, d, e, a] = await Promise.all([
        apiGet<{ entries: ChecklistEntry[] }>('/compliance/checklist'),
        apiGet<{ documents: DocRow[] }>('/compliance/documents'),
        apiGet<{ requests: EsignRow[] }>('/compliance/esign'),
        apiGet<{ availability: AvailRow[] }>('/compliance/availability'),
      ]);
      setChecklist(c.entries);
      setDocs(d.documents);
      setEsign(e.requests);
      setAvail(a.availability);
    } catch (er) { setErr((er as Error).message); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function addDoc() {
    setBusy(true); setErr(null);
    try {
      await apiSend('POST', '/compliance/documents', {
        document_type: docType,
        name: docName || undefined,
        expiration_date: docExp || undefined,
        carrier: docCarrier || undefined,
        coverage_amount: docCoverage ? Number(docCoverage) : undefined,
      });
      setDocName(''); setDocExp(''); setDocCarrier(''); setDocCoverage('');
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function addEsign() {
    setBusy(true); setErr(null);
    try {
      await apiSend('POST', '/compliance/esign', { title: esTitle || undefined, signer_email: esEmail || undefined });
      setEsTitle(''); setEsEmail('');
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function markSigned(id: string) {
    setBusy(true);
    try { await apiSend('POST', `/compliance/esign/${id}/sign`, {}); await load(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function addAvail() {
    if (!avStart || !avEnd) { setErr('Start and end are required.'); return; }
    setBusy(true); setErr(null);
    try {
      await apiSend('POST', '/compliance/availability', {
        resource_type: avResource, start_at: avStart, end_at: avEnd, status: avStatus, note: avNote || undefined,
      });
      setAvStart(''); setAvEnd(''); setAvNote('');
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function removeAvail(id: string) {
    setBusy(true);
    try { await apiSend('DELETE', `/compliance/availability/${id}`); await load(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="cp">
      <style>{CP_CSS}</style>
      <header className="cp-head">
        <span className="cp-kicker">Compliance</span>
        <h1 className="cp-title">Compliance & Availability</h1>
        <p className="cp-sub">Insurance, tax forms, e-signatures, and your bookable calendar.</p>
      </header>

      {checklist.length > 0 ? (
        <div className="cp-checklist">
          <span className="cp-check-head">Required documents</span>
          <div className="cp-check-grid">
            {checklist.map((c) => (
              <div key={c.key} className={`cp-check st-${c.status}`}>
                <span className="cp-check-label">{c.label}{c.coi ? <em>COI</em> : null}</span>
                <span className="cp-check-status">{c.status}{c.expires_in_days != null && c.expires_in_days >= 0 && c.expires_in_days <= 30 ? ` - expires in ${c.expires_in_days}d` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="cp-tabs">
        <button type="button" className={tab === 'documents' ? 'is-active' : ''} onClick={() => setTab('documents')}>Documents</button>
        <button type="button" className={tab === 'esign' ? 'is-active' : ''} onClick={() => setTab('esign')}>E-Sign</button>
        <button type="button" className={tab === 'availability' ? 'is-active' : ''} onClick={() => setTab('availability')}>Availability</button>
      </div>

      {err ? <p className="cp-err">{err}</p> : null}
      {loading ? <p className="cp-muted">Loading...</p> : null}

      {tab === 'documents' ? (
        <>
          <div className="cp-form">
            <div className="cp-form-row">
              <label>Type
                <select value={docType} onChange={(e) => setDocType(e.target.value)}>
                  <option value="w9">W-9</option>
                  <option value="coi">Certificate of Insurance</option>
                  <option value="business_license">Business license</option>
                  <option value="service_agreement">Service agreement</option>
                  <option value="permits">Permits</option>
                </select>
              </label>
              <label>Name<input value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="Document name" /></label>
              <label>Expiration<input type="date" value={docExp} onChange={(e) => setDocExp(e.target.value)} /></label>
            </div>
            <div className="cp-form-row">
              <label>Carrier (COI)<input value={docCarrier} onChange={(e) => setDocCarrier(e.target.value)} placeholder="Insurer" /></label>
              <label>Coverage (COI)<input type="number" value={docCoverage} onChange={(e) => setDocCoverage(e.target.value)} placeholder="Amount" /></label>
              <div className="cp-form-spacer"><button type="button" className="cp-btn" disabled={busy} onClick={addDoc}>Add document</button></div>
            </div>
          </div>
          {docs.length === 0 ? <div className="cp-empty"><p>No documents on file.</p></div> : (
            <div className="cp-list">
              {docs.map((d) => (
                <div key={d.id} className="cp-row">
                  <span className="cp-row-name">{d.name || d.document_type}</span>
                  <span className="cp-cap">{d.document_type}</span>
                  <span className={`cp-badge st-${d.approval_status ?? 'pending'}`}>{d.approval_status ?? 'pending'}</span>
                  <span className="cp-row-meta">{d.expiration_date ? `Exp ${new Date(d.expiration_date).toLocaleDateString()}` : 'No expiry'}{d.carrier ? ` - ${d.carrier}` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}

      {tab === 'esign' ? (
        <>
          <div className="cp-form">
            <div className="cp-form-row">
              <label>Title<input value={esTitle} onChange={(e) => setEsTitle(e.target.value)} placeholder="Agreement title" /></label>
              <label>Signer email<input value={esEmail} onChange={(e) => setEsEmail(e.target.value)} placeholder="signer@example.com" /></label>
              <div className="cp-form-spacer"><button type="button" className="cp-btn" disabled={busy} onClick={addEsign}>Send for signature</button></div>
            </div>
          </div>
          {esign.length === 0 ? <div className="cp-empty"><p>No e-sign requests yet.</p></div> : (
            <div className="cp-list">
              {esign.map((e) => (
                <div key={e.id} className="cp-row">
                  <span className="cp-row-name">{e.title || 'Agreement'}</span>
                  <span className="cp-row-meta">{e.signer_email ?? '-'}</span>
                  <span className={`cp-badge st-${e.status ?? 'sent'}`}>{e.status ?? 'sent'}</span>
                  <span>{e.status !== 'signed' ? <button type="button" className="cp-pill" disabled={busy} onClick={() => markSigned(e.id)}>Mark signed</button> : 'Signed'}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}

      {tab === 'availability' ? (
        <>
          <div className="cp-form">
            <div className="cp-form-row">
              <label>Resource
                <select value={avResource} onChange={(e) => setAvResource(e.target.value)}>
                  <option value="venue">Venue</option>
                  <option value="vendor">Vendor</option>
                </select>
              </label>
              <label>Start<input type="datetime-local" value={avStart} onChange={(e) => setAvStart(e.target.value)} /></label>
              <label>End<input type="datetime-local" value={avEnd} onChange={(e) => setAvEnd(e.target.value)} /></label>
            </div>
            <div className="cp-form-row">
              <label>Status
                <select value={avStatus} onChange={(e) => setAvStatus(e.target.value)}>
                  <option value="available">Available</option>
                  <option value="blocked">Blocked</option>
                  <option value="tentative">Tentative</option>
                  <option value="booked">Booked</option>
                </select>
              </label>
              <label>Note<input value={avNote} onChange={(e) => setAvNote(e.target.value)} placeholder="Optional" /></label>
              <div className="cp-form-spacer"><button type="button" className="cp-btn" disabled={busy} onClick={addAvail}>Add window</button></div>
            </div>
          </div>
          {avail.length === 0 ? <div className="cp-empty"><p>No availability windows set.</p></div> : (
            <div className="cp-list">
              {avail.map((a) => (
                <div key={a.id} className="cp-row">
                  <span className="cp-cap">{a.resource_type}</span>
                  <span className="cp-row-meta">{new Date(a.start_at).toLocaleString()} to {new Date(a.end_at).toLocaleString()}</span>
                  <span className={`cp-badge st-${a.status ?? 'available'}`}>{a.status ?? 'available'}</span>
                  <span><button type="button" className="cp-pill warn" disabled={busy} onClick={() => removeAvail(a.id)}>Remove</button></span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

const CP_CSS = `
.cp {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--dp-ink);
}
.cp *, .cp *::before, .cp *::after { box-sizing: border-box; }
.cp h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }
.cp-head { margin-bottom: 16px; }
.cp-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--dp-gold); font-weight: 600; }
.cp-title { font-size: 32px; color: var(--dp-emerald); line-height: 1.05; }
.cp-sub { margin: 4px 0 0; font-size: 13px; color: var(--dp-muted); }
.cp-muted { color: var(--dp-muted); font-size: 13px; }
.cp-err { color: #8a3a3a; background: #f6eaea; border: 1px solid #e2caca; border-radius: 8px; padding: 9px 12px; font-size: 12.5px; }
.cp-checklist { background: #fff; border: 1px solid var(--dp-line); border-radius: 14px; padding: 16px; margin-bottom: 18px; }
.cp-check-head { font-size: 11px; letter-spacing: .5px; text-transform: uppercase; color: var(--dp-muted); font-weight: 600; }
.cp-check-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin-top: 10px; }
.cp-check { border: 1px solid var(--dp-line); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 3px; }
.cp-check.st-approved { border-color: rgba(30,93,74,.4); background: rgba(30,93,74,.05); }
.cp-check.st-missing { border-color: rgba(168,107,107,.4); background: rgba(168,107,107,.05); }
.cp-check.st-expired { border-color: #a86b6b; background: rgba(168,107,107,.1); }
.cp-check-label { font-size: 13px; font-weight: 600; color: var(--dp-emerald); }
.cp-check-label em { font-style: normal; font-size: 9px; margin-left: 6px; color: #8a6d27; background: rgba(201,163,91,.2); border-radius: 999px; padding: 1px 6px; vertical-align: middle; }
.cp-check-status { font-size: 11.5px; color: var(--dp-muted); text-transform: capitalize; }
.cp-tabs { display: flex; gap: 6px; margin-bottom: 16px; border-bottom: 1px solid var(--dp-line); }
.cp-tabs button { background: transparent; border: 0; border-bottom: 2px solid transparent; font: inherit; font-size: 13px; font-weight: 600; padding: 8px 14px; cursor: pointer; color: var(--dp-muted); }
.cp-tabs button.is-active { color: var(--dp-emerald); border-bottom-color: var(--dp-gold); }
.cp-form { background: #fff; border: 1px solid var(--dp-line); border-radius: 14px; padding: 16px; margin-bottom: 16px; }
.cp-form-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px; }
.cp-form-row:last-child { margin-bottom: 0; }
.cp label { display: flex; flex-direction: column; gap: 5px; font-size: 11px; letter-spacing: .3px; text-transform: uppercase; color: var(--dp-muted); font-weight: 600; }
.cp input, .cp select { font: inherit; font-size: 13px; padding: 8px 10px; border: 1px solid var(--dp-line); border-radius: 8px; background: #fff; color: var(--dp-ink); text-transform: none; letter-spacing: normal; font-weight: 400; }
.cp-form-spacer { display: flex; align-items: flex-end; }
.cp-btn { background: var(--dp-emerald); color: #fff; border: 0; border-radius: 9px; font: inherit; font-size: 13px; font-weight: 600; padding: 9px 16px; cursor: pointer; width: 100%; }
.cp-btn:hover { background: var(--dp-emerald-2); }
.cp-btn:disabled { opacity: .6; cursor: default; }
.cp-empty { border: 1px dashed var(--dp-line); border-radius: 12px; padding: 32px; background: rgba(247,244,238,.55); text-align: center; }
.cp-empty p { margin: 0; font-size: 13px; color: var(--dp-muted); }
.cp-list { display: flex; flex-direction: column; border: 1px solid var(--dp-line); border-radius: 12px; overflow: hidden; background: #fff; }
.cp-row { display: grid; grid-template-columns: 1.5fr 1fr 1fr 1.5fr; gap: 10px; align-items: center; padding: 11px 14px; border-bottom: 1px solid var(--dp-line); font-size: 12.5px; }
.cp-row:last-child { border-bottom: 0; }
.cp-row-name { font-weight: 600; color: var(--dp-emerald); }
.cp-row-meta { color: var(--dp-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-cap { text-transform: capitalize; }
.cp-badge { font-size: 10px; letter-spacing: .4px; text-transform: uppercase; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: #eef0ee; color: #5a6b62; border: 1px solid #dde2dd; justify-self: start; }
.cp-badge.st-approved, .cp-badge.st-signed, .cp-badge.st-available, .cp-badge.st-booked { background: rgba(30,93,74,.12); color: #1E5D4A; border-color: rgba(30,93,74,.3); }
.cp-badge.st-rejected, .cp-badge.st-blocked { background: #f3e9e9; color: #8a4a4a; border-color: #e2caca; }
.cp-pill { background: #fff; border: 1px solid var(--dp-line); border-radius: 999px; font: inherit; font-size: 11.5px; padding: 4px 11px; cursor: pointer; color: var(--dp-ink); }
.cp-pill:hover { border-color: var(--dp-gold); }
.cp-pill.warn { color: #8a4a4a; border-color: #e2caca; }
.cp-pill:disabled { opacity: .6; cursor: default; }
@media (max-width: 700px) { .cp-form-row { grid-template-columns: 1fr; } .cp-row { grid-template-columns: 1fr 1fr; } }
`;
