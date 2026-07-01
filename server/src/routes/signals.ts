/**
 * Visitor-signal routes. Mount base: /api/signals (the parent mounts this in
 * routes.ts).
 *
 * POST / is PUBLIC: a visitor may be anonymous, so no requireUser. It records a
 * device fingerprint plus server-observed IP and headers, and (best-effort)
 * attaches the signed-in user/org when the request carries a valid auth token.
 * The body is rate/size guarded.
 *
 * GET / is admin-only and lists recent signals for the super-admin console,
 * with an optional fingerprint filter for dedupe/fraud drill-down.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireAdmin } from "../auth.js";
import * as db from "../db.js";
import * as signals from "../db/signals.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

// Guards against oversized or abusive payloads.
const MAX_FIELD = 4000; // single text field cap
const MAX_FP = 256; // a SHA-256 hex is 64 chars; allow some slack
const MAX_JSON_KEYS = 40;

/** Coerce to a trimmed, length-capped string or null. */
function str(v: unknown, max = MAX_FIELD): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/**
 * Shallow, size-bounded sanitize of a flat record of small scalars. Drops
 * anything that is not a string, number, or boolean, caps the key count, and
 * length-caps string values. Returns null when empty.
 */
function flatObject(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (n >= MAX_JSON_KEYS) break;
    const key = k.slice(0, 64);
    if (typeof val === "string") {
      out[key] = val.slice(0, 512);
      n++;
    } else if (typeof val === "number" || typeof val === "boolean") {
      out[key] = val;
      n++;
    }
  }
  return Object.keys(out).length ? out : null;
}

/** First IP from x-forwarded-for, else the socket address. */
function clientIp(req: Request): string | null {
  const xff = req.headers["x-forwarded-for"];
  const raw = Array.isArray(xff) ? xff[0] : xff;
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(",")[0]!.trim().slice(0, MAX_FIELD) || null;
  }
  return req.socket?.remoteAddress?.slice(0, MAX_FIELD) || null;
}

function headerStr(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return str(v[0]);
  return str(v);
}

const router = Router();

// -------------------------------------------------------------------------
// PUBLIC: record one visitor signal. No requireUser (the visitor may be
// anonymous). Server reads IP + headers; body carries the client fingerprint.
// -------------------------------------------------------------------------
router.post(
  "/",
  h(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    const fingerprint = str(body.fingerprint, MAX_FP);
    const path = str(body.path, 1024);
    const utm = flatObject(body.utm);
    const clientHints = flatObject(body.client_hints);

    // Best-effort identity attach: only when the bearer token verified. Never
    // required, and never blocks the record.
    let userId: string | null = null;
    let organizationId: string | null = null;
    const auth = getAuth(req);
    if (auth.userId) {
      try {
        const actor = await db.getActor(auth.userId, auth.email);
        userId = actor.user.id;
        organizationId = actor.org?.id ?? null;
      } catch {
        // best-effort only
      }
    }

    await signals.recordSignal({
      fingerprint,
      ip: clientIp(req),
      userAgent: headerStr(req.headers["user-agent"]),
      acceptLanguage: headerStr(req.headers["accept-language"]),
      path,
      referrer: headerStr(req.headers["referer"] ?? req.headers["referrer"]),
      utm,
      userId,
      organizationId,
      clientHints,
    });

    res.status(202).json({ ok: true });
  }),
);

// -------------------------------------------------------------------------
// Admin-only: list recent signals for the super-admin console.
// -------------------------------------------------------------------------
router.get(
  "/",
  requireAdmin,
  h(async (req, res) => {
    const fingerprint = typeof req.query.fingerprint === "string" ? req.query.fingerprint : null;
    const limitRaw = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : NaN;
    const limit = Number.isFinite(limitRaw) ? limitRaw : 100;
    const rows = await signals.listSignals(limit, { fingerprint });
    res.json({
      signals: rows.map((r) => ({
        id: r.id,
        fingerprint: r.fingerprint,
        ip: r.ip,
        user_agent: r.user_agent,
        accept_language: r.accept_language,
        path: r.path,
        referrer: r.referrer,
        utm: r.utm,
        user_id: r.user_id,
        organization_id: r.organization_id,
        client_hints: r.client_hints,
        created_at: r.created_at,
      })),
    });
  }),
);

export default router;
