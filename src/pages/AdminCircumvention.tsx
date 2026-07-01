import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { apiGet, apiSend } from '../lib/api';

/**
 * AdminCircumvention (Anti-Circumvention, Module 4) - the super-admin console for
 * platform-formed relationships (introductions). Lists introductions, shows the
 * 24-month (per-row) non-circumvention window, and lets a super admin flag,
 * investigate, suspend, or clear each one. Pages self-guard on isAdmin; the
 * mutating endpoints are super-admin gated server-side as well.
 *
 * Route: /admin/circumvention (wired in src/App.tsx).
 *
 * Zero em dashes.
 */
type Status = 'active' | 'flagged' | 'cleared' | 'suspended';

type Introduction = {
  id: string;
  organization_id: string | null;
  source_partner_id: string | null;
  party_a_org_id: string | null;
  party_b_org_id: string | null;
  subject_type: string | null;
  subject_id: string | null;
  introduced_at: string;
  window_months: number;
  status: Status;
  note: string | null;
  created_at: string;
};

type AuditEntry = {
  id: string;
  action: string;
  actor_email: string | null;
  summary: string | null;
  created_at: string;
};

type Investigation = {
  introduction: Introduction;
  audit: AuditEntry[];
  related: Introduction[];
};

const STATUS_FILTERS: Array<{ key: '' | Status; label: string }> = [
  { key: '', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'flagged', label: 'Flagged' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'cleared', label: 'Cleared' },
];

function shortId(id: string | null): string {
  return id ? id.slice(0, 8) : '-';
}

/** The window end date = introduced_at + window_months. */
function windowEnd(intro: Introduction): string {
  const start = new Date(intro.introduced_at);
  if (Number.isNaN(start.getTime())) return '-';
  const end = new Date(start);
  end.setMonth(end.getMonth() + (intro.window_months || 24));
  return end.toLocaleDateString();
}

function windowActive(intro: Introduction): boolean {
  const start = new Date(intro.introduced_at);
  if (Number.isNaN(start.getTime())) return false;
  const end = new Date(start);
  end.setMonth(end.getMonth() + (intro.window_months || 24));
  return end.getTime() >= Date.now();
}

