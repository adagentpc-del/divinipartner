import { useEffect, useState } from 'react';
import { apiGet, apiSend, ApiError } from './api';

// Mirrors server/src/lib/entitlements.ts's PlanEntitlements / limitExceededPayload.
export type CapabilityKey =
  | 'events.active' | 'quotes.per_event' | 'quotes.compare' | 'locations' | 'spaces'
  | 'inventory_items' | 'warehouses' | 'team_seats' | 'workers' | 'leads.monthly'
  | 'leads.active' | 'proposals.monthly' | 'packages' | 'automation_runs.monthly'
  | 'storage_bytes' | 'integrations' | 'reports.advanced';

export type PlanEntitlements = {
  planKey: string;
  planLabel: string;
  feeRate: number;
  feeCapCents: number | null;
  monthlyCents: number;
  limits: Partial<Record<CapabilityKey, number | null>>;
};

export type PlanLimitError = {
  error: 'plan_limit_reached';
  capability: CapabilityKey;
  limit: number | null;
  used: number;
  upgrade: { tier: string; label: string; monthlyUsd: number | null } | null;
};

/** True when a caught error is the structured "plan_limit_reached" response a
 *  checkLimit-gated route sends (server/src/lib/entitlements.ts). Use this in
 *  a create-form's catch block to show <UpgradePrompt> instead of a generic
 *  error string. */
export function isPlanLimitError(e: unknown): e is ApiError & { body: PlanLimitError } {
  return (
    e instanceof ApiError &&
    e.status === 402 &&
    typeof e.body === 'object' &&
    e.body !== null &&
    (e.body as { error?: string }).error === 'plan_limit_reached'
  );
}

/** Fetch the signed-in org's entitlements (fee rate/cap + usage limits). Read
 *  only -- never used to enforce anything client-side; the server is always
 *  the real gate. Good for proactive "X of Y used" indicators. */
export function useEntitlements(): { entitlements: PlanEntitlements | null; loading: boolean } {
  const [entitlements, setEntitlements] = useState<PlanEntitlements | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    apiGet<{ entitlements: PlanEntitlements | null }>('/entitlements')
      .then((r) => { if (alive) setEntitlements(r.entitlements); })
      .catch(() => { /* leave null; callers treat that as "unknown" */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return { entitlements, loading };
}

const CAPABILITY_LABEL: Partial<Record<CapabilityKey, string>> = {
  'events.active': 'active events',
  'quotes.per_event': 'quote requests per event',
  'quotes.compare': 'quotes you can compare',
  locations: 'locations',
  spaces: 'spaces',
  inventory_items: 'inventory items',
  warehouses: 'warehouses',
  team_seats: 'team seats',
  workers: 'workers',
  'leads.monthly': 'leads this month',
  'leads.active': 'active leads',
  'proposals.monthly': 'proposals this month',
  packages: 'packages',
};

/**
 * The upgrade prompt every checkLimit-gated create form shows on a 402
 * plan_limit_reached response. One shared component so every limit reads the
 * same, on-brand way, instead of a generic error toast.
 */
export function UpgradePrompt({ error, onDismiss }: { error: PlanLimitError; onDismiss?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const label = CAPABILITY_LABEL[error.capability] ?? error.capability;

  async function upgrade() {
    if (!error.upgrade) return;
    setBusy(true);
    setErr('');
    try {
      const r = await apiSend<{ redirect_url: string }>('POST', '/billing/subscribe', {
        tier: error.upgrade.tier,
      });
      if (r?.redirect_url) window.location.href = r.redirect_url;
    } catch (e) {
      setErr((e as Error).message || 'Could not start checkout.');
      setBusy(false);
    }
  }

  return (
    <div className="upgrade-prompt">
      <style>{`
        .upgrade-prompt{background:#fbf7ee;border:1px solid #C9A35B;border-radius:12px;padding:16px 18px;margin:12px 0;display:flex;flex-direction:column;gap:10px}
        .upgrade-prompt .up-head{font-weight:700;color:#123c2e;font-size:14.5px}
        .upgrade-prompt .up-body{font-size:13.5px;color:#5b564c;line-height:1.5}
        .upgrade-prompt .up-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
        .upgrade-prompt .up-btn{background:#123c2e;color:#fff;border:none;border-radius:9px;padding:9px 16px;font-weight:600;font-size:13.5px;cursor:pointer}
        .upgrade-prompt .up-btn:disabled{opacity:.6;cursor:default}
        .upgrade-prompt .up-dismiss{background:transparent;border:none;color:#7d776c;font-size:13px;cursor:pointer;text-decoration:underline}
        .upgrade-prompt .up-err{color:#a3382f;font-size:12.5px}
      `}</style>
      <div className="up-head">You have reached your plan's limit</div>
      <div className="up-body">
        Your current plan includes {error.limit ?? 0} {label}
        {error.upgrade
          ? `. Upgrade to ${error.upgrade.label}${error.upgrade.monthlyUsd != null ? ` ($${error.upgrade.monthlyUsd}/mo)` : ''} for more room to grow.`
          : '. Contact us to talk about a custom plan.'}
      </div>
      {err && <div className="up-err">{err}</div>}
      <div className="up-actions">
        {error.upgrade && (
          <button className="up-btn" onClick={upgrade} disabled={busy}>
            {busy ? 'Starting checkout...' : `Upgrade to ${error.upgrade.label}`}
          </button>
        )}
        {onDismiss && (
          <button className="up-dismiss" onClick={onDismiss}>
            Not now
          </button>
        )}
      </div>
    </div>
  );
}
