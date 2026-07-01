import React, { useState } from 'react';
import { apiSend } from '../../lib/api';

// Phase 7 - Event Scope Builder (blueprint 26). Paste a plain-English event
// description and get a structured scope: detected categories, a checklist, and
// a budget skeleton. Self-contained styles in the Divini Partners palette.

type ScopeCategory = { category: string; label: string; confidence: number; matched: string[] };
type ChecklistItem = { label: string; category: string; done: boolean };
type BudgetLine = { category: string; label: string; pct: number; amount: number };
type Scope = {
  event_type: string | null;
  guest_count: number | null;
  budget: number | null;
  categories: ScopeCategory[];
  checklist: ChecklistItem[];
  budget_skeleton: BudgetLine[];
  notes: string;
};

function money(n?: number | null) {
  if (n == null || Number.isNaN(Number(n))) return '$0';
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const EXAMPLE =
  'Wedding reception for 180 guests in the fall, budget around $60k. We need a venue, catering, an open bar, a florist for centerpieces, a DJ, and a day-of coordinator.';

export default function EventScopeBuilder() {
  const [description, setDescription] = useState('');
  const [guestCount, setGuestCount] = useState('');
  const [budget, setBudget] = useState('');
  const [eventType, setEventType] = useState('');
  const [scope, setScope] = useState<Scope | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function build() {
    if (!description.trim()) {
      setError('Add a short description of the event first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await apiSend<{ scope: Scope }>('POST', '/intelligence/scope-builder', {
        description,
        guest_count: guestCount ? Number(guestCount) : undefined,
        budget: budget ? Number(budget) : undefined,
        event_type: eventType || undefined,
      });
      setScope(r.scope);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="sb">
      <style>{CSS}</style>

      <header className="sb-head">
        <div>
          <span className="sb-kicker">Event Intelligence</span>
          <h1 className="sb-title">Event Scope Builder</h1>
          <p className="sb-sub">Describe your event in plain language and we will structure the scope, checklist, and budget.</p>
        </div>
      </header>

      {error && <div className="sb-error">{error}</div>}

      <div className="sb-grid">
        <section className="sb-input">
          <label className="sb-full">Describe your event
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={EXAMPLE} />
          </label>
          <div className="sb-row">
            <label>Guest count<input type="number" value={guestCount} onChange={(e) => setGuestCount(e.target.value)} placeholder="auto" /></label>
            <label>Budget ($)<input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="auto" /></label>
            <label>Event type
              <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
                <option value="">auto-detect</option>
                <option value="wedding">wedding</option>
                <option value="corporate">corporate</option>
                <option value="gala">gala</option>
                <option value="birthday">birthday</option>
                <option value="social">social</option>
              </select>
            </label>
          </div>
          <div className="sb-actions">
            <button type="button" className="sb-btn" disabled={loading} onClick={build}>{loading ? 'Building.' : 'Build scope'}</button>
            <button type="button" className="sb-btn ghost" onClick={() => setDescription(EXAMPLE)}>Use example</button>
          </div>
        </section>

        <section className="sb-output">
          {!scope ? (
            <div className="sb-empty">Your structured scope will appear here.</div>
          ) : (
            <>
              <div className="sb-summary">
                <span className="sb-chip">{scope.event_type ?? 'event'}</span>
                {scope.guest_count != null && <span className="sb-chip">{scope.guest_count} guests</span>}
                {scope.budget != null && <span className="sb-chip">{money(scope.budget)} budget</span>}
              </div>

              <h3 className="sb-h">Recommended vendor categories</h3>
              <div className="sb-cats">
                {scope.categories.map((c) => (
                  <div key={c.category} className="sb-cat">
                    <span className="sb-cat-label">{c.label}</span>
                    <span className="sb-conf" title={`Confidence ${Math.round(c.confidence * 100)}%`}>{Math.round(c.confidence * 100)}%</span>
                  </div>
                ))}
              </div>

              <h3 className="sb-h">Checklist</h3>
              <ul className="sb-check">
                {scope.checklist.map((c, i) => (
                  <li key={i}><span className="sb-box" aria-hidden="true" />{c.label}</li>
                ))}
              </ul>

              <h3 className="sb-h">Budget skeleton</h3>
              <table className="sb-budget">
                <thead><tr><th>Category</th><th>Share</th><th>Amount</th></tr></thead>
                <tbody>
                  {scope.budget_skeleton.map((b) => (
                    <tr key={b.category}>
                      <td>{b.label}</td>
                      <td>{Math.round(b.pct * 100)}%</td>
                      <td>{money(b.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="sb-note">{scope.notes}</p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

const CSS = `
.sb { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --iv:#F7F4EE; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:1180px; }
.sb *,.sb *::before,.sb *::after { box-sizing:border-box; }
.sb h1,.sb h3 { font-family:'Cormorant Garamond',Georgia,serif; margin:0; }
.sb-head { margin-bottom:20px; }
.sb-kicker { font-size:10.5px; letter-spacing:1.4px; text-transform:uppercase; color:var(--g); font-weight:600; }
.sb-title { font-size:28px; color:var(--e); line-height:1.1; }
.sb-sub { font-size:13px; color:var(--mut); margin:4px 0 0; }
.sb-error { background:#fff3f1; border:1px solid #e7b7ab; color:#9a3a28; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.sb-grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; align-items:start; }
.sb-input,.sb-output { background:#fff; border:1px solid var(--ln); border-radius:16px; padding:20px; }
.sb-input label,.sb-row label { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--mut); font-weight:600; }
.sb-full { margin-bottom:12px; }
.sb-input textarea { font:inherit; font-size:13px; color:var(--ink); padding:10px; border:1px solid var(--ln); border-radius:9px; min-height:130px; resize:vertical; }
.sb-row { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:14px; }
.sb-row input,.sb-row select { font:inherit; font-size:13px; padding:8px 10px; border:1px solid var(--ln); border-radius:9px; background:#fff; }
.sb-actions { display:flex; gap:10px; }
.sb-btn { background:var(--e); color:#fff; border:0; border-radius:9px; font:inherit; font-size:12.5px; font-weight:600; padding:9px 18px; cursor:pointer; }
.sb-btn:hover { background:var(--e2); }
.sb-btn.ghost { background:transparent; color:var(--e); border:1px solid var(--ln); }
.sb-btn:disabled { opacity:.55; cursor:default; }
.sb-empty { color:var(--mut); font-size:13px; text-align:center; padding:50px 0; }
.sb-summary { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px; }
.sb-chip { font-size:11.5px; font-weight:600; color:var(--e); background:rgba(201,163,91,.18); border:1px solid rgba(201,163,91,.4); border-radius:999px; padding:3px 11px; text-transform:capitalize; }
.sb-h { font-size:17px; color:var(--e); margin:16px 0 8px; }
.sb-cats { display:grid; grid-template-columns:repeat(2,1fr); gap:8px; }
.sb-cat { display:flex; justify-content:space-between; align-items:center; border:1px solid var(--ln); border-radius:9px; padding:8px 11px; font-size:12.5px; }
.sb-conf { font-size:11px; color:var(--g); font-weight:600; }
.sb-check { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px; }
.sb-check li { display:flex; align-items:center; gap:9px; font-size:12.5px; color:var(--ink); }
.sb-box { width:15px; height:15px; border:1.5px solid var(--g); border-radius:4px; flex:0 0 15px; }
.sb-budget { width:100%; border-collapse:collapse; font-size:12.5px; }
.sb-budget th { text-align:left; color:var(--mut); font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.4px; padding:6px 8px; border-bottom:1px solid var(--ln); }
.sb-budget td { padding:7px 8px; border-bottom:1px solid var(--ln); }
.sb-budget td:last-child,.sb-budget th:last-child { text-align:right; color:var(--e); font-weight:600; }
.sb-note { font-size:11.5px; color:var(--mut); margin-top:12px; line-height:1.5; }
@media (max-width:900px){ .sb-grid { grid-template-columns:1fr; } .sb-cats { grid-template-columns:1fr; } }
`;