export default function AdminCircumvention() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<Introduction[]>([]);
  const [status, setStatus] = useState<'' | Status>('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [investigation, setInvestigation] = useState<Investigation | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const qs = status ? `?status=${encodeURIComponent(status)}` : '';
      const r = await apiGet<{ introductions: Introduction[] }>(`/introductions${qs}`);
      setRows(r.introductions ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, status]);

  async function act(id: string, action: 'flag' | 'suspend' | 'clear') {
    const prompts: Record<typeof action, string> = {
      flag: 'Flag this introduction as possible off-platform circumvention?',
      suspend: 'Suspend this relationship for circumvention? (It is not deleted.)',
      clear: 'Clear the circumvention flag and set this back to active?',
    } as const;
    const note = window.prompt(prompts[action], '');
    if (note === null) return; // cancelled
    setBusyId(id);
    setErr(null);
    try {
      await apiSend('POST', `/introductions/${id}/${action}`, { note: note || undefined });
      await load();
      if (investigation?.introduction.id === id) await investigate(id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function investigate(id: string) {
    setBusyId(id);
    setErr(null);
    try {
      const r = await apiGet<Investigation>(`/introductions/${id}/investigate`);
      setInvestigation(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (!isAdmin) {
    return (
      <div className="dp-ac">
        <style>{AC_CSS}</style>
        <p className="dp-ac-guard">This page is restricted to platform administrators.</p>
      </div>
    );
  }

  return (
    <div className="dp-ac">
      <style>{AC_CSS}</style>
      <header className="dp-ac-head">
        <div>
          <span className="dp-ac-kicker">Super Admin</span>
          <h1 className="dp-ac-title">Anti-Circumvention</h1>
          <p className="dp-ac-sub">
            Platform-formed introductions and their non-circumvention windows. Flag, investigate, or
            suspend off-platform dealing. Nothing is ever deleted.
          </p>
        </div>
        <div className="dp-ac-filters">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key || 'all'}
              className={`dp-ac-chip ${status === f.key ? 'is-on' : ''}`}
              onClick={() => setStatus(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      {err ? <p className="dp-ac-err">{err}</p> : null}

      {loading ? (
        <p className="dp-ac-muted">Loading introductions...</p>
      ) : rows.length === 0 ? (
        <div className="dp-ac-empty">
          <p>No introductions match this filter yet.</p>
        </div>
      ) : (
        <div className="dp-ac-list">
          <div className="dp-ac-row dp-ac-row-head">
            <span>Parties</span>
            <span>Subject</span>
            <span>Window</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {rows.map((r) => (
            <div key={r.id} className="dp-ac-row">
              <span className="dp-ac-parties">
                <code>{shortId(r.party_a_org_id)}</code>
                <span className="dp-ac-arrow">&harr;</span>
                <code>{shortId(r.party_b_org_id)}</code>
                {r.source_partner_id ? (
                  <em className="dp-ac-src">via {shortId(r.source_partner_id)}</em>
                ) : null}
              </span>
              <span className="dp-ac-subject">{r.subject_type ?? '-'}</span>
              <span className="dp-ac-window">
                {r.window_months}mo
                <em className={windowActive(r) ? 'dp-ac-win-on' : 'dp-ac-win-off'}>
                  through {windowEnd(r)}
                </em>
              </span>
              <span className={`dp-ac-status dp-ac-status-${r.status}`}>{r.status}</span>
              <span className="dp-ac-actions">
                <button disabled={busyId === r.id} onClick={() => investigate(r.id)}>
                  Investigate
                </button>
                {r.status !== 'flagged' && r.status !== 'suspended' ? (
                  <button
                    className="dp-ac-warn"
                    disabled={busyId === r.id}
                    onClick={() => act(r.id, 'flag')}
                  >
                    Flag
                  </button>
                ) : null}
                {r.status !== 'suspended' ? (
                  <button
                    className="dp-ac-danger"
                    disabled={busyId === r.id}
                    onClick={() => act(r.id, 'suspend')}
                  >
                    Suspend
                  </button>
                ) : null}
                {r.status === 'flagged' || r.status === 'suspended' ? (
                  <button disabled={busyId === r.id} onClick={() => act(r.id, 'clear')}>
                    Clear
                  </button>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      )}

      {investigation ? (
        <div className="dp-ac-drawer">
          <div className="dp-ac-drawer-head">
            <h3>
              Investigation &middot; <code>{shortId(investigation.introduction.id)}</code>
            </h3>
            <button onClick={() => setInvestigation(null)}>Close</button>
          </div>
          <div className="dp-ac-drawer-grid">
            <section>
              <h4>Audit trail</h4>
              {investigation.audit.length === 0 ? (
                <p className="dp-ac-muted">No audit entries for this introduction yet.</p>
              ) : (
                <ul className="dp-ac-audit">
                  {investigation.audit.map((a) => (
                    <li key={a.id}>
                      <span className="dp-ac-audit-action">{a.action}</span>
                      <span className="dp-ac-audit-sum">{a.summary ?? '-'}</span>
                      <span className="dp-ac-audit-meta">
                        {a.actor_email ?? 'system'} &middot; {new Date(a.created_at).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h4>Related introductions</h4>
              {investigation.related.length === 0 ? (
                <p className="dp-ac-muted">No other introductions involve either party.</p>
              ) : (
                <ul className="dp-ac-related">
                  {investigation.related.map((r) => (
                    <li key={r.id}>
                      <code>{shortId(r.party_a_org_id)}</code> &harr;{' '}
                      <code>{shortId(r.party_b_org_id)}</code>
                      <span className={`dp-ac-status dp-ac-status-${r.status}`}>{r.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const AC_CSS = `
.dp-ac {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--dp-ink);
}
.dp-ac *, .dp-ac *::before, .dp-ac *::after { box-sizing: border-box; }
.dp-ac h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }
.dp-ac-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; margin-bottom: 18px; flex-wrap: wrap; }
.dp-ac-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--dp-gold); font-weight: 600; }
.dp-ac-title { font-size: 32px; color: var(--dp-emerald); line-height: 1.05; }
.dp-ac-sub { margin: 4px 0 0; font-size: 13px; color: var(--dp-muted); max-width: 560px; }
.dp-ac-filters { display: flex; gap: 6px; flex-wrap: wrap; }
.dp-ac-chip { font: inherit; font-size: 12px; padding: 6px 12px; border: 1px solid var(--dp-line); border-radius: 999px; background: #fff; color: var(--dp-muted); cursor: pointer; }
.dp-ac-chip.is-on { background: var(--dp-emerald); border-color: var(--dp-emerald); color: #fff; }
.dp-ac-guard { background: #f6eaea; border: 1px solid #e2caca; color: #8a3a3a; border-radius: 10px; padding: 14px 16px; font-size: 13px; }
.dp-ac-muted { color: var(--dp-muted); font-size: 13px; }
.dp-ac-err { color: #8a3a3a; background: #f6eaea; border: 1px solid #e2caca; border-radius: 8px; padding: 9px 12px; font-size: 12.5px; }
.dp-ac-empty { border: 1px dashed var(--dp-line); border-radius: 12px; padding: 36px; background: rgba(247,244,238,.55); text-align: center; }
.dp-ac-empty p { margin: 0; font-size: 13px; color: var(--dp-muted); }
.dp-ac-list { display: flex; flex-direction: column; border: 1px solid var(--dp-line); border-radius: 12px; overflow: hidden; background: #fff; }
.dp-ac-row { display: grid; grid-template-columns: 1.8fr 1fr 1.3fr .9fr 1.9fr; gap: 10px; align-items: center; padding: 11px 14px; font-size: 12.5px; border-bottom: 1px solid var(--dp-line); }
.dp-ac-row:last-child { border-bottom: 0; }
.dp-ac-row-head { background: rgba(18,60,46,.04); font-size: 10.5px; letter-spacing: .6px; text-transform: uppercase; color: var(--dp-muted); font-weight: 600; }
.dp-ac-parties { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dp-ac-parties code { background: rgba(18,60,46,.06); border-radius: 5px; padding: 2px 6px; font-size: 11px; color: var(--dp-emerald-2); }
.dp-ac-arrow { color: var(--dp-gold); }
.dp-ac-src { font-style: normal; color: var(--dp-muted); font-size: 10.5px; }
.dp-ac-subject { text-transform: capitalize; color: var(--dp-ink); }
.dp-ac-window { display: flex; flex-direction: column; gap: 2px; font-weight: 600; }
.dp-ac-window em { font-style: normal; font-weight: 500; font-size: 10.5px; }
.dp-ac-win-on { color: var(--dp-emerald-2); }
.dp-ac-win-off { color: var(--dp-muted); }
.dp-ac-status { text-transform: capitalize; font-weight: 600; font-size: 11.5px; border-radius: 999px; padding: 3px 10px; width: fit-content; }
.dp-ac-status-active { background: rgba(30,93,74,.1); color: var(--dp-emerald-2); }
.dp-ac-status-flagged { background: rgba(201,163,91,.18); color: #8a6d2e; }
.dp-ac-status-suspended { background: #f6eaea; color: #8a3a3a; }
.dp-ac-status-cleared { background: rgba(125,119,108,.12); color: var(--dp-muted); }
.dp-ac-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.dp-ac-actions button { font: inherit; font-size: 11.5px; padding: 5px 10px; border: 1px solid var(--dp-line); border-radius: 7px; background: #fff; color: var(--dp-ink); cursor: pointer; }
.dp-ac-actions button:hover { border-color: var(--dp-emerald-2); }
.dp-ac-actions button:disabled { opacity: .5; cursor: default; }
.dp-ac-actions .dp-ac-warn { color: #8a6d2e; border-color: rgba(201,163,91,.5); }
.dp-ac-actions .dp-ac-danger { color: #8a3a3a; border-color: #e2caca; }
.dp-ac-drawer { margin-top: 18px; border: 1px solid var(--dp-line); border-radius: 12px; background: #fff; padding: 16px 18px; }
.dp-ac-drawer-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.dp-ac-drawer-head h3 { margin: 0; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 20px; color: var(--dp-emerald); }
.dp-ac-drawer-head code { background: rgba(18,60,46,.06); border-radius: 5px; padding: 2px 6px; font-size: 12px; }
.dp-ac-drawer-head button { font: inherit; font-size: 12px; padding: 5px 12px; border: 1px solid var(--dp-line); border-radius: 7px; background: #fff; cursor: pointer; }
.dp-ac-drawer-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 18px; }
.dp-ac-drawer-grid h4 { margin: 0 0 8px; font-size: 11px; letter-spacing: .5px; text-transform: uppercase; color: var(--dp-gold); }
.dp-ac-audit, .dp-ac-related { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.dp-ac-audit li { display: flex; flex-direction: column; gap: 2px; border-left: 2px solid var(--dp-gold); padding-left: 10px; }
.dp-ac-audit-action { font-weight: 600; color: var(--dp-emerald-2); font-size: 12px; }
.dp-ac-audit-sum { font-size: 12px; color: var(--dp-ink); }
.dp-ac-audit-meta { font-size: 10.5px; color: var(--dp-muted); }
.dp-ac-related li { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.dp-ac-related code { background: rgba(18,60,46,.06); border-radius: 5px; padding: 1px 5px; font-size: 11px; color: var(--dp-emerald-2); }
@media (max-width: 920px) {
  .dp-ac-row { grid-template-columns: 1fr 1fr; }
  .dp-ac-row-head { display: none; }
  .dp-ac-actions { grid-column: span 2; }
  .dp-ac-drawer-grid { grid-template-columns: 1fr; }
}
`;
