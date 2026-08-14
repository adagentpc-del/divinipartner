/**
 * Divini Proposal Studio. Mounted at /api/proposal-studio.
 *
 *   GET  /proposals                    list (optional ?opportunity_id=, ?status=)
 *   POST /proposals                    create { title, opportunity_id?, scope_instance_id?,
 *                                        client_name?, client_email?, valid_until?, notes?,
 *                                        discount_cents?, tax_cents?, line_items? }
 *   GET  /proposals/:id                detail: proposal + line items + computed totals
 *   PATCH /proposals/:id               save header fields and/or replace line items
 *                                        { ...patch, line_items? } -- appends a version
 *   GET  /proposals/:id/versions       append-only version history
 *   POST /proposals/:id/send           mint/reuse a public share link, mark sent
 *   POST /proposals/:id/draft-notes    opt-in AI cover-note draft (prose only,
 *                                        never a number; always returns a real
 *                                        deterministic fallback; not auto-saved)
 *
 * See docs/DIVINI_DETERMINISTIC_TOOLS_SPEC.md. Org-scoped throughout via
 * db/proposalStudio.ts; the core tool has no LLM dependency -- draft-notes is
 * the one narrow, explicitly opt-in exception. The public accept/decline
 * surface lives in routes/public-proposals.ts.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as proposals from "../db/proposalStudio.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch((err: unknown) => {
      if (err instanceof Error && "status" in err && typeof (err as { status: unknown }).status === "number") {
        res.status((err as Error & { status: number }).status).json({ error: err.message });
        return;
      }
      next(err);
    });

async function actor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

const router = Router();
router.use(requireUser);

router.get(
  "/proposals",
  h(async (req, res) => {
    const a = await actor(req);
    const opportunityId = typeof req.query.opportunity_id === "string" ? req.query.opportunity_id : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json({ proposals: await proposals.listProposals(a, { opportunityId, status }) });
  }),
);

router.post(
  "/proposals",
  h(async (req, res) => {
    const a = await actor(req);
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    if (!title) return res.status(400).json({ error: "title is required" });
    const detail = await proposals.createProposal(a, { ...req.body, title });
    res.status(201).json(detail);
  }),
);

router.get(
  "/proposals/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json(await proposals.getProposal(a, req.params.id));
  }),
);

router.patch(
  "/proposals/:id",
  h(async (req, res) => {
    const a = await actor(req);
    const { line_items, ...patch } = req.body ?? {};
    res.json(await proposals.saveProposal(a, req.params.id, patch, Array.isArray(line_items) ? line_items : undefined));
  }),
);

router.get(
  "/proposals/:id/versions",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ versions: await proposals.listVersions(a, req.params.id) });
  }),
);

router.post(
  "/proposals/:id/send",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ proposal: await proposals.sendProposal(a, req.params.id) });
  }),
);

router.post(
  "/proposals/:id/draft-notes",
  h(async (req, res) => {
    const a = await actor(req);
    res.json(await proposals.draftProposalNotes(a, req.params.id));
  }),
);

export default router;
