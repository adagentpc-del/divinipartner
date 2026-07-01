import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

// Phase 1 (Workstream A) - Quote Approvals. Shows the vendor's quote drafts and,
// for a selected draft, the internal Sales -> PM -> Vendor approval chain with
// approve / reject controls. This layer wraps AROUND quote_drafts: it never edits
// the draft itself; once all three stages are approved the draft is "ready" for
// the existing vendor_approved / client_delivered flow. Backed by
// /api/quote-approvals and /api/quote-drafts (list) and /api/vendor-team/me
// (permission gating). Stages must be approved in order; each stage's buttons are
// disabled when the user's vendor role lacks the matching permission.
//
// Self-contained: no route is registered here (the integration lead wires it).
// Default export, no required props.

type Stage = 'sales' | 'pm' | 'vendor';
type Status = 'pending' | 'approved' | 'rejected';

type Draft = {
  id: string;
  event_id: string | null;
  vendor_id: string | null;
  scope_of_work: string | null;
  computed_price: string | null;
  status: string;
};

type SummaryStage = { stage: Stage; status: Status };
type Summary = { stages: SummaryStage[]; next_stage: Stage | null; complete: boolean; rejected: boolean };
type MeResp = { role: string | null; can: Record<string, boolean> };

const STAGE_LABEL: Record<Stage, string> = { sales: 'Sales', pm: 'Project Manager', vendor: 'Vendor sign-off' };
const STAGE_PERM: Record<Stage, string> = { sales: 'approve_sales', pm: 'approve_pm', vendor: 'edit_quote' };

