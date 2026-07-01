import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

/**
 * Intelligence Moat - Feature 13: Opportunity Engine daily feed.
 *
 * A role-scoped, actionable feed of opportunities the platform surfaces for the
 * signed-in actor: unrealized revenue (F4 leakage), unused inventory, open
 * projects, preferred requests, audience matches, and event enhancements. The
 * feed is generated deterministically on the server and is audience-scoped, so
 * each actor only sees opportunities targeted at their org/user/role. Items can
 * be regenerated and dismissed.
 */

type Opportunity = {
  id: string;
  audience_role: string | null;
  kind: string | null;
  title: string | null;
  detail: unknown;
  potential_value: number | null;
  status: string;
  source: string | null;
  created_at: string;
};

const ROLES = ['venue', 'vendor', 'planner', 'sponsor', 'client'] as const;
type Role = (typeof ROLES)[number];

const ROLE_KEY = 'dp.im.oppRole';

const KIND_LABELS: Record<string, string> = {
  unused_inventory: 'Unused inventory',
  revenue_leak: 'Revenue leak',
  open_project: 'Open project',
  preferred_request: 'Preferred request',
  audience_match: 'Audience match',
  cost_saving: 'Cost saving',
  enhancement: 'Enhancement',
  match: 'Match',
  partnership_match: 'Partnership match',
};

function money(n: unknown): string {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v) || v <= 0) return '';
  return `$${Math.round(v).toLocaleString()}`;
}

export default function OpportunityFeed() {
  const [role, setRole] = useState<Role>(
    (localStorage.getItem(ROLE_KEY) as Role) || 'venue',
  );
  const [items, setItems] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load(r: Role) {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiGet<{ opportunities: Opportunity[] }>(
        `/opportunities?role=${encodeURIComponent(r)}&status=open`,
      );
      setItems(res.opportunities ?? []);
    } catch (e) {
      setErr((e as Error).message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    localStorage.setItem(ROLE_KEY, role);
    void load(role);
  }, [role]);

  async function generate() {
    setBusy(true);
    setErr(null);
    try {
      const res = await apiSend<{ opportunities: Opportunity[] }>('POST', '/opportunities/generate', {
        role,
      });
      setItems(res.opportunities ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function dismiss(id: string) {
    setBusy(true);
    try {
      await apiSend('POST', `/opportunities/${id}/dismiss`);
      setItems((prev) => prev.filter((o) => o.id !== id));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Opportunity Feed</h1>
          <div className="sub">Your daily actionable opportunities</div>
        </div>
        <button className="btn primary" onClick={generate} disabled={busy}>
          {busy ? 'Working...' : 'Regenerate feed'}
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Role feed</div>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="note" style={{ margin: '10px 0 0', lineHeight: 1.6 }}>
          Opportunities are generated deterministically from your venues, events,
          inventory, and relationships. Regenerate to refresh after changes.
        </p>
      </div>

      {err && (
        <div className="card" style={{ borderColor: '#c0392b', color: '#c0392b', marginBottom: 16 }}>{err}</div>
      )}

      {loading ? (
        <div className="card"><p className="note" style={{ margin: 0 }}>Loading opportunities...</p></div>
      ) : items.length === 0 ? (
        <div className="card">
          <p className="note" style={{ margin: 0 }}>
            No open opportunities yet. Click Regenerate feed to scan your data.
          </p>
        </div>
      ) : (
        <div className="grid cards2">
          {items.map((o) => {
            const value = money(o.potential_value);
            return (
              <div className="card" key={o.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span className="note" style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '.5px' }}>
                    {o.kind ? (KIND_LABELS[o.kind] ?? o.kind) : 'Opportunity'}
                  </span>
                  {value && <span style={{ fontWeight: 700 }}>{value}</span>}
                </div>
                <h3 style={{ margin: '8px 0 0' }}>{o.title ?? 'Opportunity'}</h3>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn" onClick={() => dismiss(o.id)} disabled={busy}>Dismiss</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
