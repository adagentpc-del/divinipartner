import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { apiGet, apiSend } from '../lib/api';

/**
 * ComplianceCenter (Module 7) - privacy / data-subject compliance.
 * Backed by /api/compliance-privacy. Any signed-in user can submit a privacy
 * request and manage their consents; super-admins also see ALL requests, advance
 * their status, and set data-retention policies.
 *
 * Route: /admin/compliance (SuperAdmin), but the request-submission card is
 * usable by any authenticated user the page is rendered for.
 *
 * Deletion requests are recorded as workflow records; no data is hard-deleted
 * automatically - a super-admin reviews and processes each one.
 */
type PrivacyRequest = {
  id: string;
  kind: string;
  status: string;
  detail: string | null;
  resolution_note: string | null;
  requester_email: string | null;
  created_at: string;
  completed_at: string | null;
};
type Consent = { id: string; consent_type: string; granted: boolean; created_at: string };
type Retention = { id: string; organization_id: string | null; object_type: string; retention_days: number; note: string | null };

const KINDS = ['access', 'export', 'correction', 'deletion'];
const STATUSES = ['received', 'in_progress', 'completed', 'rejected'];

export default function ComplianceCenter() {
  const { isAdmin } = useAuth();
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [policies, setPolicies] = useState<Retention[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // submit form
  const [kind, setKind] = useState('access');
  const [detail, setDetail] = useState('');
  // retention form
  const [objType, setObjType] = useState('');
  const [days, setDays] = useState('365');

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [r, c] = await Promise.all([
        apiGet<{ requests: PrivacyRequest[] }>('/compliance-privacy/requests'),
        apiGet<{ consents: Consent[] }>('/compliance-privacy/consent'),
      ]);
      setRequests(r.requests);
      setConsents(c.consents);
      if (isAdmin) {
        const p = await apiGet<{ policies: Retention[] }>('/compliance-privacy/retention');
        setPolicies(p.policies);
      }
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [isAdmin]);

  async function submitRequest() {
    setErr(null); setMsg(null);
    try {
      await apiSend('POST', '/compliance-privacy/requests', { kind, detail });
      setDetail('');
      setMsg('Your privacy request was received. Our team will process it.');
      await load();
    } catch (e) { setErr((e as Error).message); }
  }
  async function advance(id: string, status: string) {
    setErr(null);
    try {
      await apiSend('POST', `/compliance-privacy/requests/${id}/status`, { status });
      await load();
    } catch (e) { setErr((e as Error).message); }
  }
  async function setConsent(type: string, granted: boolean) {
    setErr(null);
    try {
      await apiSend('POST', '/compliance-privacy/consent', { consent_type: type, granted });
      await load();
    } catch (e) { setErr((e as Error).message); }
  }
  async function savePolicy() {
    setErr(null); setMsg(null);
    try {
      await apiSend('POST', '/compliance-privacy/retention', {
        object_type: objType, retention_days: Number(days),
      });
      setObjType('');
      setMsg('Retention policy saved.');
      await load();
    } catch (e) { setErr((e as Error).message); }
  }

  const consentTypes = ['marketing_email', 'analytics', 'data_processing'];

  return (
    <div className="cc">
      <style>{CC_CSS}</style>
      <header className="cc-head">
        <span className="cc-kicker">{isAdmin ? 'Super Admin' : 'Your privacy'}</span>
        <h1 className="cc-title">Compliance Center</h1>
        <p className="cc-sub">Data-subject requests, consent, and retention policy.</p>
      </header>

      {err ? <p className="cc-err">{err}</p> : null}
      {msg ? <p className="cc-ok">{msg}</p> : null}

      {/* Submit a privacy request - available to any authenticated user */}
      <section className="cc-card">
        <h3>Submit a privacy request</h3>
        <p className="cc-card-sub">Request access to, export, correction, or deletion of your data.</p>
        <div className="cc-form">
          <select className="cc-input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <textarea className="cc-input cc-area" placeholder="Optional detail" value={detail} onChange={(e) => setDetail(e.target.value)} />
          <button type="button" className="cc-btn" onClick={submitRequest}>Submit request</button>
        </div>
      </section>

      {/* Consent management */}
      <section className="cc-card">
        <h3>Your consents</h3>
        <p className="cc-card-sub">Grant or withdraw consent for each processing purpose.</p>
        <div className="cc-consents">
          {consentTypes.map((t) => {
            const current = consents.find((c) => c.consent_type === t);
            const granted = current?.granted ?? false;
            return (
              <div key={t} className="cc-consent">
                <span className="cc-consent-name">{t.replace(/_/g, ' ')}</span>
                <span className={`cc-pill ${granted ? 'on' : 'off'}`}>{granted ? 'Granted' : 'Withdrawn'}</span>
                <button type="button" className="cc-btn ghost sm" onClick={() => setConsent(t, !granted)}>
                  {granted ? 'Withdraw' : 'Grant'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Requests list */}
      <section className="cc-card">
        <h3>{isAdmin ? 'All privacy requests' : 'Your requests'}</h3>
        {loading ? (
          <p className="cc-muted">Loading...</p>
        ) : requests.length === 0 ? (
          <div className="cc-empty"><p>No privacy requests yet.</p></div>
        ) : (
          <div className="cc-table">
            <div className="cc-tr cc-th"><span>Kind</span><span>Status</span><span>Requester</span><span>Created</span><span>Action</span></div>
            {requests.map((r) => (
              <div key={r.id} className="cc-tr">
                <span className="cc-cap">{r.kind}</span>
                <span><span className={`cc-badge st-${r.status}`}>{r.status.replace(/_/g, ' ')}</span></span>
                <span className="cc-muted2">{r.requester_email ?? '-'}</span>
                <span className="cc-muted2">{new Date(r.created_at).toLocaleDateString()}</span>
                <span>
                  {isAdmin ? (
                    <select className="cc-input sm" value={r.status} onChange={(e) => advance(r.id, e.target.value)}>
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : '-'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Retention policies - super-admin only */}
      {isAdmin ? (
        <section className="cc-card">
          <h3>Data retention policies</h3>
          <p className="cc-card-sub">Declare how long each object type is retained. Enforcement is operational, not automatic.</p>
          <div className="cc-form row">
            <input className="cc-input" placeholder="object_type (e.g. audit_logs)" value={objType} onChange={(e) => setObjType(e.target.value)} />
            <input className="cc-input sm" type="number" min="0" value={days} onChange={(e) => setDays(e.target.value)} />
            <button type="button" className="cc-btn" onClick={savePolicy}>Save policy</button>
          </div>
          {policies.length === 0 ? (
            <div className="cc-empty"><p>No retention policies defined.</p></div>
          ) : (
            <div className="cc-table">
              <div className="cc-tr cc-th tri"><span>Object type</span><span>Scope</span><span>Retention</span></div>
              {policies.map((p) => (
                <div key={p.id} className="cc-tr tri">
                  <span className="cc-cap">{p.object_type}</span>
                  <span className="cc-muted2">{p.organization_id ? 'Org override' : 'Platform default'}</span>
                  <span>{p.retention_days} days</span>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

const CC_CSS = `
.cc {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--dp-ink);
}
.cc *, .cc *::before, .cc *::after { box-sizing: border-box; }
.cc h1, .cc h3 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }
.cc-head { margin-bottom: 18px; }
.cc-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--dp-gold); font-weight: 600; }
.cc-title { font-size: 32px; color: var(--dp-emerald); line-height: 1.05; }
.cc-sub { margin: 4px 0 0; font-size: 13px; color: var(--dp-muted); }
.cc-err { color: #8a3a3a; background: #f6eaea; border: 1px solid #e2caca; border-radius: 8px; padding: 9px 12px; font-size: 12.5px; }
.cc-ok { color: #1E5D4A; background: rgba(30,93,74,.1); border: 1px solid rgba(30,93,74,.3); border-radius: 8px; padding: 9px 12px; font-size: 12.5px; }
.cc-card { background: #fff; border: 1px solid var(--dp-line); border-radius: 14px; padding: 20px; margin-bottom: 16px; }
.cc-card h3 { font-size: 20px; color: var(--dp-emerald); }
.cc-card-sub { font-size: 12.5px; color: var(--dp-muted); margin: 4px 0 12px; }
.cc-form { display: flex; flex-direction: column; gap: 10px; max-width: 520px; }
.cc-form.row { flex-direction: row; flex-wrap: wrap; align-items: center; max-width: none; }
.cc-input { font: inherit; padding: 8px 11px; border: 1px solid var(--dp-line); border-radius: 8px; background: #fff; font-size: 12.5px; }
.cc-input.sm { max-width: 120px; }
.cc-area { min-height: 70px; resize: vertical; }
.cc-consents { display: flex; flex-direction: column; gap: 8px; }
.cc-consent { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--dp-line); }
.cc-consent:last-child { border-bottom: 0; }
.cc-consent-name { flex: 1 1 auto; text-transform: capitalize; font-size: 13px; }
.cc-pill { font-size: 10px; letter-spacing: .4px; text-transform: uppercase; font-weight: 600; padding: 2px 9px; border-radius: 999px; }
.cc-pill.on { background: rgba(30,93,74,.12); color: #1E5D4A; border: 1px solid rgba(30,93,74,.3); }
.cc-pill.off { background: #eef0ee; color: #5a6b62; border: 1px solid #dde2dd; }
.cc-muted { color: var(--dp-muted); font-size: 13px; }
.cc-muted2 { color: var(--dp-muted); font-size: 12px; }
.cc-empty { border: 1px dashed var(--dp-line); border-radius: 11px; padding: 24px; background: rgba(247,244,238,.55); text-align: center; }
.cc-empty p { margin: 0; font-size: 12.5px; color: var(--dp-muted); }
.cc-table { display: flex; flex-direction: column; border: 1px solid var(--dp-line); border-radius: 11px; overflow: hidden; }
.cc-tr { display: grid; grid-template-columns: 1fr 1.2fr 1.4fr 1fr 1fr; gap: 10px; align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--dp-line); font-size: 12.5px; }
.cc-tr.tri { grid-template-columns: 1.4fr 1.2fr 1fr; }
.cc-tr:last-child { border-bottom: 0; }
.cc-th { background: rgba(18,60,46,.04); font-size: 10.5px; letter-spacing: .5px; text-transform: uppercase; color: var(--dp-muted); font-weight: 600; }
.cc-cap { text-transform: capitalize; font-weight: 600; color: var(--dp-emerald); }
.cc-badge { font-size: 10px; letter-spacing: .4px; text-transform: uppercase; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: #eef0ee; color: #5a6b62; border: 1px solid #dde2dd; }
.cc-badge.st-completed { background: rgba(30,93,74,.12); color: #1E5D4A; border-color: rgba(30,93,74,.3); }
.cc-badge.st-rejected { background: #f3e9e9; color: #8a4a4a; border-color: #e2caca; }
.cc-btn { align-self: flex-start; background: var(--dp-emerald); color: #fff; border: 0; border-radius: 8px; font: inherit; font-size: 12.5px; font-weight: 600; padding: 8px 16px; cursor: pointer; }
.cc-btn:hover { background: var(--dp-emerald-2); }
.cc-btn.ghost { background: transparent; color: var(--dp-emerald); border: 1px solid var(--dp-line); }
.cc-btn.sm { padding: 5px 11px; font-size: 11.5px; }
@media (max-width: 900px) { .cc-tr, .cc-tr.tri { grid-template-columns: 1fr 1fr; } .cc-th { display: none; } }
`;
