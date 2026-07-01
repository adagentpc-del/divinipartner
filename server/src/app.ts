/**
 * Express app - mirrors divinipartner/api-server/src/app.ts: one Node process
 * serving the built Vite SPA AND the /api router. Authentik OIDC token
 * verification runs as middleware (authMiddleware) before the router.
 */
import express, { type Express } from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authMiddleware } from "./auth.js";
import router, { errorHandler } from "./routes.js";
import sitemap from "./routes/sitemap.js";
import { getAllowedOrigins, IS_PROD } from "./config.js";
import { securityHeaders } from "./lib/securityHeaders.js";
import { apiRateLimit, authRateLimit } from "./lib/rateLimit.js";

const app: Express = express();
app.set("trust proxy", 1);

// Security response headers - set early, before routes and body parsing. HSTS
// is on because the app is served behind Caddy over HTTPS.
app.use(securityHeaders());

// CORS - allow PUBLIC_APP_URL / ALLOWED_ORIGINS and same-origin (no Origin).
// Deny by default in production: when the allowlist is empty we restrict to
// same-origin instead of reflecting every Origin, so a misconfigured deploy
// cannot silently open cross-origin access. Outside production we keep the
// permissive bootstrap for local dev convenience.
const allowedOrigins = getAllowedOrigins();
if (IS_PROD && allowedOrigins.length === 0) {
  // eslint-disable-next-line no-console
  console.warn(
    "[cors] No allowlist configured in production (PUBLIC_APP_URL / ALLOWED_ORIGINS empty). " +
      "Denying all cross-origin requests; restricting to same-origin. Set PUBLIC_APP_URL or ALLOWED_ORIGINS.",
  );
}
app.use(
  cors({
    credentials: true,
    origin(origin, cb) {
      if (!origin) return cb(null, true); // same-origin / curl
      if (allowedOrigins.length === 0) {
        // Empty allowlist: permissive only outside production. In production
        // fail closed and deny the cross-origin request.
        return cb(null, !IS_PROD);
      }
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
  }),
);

// JSON bodies (file bytes travel via multipart, not JSON). The `verify` hook
// stashes the raw buffer so payment webhook routes can verify HMAC signatures
// (Stripe) against the exact bytes that were signed.
app.use(
  express.json({
    limit: "2mb",
    verify: (req, _res, buf) => {
      (req as unknown as { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// Authentik (OIDC) verification - stashes verified claims on req.
app.use(authMiddleware());

// API - throttle the API surface (reads x-forwarded-for via trust proxy).
app.use("/api", apiRateLimit);
// Tighter per-IP throttle on the auth surface (login / register / verify /
// resend / forgot / reset) to blunt credential-stuffing and enumeration. Must
// be registered BEFORE the router so it runs ahead of the auth handlers.
app.use("/api/auth", authRateLimit);
app.use("/api", router);
app.use("/api", errorHandler);

// ---- serve the built SPA from this same process ---------------------------
// The build step copies Vite's dist/ into server/dist/public.
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const clientDistDir = process.env.CLIENT_DIST_DIR
  ? path.resolve(process.env.CLIENT_DIST_DIR)
  : path.join(serverDir, "public");

app.use(express.static(clientDistDir, { index: false }));

// Public sitemap.xml + robots.txt (must be before the SPA fallback so they are
// not swallowed by index.html). Mounted at app root, not under /api.
app.use(sitemap);

// SPA history fallback: any non-API GET returns index.html.
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(clientDistDir, "index.html"), (err) => {
    if (err) next();
  });
});

export default app;
