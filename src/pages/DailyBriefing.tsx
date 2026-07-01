import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

/**
 * Divini AI COO (V2) - Daily Executive Briefing.
 *
 * The morning briefing narrative (greeting + a plain-language rundown of today's
 * priorities, revenue, risks, approvals, follow-ups, expiring contracts, and
 * partnership / sponsorship opportunities) assembled live on the server from the
 * existing engines, paired with the ranked automated executive tasks the COO
 * generates from that briefing. Tasks can be regenerated and marked done /
 * dismissed. Degrades to honest empty states before real data exists.
 */

type Priority = { title: string; detail?: string; impact: number; category: string };
type Risk = { title: string; severity: string; recommendation?: string };
type RevenueOpportunity = { title: string; value: number };
type FollowUp = { title: string; detail?: string };
type Briefing = {
  greeting: string;
  priorities: Priority[];
  revenueOpportunities: RevenueOpportunity[];
  risks: Risk[];
  approvalsNeeded: { title: string; count: number }[];
  followUps: FollowUp[];
  contractsExpiring: { title: string; daysUntil: number | null }[];
  sponsorshipOpportunities: { title: string; value: number }[];
  partnershipOpportunities: { title: string; score: number; reasons: string[] }[];
  recommendedActions: { title: string; actionType: string; impact: number }[];
  potentialRevenue: number;
};

type Task = {
  id: string;
  title: string;
  action_type: string | null;
  detail: unknown;
  impact_score: number | null;
  status: 'open' | 'done' | 'dismissed';
  due_at: string | null;
  source: string | null;
  created_at: string;
};

function money(n: unknown): string {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v) || v <= 0) return '$0';
  return `$${Math.round(v).toLocaleString()}`;
}

export default function DailyBriefing() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [b, t] = await Promise.all([
        apiGet<{ briefing: Briefing }>('/coo/briefing'),
        apiGet<{ tasks: Task[] }>('/coo/tasks?status=open'),
      ]);
      setBriefing(b.briefing ?? null);
      setTaskList(t.tasks ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function generate() {
    setBusy(true);
    setErr(null);
    try {
      const res = await apiSend<{ tasks: Task[] }>('POST', '/coo/tasks/generate');
      setTaskList(res.tasks ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: 'done' | 'dismissed') {
    setBusy(true);
    try {
      await apiSend('POST', `/coo/tasks/${id}/status`, { status });
      setTaskList((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const hasNarrative =
    !!briefing &&
    (briefing.priorities.length > 0 ||
      briefing.revenueOpportunities.length > 0 ||
      briefing.risks.length > 0 ||
      briefing.followUps.length > 0 ||
      briefing.contractsExpiring.length > 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Daily Executive Briefing</h1>
          <div className="sub">{briefing?.greeting ?? 'Your morning rundown'}</div>
        </div>
        <button className="btn primary" onClick={generate} disabled={busy}>
          {busy ? 'Working...' : 'Generate tasks'}
        </button>
      </div>

      {err && (
        <div className="card" style={{ borderColor: '#c0392b', color: '#c0392b', marginBottom: 16 }}>{err}</div>
      )}

      {loading ? (
        <div className="card"><p className="note" style={{ margin: 0 }}>Assembling your briefing...</p></div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>This morning</h3>
            {hasNarrative && briefing ? (
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
                {briefing.potentialRevenue > 0 && (
                  <li>
                    The engines identified <strong>{money(briefing.potentialRevenue)}</strong> in
                    potential revenue across your venues and events.
                  </li>
                )}
                {briefing.risks.length > 0 && (
                  <li>
                    <strong>{briefing.risks.length}</strong> open risk
                    {briefing.risks.length === 1 ? '' : 's'} need attention
                    {briefing.risks[0] ? `, starting with ${briefing.risks[0].title}.` : '.'}
                  </li>
                )}
                {briefing.approvalsNeeded.length > 0 && (
                  <li>
                    {briefing.approvalsNeeded.length} approval queue
                    {briefing.approvalsNeeded.length === 1 ? '' : 's'} awaiting your decision.
                  </li>
                )}
                {briefing.followUps.length > 0 && (
                  <li>{briefing.followUps.length} outstanding follow-up{briefing.followUps.length === 1 ? '' : 's'}.</li>
                )}
                {briefing.contractsExpiring.length > 0 && (
                  <li>
                    <strong>{briefing.contractsExpiring.length}</strong> contract
                    {briefing.contractsExpiring.length === 1 ? '' : 's'} / document
                    {briefing.contractsExpiring.length === 1 ? '' : 's'} approaching expiry.
                  </li>
                )}
                {briefing.partnershipOpportunities.length > 0 && (
                  <li>
                    {briefing.partnershipOpportunities.length} partnership
                    {briefing.partnershipOpportunities.length === 1 ? '' : 's'} worth pursuing.
                  </li>
                )}
                {briefing.sponsorshipOpportunities.length > 0 && (
                  <li>
                    {briefing.sponsorshipOpportunities.length} sponsorship
                    {briefing.sponsorshipOpportunities.length === 1 ? '' : 's'} ready to sell.
                  </li>
                )}
              </ul>
            ) : (
              <p className="note" style={{ margin: 0, lineHeight: 1.6 }}>
                A quiet morning. As your venues, events, quotes, contracts, and
                sponsorships fill in, your briefing will summarize what matters most
                and generate ranked tasks automatically.
              </p>
            )}
          </div>

          <div className="sectitle">Ranked tasks</div>
          {taskList.length === 0 ? (
            <div className="card">
              <p className="note" style={{ margin: 0 }}>
                No open tasks. Click Generate tasks to turn this briefing into a ranked action list.
              </p>
            </div>
          ) : (
            <div className="grid cards2">
              {taskList.map((t) => (
                <div className="card" key={t.id}>
                  <div className="note" style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '.5px' }}>
                    {(t.action_type ?? 'task').replace(/_/g, ' ')} - impact {t.impact_score ?? 0}
                  </div>
                  <h3 style={{ margin: '6px 0 0' }}>{t.title}</h3>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button className="btn" onClick={() => setStatus(t.id, 'done')} disabled={busy}>Mark done</button>
                    <button className="btn" onClick={() => setStatus(t.id, 'dismissed')} disabled={busy}>Dismiss</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
