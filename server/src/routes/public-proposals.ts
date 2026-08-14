/**
 * Divini Proposal Studio - PUBLIC surface (no auth). Mount base:
 * /api/public/proposals.
 *
 *   GET  /:token           resolve the public proposal payload (marks sent -> viewed)
 *   POST /:token/respond   { decision: 'accept' | 'decline', decline_reason? }
 *
 * A client who received the share link out of band views and responds to a
 * proposal without an account. Only whitelisted fields are returned; an
 * unknown token or an already-resolved proposal both yield 404 so neither
 * leaks which.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import * as proposals from "../db/proposalStudio.js";
import { publicWriteRateLimit } from "../lib/rateLimit.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();

router.get(
  "/:token",
  h(async (req, res) => {
    const view = await proposals.getPublicProposalByToken(req.params.token);
    if (!view) return res.status(404).json({ error: "This proposal link is no longer available." });
    res.json({ proposal: view });
  }),
);

router.post(
  "/:token/respond",
  publicWriteRateLimit,
  h(async (req, res) => {
    const decision = req.body?.decision;
    if (decision !== "accept" && decision !== "decline") {
      return res.status(400).json({ error: "decision must be 'accept' or 'decline'" });
    }
    const declineReason = typeof req.body?.decline_reason === "string" ? req.body.decline_reason : null;
    const result = await proposals.respondToProposal(req.params.token, decision, declineReason);
    if (!result) return res.status(404).json({ error: "This proposal link is no longer available." });
    res.json(result);
  }),
);

export default router;
