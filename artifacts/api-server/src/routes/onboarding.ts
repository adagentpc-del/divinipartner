// @ts-nocheck
import { Router, type IRouter } from "express";
import { db, onboardingProgressTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { readinessForPartner, platformReadiness, setLaunchStatus } from "../services/launchReadiness";
import {
  GetOnboardingProgressResponse,
  UpsertOnboardingProgressResponse,
  DismissOnboardingResponse,
  GetLaunchPlatformResponse,
  GetLaunchPartnerResponse,
  ActivateLaunchResponse,
} from "@workspace/api-zod";
import { sendValidated } from "../lib/validateResponse";

const router: IRouter = Router();
const launchRouter: IRouter = Router();

// ---- Onboarding progress (per user / flow / step) — PUBLIC ----
router.get("/onboarding/progress", async (req, res) => {
  const userId = String(req.query.userId || "");
  const flow = req.query.flow ? String(req.query.flow) : null;
  if (!userId) return res.status(400).json({ error: "userId required" });
  const where = flow ? and(eq(onboardingProgressTable.userId, userId), eq(onboardingProgressTable.flow, flow)) : eq(onboardingProgressTable.userId, userId);
  const rows = await db.select().from(onboardingProgressTable).where(where);
  sendValidated(req, res, GetOnboardingProgressResponse, rows, "Get onboarding progress");
});
router.post("/onboarding/progress", async (req, res) => {
  const { userId, role, flow, stepKey, status, partnerId, dataJson } = req.body || {};
  if (!userId || !role || !flow || !stepKey) return res.status(400).json({ error: "userId, role, flow, stepKey required" });
  const update: any = { status: status || "completed", dataJson, updatedAt: new Date() };
  if (status === "completed") update.completedAt = new Date();
  if (status === "dismissed") update.dismissedAt = new Date();
  const [row] = await db.insert(onboardingProgressTable).values({ userId, role, flow, stepKey, status: update.status, partnerId, dataJson, completedAt: update.completedAt, dismissedAt: update.dismissedAt })
    .onConflictDoUpdate({ target: [onboardingProgressTable.userId, onboardingProgressTable.flow, onboardingProgressTable.stepKey], set: update })
    .returning();
  sendValidated(req, res, UpsertOnboardingProgressResponse, row, "Upsert onboarding progress");
});
router.post("/onboarding/dismiss", async (req, res) => {
  const { userId, flow } = req.body || {};
  if (!userId || !flow) return res.status(400).json({ error: "userId, flow required" });
  await db.update(onboardingProgressTable).set({ dismissedAt: new Date(), status: "dismissed" })
    .where(and(eq(onboardingProgressTable.userId, userId), eq(onboardingProgressTable.flow, flow)));
  sendValidated(req, res, DismissOnboardingResponse, { ok: true }, "Dismiss onboarding");
});

// ---- Launch readiness — ADMIN ONLY (mounted behind auth boundary) ----
launchRouter.get("/launch/platform", async (req, res) => {
  const payload = await platformReadiness();
  sendValidated(req, res, GetLaunchPlatformResponse, payload, "Get launch platform readiness");
});
launchRouter.get("/launch/partner/:id", async (req, res) => {
  try {
    const payload = await readinessForPartner(parseInt(req.params.id));
    sendValidated(req, res, GetLaunchPartnerResponse, payload, "Get launch partner readiness");
  } catch (e: any) { res.status(404).json({ error: e?.message || "Not found" }); }
});
launchRouter.post("/launch/partner/:id/activate", async (req, res) => {
  const { status, overrideNote } = req.body || {};
  if (!["draft", "preview", "internal_only", "live", "paused"].includes(status)) return res.status(400).json({ error: "Invalid status" });
  const r = await readinessForPartner(parseInt(req.params.id));
  if (status === "live" && r.blockerCount > 0 && !overrideNote) {
    return res.status(409).json({ error: "Partner has unresolved blockers", blockers: r.items.filter(i => i.severity === "blocker" && i.status !== "complete"), requiresOverride: true });
  }
  const payload = await setLaunchStatus(parseInt(req.params.id), status, overrideNote);
  sendValidated(req, res, ActivateLaunchResponse, payload, "Activate launch");
});

export { launchRouter };
export default router;
