import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

/**
 * Divini Pipeline - the shared CRM board (docs/DIVINI_DETERMINISTIC_TOOLS_SPEC.md
 * section 6). Deterministic: stage moves, activity log, and the readiness
 * score are all real computed/stored values, never a generated summary.
 * One board for every role; stages are seeded from a shared default template
 * per org (GET /pipeline/stages) and can be customized later.
 */

type Stage = {
  id: string;
  key: string;
  label: string;
  sort_order: number;
  is_closed_won: boolean;
  is_closed_lost: boolean;
};

type Opportunity = {
  id: string;
  stage_id: string;
  name: string;
  category: string | null;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  decision_maker_name: string | null;
  estimated_value_cents: string | null;
  event_date: string | null;
  next_action_note: string | null;
  next_action_at: string | null;
  status: 'open' | 'won' | 'lost';
  loss_reason: string | null;
  updated_at: string;
};

type ReadinessFactor = { key: string; label: string; points: number; met: boolean };
type Readiness = { score: number; max: number; factors: ReadinessFactor[] };

type Activity = { id: string; activity_type: string; body: string | null; created_at: string };

function money(cents: string | null): string {
  if (cents == null) return '-';
  const n = Number(cents) / 100;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

const EMPTY_FORM = { name: '', category: '', client_name: '', client_email: '', estimated_value: '' };

export default function Pipeline() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [s, o] = await Promise.all([
        apiGet<{ stages: Stage[] }>('/pipeline/stages'),
        apiGet<{ opportunities: Opportunity[] }>('/pipeline/opportunities'),
      ]);
      setStages(s.stages);
      setOpportunities(o.opportunities);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend('POST', '/pipeline/opportunities', {
        name: form.name.trim(),
        category: form.category.trim() || undefined,
        client_name: form.client_name.trim() || undefined,
        client_email: form.client_email.trim() || undefined,
        estimated_value_cents: form.estimated_value ? Math.round(Number(form.estimated_value) * 100) : undefined,
      });
      setForm(EMPTY_FORM);
      setCreating(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function moveStage(oppId: string, stageId: string) {
    const target = stages.find((s) => s.id === stageId);
    let lossReason: string | null = null;
    if (target?.is_closed_lost) {
      lossReason = window.prompt('Reason lost (optional)') ?? '';
    }
    try {
      await apiSend('POST', `/pipeline/opportunities/${oppId}/stage`, { stage_id: stageId, loss_reason: lossReason || undefined });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="pipe">
      <style>{CSS}</style>

      <header className="pipe-head">
        <div>
          <h1>Divini Pipeline</h1>
          <p className="pipe-sub">Every opportunity, organized by stage, with a real readiness score for what to do next.</p>
        </div>
        <button className="pipe-btn" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Cancel' : 'New opportunity'}
        </button>
      </header>

      {loading && <p className="pipe-muted">Loading.</p>}
      {error && <p className="pipe-error">{error}</p>}

      {creating && (
        <form className="pipe-card pipe-form" onSubmit={create}>
          <input placeholder="Opportunity name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Category (optional)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <input placeholder="Client name (optional)" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
          <input placeholder="Client email (optional)" value={form.client_email} onChange={(e) => setForm({ ...form, client_email: e.target.value })} />
          <input type="number" min="0" step="0.01" placeholder="Estimated value ($, optional)" value={form.estimated_value} onChange={(e) => setForm({ ...form, estimated_value: e.target.value })} />
          <button type="submit" className="pipe-btn" disabled={busy}>{busy ? 'Saving...' : 'Create opportunity'}</button>
        </form>
      )}

      <div className="pipe-board">
        {stages.map((stage) => {
          const items = opportunities.filter((o) => o.stage_id === stage.id);
          return (
            <div className="pipe-col" key={stage.id}>
              <div className={'pipe-col-head' + (stage.is_closed_won ? ' won' : stage.is_closed_lost ? ' lost' : '')}>
                <span>{stage.label}</span>
                <span className="pipe-col-count">{items.length}</span>
              </div>
              <div className="pipe-col-body">
                {items.map((o) => (
                  <OpportunityCard
                    key={o.id}
                    opp={o}
                    stages={stages}
                    open={openId === o.id}
                    onToggle={() => setOpenId(openId === o.id ? null : o.id)}
                    onMove={(stageId) => moveStage(o.id, stageId)}
                    onChanged={load}
                  />
                ))}
                {items.length === 0 && <div className="pipe-col-empty">Empty</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OpportunityCard({
  opp,
  stages,
  open,
  onToggle,
  onMove,
  onChanged,
}: {
  opp: Opportunity;
  stages: Stage[];
  open: boolean;
  onToggle: () => void;
  onMove: (stageId: string) => void;
  onChanged: () => void;
}) {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    apiGet<{ readiness: Readiness }>(`/pipeline/opportunities/${opp.id}/readiness`).then((r) => { if (alive) setReadiness(r.readiness); }).catch(() => {});
    apiGet<{ activities: Activity[] }>(`/pipeline/opportunities/${opp.id}/activities`).then((r) => { if (alive) setActivities(r.activities); }).catch(() => {});
    return () => { alive = false; };
  }, [open, opp.id]);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    try {
      await apiSend('POST', `/pipeline/opportunities/${opp.id}/activities`, { activity_type: 'note', body: note.trim() });
      setNote('');
      const r = await apiGet<{ activities: Activity[] }>(`/pipeline/opportunities/${opp.id}/activities`);
      setActivities(r.activities);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={'pipe-card pipe-opp' + (open ? ' open' : '')}>
      <div className="pipe-opp-top" onClick={onToggle} role="button">
        <div className="pipe-opp-name">{opp.name}</div>
        {readiness && open && (
          <span className="pipe-score">{readiness.score}/{readiness.max}</span>
        )}
      </div>
      {opp.client_name && <div className="pipe-opp-client">{opp.client_name}</div>}
      <div className="pipe-opp-value">{money(opp.estimated_value_cents)}</div>

      <select
        className="pipe-move"
        value={opp.stage_id}
        onChange={(e) => onMove(e.target.value)}
        onClick={(e) => e.stopPropagation()}
      >
        {stages.map((s) => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>

      {open && (
        <div className="pipe-opp-detail">
          {readiness && (
            <div className="pipe-readiness">
              <div className="pipe-readiness-title">Readiness: {readiness.score}/{readiness.max}</div>
              <ul>
                {readiness.factors.map((f) => (
                  <li key={f.key} className={f.met ? 'met' : 'unmet'}>
                    {f.met ? '✓' : '○'} {f.label} ({f.points} pts)
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="pipe-activity">
            <div className="pipe-activity-title">Activity</div>
            {activities.map((a) => (
              <div className="pipe-activity-row" key={a.id}>
                <span className="pipe-activity-type">{a.activity_type}</span>
                <span>{a.body}</span>
                <span className="pipe-activity-date">{new Date(a.created_at).toLocaleDateString()}</span>
              </div>
            ))}
            <form onSubmit={addNote} className="pipe-note-form">
              <input placeholder="Add a note" value={note} onChange={(e) => setNote(e.target.value)} />
              <button type="submit" disabled={busy}>Add</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
.pipe { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --ink:#2c2a26; --mut:#6b6459; --ln:#e7e1d6;
  --bg:#fbf9f4; font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:1280px;
  margin:0 auto; padding:24px 20px 56px; }
.pipe *,.pipe *::before,.pipe *::after { box-sizing:border-box; }
.pipe-head { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; flex-wrap:wrap; }
.pipe-head h1 { font-size:26px; margin:0 0 6px; color:var(--e); font-weight:800; }
.pipe-sub { font-size:14px; color:var(--mut); margin:0; max-width:520px; line-height:1.5; }
.pipe-muted { font-size:12px; color:var(--mut); margin:10px 0 0; }
.pipe-error { font-size:13px; color:#9a3a28; margin-top:10px; }

.pipe-btn { background:var(--e); color:#fff; border:none; border-radius:9px; padding:9px 16px;
  font-size:13.5px; font-weight:600; cursor:pointer; white-space:nowrap; }
.pipe-btn:disabled { opacity:.6; cursor:default; }

.pipe-card { background:#fff; border:1px solid var(--ln); border-radius:12px; padding:14px 16px; }
.pipe-form { display:flex; flex-direction:column; gap:8px; margin-top:16px; max-width:420px; }
.pipe-form input { border:1px solid var(--ln); border-radius:8px; padding:8px 11px; font-size:13.5px; font-family:inherit; }
.pipe-form .pipe-btn { align-self:flex-start; margin-top:4px; }

.pipe-board { display:flex; gap:12px; overflow-x:auto; margin-top:20px; padding-bottom:12px; }
.pipe-col { flex:0 0 240px; background:var(--bg); border:1px solid var(--ln); border-radius:12px; padding:10px; display:flex; flex-direction:column; gap:8px; max-height:74vh; }
.pipe-col-head { display:flex; justify-content:space-between; align-items:center; font-size:12.5px; font-weight:700; color:var(--e); text-transform:uppercase; letter-spacing:.3px; padding:2px 4px; }
.pipe-col-head.won { color:#1E5D4A; }
.pipe-col-head.lost { color:#9a3a28; }
.pipe-col-count { background:#fff; border:1px solid var(--ln); border-radius:999px; padding:1px 8px; font-size:11px; }
.pipe-col-body { overflow-y:auto; display:flex; flex-direction:column; gap:8px; }
.pipe-col-empty { font-size:11.5px; color:var(--mut); text-align:center; padding:10px 0; }

.pipe-opp { cursor:default; }
.pipe-opp-top { display:flex; justify-content:space-between; align-items:center; gap:8px; cursor:pointer; }
.pipe-opp-name { font-weight:700; font-size:13.5px; color:var(--e); }
.pipe-opp-client { font-size:11.5px; color:var(--mut); margin-top:2px; }
.pipe-opp-value { font-size:13px; font-weight:700; color:var(--ink); margin-top:4px; }
.pipe-score { font-size:11px; font-weight:700; background:var(--g); color:var(--e); border-radius:999px; padding:2px 8px; white-space:nowrap; }
.pipe-move { width:100%; margin-top:8px; border:1px solid var(--ln); border-radius:7px; padding:5px 6px; font-size:12px; font-family:inherit; }

.pipe-opp-detail { margin-top:12px; border-top:1px solid var(--ln); padding-top:10px; }
.pipe-readiness-title { font-size:12px; font-weight:700; color:var(--e); margin-bottom:6px; }
.pipe-readiness ul { list-style:none; padding:0; margin:0 0 10px; display:flex; flex-direction:column; gap:3px; }
.pipe-readiness li { font-size:11px; color:var(--mut); }
.pipe-readiness li.met { color:#1E5D4A; }
.pipe-activity-title { font-size:12px; font-weight:700; color:var(--e); margin-bottom:6px; }
.pipe-activity-row { font-size:11px; color:var(--mut); display:flex; gap:6px; flex-wrap:wrap; padding:4px 0; border-bottom:1px dashed var(--ln); }
.pipe-activity-type { text-transform:uppercase; font-weight:700; color:var(--e2); font-size:9.5px; }
.pipe-activity-date { margin-left:auto; }
.pipe-note-form { display:flex; gap:6px; margin-top:8px; }
.pipe-note-form input { flex:1; border:1px solid var(--ln); border-radius:7px; padding:6px 8px; font-size:12px; font-family:inherit; }
.pipe-note-form button { background:var(--e); color:#fff; border:none; border-radius:7px; padding:6px 12px; font-size:12px; cursor:pointer; }

@media(max-width:600px){ .pipe { padding:18px 14px 44px; } .pipe-head h1 { font-size:22px; } .pipe-col { flex:0 0 78vw; } }
`;
