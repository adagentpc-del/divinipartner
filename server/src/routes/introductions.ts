/**
 * Anti-Circumvention (Module 4) routes. Mount base: /api/introductions.
 *
 * Records platform-formed relationships and gives super admins the tools to
 * police off-platform circumvention: list, flag, investigate, suspend. The
 * 24-month (default) non-circumvention window is stored per row.
 *
 *   POST /                         record an introduction (party_a/party_b orgs,
 *                                  subject, source_partner). Actor's org owns it.
 *   GET  /                         list visible introductions (?status=&party=).
 *                                  Super admins see all; an org sees only rows it
 *                                  is a party to (read-only).
 *   GET  /:id                      one introduction (same visibility rule).
 *   GET  /:id/investigate          SUPER-ADMIN: audit trail + related events.
 *   POST /:id/flag                 SUPER-ADMIN: status -> flagged (audit + notify).
 *   POST /:id/clear                SUPER-ADMIN: status -> cleared (audit).
 *   POST /:id/suspend              SUPER-ADMIN: status -> suspended + flag (audit + notify).
 *
 * IDOR posture: list / get scope to the actor (super admins excepted); the
 * mutating super-admin actions are gated by requireAdmin AND re-checked in the
 * repo. Flag / suspend never hard-delete.
 *
 * audit + notify: flag/suspend call writeAudit (logAction) and
 * notify.circumventionFlagged; clear writes audit only.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser, requireAdmin } from "../auth.js";
import * as db from "../db.js";
import * as intro from "../db/introductions.js";
import { logAction } from "../lib/audit.js";
import { notify } from "../lib/notify.js";
import { getAdminAllowedEmails } from "../config.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<{ a: db.Actor; isAdmin: boolean; email: string | null }> {
  const auth = getAuth(req);
  return { a: await db.getActor(auth.userId!, auth.email), isAdmin: auth.isAdmin, email: auth.email };
}

/** The admin alert recipients for circumvention flags (best-effort). */
function adminRecipients(): string[] {
  try {
    return getAdminAllowedEmails();
  } catch {
    return [];
  }
}

const router = Router();
router.use(requireUser);

/** Record a platform-formed introduction. The actor's org owns the record. */
router.post(
  "/",
  h(async (req, res) => {
    const { a } = await actor(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const row = await intro.recordIntroduction(a, {
      partyAOrgId: String(body.party_a_org_id ?? body.partyAOrgId ?? ""),
      partyBOrgId: String(body.party_b_org_id ?? body.partyBOrgId ?? ""),
      subjectType: (body.subject_type ?? body.subjectType ?? null) as intro.SubjectType | null,
      subjectId: (body.subject_id ?? body.subjectId ?? null) as string | null,
      sourcePartnerId: (body.source_partner_id ?? body.sourcePartnerId ?? null) as string | null,
      windowMonths:
        body.window_months != null || body.windowMonths != null
          ? Number(body.window_months ?? body.windowMonths)
          : null,
      note: (body.note ?? null) as string | null,
    });
    if (!row) {
      res.status(503).json({ error: "introductions are not available yet" });
      return;
    }
    res.status(201).json({ introduction: row });
  }),
);

/** List introductions visible to the actor (super admins see all). */
router.get(
  "/",
  h(async (req, res) => {
    const { a, isAdmin } = await actor(req);
    const status = req.query.status ? (String(req.query.status) as intro.IntroStatus) : undefined;
    const party = req.query.party ? String(req.query.party) : undefined;
    res.json({ introductions: await intro.listForActor(a, isAdmin, { status, party }) });
  }),
);

/** Fetch one introduction (same visibility rule as the list). */
router.get(
  "/:id",
  h(async (req, res) => {
    const { a, isAdmin } = await actor(req);
    res.json({ introduction: await intro.getForActor(a, isAdmin, req.params.id) });
  }),
);

/** SUPER-ADMIN: investigation view (audit trail + related introductions). */
router.get(
  "/:id/investigate",
  requireAdmin,
  h(async (req, res) => {
    const { a, isAdmin } = await actor(req);
    res.json(await intro.investigate(a, isAdmin, req.params.id));
  }),
);

/** SUPER-ADMIN: flag an introduction as circumvention (audit + notify). */
router.post(
  "/:id/flag",
  requireAdmin,
  h(async (req, res) => {
    const { a, isAdmin, email } = await actor(req);
    const note = (req.body?.note ?? null) as string | null;
    const { prev, next } = await intro.flag(a, isAdmin, req.params.id, note);

    await logAction(a, "circumvention.flagged", "introduction", next.id, prev, next, {
      summary: note ?? "Introduction flagged as possible circumvention",
      ip: (req.ip as string | undefined) ?? null,
    });
    await notify
      .circumventionFlagged(adminRecipients(), next.id.slice(0, 8), {
        introduction_id: next.id,
        party_a_org_id: next.party_a_org_id,
        party_b_org_id: next.party_b_org_id,
        flagged_by: email,
        message: note ?? "An introduction was flagged for possible off-platform circumvention.",
      })
      .catch(() => null);

    res.json({ introduction: next });
  }),
);

/** SUPER-ADMIN: clear a flag back to active (audit only). */
router.post(
  "/:id/clear",
  requireAdmin,
  h(async (req, res) => {
    const { a, isAdmin } = await actor(req);
    const note = (req.body?.note ?? null) as string | null;
    const { prev, next } = await intro.clear(a, isAdmin, req.params.id, note);
    await logAction(a, "circumvention.cleared", "introduction", next.id, prev, next, {
      summary: note ?? "Circumvention flag cleared",
      ip: (req.ip as string | undefined) ?? null,
    });
    res.json({ introduction: next });
  }),
);

/** SUPER-ADMIN: suspend the relationship (soft; audit + notify). No hard-delete. */
router.post(
  "/:id/suspend",
  requireAdmin,
  h(async (req, res) => {
    const { a, isAdmin, email } = await actor(req);
    const note = (req.body?.note ?? null) as string | null;
    const { prev, next } = await intro.suspend(a, isAdmin, req.params.id, note);

    await logAction(a, "circumvention.suspended", "introduction", next.id, prev, next, {
      summary: note ?? "Introduction suspended for circumvention",
      ip: (req.ip as string | undefined) ?? null,
    });
    await notify
      .circumventionFlagged(adminRecipients(), next.id.slice(0, 8), {
        introduction_id: next.id,
        action: "suspended",
        suspended_by: email,
        message: note ?? "An introduction was suspended for off-platform circumvention.",
      })
      .catch(() => null);

    res.json({ introduction: next });
  }),
);

export default router;
