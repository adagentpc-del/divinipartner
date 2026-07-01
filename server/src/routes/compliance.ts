/**
 * Phase 8 - Compliance routes. Mount base: /api/compliance.
 * requireUser; document approval is admin-gated in the db layer.
 *
 * Covers documents / COI / W-9 (blueprint 30), e-sign (MVP), and availability
 * (blueprint 29).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as compliance from "../db/compliance.js";
import { logAction } from "../lib/audit.js";
import { validateUrlUpload } from "../lib/uploadGuard.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<{ a: db.Actor; isAdmin: boolean }> {
  const auth = getAuth(req);
  return { a: await db.getActor(auth.userId!, auth.email), isAdmin: auth.isAdmin };
}

const router = Router();
router.use(requireUser);

// ---- meta + checklist ------------------------------------------------------
router.get(
  "/meta",
  h(async (_req, res) => {
    res.json({ required_docs: compliance.REQUIRED_DOCS, avail_statuses: compliance.AVAIL_STATUSES });
  }),
);

router.get(
  "/checklist",
  h(async (req, res) => {
    const { a } = await actor(req);
    res.json(await compliance.complianceChecklist(a));
  }),
);

router.get(
  "/expiring",
  h(async (req, res) => {
    const { a, isAdmin } = await actor(req);
    const days = req.query.days ? Number(req.query.days) : 30;
    res.json({ documents: await compliance.expiringDocuments(a, isAdmin, days) });
  }),
);

// ---- documents (COI / W-9) -------------------------------------------------
router.get(
  "/documents",
  h(async (req, res) => {
    const { a, isAdmin } = await actor(req);
    res.json({
      documents: await compliance.listDocuments(a, isAdmin, {
        document_type: (req.query.document_type as string) || undefined,
      }),
    });
  }),
);

router.post(
  "/documents",
  h(async (req, res) => {
    const { a } = await actor(req);
    const body = req.body ?? {};
    if (typeof body.file_url === "string" && body.file_url.trim()) {
      const check = validateUrlUpload(body.file_url.trim(), { allow: "documents" });
      if (!check.ok) return res.status(400).json({ error: check.reason });
    }
    const doc = await compliance.createDocument(a, body);
    await logAction(a, "document.created", "document", doc.id, null, doc);
    res.status(201).json({ document: doc });
  }),
);

router.post(
  "/documents/:id/approval",
  h(async (req, res) => {
    const { a, isAdmin } = await actor(req);
    const { approval } = req.body ?? {};
    if (!["approved", "rejected", "pending"].includes(approval)) {
      return res.status(400).json({ error: "approval must be approved|rejected|pending" });
    }
    const doc = await compliance.setDocApproval(a, isAdmin, req.params.id, approval);
    await logAction(a, "document.approval_changed", "document", req.params.id, null, doc, {
      summary: `document -> ${approval}`,
    });
    res.json({ document: doc });
  }),
);

// ---- e-sign (MVP) ----------------------------------------------------------
router.get(
  "/esign",
  h(async (req, res) => {
    const { a, isAdmin } = await actor(req);
    res.json({ requests: await compliance.listEsign(a, isAdmin) });
  }),
);

router.post(
  "/esign",
  h(async (req, res) => {
    const { a } = await actor(req);
    const r = await compliance.createEsign(a, req.body ?? {});
    await logAction(a, "esign.requested", "esign_request", r.id, null, r);
    res.status(201).json({ request: r });
  }),
);

router.post(
  "/esign/:id/sign",
  h(async (req, res) => {
    const { a } = await actor(req);
    const { signed_file_url } = req.body ?? {};
    if (typeof signed_file_url === "string" && signed_file_url.trim()) {
      const check = validateUrlUpload(signed_file_url.trim(), { allow: "documents" });
      if (!check.ok) return res.status(400).json({ error: check.reason });
    }
    const r = await compliance.markSigned(a, req.params.id, signed_file_url);
    await logAction(a, "esign.signed", "esign_request", req.params.id, null, r);
    res.json({ request: r });
  }),
);

// ---- availability (blueprint 29) -------------------------------------------
router.get(
  "/availability",
  h(async (req, res) => {
    const { a, isAdmin } = await actor(req);
    res.json({
      availability: await compliance.listAvailability(a, isAdmin, {
        from: (req.query.from as string) || undefined,
        to: (req.query.to as string) || undefined,
        resource_type: (req.query.resource_type as string) || undefined,
      }),
    });
  }),
);

router.post(
  "/availability",
  h(async (req, res) => {
    const { a } = await actor(req);
    const { start_at, end_at } = req.body ?? {};
    if (!start_at || !end_at) return res.status(400).json({ error: "start_at and end_at required" });
    res.status(201).json({ availability: await compliance.createAvailability(a, req.body) });
  }),
);

router.delete(
  "/availability/:id",
  h(async (req, res) => {
    const { a, isAdmin } = await actor(req);
    await compliance.deleteAvailability(a, isAdmin, req.params.id);
    res.status(204).end();
  }),
);

export default router;
