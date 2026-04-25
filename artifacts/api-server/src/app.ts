import express, { type Express, type Request } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
import { canonicalHostMiddleware } from "./middlewares/canonicalHostMiddleware";
import { safeErrorHandler } from "./middlewares/errorHandler";
import { getAllowedOrigins, assertRequiredSecrets } from "./lib/securityConfig";
import router from "./routes";
import { logger } from "./lib/logger";

// Boot-time: hard-fail in production if any required secret is missing.
const secretCheck = assertRequiredSecrets();
if (!secretCheck.ok) {
  logger.warn({ missing: secretCheck.missing }, "Required secrets missing — running in degraded mode (non-prod)");
}

const app: Express = express();

// Behind Replit's edge proxy. Trust one hop so req.ip / X-Forwarded-* work
// for rate limiting and canonical-host detection without spoofing risk.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) { return { statusCode: res.statusCode }; },
    },
  }),
);

// Security headers. We don't serve HTML from the API, so a strict CSP isn't
// needed here; the helmet defaults give us HSTS, X-Content-Type-Options, frame
// guards, and referrer policy without breaking anything.
app.use(helmet({
  contentSecurityPolicy: false, // SPA + Clerk handle their own CSP needs
  crossOriginResourcePolicy: { policy: "cross-origin" }, // allow SPA to fetch
}));

app.use(canonicalHostMiddleware());

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// CORS allowlist driven by ALLOWED_ORIGINS + PUBLIC_APP_URL + dev domains.
// We wrap cors() so we can also reflect same-origin requests (Origin host
// matches the request's own Host header). Same-origin browser requests should
// never be blocked regardless of the configured allowlist — the SPA and API
// are served from the same artifact in this app, so any cross-origin block on
// them is by definition a misconfiguration, not a security boundary.
const allowedOrigins = getAllowedOrigins();
app.use((req, res, next) => {
  const reqHost = (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim()
    || req.headers.host
    || "";
  cors({
    credentials: true,
    origin(origin, cb) {
      // Same-origin / curl / server-to-server requests have no Origin header.
      if (!origin) return cb(null, true);
      // Same-origin browser request — Origin's host equals the server's own
      // Host. Always allow.
      try {
        const oHost = new URL(origin).host;
        if (reqHost && oHost === reqHost) return cb(null, true);
      } catch { /* fall through */ }
      if (allowedOrigins.length === 0) return cb(null, true); // permissive bootstrap
      if (allowedOrigins.includes(origin)) return cb(null, true);
      // Reject without throwing — throwing surfaces as a 500 in the error
      // handler, which is misleading. cb(null, false) lets cors send the
      // request through without CORS headers; the browser will then block it
      // on its end with a clear CORS error in devtools.
      return cb(null, false);
    },
  })(req, res, next);
});

// JSON body cap. Files travel via presigned URLs to object storage, never
// through JSON, so legitimate bodies are small (largest is POST orders with
// up to 200 items ≈ 200 KB). 2 MB gives 10× headroom while preventing the
// memory-exhaustion DoS that the prior 50 MB cap allowed.
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

app.use(clerkMiddleware());

app.use("/api", router);

// Final error handler — must be the LAST app.use(). Sanitizes leaks.
app.use(safeErrorHandler());

export default app;
