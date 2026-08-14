import React, { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend, ApiError } from '../../../lib/api';

/**
 * Event Closeout (live-ops phase, Part 25-27): the CLOSE gate at the other
 * end of the lifecycle from ExecutionReadinessTab's Start Event gate --
 * same shape (deterministic checks, audited override), same UX pattern,
 * different data (db/closeout.ts's computeCloseoutReadiness). Also the
 * per-vendor completion roster (Part 26): a vendor org's own rep marks
 * their own org's participation complete or flags an issue; owner/planner
 * see and can override the whole roster.
 *
 * Zero em dashes.
 */

type CloseoutCheck = {
  id: string;
  label: string;
  status: 'complete' | 'missing';
  severity: 'blocking' | 'warning';
  message: string;
};
type CloseoutReport = {
  state: 'not_ready' | 'needs_attention' | 'ready' | 'ready_with_warnings';
  blocking: CloseoutCheck[];
  warnings: CloseoutCheck[];
  completed: CloseoutCheck[];
};

const STATE_LABEL: Record<CloseoutReport['state'], string> = {
  not_ready: 'NOT READY TO CLOSE',
  needs_attention: 'NEEDS ATTENTION',
  ready: 'READY TO CLOSE',
  ready_with_warnings: 'READY TO CLOSE (WITH WARNINGS)',
};

function stateColor(state: CloseoutReport['state']): string {
  if (state === 'ready' || state === 'ready_with_warnings') return '#1E5D4A';
  if (state === 'needs_attention') return '#C9A35B';
  return '#b4451f';
}

type VendorCompletion = {
  vendor_org_id: string;
  vendor_name: string;
  status: 'pending' | 'complete' | 'issue';
  notes: string | null;
};

type EventRow = { id: string; status: string | null };
type Me = { company?: { id: string } | null };

