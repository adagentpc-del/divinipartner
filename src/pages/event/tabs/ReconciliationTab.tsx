import React, { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend, ApiError } from '../../../lib/api';

/**
 * Event Financial Reconciliation + Settlement (live-ops phase, Part
 * 28-31). Owner/planner/finance only -- every other role's fetch simply
 * 403s and this renders the generic error state, matching InvoicesTab's
 * existing precedent for financially-sensitive tabs. Reuses the same
 * hero/blocked-panel UX as ExecutionReadinessTab/CloseoutTab.
 *
 * Zero em dashes.
 */

type ReconciliationCheck = {
  id: string;
  label: string;
  status: 'complete' | 'missing';
  severity: 'blocking' | 'warning';
  message: string;
};
type ReconciliationTotals = {
  invoiced_total: number;
  paid_total: number;
  outstanding_total: number;
  platform_fees_total: number;
  processing_fees_total: number;
  net_payable_total: number;
};
type ReconciliationReport = {
  state: 'not_ready' | 'needs_attention' | 'ready' | 'ready_with_warnings';
  totals: ReconciliationTotals;
  blocking: ReconciliationCheck[];
  warnings: ReconciliationCheck[];
  completed: ReconciliationCheck[];
};
type Settlement = {
  id: string;
  settled_by: string | null;
  invoiced_total: string;
  paid_total: string;
  state: string;
  overrode_blocking: boolean;
  notes: string | null;
  created_at: string;
} | null;

const STATE_LABEL: Record<ReconciliationReport['state'], string> = {
  not_ready: 'NOT READY TO SETTLE',
  needs_attention: 'NEEDS ATTENTION',
  ready: 'READY TO SETTLE',
  ready_with_warnings: 'READY TO SETTLE (WITH WARNINGS)',
};

