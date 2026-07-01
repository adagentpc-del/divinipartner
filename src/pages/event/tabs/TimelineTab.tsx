import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

/**
 * Phase 6 - Timeline tab (blueprint 33). The event timeline: tasks grouped by
 * month with milestones and progress rollups. Drives the same task data as the
 * Tasks tab but presents it chronologically.
 */
type Task = {
  id: string;
  name: string | null;
  category: string | null;
  status: string | null;
  priority: string | null;
  due_date: string | null;
  milestone: boolean | null;
};
type Timeline = {
  groups: { key: string; label: string; tasks: Task[] }[];
  undated: Task[];
  milestones: Task[];
  counts: { total: number; done: number; overdue: number; by_status: Record<string, number> };
};

function fmtDay(v: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function TimelineTab({ eventId }: { eventId: string }) {
  const [tl, setTl] = useState<Timeline | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const r = await apiGet<{ timeline: Timeline }>(`/tasks/event/${eventId}/timeline`);
      setTl(r.timeline);
    } catch (e) { setErr((e as Error).message); }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [eventId]);

  async function setStatus(id: string, status: string) {
    try { await apiSend('POST', `/tasks/${id}/status`, { status }); await load(); }
    catch (e) { setErr((e as Error).message); }
  }

  if (err) return <p className="ew-error">{err}</p>;
  if (!tl) return <p className="ew-muted">Loading timeline...</p>;

  const empty = tl.groups.length === 0 && tl.undated.length === 0;

  return (
    <div>
      <style>{TL_CSS}</style>

      <div className="tl-stats">
        <div className="tl-stat"><span className="tl-n">{tl.counts.total}</span><span className="tl-l">Tasks</span></div>
        <div className="tl-stat"><span className="tl-n">{tl.counts.done}</span><span className="tl-l">Complete</span></div>
        <div className="tl-stat is-warn"><span className="tl-n">{tl.counts.overdue}</span><span className="tl-l">Overdue</span></div>
        <div className="tl-stat is-accent"><span className="tl-n">{tl.milestones.length}</span><span className="tl-l">Milestones</span></div>
      </div>

      {empty ? (
        <div className="ew-empty"><p>No dated tasks yet. Add tasks with due dates in the Tasks tab to populate the timeline.</p></div>
      ) : (
        <div className="tl-track">
          {tl.groups.map((g) => (
            <div key={g.key} className="tl-month">
              <div className="tl-monthhead"><span className="tl-dot" />{g.label}</div>
              <div className="tl-items">
                {g.tasks.map((t) => (
                  <div key={t.id} className={`tl-item${t.status === 'done' ? ' is-done' : ''}${t.milestone ? ' is-ms' : ''}`}>
                    <span className="tl-day">{fmtDay(t.due_date)}</span>
                    <input type="checkbox" className="tl-check" checked={t.status === 'done'}
                      onChange={(e) => setStatus(t.id, e.target.checked ? 'done' : 'todo')} />
                    <span className="tl-name">{t.name}{t.milestone ? <span className="tl-flag">Milestone</span> : null}</span>
                    <span className={`tl-status st-${t.status ?? 'todo'}`}>{(t.status ?? 'todo').replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {tl.undated.length > 0 ? (
            <div className="tl-month">
              <div className="tl-monthhead"><span className="tl-dot is-empty" />No due date</div>
              <div className="tl-items">
                {tl.undated.map((t) => (
                  <div key={t.id} className={`tl-item${t.status === 'done' ? ' is-done' : ''}`}>
                    <span className="tl-day">-</span>
                    <input type="checkbox" className="tl-check" checked={t.status === 'done'}
                      onChange={(e) => setStatus(t.id, e.target.checked ? 'done' : 'todo')} />
                    <span className="tl-name">{t.name}</span>
                    <span className={`tl-status st-${t.status ?? 'todo'}`}>{(t.status ?? 'todo').replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

const TL_CSS = `
.tl-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px; margin-bottom: 20px; }
.tl-stat { background: #fff; border: 1px solid #e7e1d6; border-radius: 12px; padding: 12px; text-align: center; }
.tl-stat.is-warn { border-color: #e2caca; background: #faf2f2; }
.tl-stat.is-accent { border-color: rgba(201,163,91,.6); background: rgba(201,163,91,.08); }
.tl-n { display: block; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 26px; color: #123c2e; line-height: 1; }
.tl-l { display: block; font-size: 10px; letter-spacing: .5px; text-transform: uppercase; color: #9a8a5e; margin-top: 4px; font-weight: 600; }
.tl-track { position: relative; padding-left: 8px; }
.tl-month { margin-bottom: 18px; }
.tl-monthhead { display: flex; align-items: center; gap: 8px; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 19px; color: #123c2e; margin-bottom: 10px; }
.tl-dot { width: 11px; height: 11px; border-radius: 50%; background: #C9A35B; box-shadow: 0 0 0 3px rgba(201,163,91,.2); }
.tl-dot.is-empty { background: #d8d0c1; box-shadow: none; }
.tl-items { display: flex; flex-direction: column; gap: 6px; border-left: 2px solid #e7e1d6; margin-left: 5px; padding-left: 16px; }
.tl-item { display: flex; align-items: center; gap: 10px; background: #fff; border: 1px solid #f0ebe0; border-radius: 10px; padding: 8px 12px; }
.tl-item.is-ms { border-color: rgba(201,163,91,.5); }
.tl-item.is-done { opacity: .6; }
.tl-item.is-done .tl-name { text-decoration: line-through; }
.tl-day { font-size: 11px; color: #9a8a5e; font-weight: 600; flex: 0 0 48px; }
.tl-check { width: 15px; height: 15px; accent-color: #1E5D4A; flex: 0 0 auto; }
.tl-name { flex: 1 1 auto; min-width: 0; font-size: 13px; color: #2c2a26; display: flex; align-items: center; gap: 6px; }
.tl-flag { font-size: 9px; font-weight: 700; letter-spacing: .5px; color: #123c2e; background: rgba(201,163,91,.3); border-radius: 4px; padding: 1px 5px; }
.tl-status { font-size: 10px; font-weight: 600; text-transform: capitalize; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
.st-todo { background: #eef2ef; color: #5a6b62; }
.st-in_progress { background: #eaf0ee; color: #1E5D4A; }
.st-blocked { background: #f6eaea; color: #8a3a3a; }
.st-done { background: rgba(30,93,74,.15); color: #1E5D4A; }
.st-cancelled { background: #f1eee8; color: #b3aa99; }
`;
