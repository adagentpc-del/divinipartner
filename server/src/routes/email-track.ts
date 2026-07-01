/**
 * Self-hosted email open + click tracking. PUBLIC routes (no auth). The parent
 * mounts this router at /api/e (see routes.ts). All endpoints are best-effort:
 * a tracking failure must never block delivery of the pixel or the redirect.
 *
 *   GET /o/:ref   record an 'open' for message_ref :ref (recipient from ?r=),
 *                 respond with a 1x1 transparent GIF (no-cache).
 *   GET /c/:ref   record a 'click' with the target url from ?u=<encoded>, then
 *                 302 redirect to that url. The target is validated to be an
 *                 http/https URL on an allowed host to avoid an open redirect;
 *                 invalid targets fall back to PUBLIC_APP_URL.
 *
 * The :ref is the claim_outreach row id, so opens/clicks tie back to the exact
 * outreach record (see lib/claim-emails.ts and lib/email.ts).
 *
 * ZERO em dashes in this file (hard rule).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { recordEmailEvent } from "../db/email-events.js";
import { PUBLIC_APP_URL, BASE_PATH, getAllowedOrigins } from "../config.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

// 1x1 transparent GIF.
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
  "base64",
);

const SAFE_FALLBACK = (PUBLIC_APP_URL || "https://divinipartners.com") + BASE_PATH;

/** First IP from x-forwarded-for, else the socket address. */
function clientIp(req: Request): string | null {
  const xff = req.headers["x-forwarded-for"];
  const raw = Array.isArray(xff) ? xff[0] : xff;
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(",")[0]!.trim() || null;
  }
  return req.socket?.remoteAddress ?? null;
}

function headerStr(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return typeof v === "string" ? v : null;
}

function queryStr(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return null;
}

/** Allowed redirect hosts: PUBLIC_APP_URL host plus configured origins. */
function allowedHosts(): Set<string> {
  const hosts = new Set<string>();
  for (const origin of getAllowedOrigins()) {
    try {
      hosts.add(new URL(origin).host.toLowerCase());
    } catch {
      // ignore malformed origins
    }
  }
  if (PUBLIC_APP_URL) {
    try {
      hosts.add(new URL(PUBLIC_APP_URL).host.toLowerCase());
    } catch {
      // ignore
    }
  }
  return hosts;
}

/**
 * Validate a click target. Only http/https URLs are allowed, and the host must
 * be on the allow list (PUBLIC_APP_URL + ALLOWED_ORIGINS). Returns the safe URL
 * string, or null when the target is unsafe. When the allow list is empty (no
 * PUBLIC_APP_URL configured, e.g. local dev), any http/https URL is accepted so
 * tracking still functions; production always has PUBLIC_APP_URL set.
 */
function safeRedirectTarget(raw: string | null): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const hosts = allowedHosts();
  if (hosts.size === 0) return url.toString();
  return hosts.has(url.host.toLowerCase()) ? url.toString() : null;
}

const router = Router();

// ---- open pixel ------------------------------------------------------------
router.get(
  "/o/:ref",
  h(async (req, res) => {
    const ref = req.params.ref;
    if (ref) {
      try {
        await recordEmailEvent({
          messageRef: ref,
          recipient: queryStr(req.query.r),
          kind: "open",
          ip: clientIp(req),
          userAgent: headerStr(req.headers["user-agent"]),
        });
      } catch {
        // best-effort only; always serve the pixel
      }
    }
    res.setHeader("Content-Type", "image/gif");
    res.setHeader("Content-Length", String(PIXEL.length));
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.status(200).end(PIXEL);
  }),
);

// ---- tracked click redirect ------------------------------------------------
router.get(
  "/c/:ref",
  h(async (req, res) => {
    const ref = req.params.ref;
    const requested = queryStr(req.query.u);
    const safe = safeRedirectTarget(requested);
    const target = safe ?? SAFE_FALLBACK;
    if (ref) {
      try {
        await recordEmailEvent({
          messageRef: ref,
          recipient: queryStr(req.query.r),
          kind: "click",
          url: safe ?? requested,
          ip: clientIp(req),
          userAgent: headerStr(req.headers["user-agent"]),
        });
      } catch {
        // best-effort only; always redirect
      }
    }
    res.redirect(302, target);
  }),
);

export default router;