export default function CloseoutTab({ eventId }: { eventId: string }) {
  const [report, setReport] = useState<CloseoutReport | null>(null);
  const [vendors, setVendors] = useState<VendorCompletion[]>([]);
  const [ev, setEv] = useState<EventRow | null>(null);
  const [myOrgId, setMyOrgId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [vendorBusy, setVendorBusy] = useState(false);

  const [closeBusy, setCloseBusy] = useState(false);
  const [closeBlocked, setCloseBlocked] = useState<CloseoutCheck[] | null>(null);
  const [closedOk, setClosedOk] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const [r, v, e, me] = await Promise.all([
        apiGet<{ readiness: CloseoutReport }>(`/closeout/event/${eventId}/readiness`),
        apiGet<{ vendors: VendorCompletion[] }>(`/closeout/event/${eventId}/vendors`),
        apiGet<{ event: EventRow }>(`/events/${eventId}`).catch(() => null),
        apiGet<Me>(`/me`).catch(() => null),
      ]);
      setReport(r.readiness);
      setVendors(v.vendors);
      if (e) setEv(e.event);
      setMyOrgId(me?.company?.id ?? null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function closeEvent(override: boolean) {
    setCloseBusy(true);
    setErr(null);
    try {
      const r = await apiSend<{ event: EventRow }>('POST', `/events/${eventId}/close`, { override });
      setEv(r.event);
      setCloseBlocked(null);
      setClosedOk(true);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const blocking = (e.body as { blocking?: CloseoutCheck[] } | null)?.blocking;
        setCloseBlocked(blocking ?? []);
      } else {
        setErr((e as Error).message);
      }
    } finally {
      setCloseBusy(false);
    }
  }

  async function markVendor(vendorOrgId: string, status: 'complete' | 'issue') {
    setVendorBusy(true);
    setErr(null);
    try {
      await apiSend('PATCH', `/closeout/event/${eventId}/vendors/${vendorOrgId}`, { status });
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setVendorBusy(false);
    }
  }

  if (busy && !report) return <p className="ew-empty"><p>Loading closeout status...</p></p>;
  if (err && !report) return <p className="ew-error">{err}</p>;
  if (!report) return null;

  const canCloseNow = ev?.status === 'event_day';
  const allChecks = [...report.completed, ...report.blocking, ...report.warnings].slice().sort((a, b) => {
    const rank = (x: CloseoutCheck) => (x.status === 'complete' ? 2 : x.severity === 'blocking' ? 0 : 1);
    return rank(a) - rank(b);
  });

  return (
    <div className="ew-clo">
      <style>{CLO_CSS}</style>
      {err ? <p className="ew-error">{err}</p> : null}

      <div className="ew-clo-hero" style={{ borderColor: stateColor(report.state) }}>
        <div className="ew-clo-state" style={{ color: stateColor(report.state) }}>{STATE_LABEL[report.state]}</div>
        <div className="ew-clo-heroacts">
          {canCloseNow ? (
            <button type="button" className="ew-btn sm" onClick={() => void closeEvent(false)} disabled={closeBusy}>
              {closeBusy ? 'Closing...' : 'Close Event'}
            </button>
          ) : ev ? (
            <span className="ew-clo-notlive">{ev.status === 'completed' || ev.status === 'closed' || ev.status === 'archived' ? 'Event closed' : 'Event is not yet live'}</span>
          ) : null}
          <button type="button" className="ew-btn ghost sm" onClick={() => void load()} disabled={busy}>
            {busy ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {closedOk ? <p className="ew-clo-closeok">Event closed. It is ready for reconciliation.</p> : null}

      {closeBlocked ? (
        <div className="ew-clo-block">
          <div className="ew-clo-blockhead">EVENT NOT READY TO CLOSE</div>
          <p className="ew-clo-blocksub">
            {closeBlocked.length} blocking issue{closeBlocked.length === 1 ? '' : 's'} must be resolved before this
            event can close, or an owner/planner may close anyway.
          </p>
          <ul>
            {closeBlocked.map((c) => (
              <li key={c.id}>{c.message}</li>
            ))}
          </ul>
          <div className="ew-clo-blockacts">
            <button type="button" className="ew-btn ghost sm" onClick={() => setCloseBlocked(null)} disabled={closeBusy}>
              Resolve First
            </button>
            <button type="button" className="ew-btn sm ew-clo-danger" onClick={() => void closeEvent(true)} disabled={closeBusy}>
              {closeBusy ? 'Closing...' : 'Close Anyway'}
            </button>
          </div>
        </div>
      ) : null}

      <section className="ew-clo-cat">
        <h3>Closing checklist</h3>
        <ul>
          {allChecks.map((c) => (
            <li key={c.id} className={c.status === 'complete' ? 'is-ok' : c.severity === 'blocking' ? 'is-block' : 'is-warn'}>
              <span className="ew-clo-glyph" aria-hidden="true">{c.status === 'complete' ? '✓' : '⚠'}</span>
              <span className="ew-clo-body">
                <span className="ew-clo-label">{c.label}</span>
                <span className="ew-clo-msg">{c.message}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="ew-clo-cat">
        <h3>Vendor completion</h3>
        {vendors.length === 0 ? (
          <div className="ew-empty"><p>No vendors attached to this event.</p></div>
        ) : (
          <ul>
            {vendors.map((v) => (
              <li key={v.vendor_org_id} data-status={v.status} className="ew-clo-vrow">
                <span className="ew-clo-vstatus">{v.status}</span>
                <span className="ew-clo-vname">{v.vendor_name}</span>
                {myOrgId && myOrgId === v.vendor_org_id ? (
                  <div className="ew-clo-vacts">
                    {v.status !== 'complete' ? (
                      <button type="button" className="ew-btn sm" onClick={() => void markVendor(v.vendor_org_id, 'complete')} disabled={vendorBusy}>Mark my org complete</button>
                    ) : null}
                    {v.status !== 'issue' ? (
                      <button type="button" className="ew-btn ghost sm" onClick={() => void markVendor(v.vendor_org_id, 'issue')} disabled={vendorBusy}>Flag issue</button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const CLO_CSS = `
.ew-clo { display: flex; flex-direction: column; gap: 18px; }
.ew-clo-hero { display: flex; flex-wrap: wrap; align-items: baseline; gap: 16px; padding: 18px 20px; border: 1.5px solid; border-radius: 14px; background: rgba(247,244,238,.5); }
.ew-clo-state { font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
.ew-clo-heroacts { margin-left: auto; align-self: center; display: flex; align-items: center; gap: 10px; }
.ew-clo-notlive { font-size: 12px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: #6b6459; }
.ew-clo-closeok { margin: 0; padding: 10px 14px; border-radius: 10px; background: rgba(30,93,74,.08); color: #1E5D4A; font-size: 13px; font-weight: 600; }
.ew-clo-block { border: 1.5px solid #b4451f; border-radius: 14px; padding: 16px 18px; background: rgba(180,69,31,.05); }
.ew-clo-blockhead { font-size: 13px; font-weight: 700; letter-spacing: 1px; color: #b4451f; margin-bottom: 6px; }
.ew-clo-blocksub { margin: 0 0 10px; font-size: 12.5px; color: #6b6459; line-height: 1.5; }
.ew-clo-block ul { margin: 0 0 14px; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; }
.ew-clo-block li { font-size: 13px; color: #2c2a26; }
.ew-clo-blockacts { display: flex; gap: 10px; }
.ew-clo-danger { background: #b4451f; border-color: #b4451f; color: #fff; }
.ew-clo-cat h3 { margin: 0 0 10px; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 19px; color: #123c2e; }
.ew-clo-cat ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.ew-clo-cat li { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 10px; border: 1px solid #e7e1d6; background: #fff; }
.ew-clo-cat li.is-ok { background: rgba(30,93,74,.05); }
.ew-clo-cat li.is-warn { border-color: rgba(201,163,91,.5); }
.ew-clo-cat li.is-block { border-color: rgba(180,69,31,.5); background: rgba(180,69,31,.04); }
.ew-clo-glyph { flex: 0 0 auto; width: 22px; text-align: center; font-size: 15px; }
.is-ok .ew-clo-glyph { color: #1E5D4A; }
.is-warn .ew-clo-glyph { color: #9a7e3e; }
.is-block .ew-clo-glyph { color: #b4451f; }
.ew-clo-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
.ew-clo-label { font-size: 13.5px; font-weight: 600; color: #2c2a26; }
.ew-clo-msg { font-size: 12px; color: #6b6459; }
.ew-clo-vrow { flex-wrap: wrap; }
.ew-clo-vstatus { font-size: 10.5px; text-transform: uppercase; letter-spacing: .4px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: rgba(154,142,94,.15); color: #9a8a5e; white-space: nowrap; }
.ew-clo-vrow[data-status="complete"] .ew-clo-vstatus { background: rgba(18,60,46,.1); color: #123c2e; }
.ew-clo-vrow[data-status="issue"] .ew-clo-vstatus { background: rgba(155,44,44,.1); color: #9b2c2c; }
.ew-clo-vname { flex: 1 1 auto; font-size: 13px; color: #2c2a26; }
.ew-clo-vacts { display: flex; gap: 6px; }
`;
