/**
 * Visitor signals: device fingerprint + IP + usage signals captured from the
 * public web for security, fraud prevention, dedupe, and attribution.
 *
 * Backed by the visitor_signals table (db/schema.sql). Written from the public
 * POST /api/signals route (a visitor may be anonymous) and read read-only from
 * the super-admin console (GET /api/signals).
 *
 * Zero em dashes.
 */
import { q, q1 } from "../pool.js";

export type SignalInput = {
  fingerprint?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  acceptLanguage?: string | null;
  path?: string | null;
  referrer?: string | null;
  utm?: Record<string, unknown> | null;
  userId?: string | null;
  organizationId?: string | null;
  clientHints?: Record<string, unknown> | null;
};

export type SignalRow = {
  id: string;
  fingerprint: string | null;
  ip: string | null;
  user_agent: string | null;
  accept_language: string | null;
  path: string | null;
  referrer: string | null;
  utm: Record<string, unknown> | null;
  user_id: string | null;
  organization_id: string | null;
  client_hints: Record<string, unknown> | null;
  created_at: string;
};

const COLS = `
  id, fingerprint, ip, user_agent, accept_language, path, referrer, utm,
  user_id, organization_id, client_hints, created_at
`;

/** Insert one visitor signal. Returns the inserted row. */
export async function recordSignal(input: SignalInput): Promise<SignalRow> {
  const row = await q1<SignalRow>(
    `insert into visitor_signals
       (fingerprint, ip, user_agent, accept_language, path, referrer, utm,
        user_id, organization_id, client_hints)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     returning ${COLS}`,
    [
      input.fingerprint ?? null,
      input.ip ?? null,
      input.userAgent ?? null,
      input.acceptLanguage ?? null,
      input.path ?? null,
      input.referrer ?? null,
      input.utm ? JSON.stringify(input.utm) : null,
      input.userId ?? null,
      input.organizationId ?? null,
      input.clientHints ? JSON.stringify(input.clientHints) : null,
    ],
  );
  return row as SignalRow;
}

/**
 * Recent signals for the admin console, newest first. Optional fingerprint
 * filter for dedupe/fraud drill-down. The limit is clamped to a sane range.
 */
export async function listSignals(
  limit = 100,
  filters: { fingerprint?: string | null } = {},
): Promise<SignalRow[]> {
  const lim = Math.min(Math.max(Math.trunc(limit) || 100, 1), 500);
  const fp = filters.fingerprint?.trim() || null;
  if (fp) {
    return q<SignalRow>(
      `select ${COLS} from visitor_signals
        where fingerprint = $1
        order by created_at desc
        limit $2`,
      [fp, lim],
    );
  }
  return q<SignalRow>(
    `select ${COLS} from visitor_signals
      order by created_at desc
      limit $1`,
    [lim],
  );
}

/** How many signals share a fingerprint (dedupe/fraud signal). */
export async function countByFingerprint(fingerprint: string): Promise<number> {
  const r = await q1<{ c: string }>(
    `select count(*)::int as c from visitor_signals where fingerprint = $1`,
    [fingerprint],
  );
  return Number(r?.c ?? 0);
}