export default function QuoteApprovals() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [can, setCan] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState('');

  const [loading, setLoading] = useState(true);
  const [chainLoading, setChainLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function loadDrafts() {
    setLoading(true);
    try {
      const [meRes, listRes] = await Promise.all([
        apiGet<MeResp>('/vendor-team/me'),
        apiGet<{ drafts: Draft[] }>('/quote-drafts'),
      ]);
      setCan(meRes.can || {});
      setDrafts(listRes.drafts || []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDrafts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function openChain(id: string) {
    setActiveId(id);
    setSummary(null);
    setNote('');
    setOk(null);
    setChainLoading(true);
    try {
      const res = await apiGet<{ summary: Summary }>(`/quote-approvals/draft/${id}`);
      setSummary(res.summary);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChainLoading(false);
    }
  }

  async function decide(stage: Stage, status: 'approved' | 'rejected') {
    if (!activeId) return;
    setSaving(true);
    setOk(null);
    try {
      const res = await apiSend<{ summary: Summary; ready: boolean }>(
        'POST',
        `/quote-approvals/draft/${activeId}/decision`,
        { stage, status, note: note.trim() || null },
      );
      setSummary(res.summary);
      setNote('');
      setOk(res.ready ? 'All stages approved. The quote is ready to proceed.' : `${STAGE_LABEL[stage]} ${status}.`);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function stageState(stage: Stage): Status {
    return summary?.stages.find((s) => s.stage === stage)?.status ?? 'pending';
  }

  const activeDraft = drafts.find((d) => d.id === activeId) || null;

  return (
    <div className="qa">
      <style>{CSS}</style>

      <header className="qa-head">
        <span className="qa-kicker">Vendor Workspace</span>
        <h1 className="qa-title">Quote Approvals</h1>
        <p className="qa-sub">
          Move each quote through your internal review: Sales, then Project Manager, then a final
          Vendor sign-off. Stages approve in order; you only see buttons for stages your role can act on.
        </p>
      </header>

      {error && <div className="qa-error">{error}</div>}
      {ok && <div className="qa-ok">{ok}</div>}

      <div className="qa-grid">
        <section className="qa-section qa-drafts">
          <h2>Quote drafts</h2>
          {loading ? (
            <p className="qa-muted">Loading.</p>
          ) : drafts.length === 0 ? (
            <p className="qa-muted">No quote drafts yet.</p>
          ) : (
            <div className="qa-list">
              {drafts.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`qa-draftrow${activeId === d.id ? ' active' : ''}`}
                  onClick={() => openChain(d.id)}
                >
                  <span className="qa-draftscope">{d.scope_of_work || '(no scope)'}</span>
                  <span className="qa-draftmeta">
                    {d.computed_price ? `$${d.computed_price}` : 'no price'}
                    <span className="qa-draftstatus">{d.status}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="qa-section qa-chain">
          <h2>Approval chain</h2>
          {!activeId ? (
            <p className="qa-muted">Select a quote draft to review its approval chain.</p>
          ) : chainLoading ? (
            <p className="qa-muted">Loading chain.</p>
          ) : !summary ? (
            <p className="qa-muted">No chain.</p>
          ) : (
            <div>
              {activeDraft && (
                <p className="qa-active">
                  {activeDraft.scope_of_work || '(no scope)'}
                  {summary.complete ? <span className="qa-ready">Ready</span> : null}
                  {summary.rejected ? <span className="qa-blocked">Blocked</span> : null}
                </p>
              )}

              <div className="qa-stages">
                {(['sales', 'pm', 'vendor'] as Stage[]).map((stage) => {
                  const st = stageState(stage);
                  const isNext = summary.next_stage === stage;
                  const allowed = !!can[STAGE_PERM[stage]];
                  return (
                    <div key={stage} className={`qa-stage qa-${st}`}>
                      <div className="qa-stagehead">
                        <span className="qa-stagename">{STAGE_LABEL[stage]}</span>
                        <span className={`qa-statuspill qa-pill-${st}`}>{st}</span>
                      </div>
                      {st === 'pending' && isNext && (
                        <div className="qa-stageactions">
                          {allowed ? (
                            <>
                              <button type="button" className="qa-approve" onClick={() => decide(stage, 'approved')} disabled={saving}>
                                Approve
                              </button>
                              <button type="button" className="qa-reject" onClick={() => decide(stage, 'rejected')} disabled={saving}>
                                Reject
                              </button>
                            </>
                          ) : (
                            <span className="qa-locked">Your role cannot act on this stage.</span>
                          )}
                        </div>
                      )}
                      {st === 'pending' && !isNext && !summary.rejected && (
                        <span className="qa-waiting">Waiting on an earlier stage.</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {summary.next_stage && can[STAGE_PERM[summary.next_stage]] && (
                <label className="qa-note">Decision note (optional)
                  <input value={note} placeholder="Add a note for this decision" onChange={(e) => setNote(e.target.value)} />
                </label>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const CSS = `
.qa { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --iv:#F7F4EE; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:1100px; }
.qa *,.qa *::before,.qa *::after { box-sizing:border-box; }
.qa h1,.qa h2 { font-family:'Cormorant Garamond',Georgia,serif; margin:0; }
.qa-head { margin-bottom:18px; }
.qa-kicker { font-size:10.5px; letter-spacing:1.4px; text-transform:uppercase; color:var(--g); font-weight:600; }
.qa-title { font-size:28px; color:var(--e); line-height:1.1; }
.qa-sub { font-size:13px; color:var(--mut); margin:4px 0 0; max-width:680px; }
.qa-error { background:#fff3f1; border:1px solid #e7b7ab; color:#9a3a28; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.qa-ok { background:rgba(30,93,74,.1); border:1px solid rgba(30,93,74,.3); color:var(--e2); padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.qa-grid { display:grid; grid-template-columns:minmax(260px,1fr) minmax(320px,1.4fr); gap:14px; }
.qa-section { background:#fff; border:1px solid var(--ln); border-radius:14px; padding:18px; }
.qa-section h2 { font-size:20px; color:var(--e); margin-bottom:12px; }
.qa-muted { color:var(--mut); font-size:12.5px; }
.qa-list { display:flex; flex-direction:column; gap:8px; }
.qa-draftrow { display:flex; flex-direction:column; gap:4px; text-align:left; background:var(--iv); border:1px solid var(--ln); border-radius:10px; padding:10px 12px; cursor:pointer; font:inherit; }
.qa-draftrow.active { border-color:var(--g); }
.qa-draftscope { font-size:13px; color:var(--e); font-weight:600; }
.qa-draftmeta { font-size:11.5px; color:var(--mut); display:flex; align-items:center; gap:8px; }
.qa-draftstatus { font-size:10px; text-transform:uppercase; letter-spacing:.5px; background:#fff; border:1px solid var(--ln); padding:1px 7px; border-radius:20px; }
.qa-active { font-size:13.5px; color:var(--e); font-weight:600; margin:0 0 12px; display:flex; align-items:center; gap:10px; }
.qa-ready { font-size:10.5px; text-transform:uppercase; letter-spacing:.5px; background:var(--e); color:#fff; padding:2px 9px; border-radius:20px; }
.qa-blocked { font-size:10.5px; text-transform:uppercase; letter-spacing:.5px; background:#9a3a28; color:#fff; padding:2px 9px; border-radius:20px; }
.qa-stages { display:flex; flex-direction:column; gap:10px; }
.qa-stage { border:1px solid var(--ln); border-radius:12px; padding:12px 14px; background:var(--iv); }
.qa-stage.qa-approved { border-color:rgba(30,93,74,.4); }
.qa-stage.qa-rejected { border-color:#e7b7ab; }
.qa-stagehead { display:flex; align-items:center; justify-content:space-between; }
.qa-stagename { font-size:13.5px; color:var(--e); font-weight:600; }
.qa-statuspill { font-size:10px; text-transform:uppercase; letter-spacing:.5px; padding:3px 9px; border-radius:20px; font-weight:600; }
.qa-pill-pending { background:var(--mut); color:#fff; }
.qa-pill-approved { background:var(--e2); color:#fff; }
.qa-pill-rejected { background:#9a3a28; color:#fff; }
.qa-stageactions { display:flex; gap:8px; align-items:center; margin-top:10px; }
.qa-approve { background:var(--e); color:#fff; border:0; border-radius:9px; font:inherit; font-size:12.5px; font-weight:600; padding:7px 18px; cursor:pointer; }
.qa-approve:hover { background:var(--e2); }
.qa-reject { background:#fff; color:#9a3a28; border:1px solid #e7b7ab; border-radius:9px; font:inherit; font-size:12.5px; font-weight:600; padding:7px 18px; cursor:pointer; }
.qa-approve:disabled,.qa-reject:disabled { opacity:.6; cursor:default; }
.qa-locked,.qa-waiting { font-size:11.5px; color:var(--mut); margin-top:8px; display:inline-block; }
.qa-note { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--mut); font-weight:600; margin-top:14px; }
.qa-note input { font:inherit; font-size:13px; padding:8px 10px; border:1px solid var(--ln); border-radius:9px; background:#fff; color:var(--ink); }
@media (max-width:760px){ .qa-grid { grid-template-columns:1fr; } }
`;