function stateColor(state: ReconciliationReport['state']): string {
  if (state === 'ready' || state === 'ready_with_warnings') return '#1E5D4A';
  if (state === 'needs_attention') return '#C9A35B';
  return '#b4451f';
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function ReconciliationTab({ eventId }: { eventId: string }) {
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [settlement, setSettlement] = useState<Settlement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [settleBusy, setSettleBusy] = useState(false);
  const [settleBlocked, setSettleBlocked] = useState<ReconciliationCheck[] | null>(null);
  const [settledOk, setSettledOk] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const [r, s] = await Promise.all([
        apiGet<{ reconciliation: ReconciliationReport }>(`/reconciliation/event/${eventId}`),
        apiGet<{ settlement: Settlement }>(`/reconciliation/event/${eventId}/settlement`),
      ]);
      setReport(r.reconciliation);
      setSettlement(s.settlement);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function settle(override: boolean) {
    setSettleBusy(true);
    setErr(null);
    try {
      const r = await apiSend<{ settlement: Settlement }>('POST', `/reconciliation/event/${eventId}/settle`, { override });
      setSettlement(r.settlement);
      setSettleBlocked(null);
      setSettledOk(true);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const blocking = (e.body as { blocking?: ReconciliationCheck[] } | null)?.blocking;
        if (blocking) setSettleBlocked(blocking);
        else setErr(e.message);
      } else {
        setErr((e as Error).message);
      }
    } finally {
      setSettleBusy(false);
    }
  }

  if (busy && !report) return <p className="ew-empty"><p>Loading reconciliation...</p></p>;
  if (err && !report) return <p className="ew-error">{err}</p>;
  if (!report) return null;

  const allChecks = [...report.completed, ...report.blocking, ...report.warnings].slice().sort((a, b) => {
    const rank = (x: ReconciliationCheck) => (x.status === 'complete' ? 2 : x.severity === 'blocking' ? 0 : 1);
    return rank(a) - rank(b);
  });

  return (
    <div className="ew-rec">
      <style>{REC_CSS}</style>
      {err ? <p className="ew-error">{err}</p> : null}

      <div className="ew-rec-hero" style={{ borderColor: stateColor(report.state) }}>
        <div className="ew-rec-state" style={{ color: stateColor(report.state) }}>
          {settlement ? 'EVENT SETTLED' : STATE_LABEL[report.state]}
        </div>
        <div className="ew-rec-heroacts">
          {!settlement ? (
            <button type="button" className="ew-btn sm" onClick={() => void settle(false)} disabled={settleBusy}>
              {settleBusy ? 'Settling...' : 'Settle Event'}
            </button>
          ) : null}
          <button type="button" className="ew-btn ghost sm" onClick={() => void load()} disabled={busy}>
            {busy ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {settledOk ? <p className="ew-rec-settleok">Event settled. The books are closed.</p> : null}

      {settlement ? (
        <section className="ew-rec-cat">
          <h3>Settlement record</h3>
          <ul>
            <li className="ew-rec-line"><span>Invoiced total</span><span>{fmtMoney(Number(settlement.invoiced_total))}</span></li>
            <li className="ew-rec-line"><span>Paid total</span><span>{fmtMoney(Number(settlement.paid_total))}</span></li>
            <li className="ew-rec-line"><span>Settled</span><span>{new Date(settlement.created_at).toLocaleString()}</span></li>
            {settlement.overrode_blocking ? <li className="ew-rec-line ew-rec-warn"><span>Settled with blocking issues overridden</span></li> : null}
          </ul>
        </section>
      ) : null}

      {settleBlocked ? (
        <div className="ew-rec-block">
          <div className="ew-rec-blockhead">EVENT NOT READY TO SETTLE</div>
          <p className="ew-rec-blocksub">
            {settleBlocked.length} blocking issue{settleBlocked.length === 1 ? '' : 's'} must be resolved before this
            event can settle, or an owner/planner/finance may settle anyway.
          </p>
          <ul>
            {settleBlocked.map((c) => (
              <li key={c.id}>{c.message}</li>
            ))}
          </ul>
          <div className="ew-rec-blockacts">
            <button type="button" className="ew-btn ghost sm" onClick={() => setSettleBlocked(null)} disabled={settleBusy}>
              Resolve First
            </button>
            <button type="button" className="ew-btn sm ew-rec-danger" onClick={() => void settle(true)} disabled={settleBusy}>
              {settleBusy ? 'Settling...' : 'Settle Anyway'}
            </button>
          </div>
        </div>
      ) : null}

      <section className="ew-rec-cat">
        <h3>Totals</h3>
        <ul>
          <li className="ew-rec-line"><span>Invoiced</span><span>{fmtMoney(report.totals.invoiced_total)}</span></li>
          <li className="ew-rec-line"><span>Paid</span><span>{fmtMoney(report.totals.paid_total)}</span></li>
          <li className="ew-rec-line"><span>Outstanding</span><span>{fmtMoney(report.totals.outstanding_total)}</span></li>
          <li className="ew-rec-line"><span>Platform fees</span><span>{fmtMoney(report.totals.platform_fees_total)}</span></li>
          <li className="ew-rec-line"><span>Processing fees</span><span>{fmtMoney(report.totals.processing_fees_total)}</span></li>
          <li className="ew-rec-line"><span>Net payable to vendors</span><span>{fmtMoney(report.totals.net_payable_total)}</span></li>
        </ul>
      </section>

      <section className="ew-rec-cat">
        <h3>Reconciliation checklist</h3>
        <ul>
          {allChecks.map((c) => (
            <li key={c.id} className={c.status === 'complete' ? 'is-ok' : c.severity === 'blocking' ? 'is-block' : 'is-warn'}>
              <span className="ew-rec-glyph" aria-hidden="true">{c.status === 'complete' ? '✓' : '⚠'}</span>
              <span className="ew-rec-body">
                <span className="ew-rec-label">{c.label}</span>
                <span className="ew-rec-msg">{c.message}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const REC_CSS = `
.ew-rec { display: flex; flex-direction: column; gap: 18px; }
.ew-rec-hero { display: flex; align-items: baseline; gap: 16px; padding: 18px 20px; border: 1.5px solid; border-radius: 14px; background: rgba(247,244,238,.5); }
.ew-rec-state { font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
.ew-rec-heroacts { margin-left: auto; align-self: center; display: flex; align-items: center; gap: 10px; }
.ew-rec-settleok { margin: 0; padding: 10px 14px; border-radius: 10px; background: rgba(30,93,74,.08); color: #1E5D4A; font-size: 13px; font-weight: 600; }
.ew-rec-block { border: 1.5px solid #b4451f; border-radius: 14px; padding: 16px 18px; background: rgba(180,69,31,.05); }
.ew-rec-blockhead { font-size: 13px; font-weight: 700; letter-spacing: 1px; color: #b4451f; margin-bottom: 6px; }
.ew-rec-blocksub { margin: 0 0 10px; font-size: 12.5px; color: #6b6459; line-height: 1.5; }
.ew-rec-block ul { margin: 0 0 14px; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; }
.ew-rec-block li { font-size: 13px; color: #2c2a26; }
.ew-rec-blockacts { display: flex; gap: 10px; }
.ew-rec-danger { background: #b4451f; border-color: #b4451f; color: #fff; }
.ew-rec-cat h3 { margin: 0 0 10px; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 19px; color: #123c2e; }
.ew-rec-cat ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.ew-rec-cat li { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 10px; border: 1px solid #e7e1d6; background: #fff; }
.ew-rec-cat li.is-ok { background: rgba(30,93,74,.05); }
.ew-rec-cat li.is-warn { border-color: rgba(201,163,91,.5); }
.ew-rec-cat li.is-block { border-color: rgba(180,69,31,.5); background: rgba(180,69,31,.04); }
.ew-rec-glyph { flex: 0 0 auto; width: 22px; text-align: center; font-size: 15px; }
.is-ok .ew-rec-glyph { color: #1E5D4A; }
.is-warn .ew-rec-glyph { color: #9a7e3e; }
.is-block .ew-rec-glyph { color: #b4451f; }
.ew-rec-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
.ew-rec-label { font-size: 13.5px; font-weight: 600; color: #2c2a26; }
.ew-rec-msg { font-size: 12px; color: #6b6459; }
.ew-rec-line { justify-content: space-between; font-size: 13px; color: #2c2a26; }
.ew-rec-line.ew-rec-warn { color: #9b2c2c; }
`;
