/**
 * Divini AI COO V2 - Divini Command Center routes.
 * Mount base: /command-center (the lead wires the mount in routes.ts).
 *
 *   GET  /questions        the fixed catalog of supported executive questions
 *   POST /ask {questionKey} a structured answer to one canned question
 *
 * Deterministic by default: /ask routes the question through db/command-center.ask,
 * which gathers org / role scoped inputs from the existing engines and runs the
 * pure router (lib/commandCenter). requireUser + getActor + h() wrapper, matching
 * routes/events.ts conventions.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { ask } from "../db/command-center.js";
import { SUPPORTED_QUESTIONS, isQuestionKey } from "../lib/commandCenter.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

const router = Router();
router.use(requireUser);

/** The fixed catalog of executive questions the UI renders as a clickable list. */
router.get(
  "/questions",
  h(async (_req, res) => {
    res.json({ questions: SUPPORTED_QUESTIONS });
  }),
);

/** Answer one canned executive question for the signed-in actor. */
router.post(
  "/ask",
  h(async (req, res) => {
    const a = await actor(req);
    const questionKey = (req.body ?? {}).questionKey;
    if (!isQuestionKey(questionKey)) {
      return res.status(400).json({ error: "valid questionKey required" });
    }
    const result = await ask(a, questionKey);
    res.json({ answer: result });
  }),
);

export default router;
