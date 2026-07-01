/**
 * Divini Partners - in-memory rate limiter (Module 5, security, code-level).
 *
 * A dependency-free fixed-window rate limiter middleware factory. Counts
 * requests per key (default: per client IP) inside a rolling fixed window held
 * in a Map. No new npm package, no Redis. Suitable for a single-process app; it
 * is the application-layer backstop, NOT the perimeter defense.
 *
 * Usage (integration registers this; this file only defines it):
 *   import { rateLimit, apiRateLimit } from "./lib/rateLimit.js";
 *   app.use("/api", apiRateLimit);                 // sensible default for the API
 *   app.use("/api/auth", rateLimit({ windowMs: 60_000, max: 20 })); // tighter
 *
 * On limit the middleware responds 429 with a Retry-After header and a small
 * JSON body, and never calls next().
 *
 * ----------------------------------------------------------------------------
 * INFRA ITEMS NOT COVERED BY THIS APP CODE (flagged honestly, do not fake):
 *   - WAF / DDoS / bot protection / volumetric L3-L4 mitigation: belongs at the
 *     edge (Caddy / Cloudflare / load balancer). A Map-based limiter in one
 *     Node process cannot absorb a distributed flood and is not shared across
 *     replicas. This is a courtesy throttle and abuse-dampener only.
 *   - MFA / 2FA: provided by the Authentik IdP, not by this limiter.
 * ----------------------------------------------------------------------------
 */
import type { Request, Response, NextFunction, RequestHandler } from "express";

export interface RateLimitOptions {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Max requests allowed per key per window. */
  max: number;
  /** Derive the bucket key from the request (default: client IP). */
  keyBy?: (req: Request) => string;
  /** Optional label used in the 429 body (helps debugging multiple limiters). */
  name?: string;
}

interface Bucket {
  count: number;
  /** Epoch ms when the current window resets. */
  resetAt: number;
}

/** Best-effort client IP, honoring a single upstream proxy hop. */
function clientIp(req: Request): string {
  const fwd = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  return fwd || req.socket?.remoteAddress || "unknown";
}

/**
 * Build a rate-limiting middleware. Each factory call owns its own Map so
 * different mounts (e.g. /api vs /api/auth) keep independent counters. A lazy
 * sweep on each request evicts expired buckets so the Map cannot grow without
 * bound under churning IPs.
 */
export function rateLimit(opts: RateLimitOptions): RequestHandler {
  const windowMs = Math.max(1, Math.floor(opts.windowMs));
  const max = Math.max(1, Math.floor(opts.max));
  const keyBy = opts.keyBy ?? clientIp;
  const name = opts.name ?? "api";

  const buckets = new Map<string, Bucket>();
  let lastSweep = Date.now();

  function sweep(now: number): void {
    // Sweep at most once per window to keep the hot path cheap.
    if (now - lastSweep < windowMs) return;
    lastSweep = now;
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }

  return function rateLimitMw(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    sweep(now);

    const key = keyBy(req);
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    const remaining = Math.max(0, max - bucket.count);
    const resetSeconds = Math.ceil((bucket.resetAt - now) / 1000);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(resetSeconds));

    if (bucket.count > max) {
      res.setHeader("Retry-After", String(resetSeconds));
      res.status(429).json({
        error: "rate_limited",
        message: "Too many requests. Please retry shortly.",
        limiter: name,
        retry_after_seconds: resetSeconds,
      });
      return;
    }

    next();
  };
}

/**
 * A sensible default for API routes: 300 requests per IP per minute. Generous
 * enough for a logged-in dashboard session, low enough to blunt scripted abuse.
 * Integration should mount this on `/api`.
 */
export const apiRateLimit: RequestHandler = rateLimit({
  windowMs: 60_000,
  max: 300,
  name: "api",
});

/**
 * Tight limiter for the auth surface (/api/auth: login, register, verify,
 * resend, forgot, reset): 20 requests per IP per minute. Low enough to blunt
 * credential stuffing and user-enumeration probing, high enough for a real
 * person retyping a password. Mounted on /api/auth by the app bootstrap.
 */
export const authRateLimit: RequestHandler = rateLimit({
  windowMs: 60_000,
  max: 20,
  name: "auth",
});

export default rateLimit;
