import React, { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { apiGet } from '../../lib/api';

/**
 * Reports (blueprint 41) - run and download reports / exports. Reads
 * /api/reports/*. Each report returns { title, columns, rows }; the page renders
 * a table and offers a CSV download built entirely client-side.
 */
type Column = { key: string; label: string };
type Report = { key: string; title: string; columns: Column[]; rows: Record<string, unknown>[]; generated_at: string };
type ReportType = { key: string; label: string; admin: boolean };

const PATHS: Record<string, string> = {
  event_summary: '/reports/event-summary',
  bid_comparison: '/reports/bid-comparison',
  payment_report: '/reports/payment-report',
  vendor_performance: '/reports/vendor-performance',
  admin_revenue: '/reports/admin-revenue',
};

function toCsv(report: Report): string {
  const esc = (v: unknown): string => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = report.columns.map((c) => esc(c.label)).join(',');
  const lines = report.rows.map((r) => report.columns.map((c) => esc(r[c.key])).join(','));
  return [header, ...lines].join('\n');
}

function download(report: Report) {
  const blob = new Blob([toCsv(report)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${report.key}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const { isAdmin } = useAuth();
  const [types, setTypes] = useState<ReportType[]>([]);
  const [selected, setSelected] = useState<string>('event_summary');
  const [eventId, setEventId] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiGet<{ types: ReportType[] }>('/reports/meta')
      .then((r) => setTypes(r.types.filter((t) => !t.admin || isAdmin)))
      .catch(() => {});
  }, [isAdmin]);

  async function run() {
    setLoading(true);
    setErr(null);
    setReport(null);
    try {
      let path = PATHS[selected];
      if (selected === 'bid_comparison') {
        if (!eventId) { setErr('Enter an event ID for the bid comparison.'); setLoading(false); return; }
        path += `?event_id=${encodeURIComponent(eventId)}`;
      }
      const r = await apiGet<{ report: Report }>(path);
      setReport(r.report);
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }

  return (
    <div className="rp">
      <style>{RP_CSS}</style>
      <header className="rp-head">
        <span className="rp-kicker">Exports</span>
        <h1 className="rp-title">Reports</h1>
        <p className="rp-sub">Generate a report and download it as CSV.</p>
      </header>

      <div className="rp-controls">
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        {selected === 'bid_comparison' ? (
          <input value={eventId} onChange={(e) => setEventId(e.target.value)} placeholder="Event ID" />
        ) : null}
        <button type="button" className="rp-btn" disabled={loading} onClick={run}>{loading ? 'Running...' : 'Run report'}</button>
        {report ? <button type="button" className="rp-btn ghost" onClick={() => download(report)}>Download CSV</button> : null}
      </div>

      {err ? <p className="rp-err">{err}</p> : null}

      {report ? (
        <div className="rp-result">
          <div className="rp-result-head">
            <h2>{report.title}</h2>
            <span className="rp-gen">{report.rows.length} rows - generated {new Date(report.generated_at).toLocaleString()}</span>
          </div>
          {report.rows.length === 0 ? (
            <p className="rp-muted">No data for this report yet.</p>
          ) : (
            <div className="rp-tablewrap">
              <table className="rp-table">
                <thead>
                  <tr>{report.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
                </thead>
                <tbody>
                  {report.rows.map((row, i) => (
                    <tr key={i}>
                      {report.columns.map((c) => <td key={c.key}>{row[c.key] == null ? '-' : String(row[c.key])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="rp-empty"><p>Choose a report and run it to see results here.</p></div>
      )}
    </div>
  );
}

const RP_CSS = `
.rp {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--dp-ink);
}
.rp *, .rp *::before, .rp *::after { box-sizing: border-box; }
.rp h1, .rp h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }
.rp-head { margin-bottom: 16px; }
.rp-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--dp-gold); font-weight: 600; }
.rp-title { font-size: 32px; color: var(--dp-emerald); line-height: 1.05; }
.rp-sub { margin: 4px 0 0; font-size: 13px; color: var(--dp-muted); }
.rp-muted { color: var(--dp-muted); font-size: 13px; }
.rp-err { color: #8a3a3a; background: #f6eaea; border: 1px solid #e2caca; border-radius: 8px; padding: 9px 12px; font-size: 12.5px; }
.rp-controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 18px; }
.rp-controls select, .rp-controls input { font: inherit; font-size: 13px; padding: 9px 12px; border: 1px solid var(--dp-line); border-radius: 9px; background: #fff; }
.rp-btn { background: var(--dp-emerald); color: #fff; border: 0; border-radius: 9px; font: inherit; font-size: 13px; font-weight: 600; padding: 9px 16px; cursor: pointer; }
.rp-btn:hover { background: var(--dp-emerald-2); }
.rp-btn:disabled { opacity: .6; cursor: default; }
.rp-btn.ghost { background: transparent; color: var(--dp-emerald); border: 1px solid var(--dp-line); }
.rp-empty { border: 1px dashed var(--dp-line); border-radius: 12px; padding: 40px; background: rgba(247,244,238,.55); text-align: center; }
.rp-empty p { margin: 0; font-size: 13px; color: var(--dp-muted); }
.rp-result { background: #fff; border: 1px solid var(--dp-line); border-radius: 14px; padding: 18px; }
.rp-result-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.rp-result-head h2 { font-size: 22px; color: var(--dp-emerald); }
.rp-gen { font-size: 11.5px; color: var(--dp-muted); }
.rp-tablewrap { overflow-x: auto; }
.rp-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.rp-table th { text-align: left; font-size: 10.5px; letter-spacing: .4px; text-transform: uppercase; color: var(--dp-muted); font-weight: 600; padding: 8px 12px; border-bottom: 1px solid var(--dp-line); white-space: nowrap; }
.rp-table td { padding: 8px 12px; border-bottom: 1px solid var(--dp-line); color: var(--dp-ink); }
.rp-table tr:last-child td { border-bottom: 0; }
`;
