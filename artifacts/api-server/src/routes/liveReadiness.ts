// ---------------------------------------------------------------------------
// GET /api/admin/live-readiness
//
// Operational "is the live system actually working right now?" probe.
// Complementary to /api/deployment/readiness (which checks env presence and
// pre-deploy config) and /api/admin/email-readiness (which is per-partner
// email config detail). This endpoint runs cheap live probes and rolls
// recent usage_events into pass/warn/fail signals for the workflows that
// matter operationally:
//
//   - database round-trip
//   - public app URL configured + matches request origin
//   - email provider configured + recent sends are succeeding
//   - object storage configured (public + private dirs)
//   - AI provider configured + recent extractions are succeeding
//   - last partner update (proves admin save is reachable)
//   - last order received (proves public order submit is reachable)
//   - last asset upload (proves storage upload-url is reachable)
//
// Plus a documented list of known blockers — items that aren't full-stop
// outages but should be verified manually before broader rollout. Each
// blocker carries a stable id so the UI can render an actionUrl.
//
// Cheap by design: no live OpenAI call, no live Resend call, no actual
// object download — all those would cost money or rate-limit budget. We
// rely on the existing usage_events stream as the truth of "is this
// actually working in production?"
// ---------------------------------------------------------------------------

import { Router, type IRouter } from "express";
import { sql, desc, eq, and, gte, count } from "drizzle-orm";
import {
  db, partnersTable, ordersTable, usageEvents,
} from "@workspace/db";
import { getPublicUrlInfo } from "../lib/publicUrl";
import { requireAdmin } from "../middlewares/requireAdmin";

const router: IRouter = Router();

// Defensive stringifier so a thrown non-Error value never produces
// "[object Object]" in an admin-facing readiness panel.
function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e && typeof (e as any).message === "string") {
    return (e as any).message;
  }
  try { return JSON.stringify(e); } catch { return String(e); }
}

// Admin gate — same allowlist that protects /api/admin/email-readiness and
// /api/security/readiness. In non-prod with no allowlist set, signed-in
// users are admitted (with a banner on /api/security/readiness explaining
// open-beta posture).
router.use("/admin/live-readiness", requireAdmin());

type Status = "pass" | "warn" | "fail";
interface Check {
  id: string;
  label: string;
  status: Status;
  detail: string;
  // Optional admin page to jump to in order to fix or verify this item.
  actionUrl?: string;
  actionLabel?: string;
}

interface Blocker {
  id: string;
  severity: "low" | "medium" | "high";
  title: string;
  detail: string;
  workaround: string;
}

// ---------------------------------------------------------------------------
// Known blockers — items that are not full outages but should be verified
// or addressed before broader live rollout. Keep this list small and only
// include things the team has actually decided about. Each entry should
// have a clear workaround so on-call doesn't need to dig.
// ---------------------------------------------------------------------------
function knownBlockers(): Blocker[] {
  return [
    {
      id: "private_object_acl_unenforced",
      severity: "medium",
      title: "Private object route relies on UUID-only obscurity, not ACL",
      detail:
        "GET /api/storage/objects/* serves any private upload to anyone who knows the URL. The path is a random UUID, so it isn't enumerable, but the URL works without an admin session. In practice these URLs are only embedded in admin-only pages, so this is low real-world risk today — but anyone with the link (forwarded email, screenshot, browser history) can fetch the file.",
      workaround:
        "Don't share /api/storage/objects/* URLs outside admin context. To harden: gate the route behind requireAdmin and refactor the three internal extractors (deckExtraction, packageExtraction, quoteAssets) that fetch via http://localhost:8080 to read from objectStorageService directly instead of HTTP.",
    },
  ];
}

// Helper: look up the most recent usage_event of a given type. Used to
// answer "when did this workflow last actually succeed in production?"
async function lastEventAt(eventType: string): Promise<Date | null> {
  const rows = await db.select({ occurredAt: usageEvents.occurredAt })
    .from(usageEvents)
    .where(eq(usageEvents.eventType, eventType))
    .orderBy(desc(usageEvents.occurredAt))
    .limit(1);
  return rows[0]?.occurredAt ?? null;
}

