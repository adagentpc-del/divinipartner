/**
 * Divini Partners - security response headers (Module 5, security, code-level).
 *
 * A hand-rolled Express middleware (no helmet package) that sets a baseline of
 * security headers on every response. Designed to register EARLY in the app
 * entry, before routes, so every response (including errors) carries them.
 *
 * Usage (integration registers this; this file only defines it):
 *   import { securityHeaders } from "./lib/securityHeaders.js";
 *   app.use(securityHeaders());   // first, before any route
 *
 * The Content-Security-Policy here is deliberately conservative but permissive
 * enough for a same-origin SPA that uses inline <style> blocks (the dashboards
 * inject scoped CSS via <style>). Tighten `script-src` once a nonce/hash
 * pipeline exists. HSTS is only meaningful over HTTPS (it is ignored by browsers
 * on plain http), and is sent unconditionally because production is HTTPS-only
 * behind Caddy.
 *
 * ----------------------------------------------------------------------------
 * INFRA ITEMS NOT COVERED BY THESE HEADERS (flagged honestly, do not fake):
 *   - TLS termination / HTTPS / certificate management: handled by Caddy at the
 *     edge. HSTS below only INSTRUCTS the browser; it does not provide TLS.
 *   - WAF / DDoS / bot protection: edge/infra (Caddy / Cloudflare), not headers.
 *   - Encryption-at-rest (DB / disk): Postgres + host/volume configuration, not
 *     an HTTP concern.
 *   - Virus / malware scanning of uploaded files: requires an external scanner
 *     service (e.g. ClamAV / a cloud AV API) wired into the upload path; headers
 *     do nothing for file content safety.
 *   - MFA / 2FA: provided by the Authentik IdP.
 * ----------------------------------------------------------------------------
 */
import type { Request, Response, NextFunction, RequestHandler } from "express";

export interface SecurityHeadersOptions {
  /**
   * Override the Content-Security-Policy string entirely. When omitted a
   * same-origin SPA default is used (allows inline styles, blocks framing).
   */
  contentSecurityPolicy?: string;
  /** Disable HSTS (e.g. for a plain-http local dev box). Default: enabled. */
  enableHsts?: boolean;
  /** max-age (seconds) for HSTS. Default: 1 year. */
  hstsMaxAge?: number;
}

/**
 * Default CSP for a same-origin React SPA:
 *   - default to self only
 *   - allow inline <style> (dashboards inject scoped CSS) + Google Fonts CSS
 *   - allow images/data + https (avatars, logos)
 *   - allow XHR/fetch to self (the API is same-origin) and the OIDC issuer
 *     domain is reached by the browser directly; keep connect-src broad to https
 *   - block plugins, forbid being framed (defense in depth with X-Frame-Options)
 */
const DEFAULT_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https:",
  "connect-src 'self' https:",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

/**
 * Build the security-headers middleware. Sets, on every response:
 *   - Content-Security-Policy
 *   - X-Content-Type-Options: nosniff
 *   - X-Frame-Options: DENY
 *   - Referrer-Policy: strict-origin-when-cross-origin
 *   - Strict-Transport-Security (HTTPS only; harmless over http)
 *   - X-XSS-Protection: 0  (modern guidance: rely on CSP, disable the legacy
 *     auditor which itself introduced vulnerabilities)
 *   - Permissions-Policy: deny the powerful features this app never uses
 *   - X-Permitted-Cross-Domain-Policies: none
 *   - X-DNS-Prefetch-Control: off
 */
export function securityHeaders(opts: SecurityHeadersOptions = {}): RequestHandler {
  const csp = opts.contentSecurityPolicy ?? DEFAULT_CSP;
  const hstsEnabled = opts.enableHsts ?? true;
  const hstsMaxAge = opts.hstsMaxAge ?? 31_536_000; // 1 year
  const hstsValue = `max-age=${hstsMaxAge}; includeSubDomains; preload`;

  const permissionsPolicy = [
    "accelerometer=()",
    "autoplay=()",
    "camera=()",
    "display-capture=()",
    "encrypted-media=()",
    "fullscreen=(self)",
    "geolocation=()",
    "gyroscope=()",
    "magnetometer=()",
    "microphone=()",
    "midi=()",
    "payment=()",
    "usb=()",
  ].join(", ");

  return function securityHeadersMw(_req: Request, res: Response, next: NextFunction): void {
    res.setHeader("Content-Security-Policy", csp);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-XSS-Protection", "0");
    res.setHeader("Permissions-Policy", permissionsPolicy);
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    if (hstsEnabled) {
      res.setHeader("Strict-Transport-Security", hstsValue);
    }
    next();
  };
}

export default securityHeaders;
