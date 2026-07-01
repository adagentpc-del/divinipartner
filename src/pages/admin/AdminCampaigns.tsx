import React, { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { apiGet, apiSend } from '../../lib/api';

/**
 * AdminCampaigns - the campaign engine console. Admin-only.
 *
 * Flow (the gating is intentional): create a campaign, send a TEST to yourself,
 * review it, then explicitly Approve and Push to broadcast to all recipients.
 *
 * Endpoints:
 *   GET  /admin/campaigns
 *   POST /admin/campaigns
 *   GET  /admin/campaigns/:id
 *   POST /admin/campaigns/:id/test          (test email to the admin only)
 *   POST /admin/campaigns/:id/approve-send  (broadcast to everyone)
 *
 * ZERO em dashes anywhere (hard rule).
 */

type Campaign = {
  id: string;
  name: string | null;
  status: string | null;
  subject: string | null;
  recipient_count: number | null;
  sent_count: number | null;
  created_at: string;
};

type Recipient = { email: string; name: string | null };

type Audience = 'venue' | 'vendor' | 'planner' | 'all';

const STYLES = `
.acp{--emerald:#1E5D4A;--emerald-deep:#123c2e;--emerald-mid:#174838;--gold:#C9A35B;--champagne:#D9CCB0;--ink:#2c2a26;--muted:#7d776c;--line:#e7e1d6;--ivory:#f7f4ee;background:var(--ivory);color:var(--ink);min-height:100vh;font-family:Inter,system-ui,sans-serif}
.acp .wrap{max-width:1180px;margin:0 auto;padding:26px 28px 60px}
.acp h1,.acp h2,.acp h3{font-family:'Cormorant Garamond',serif;color:var(--emerald-deep);margin:0}
.acp .top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:6px}
.acp .top h1{font-size:28px}
.acp .by{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-top:2px}
.acp .sectitle{font-size:12px;letter-spacing:.7px;text-transform:uppercase;color:var(--muted);font-weight:700;margin:26px 0 12px}
.acp .card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:18px}
.acp table{width:100%;border-collapse:collapse}
.acp th{text-align:left;font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);font-weight:600;padding:9px 10px;border-bottom:1px solid var(--line)}
.acp td{padding:10px;border-bottom:1px solid var(--line);font-size:13px;vertical-align:middle}
.acp .status{font-size:11px;color:var(--muted)}
.acp .badge{font-size:10px;font-weight:700;text-transform:uppercase;padding:3px 8px;border-radius:20px;background:#eef0ee;color:#5a6b62;border:1px solid #dde2dd}
.acp .badge.sent{background:#e6f3ec;color:#1a5d42;border-color:#cfe6da}
.acp .badge.draft{background:#f6f1e6;color:#8a6a1f;border-color:#ecdfbf}
.acp .badge.sending{background:#eaf0f6;color:#2a5a8a;border-color:#cdddec}
.acp .btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:#fff;color:var(--emerald-deep);font-family:Inter;font-size:12px;font-weight:600;padding:6px 11px;border-radius:8px;cursor:pointer;transition:.15s;margin:0 4px 4px 0}
.acp .btn:hover{border-color:var(--emerald);background:var(--ivory)}
.acp .btn.primary{background:var(--emerald);border-color:var(--emerald);color:#fff}
.acp .btn.primary:hover{background:var(--emerald-mid)}
.acp .btn.broadcast{background:var(--gold);border-color:var(--gold);color:#3a2c08}
.acp .btn.broadcast:hover{filter:brightness(.96)}
.acp .btn:disabled{opacity:.6;cursor:default}
.acp label{display:block;font-size:12px;color:var(--muted);font-weight:600;margin:0 0 6px}
.acp input,.acp select,.acp textarea{width:100%;padding:10px 11px;border:1px solid var(--line);border-radius:9px;font-family:Inter;font-size:13.5px;background:#fff;color:var(--ink);box-sizing:border-box}
.acp textarea{font-family:ui-monospace,monospace;font-size:12.5px}
.acp input:focus,.acp select:focus,.acp textarea:focus{outline:none;border-color:var(--emerald)}
.acp .row3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px}
.acp .msg{padding:10px 13px;border-radius:9px;font-size:13px;margin-top:10px}
.acp .msg.ok{background:#eef6f1;border:1px solid #cfe6da;color:var(--emerald-deep)}
.acp .msg.err{background:#fbeeee;border:1px solid #ecd2d2;color:#7a3030}
.acp .detail{background:var(--ivory);border:1px solid var(--line);border-radius:11px;padding:16px;margin-top:8px}
.acp .step{display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px dashed var(--line)}
.acp .step:last-child{border-bottom:0}
.acp .stepnum{flex:0 0 auto;width:24px;height:24px;border-radius:50%;background:var(--emerald);color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center}
.acp .stephd{font-weight:600;font-size:13px;color:var(--emerald-deep)}
.acp .stepsub{font-size:12px;color:var(--muted);margin:2px 0 8px}
.acp .gate{max-width:460px;margin:80px auto;text-align:center;background:#fff;border:1px solid var(--line);border-radius:16px;padding:40px}
@media(max-width:1024px){.acp .row3{grid-template-columns:1fr}}
`;

export default function AdminCampaigns() {
  const { isAdmin, loading } = useAuth();
  const [rows, setRows] = useState<Campaign[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // create form
  const [name, setName] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');

  // expanded campaign detail
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ campaign: Campaign; recipients: Recipient[] } | null>(null);

  async function load() {
    setLoadingRows(true);
    try {
      const r = await apiGet<{ campaigns: Campaign[] }>('/admin/campaigns');
      setRows(r.campaigns);
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to load campaigns.' });
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
      await apiSend<{ campaign: Campaign }>('POST', '/admin/campaigns', {
        name,
        audience: { kind: audience },
        subject,
        bodyHtml,
      });
      setMsg({ kind: 'ok', text: 'Campaign created as a draft. Send yourself a test before broadcasting.' });
      setName('');
      setSubject('');
      setBodyHtml('');
      setAudience('all');
      await load();
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Failed to create campaign.' });
    } finally {
      setBusy(null);
    }
  }

  async function openCampaign(id: string) {
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(id);
    setDetail(null);
    try {
      const d = await apiGet<{ campaign: Campaign; recipients: Recipient[] }>(`/admin/campaigns/${id}`);
      setDetail(d);
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to load campaign.' });
    }
  }

  async function sendTest(id: string) {
    setMsg(null);
    setBusy(`test-${id}`);
    try {
      const out = await apiSend<{ sent: boolean; to: string }>('POST', `/admin/campaigns/${id}/test`);
      setMsg({ kind: 'ok', text: `Test sent to ${out.to}. Check your inbox before broadcasting.` });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to send test.' });
    } finally {
      setBusy(null);
    }
  }

  async function approveSend(id: string, recipientCount: number) {
    if (!window.confirm(`This sends to all ${recipientCount} recipients. Continue?`)) return;
    setMsg(null);
    setBusy(`send-${id}`);
    try {
      const out = await apiSend<{ recipient_count: number; sent_count: number }>('POST', `/admin/campaigns/${id}/approve-send`);
      setMsg({ kind: 'ok', text: `Campaign broadcast. Sent to ${out.sent_count} of ${out.recipient_count} recipients.` });
      await load();
      if (openId === id) {
        const d = await apiGet<{ campaign: Campaign; recipients: Recipient[] }>(`/admin/campaigns/${id}`);
        setDetail(d);
      }
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to broadcast campaign.' });
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <div className="acp"><style>{STYLES}</style><div className="wrap"><p style={{ padding: 60 }}>Loading...</p></div></div>;
  }

  if (!isAdmin) {
    return (
      <div className="acp">
        <style>{STYLES}</style>
        <div className="gate">
          <h1>Administrators only</h1>
          <p>This page is restricted to platform administrators.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="acp">
      <style>{STYLES}</style>
      <div className="wrap">
        <div className="top">
          <div>
            <h1>Campaigns</h1>
            <div className="by">Divini Partners by Divini Group</div>
          </div>
          <button className="btn" onClick={() => void load()}>Refresh</button>
        </div>

        {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}

        <div className="sectitle">Create campaign</div>
        <div className="card">
          <form onSubmit={create}>
            <div className="row3">
              <div>
                <label>Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <label>Audience</label>
                <select value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
                  <option value="all">All</option>
                  <option value="venue">Venues</option>
                  <option value="vendor">Vendors</option>
                  <option value="planner">Planners</option>
                </select>
              </div>
              <div>
                <label>Subject</label>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} required />
              </div>
            </div>
            <div>
              <label>Body (HTML)</label>
              <textarea rows={8} value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} placeholder="<p>Hello {{name}},</p>" />
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="btn primary" type="submit" disabled={busy === 'create'}>Create campaign</button>
            </div>
          </form>
        </div>

        <div className="sectitle">Campaigns</div>
        <div className="card">
          <table>
            <thead>
              <tr><th>Name</th><th>Subject</th><th>Status</th><th>Recipients</th><th>Sent</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <React.Fragment key={c.id}>
                  <tr>
                    <td style={{ fontWeight: 600 }}>{c.name ?? '-'}</td>
                    <td>{c.subject ?? '-'}</td>
                    <td><span className={`badge ${c.status ?? ''}`}>{c.status ?? 'draft'}</span></td>
                    <td>{c.recipient_count ?? 0}</td>
                    <td>{c.sent_count ?? 0}</td>
                    <td>
                      <button className="btn" onClick={() => openCampaign(c.id)}>{openId === c.id ? 'Hide' : 'Open'}</button>
                    </td>
                  </tr>
                  {openId === c.id && (
                    <tr>
                      <td colSpan={6} style={{ background: 'transparent' }}>
                        {!detail ? (
                          <p className="status" style={{ padding: '8px 0' }}>Loading campaign...</p>
                        ) : (
                          <div className="detail">
                            <div className="step">
                              <div className="stepnum">1</div>
                              <div style={{ flex: 1 }}>
                                <div className="stephd">Review recipients</div>
                                <div className="stepsub">
                                  This campaign will reach <b>{detail.recipients.length}</b> recipients
                                  {' '}(audience preview).
                                </div>
                                {detail.recipients.slice(0, 8).map((r, i) => (
                                  <div key={`${r.email}-${i}`} className="status">{r.name ? `${r.name} ` : ''}&lt;{r.email}&gt;</div>
                                ))}
                                {detail.recipients.length > 8 && (
                                  <div className="status">and {detail.recipients.length - 8} more...</div>
                                )}
                              </div>
                            </div>
                            <div className="step">
                              <div className="stepnum">2</div>
                              <div style={{ flex: 1 }}>
                                <div className="stephd">Send a test to yourself</div>
                                <div className="stepsub">A test email goes only to your admin address so you can proof it.</div>
                                <button
                                  className="btn"
                                  disabled={busy === `test-${c.id}`}
                                  onClick={() => sendTest(c.id)}
                                >
                                  Send test to me
                                </button>
                              </div>
                            </div>
                            <div className="step">
                              <div className="stepnum">3</div>
                              <div style={{ flex: 1 }}>
                                <div className="stephd">Approve and push to everyone</div>
                                <div className="stepsub">
                                  This is the final broadcast to all {detail.recipients.length} recipients. Test first.
                                </div>
                                <button
                                  className="btn broadcast"
                                  disabled={busy === `send-${c.id}`}
                                  onClick={() => approveSend(c.id, detail.recipients.length)}
                                >
                                  Approve and Push Campaign
                                </button>
                                {(c.sent_count ?? 0) > 0 && (
                                  <span className="status" style={{ marginLeft: 8 }}>Sent so far: {c.sent_count}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {loadingRows && <tr><td colSpan={6} className="status">Loading campaigns...</td></tr>}
              {!loadingRows && !rows.length && <tr><td colSpan={6} className="status">No campaigns yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