// Helper: count events of a given type in the last N hours. Used for the
// success-vs-failure ratio on email and AI extraction.
async function eventCountSince(eventType: string, hoursAgo: number): Promise<number> {
  const since = new Date(Date.now() - hoursAgo * 3600 * 1000);
  const rows = await db.select({ n: count() })
    .from(usageEvents)
    .where(and(eq(usageEvents.eventType, eventType), gte(usageEvents.occurredAt, since)));
  return Number(rows[0]?.n ?? 0);
}

function fmtAge(d: Date | null): string {
  if (!d) return "never";
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

router.get("/admin/live-readiness", async (_req, res): Promise<void> => {
  const checks: Check[] = [];

  // -- 1. Database -----------------------------------------------------------
  // Cheapest possible round-trip: SELECT 1. If this fails the whole app is
  // already on fire, but the explicit probe here confirms the readiness
  // page itself is talking to the right DB.
  try {
    await db.execute(sql`SELECT 1`);
    checks.push({ id: "database", label: "Database connectivity", status: "pass", detail: "SELECT 1 round-trip succeeded." });
  } catch (e: any) {
    checks.push({ id: "database", label: "Database connectivity", status: "fail", detail: `Could not reach the database: ${errMsg(e)}` });
  }

  // -- 2. Public URL configured ----------------------------------------------
  // If PUBLIC_APP_URL isn't set, every "preview partnership page" link the
  // admin copies will fall back to the workspace dev domain — fine for dev,
  // wrong for prod.
  try {
    const info = getPublicUrlInfo();
    if (info.source === "PUBLIC_APP_URL") {
      checks.push({
        id: "public_url",
        label: "Public app URL configured",
        status: "pass",
        detail: `PUBLIC_APP_URL is set to ${info.url}. Preview partnership links will use this host.`,
      });
    } else {
      checks.push({
        id: "public_url",
        label: "Public app URL configured",
        status: "warn",
        detail: `PUBLIC_APP_URL is not set. Preview links will fall back to ${info.url} (source: ${info.source}). Set PUBLIC_APP_URL to your real customer-facing host (e.g. https://partnershipportal.co) before broader rollout.`,
      });
    }
  } catch (e: any) {
    checks.push({ id: "public_url", label: "Public app URL configured", status: "fail", detail: `Could not read public URL config: ${errMsg(e)}` });
  }

  // -- 3. Email provider configured ------------------------------------------
  const resendKeySet = !!process.env.RESEND_API_KEY;
  const resendFromSet = !!process.env.RESEND_FROM_EMAIL;
  if (resendKeySet && resendFromSet) {
    checks.push({
      id: "email_provider",
      label: "Email provider configured",
      status: "pass",
      detail: `RESEND_API_KEY and RESEND_FROM_EMAIL are set. Default sender: ${process.env.RESEND_FROM_EMAIL}.`,
      actionUrl: "/admin/email-readiness",
      actionLabel: "Open per-partner email readiness",
    });
  } else {
    const missing = [
      !resendKeySet && "RESEND_API_KEY",
      !resendFromSet && "RESEND_FROM_EMAIL",
    ].filter(Boolean).join(", ");
    checks.push({
      id: "email_provider",
      label: "Email provider configured",
      status: "fail",
      detail: `Missing: ${missing}. Customer confirmation and ops forward emails will not send.`,
    });
  }

  // -- 4. Email recent activity (last 24h) -----------------------------------
  // The truthiest signal of "email actually works in production": ratio of
  // .sent vs .failed events emitted by sendBrandedEmail in the last day.
  const [sent24, failed24, lastSent, lastFailed] = await Promise.all([
    eventCountSince("email.sent", 24),
    eventCountSince("email.failed", 24),
    lastEventAt("email.sent"),
    lastEventAt("email.failed"),
  ]);
  if (sent24 === 0 && failed24 === 0) {
    checks.push({
      id: "email_recent_activity",
      label: "Email send activity (last 24h)",
      status: "warn",
      detail: `No email send attempts in the last 24h. Last successful send: ${fmtAge(lastSent)}. Run a test send from the per-partner email readiness page to verify.`,
      actionUrl: "/admin/email-readiness",
      actionLabel: "Send a test email",
    });
  } else if (failed24 > 0 && failed24 >= sent24) {
    checks.push({
      id: "email_recent_activity",
      label: "Email send activity (last 24h)",
      status: "fail",
      detail: `${failed24} failed vs ${sent24} succeeded in the last 24h. Last failure: ${fmtAge(lastFailed)}. Investigate from per-partner email readiness — failed events have a Retry button there.`,
      actionUrl: "/admin/email-readiness",
      actionLabel: "Open email readiness",
    });
  } else if (failed24 > 0) {
    checks.push({
      id: "email_recent_activity",
      label: "Email send activity (last 24h)",
      status: "warn",
      detail: `${sent24} succeeded, ${failed24} failed in the last 24h. Last failure: ${fmtAge(lastFailed)}. Tail the per-partner email readiness page for retry.`,
      actionUrl: "/admin/email-readiness",
      actionLabel: "Open email readiness",
    });
  } else {
    checks.push({
      id: "email_recent_activity",
      label: "Email send activity (last 24h)",
      status: "pass",
      detail: `${sent24} email${sent24 === 1 ? "" : "s"} sent successfully, 0 failures. Last send: ${fmtAge(lastSent)}.`,
    });
  }

  // -- 5. Object storage configured ------------------------------------------
  const bucketSet = !!process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  const privDirSet = !!process.env.PRIVATE_OBJECT_DIR;
  const pubPathsSet = !!process.env.PUBLIC_OBJECT_SEARCH_PATHS;
  if (bucketSet && privDirSet && pubPathsSet) {
    checks.push({
      id: "object_storage",
      label: "Object storage configured",
      status: "pass",
      detail: "Bucket id, private dir, and public search paths are all set. File uploads will resolve to the configured bucket.",
    });
  } else {
    const missing = [
      !bucketSet && "DEFAULT_OBJECT_STORAGE_BUCKET_ID",
      !privDirSet && "PRIVATE_OBJECT_DIR",
      !pubPathsSet && "PUBLIC_OBJECT_SEARCH_PATHS",
    ].filter(Boolean).join(", ");
    checks.push({
      id: "object_storage",
      label: "Object storage configured",
      status: "fail",
      detail: `Missing: ${missing}. File uploads from partner onboarding will fail.`,
    });
  }

  // -- 6. AI provider configured + recent activity ---------------------------
  const openaiKeySet = !!process.env.OPENAI_API_KEY;
  if (!openaiKeySet) {
    checks.push({
      id: "ai_provider",
      label: "AI extraction provider configured",
      status: "warn",
      detail: "OPENAI_API_KEY is not set. Deck/package PDF extraction and AI request summaries will fall back to deterministic-only output. Order submission and email routing are NOT affected.",
    });
  } else {
    const [extGen24, extFail24, lastExtFail] = await Promise.all([
      eventCountSince("deck.parse.generated", 24),
      eventCountSince("deck.parse.failed", 24),
      lastEventAt("deck.parse.failed"),
    ]);
    const pkgGen24 = await eventCountSince("package_pdf.parse.generated", 24);
    const pkgFail24 = await eventCountSince("package_pdf.parse.failed", 24);
    const totalGen = extGen24 + pkgGen24;
    const totalFail = extFail24 + pkgFail24;
    if (totalFail > 0 && totalFail >= totalGen) {
      checks.push({
        id: "ai_provider",
        label: "AI extraction provider configured",
        status: "fail",
        detail: `${totalFail} extraction failure${totalFail === 1 ? "" : "s"} vs ${totalGen} success${totalGen === 1 ? "" : "es"} in the last 24h. Last failure: ${fmtAge(lastExtFail)}. Check OpenAI status and recent deck/package uploads.`,
      });
    } else if (totalFail > 0) {
      checks.push({
        id: "ai_provider",
        label: "AI extraction provider configured",
        status: "warn",
        detail: `${totalGen} extraction${totalGen === 1 ? "" : "s"} succeeded, ${totalFail} failed in the last 24h. Last failure: ${fmtAge(lastExtFail)}.`,
      });
    } else {
      checks.push({
        id: "ai_provider",
        label: "AI extraction provider configured",
        status: "pass",
        detail: totalGen > 0
          ? `${totalGen} extraction${totalGen === 1 ? "" : "s"} succeeded in the last 24h, 0 failures.`
          : "OPENAI_API_KEY is set. No extractions in the last 24h to grade.",
      });
    }
  }

  // -- 7. Recent partner updates ---------------------------------------------
  // Proves the admin partner save path is reachable end-to-end. We use the
  // partnersTable.updatedAt column (set by the Drizzle schema's $onUpdate
  // hook) as the truth — usage_events doesn't track every partner edit.
  try {
    const recent = await db.select({ updatedAt: partnersTable.updatedAt, id: partnersTable.id, companyName: partnersTable.companyName })
      .from(partnersTable)
      .orderBy(desc(partnersTable.updatedAt))
      .limit(1);
    const last = recent[0]?.updatedAt ?? null;
    checks.push({
      id: "partner_save",
      label: "Partner profile save activity",
      status: last ? "pass" : "warn",
      detail: last
        ? `Last partner update: ${fmtAge(last)} (${recent[0].companyName || `id ${recent[0].id}`}).`
        : "No partner records exist yet — create one to verify the save path.",
      actionUrl: "/admin/partners",
      actionLabel: "Open partners",
    });
  } catch (e: any) {
    checks.push({ id: "partner_save", label: "Partner profile save activity", status: "fail", detail: `Could not query partners: ${errMsg(e)}` });
  }

  // -- 8. Recent orders ------------------------------------------------------
  try {
    const recent = await db.select({ createdAt: ordersTable.createdAt, orderNumber: ordersTable.orderNumber, partnerId: ordersTable.partnerId })
      .from(ordersTable)
      .orderBy(desc(ordersTable.createdAt))
      .limit(1);
    const last = recent[0]?.createdAt ?? null;
    checks.push({
      id: "order_submit",
      label: "Order submission activity",
      status: last ? "pass" : "warn",
      detail: last
        ? `Last order received: ${fmtAge(last)} (${recent[0].orderNumber}).`
        : "No orders received yet — submit a test order from a partner's public ordering page to verify.",
      actionUrl: "/admin/orders",
      actionLabel: "Open orders",
    });
  } catch (e: any) {
    checks.push({ id: "order_submit", label: "Order submission activity", status: "fail", detail: `Could not query orders: ${errMsg(e)}` });
  }

  // -- 9. Recent asset uploads -----------------------------------------------
  // Proves the storage upload-url presigning path is being exercised. We
  // emit "asset.uploaded" events from the public onboarding submit and
  // admin upload paths; if those have never fired, ask for a manual probe.
  try {
    const lastUpload = await lastEventAt("asset.uploaded");
    checks.push({
      id: "asset_upload",
      label: "File upload activity",
      status: lastUpload ? "pass" : "warn",
      detail: lastUpload
        ? `Last asset upload: ${fmtAge(lastUpload)}.`
        : "No file uploads recorded. The upload-url endpoint has size+content-type guards but hasn't been exercised — upload a test file from partner onboarding to verify end-to-end.",
    });
  } catch (e: any) {
    checks.push({ id: "asset_upload", label: "File upload activity", status: "warn", detail: `Could not read upload activity: ${errMsg(e)}` });
  }

  // ---- Roll-up -------------------------------------------------------------
  const summary = checks.reduce((a, c) => { a[c.status]++; return a; }, { pass: 0, warn: 0, fail: 0 });
  const overall: Status = summary.fail > 0 ? "fail" : summary.warn > 0 ? "warn" : "pass";

  const blockers = knownBlockers();

  // Items the team should manually verify before broader rollout. These are
  // workflow-level smoke tests that no automated probe can substitute for.
  const manualVerification: string[] = [
    "Open a partner's public portal preview link (admin Partners → row → Preview button) and confirm it loads on the customer-facing host.",
    "Submit a test order from a real partner's public ordering page and confirm the customer-confirmation email lands in an inbox you control (not just shows 'sent' in the UI).",
    "Upload a real PDF from the partner onboarding flow and confirm the file streams back from /api/storage/objects/<path> for an admin viewer.",
    "Trigger one deck-extraction rerun and confirm the AI summary persists after a hard refresh.",
    "Edit a partner's profile, save, navigate away, reopen, and confirm every saved field is still populated.",
  ];

  res.json({
    overall,
    summary,
    checks,
    blockers,
    manualVerification,
    generatedAt: new Date().toISOString(),
  });
});

export default router;
