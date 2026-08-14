import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { apiSend } from '../lib/api';
import { isPlanLimitError, UpgradePrompt, type PlanLimitError } from '../lib/entitlements';

/**
 * Comparison view (/compare/:type?ids=a,b,c). Opened in a new tab from a list
 * where a client selected up to 10 venues, vendors, or quotes and clicked Compare.
 * Renders a row-level side-by-side table plus deterministic pros and cons per
 * option. Self-contained styling under .cmp-. Zero em dashes.
 *
 * The "quotes" type is docs/DIVINI_DETERMINISTIC_TOOLS_SPEC.md's Divini
 * Quote Compare (build-order slice 7). Its real, pre-existing plan limit
 * (quotes.compare -- Client Free 3, Client Plus 10) is enforced server-side;
 * this page only renders the limit-reached state, never enforces anything.
 */

type Col = { id: string; label: string };
type Row = { label: string; values: string[]; highlight?: boolean };
type ProsCons = { id: string; label: string; pros: string[]; cons: string[] };
type Result = { type: string; columns: Col[]; rows: Row[]; proscons: ProsCons[] };

const TITLES: Record<string, string> = { venues: 'Venue comparison', vendors: 'Vendor comparison', quotes: 'Divini Quote Compare' };

export default function Compare() {
  const { type = '' } = useParams();
  const [params] = useSearchParams();
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [limitError, setLimitError] = useState<PlanLimitError | null>(null);

  useEffect(() => {
    const ids = (params.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!['venues', 'vendors', 'quotes'].includes(type)) { setErr('Unknown comparison type.'); setLoading(false); return; }
    if (ids.length < 2) { setErr('Select at least 2 to compare.'); setLoading(false); return; }
    (async () => {
      try {
        const r = await apiSend<{ result: Result }>('POST', `/compare/${type}`, { ids });
        setResult(r.result);
      } catch (e) {
        if (isPlanLimitError(e)) setLimitError(e.body);
        else setErr((e as Error)?.message ?? 'Could not build the comparison.');
      } finally {
        setLoading(false);
      }
    })();
  }, [type, params]);

  return (
    <div className="cmp">
      <style>{CSS}</style>
      <div className="cmp-wrap">
        <div className="cmp-brand">Divini Partners</div>
        <h1 className="cmp-title">{TITLES[type] ?? 'Comparison'}</h1>

        {loading ? (
          <div className="cmp-loading">Building the comparison...</div>
        ) : limitError ? (
          <UpgradePrompt error={limitError} />
        ) : err ? (
          <div className="cmp-card"><p className="cmp-sub">{err}</p></div>
        ) : result ? (
          <>
            <div className="cmp-scroll">
              <table className="cmp-table">
                <thead>
                  <tr>
                    <th className="cmp-rowlabel">Attribute</th>
                    {result.columns.map((c) => <th key={c.id}>{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr key={row.label} className={row.highlight ? 'cmp-hl' : undefined}>
                      <th className="cmp-rowlabel">{row.label}</th>
                      {row.values.map((v, i) => <td key={i}>{v}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="cmp-h2">Pros and cons</h2>
            <div className="cmp-cards">
              {result.proscons.map((pc) => (
                <div key={pc.id} className="cmp-pc">
                  <div className="cmp-pcname">{pc.label}</div>
                  <div className="cmp-pcsec">
                    <div className="cmp-pclabel pro">Pros</div>
                    {pc.pros.length ? pc.pros.map((p, i) => <div key={i} className="cmp-pro">+ {p}</div>) : <div className="cmp-none">No standout advantage</div>}
                  </div>
                  <div className="cmp-pcsec">
                    <div className="cmp-pclabel con">Cons</div>
                    {pc.cons.length ? pc.cons.map((c, i) => <div key={i} className="cmp-con">- {c}</div>) : <div className="cmp-none">No notable drawback</div>}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

const CSS = `
.cmp { min-height: 100vh; background: #faf8f3; padding: 32px 16px; }
.cmp-wrap { max-width: 1100px; margin: 0 auto; }
.cmp-brand { font-family: Georgia, serif; font-size: 18px; color: #123c2e; font-weight: 700; }
.cmp-title { font-family: Georgia, serif; font-size: 28px; color: #123c2e; margin: 4px 0 18px; }
.cmp-loading, .cmp-sub { color: #6b6459; }
.cmp-card { background: #fff; border: 1px solid #e7e1d6; border-radius: 12px; padding: 22px; }
.cmp-scroll { overflow-x: auto; border: 1px solid #e7e1d6; border-radius: 12px; background: #fff; }
.cmp-table { border-collapse: collapse; width: 100%; min-width: 520px; }
.cmp-table th, .cmp-table td { border: 1px solid #ece5d8; padding: 10px 13px; text-align: left; vertical-align: top; font-size: 14px; }
.cmp-rowlabel { background: #f7f4ee; font-weight: 600; white-space: nowrap; color: #123c2e; }
.cmp-table thead th { background: #123c2e; color: #fff; }
.cmp-table thead th.cmp-rowlabel { background: #0e2f24; }
.cmp-hl td, .cmp-hl th.cmp-rowlabel { background: #e9e2d2; font-weight: 700; }
.cmp-h2 { font-size: 18px; color: #123c2e; margin: 26px 0 12px; }
.cmp-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.cmp-pc { background: #fff; border: 1px solid #e7e1d6; border-radius: 12px; padding: 14px; }
.cmp-pcname { font-weight: 700; color: #123c2e; margin-bottom: 10px; }
.cmp-pcsec { margin-bottom: 8px; }
.cmp-pclabel { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; font-weight: 700; margin-bottom: 4px; }
.cmp-pclabel.pro { color: #1E5D4A; }
.cmp-pclabel.con { color: #a12; }
.cmp-pro { font-size: 13px; color: #1E5D4A; padding: 2px 0; }
.cmp-con { font-size: 13px; color: #8a3a3a; padding: 2px 0; }
.cmp-none { font-size: 12px; color: #b3aa99; }
`;
