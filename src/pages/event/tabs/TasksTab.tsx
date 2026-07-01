import React, { useEffect, useMemo, useState } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

/**
 * Phase 6 - Tasks tab (blueprint 33). A task checklist grouped by category with
 * status, priority, due dates and milestones. Seed the standard event workflow
 * template in one click.
 */
type Task = {
  id: string;
  name: string | null;
  category: string | null;
  status: string | null;
  priority: string | null;
  due_date: string | null;
  milestone: boolean | null;
  assigned_role: string | null;
};
type Meta = {
  categories: { key: string; label: string }[];
  statuses: { key: string; label: string }[];
  priorities: string[];
};

function fmtDate(v: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

export default function TasksTab({ eventId }: { eventId: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [form, setForm] = useState({ name: '', category: 'planning', priority: 'medium', due_date: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const [t, m] = await Promise.all([
        apiGet<{ tasks: Task[] }>(`/tasks/event/${eventId}`),
        apiGet<Meta>(`/tasks/meta`),
      ]);
      setTasks(t.tasks);
      setMeta(m);
    } catch (e) { setErr((e as Error).message); }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [eventId]);

  async function refresh() {
    const t = await apiGet<{ tasks: Task[] }>(`/tasks/event/${eventId}`);
    setTasks(t.tasks);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true); setErr(null);
    try {
      await apiSend('POST', `/tasks/event/${eventId}`, { ...form, due_date: form.due_date || null });
      setForm({ name: '', category: form.category, priority: 'medium', due_date: '' });
      await refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function seed() {
    setBusy(true); setErr(null);
    try { await apiSend('POST', `/tasks/event/${eventId}/seed-workflow`); await refresh(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function setStatus(id: string, status: string) {
    try { await apiSend('POST', `/tasks/${id}/status`, { status }); await refresh(); }
    catch (e) { setErr((e as Error).message); }
  }
  async function remove(id: string) {
    try { await apiSend('DELETE', `/tasks/${id}`); await refresh(); }
    catch (e) { setErr((e as Error).message); }
  }

  const byCategory = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      const k = t.category ?? 'planning';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    return map;
  }, [tasks]);

  const catLabel = (k: string) => meta?.categories.find((c) => c.key === k)?.label ?? k;
  const done = tasks.filter((t) => t.status === 'done').length;

  return (
    <div>
      <style>{T_CSS}</style>
      {err ? <p className="ew-error">{err}</p> : null}

      <div className="tk-head">
        <div className="tk-progress">
          <span className="tk-pn">{done}/{tasks.length}</span>
          <span className="tk-pl">tasks complete</span>
          <div className="tk-bar"><div className="tk-fill" style={{ width: tasks.length ? `${(done / tasks.length) * 100}%` : '0%' }} /></div>
        </div>
        <button type="button" className="ew-btn ghost sm" onClick={seed} disabled={busy}>Seed workflow template</button>
      </div>

      <form className="tk-add" onSubmit={add}>
        <input className="tk-in" placeholder="New task" value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select className="tk-sel" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {meta?.categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <select className="tk-sel" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
          {meta?.priorities.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input className="tk-in tk-date" type="date" value={form.due_date}
          onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
        <button type="submit" className="ew-btn sm" disabled={busy}>Add</button>
      </form>

      {tasks.length === 0 ? (
        <div className="ew-empty"><p>No tasks yet. Add a task above or seed the standard event workflow template.</p></div>
      ) : (
        [...byCategory.keys()].map((cat) => (
          <div key={cat} className="tk-group">
            <h3 className="tk-grouphead">{catLabel(cat)}</h3>
            {byCategory.get(cat)!.map((t) => (
              <div key={t.id} className={`tk-task${t.status === 'done' ? ' is-done' : ''}`}>
                <input type="checkbox" className="tk-check" checked={t.status === 'done'}
                  onChange={(e) => setStatus(t.id, e.target.checked ? 'done' : 'todo')} />
                <div className="tk-body">
                  <span className="tk-name">{t.name}{t.milestone ? <span className="tk-ms">Milestone</span> : null}</span>
                  <span className="tk-meta">
                    {t.priority ? <span className={`tk-pri pri-${t.priority}`}>{t.priority}</span> : null}
                    {t.assigned_role ? <span className="tk-role">{t.assigned_role}</span> : null}
                    {t.due_date ? <span className="tk-due">Due {fmtDate(t.due_date)}</span> : null}
                  </span>
                </div>
                <select className="tk-statussel" value={t.status ?? 'todo'} onChange={(e) => setStatus(t.id, e.target.value)}>
                  {meta?.statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                <button type="button" className="tk-del" onClick={() => remove(t.id)}>x</button>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

const T_CSS = `
.tk-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-bottom: 16px; }
.tk-progress { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tk-pn { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 24px; color: #123c2e; }
.tk-pl { font-size: 12px; color: #7d776c; }
.tk-bar { width: 160px; height: 7px; background: #efeadf; border-radius: 999px; overflow: hidden; }
.tk-fill { height: 100%; background: linear-gradient(90deg, #1E5D4A, #C9A35B); }
.tk-add { display: flex; flex-wrap: wrap; gap: 8px; background: rgba(247,244,238,.6); border: 1px dashed #e7e1d6; border-radius: 12px; padding: 12px 14px; margin-bottom: 18px; }
.tk-in { font: inherit; font-size: 12.5px; padding: 7px 10px; border: 1px solid #e7e1d6; border-radius: 8px; background: #fff; color: #2c2a26; flex: 1 1 180px; min-width: 0; }
.tk-date { flex: 0 0 150px; }
.tk-sel { font: inherit; font-size: 12.5px; padding: 7px 9px; border: 1px solid #e7e1d6; border-radius: 8px; background: #fff; color: #2c2a26; }
.tk-group { margin-bottom: 18px; }
.tk-grouphead { font-size: 17px; color: #123c2e; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #e7e1d6; }
.tk-task { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border: 1px solid #f0ebe0; border-radius: 10px; margin-bottom: 6px; background: #fff; }
.tk-task.is-done { opacity: .62; }
.tk-task.is-done .tk-name { text-decoration: line-through; }
.tk-check { width: 16px; height: 16px; accent-color: #1E5D4A; flex: 0 0 auto; }
.tk-body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.tk-name { font-size: 13px; color: #2c2a26; display: flex; align-items: center; gap: 6px; }
.tk-ms { font-size: 9px; font-weight: 700; letter-spacing: .5px; color: #123c2e; background: rgba(201,163,91,.3); border-radius: 4px; padding: 1px 5px; }
.tk-meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.tk-pri { font-size: 10px; font-weight: 600; text-transform: capitalize; padding: 1px 7px; border-radius: 999px; }
.pri-low { background: #eef2ef; color: #5a6b62; }
.pri-medium { background: #eaf0ee; color: #1E5D4A; }
.pri-high { background: rgba(201,163,91,.2); color: #9a7e3e; }
.pri-urgent { background: #f6eaea; color: #8a3a3a; }
.tk-role { font-size: 10.5px; color: #9a8a5e; text-transform: capitalize; }
.tk-due { font-size: 10.5px; color: #b3aa99; }
.tk-statussel { font: inherit; font-size: 11.5px; padding: 4px 7px; border: 1px solid #e7e1d6; border-radius: 7px; background: #fff; color: #2c2a26; }
.tk-del { font: inherit; font-size: 13px; color: #b3aa99; background: transparent; border: 0; cursor: pointer; padding: 2px 6px; }
.tk-del:hover { color: #8a3a3a; }
`;
