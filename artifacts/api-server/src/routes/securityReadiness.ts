import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/requireAdmin";
import {
  getSecretReports,
  getAllowedOrigins,
  isAdminAllowlistEnforced,
  getAdminAllowedEmails,
} from "../lib/securityConfig";

const router: IRouter = Router();

router.get("/security/readiness", requireAdmin(), (_req, res) => {
  const secrets = getSecretReports();
  const missingRequired = secrets.filter((s) => s.requirement === "required" && s.status === "missing").map((s) => s.key);
  const recommended = secrets.filter((s) => s.requirement === "recommended" && s.status === "missing").map((s) => s.key);
  const weak = secrets.filter((s) => s.status === "weak").map((s) => s.key);

  const allowedOrigins = getAllowedOrigins();
  const adminAllowlistOn = isAdminAllowlistEnforced();
  const adminAllowlistCount = getAdminAllowedEmails().length;

  res.json({
    generatedAt: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",

    secrets,

    summary: {
      missingRequired,
      missingRecommended: recommended,
      weakSecrets: weak,
      okCount: secrets.filter((s) => s.status === "ok").length,
      totalTracked: secrets.length,
    },

    network: {
      corsAllowedOrigins: allowedOrigins,
      canonicalRedirectActive:
        process.env.NODE_ENV === "production" || process.env.CANONICAL_REDIRECT === "1",
      helmetEnabled: true,
    },

    auth: {
      adminAllowlistEnforced: adminAllowlistOn,
      adminAllowlistCount,
      // Plain advisory text for the readiness UI.
      posture: adminAllowlistOn
        ? "ENFORCED — only listed emails can hit the admin API."
        : (process.env.NODE_ENV === "production"
            ? "BLOCKED — production refuses all admin requests until ADMIN_ALLOWED_EMAILS is set."
            : "OPEN (dev only) — any signed-in Clerk user is admitted in non-prod. Set ADMIN_ALLOWED_EMAILS before deploying."),
    },

    uploads: {
      maxUploadBytes: 25 * 1024 * 1024,
      allowedContentTypePrefixes: ["image/", "application/pdf", "application/zip", "application/octet-stream"],
      importerMaxBytes: 10 * 1024 * 1024,
      importerAllowedExtensions: [".csv", ".tsv", ".xlsx", ".xls"],
      defaultObjectAcl: "private — served only via /api/storage/objects with ACL check",
      filenameSanitization: "stripped to [a-zA-Z0-9._-], length-capped to 120 chars on the importer route",
    },

    rateLimits: {
      login: "30 / 5 min / ip (proxied to Clerk)",
      orderSubmit: "20 / 10 min / ip",
      upload: "60 / 1 min / ip",
      publicWrite: "30 / 1 min / ip",
    },

    errors: {
      productionSanitization: process.env.NODE_ENV === "production",
      detail: "Stack traces and Error.message are stripped in production responses; full details remain in structured logs (cookies + Authorization redacted).",
    },
  });
});

export default router;
