/**
 * Module 6 - Audit Viewer routes. Mount base: /api/audit-log.
 * SUPER-ADMIN ONLY (requireAdmin). READ-ONLY: the audit history is immutable,
 * so this router exposes search/filter/export but NO create/edit/delete.
 *
 * Reads the existing `audit_logs` table directly (so it can add a date range
 * filter the shared readAudit() helper does not support). Pagination via
 * limit/offset plus a total count for the viewer.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAdmin } from "../auth.js";
import { q, q1 } from "../pool.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

type AuditRow = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string | null;
  object_type: string | null;
  object_id: string | null;
  summary: string | null;
  previous_value: unknown;
  new_value: unknown;
  ip_address: string | null;
  created_at: string;
};

const COLS = `id, actor_id, actor_email, action, object_type, object_id, summary,
  previous_value, new_value, ip_address, created_at`;

/** Build a shared WHERE clause + params from the query filters. */
function buildFilter(req: Request): { where: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (clause: (i: number) => string, value: unknown) => {
    params.push(value);
    where.push(clause(params.length));
  };

  const actorId = (req.query.actorId as string) || (req.query.actor_id as string);
  const actorEmail = (req.query.actorEmail as string) || (req.query.actor_email as string);
  const action = req.query.action as string;
  const objectType = (req.query.objectType as string) || (req.query.object_type as string);
  const objectId = (req.query.objectId as string) || (req.query.object_id as string);
  const from = (req.query.from as string) || (req.query.dateFrom as string);
  const to = (req.query.to as string) || (req.query.dateTo as string);
  const search = req.query.q as string;

  if (actorId) add((i) => `actor_id = $${i}`, actorId);
  if (actorEmail) add((i) => `actor_email ilike $${i}`, `%${actorEmail}%`);
  if (action) add((i) => `action = $${i}`, action);
  if (objectType) add((i) => `object_type = $${i}`, objectType);
  if (objectId) add((i) => `object_id = $${i}`, objectId);
  if (from) add((i) => `created_at >= $${i}`, from);
  if (to) add((i) => `created_at <= $${i}`, to);
  if (search) add((i) => `(action ilike $${i} or summary ilike $${i} or actor_email ilike $${i})`, `%${search}%`);

  return { where: where.length ? `where ${where.join(" and ")}` : "", params };
}

const router = Router();
router.use(requireAdmin);

/** Distinct action verbs + object types for the viewer's filter dropdowns. */
router.get(
  "/meta",
  h(async (_req, res) => {
    const actions = await q<{ action: string }>(
      `select distinct action from audit_logs where action is not null order by action asc limit 300`,
    );
    const objectTypes = await q<{ object_type: string }>(
      `select distinct object_type from audit_logs where object_type is not null order by object_type asc limit 300`,
    );
    res.json({
      actions: actions.map((r) => r.action),
      object_types: objectTypes.map((r) => r.object_type),
    });
  }),
);

/** Search / filter audit entries, paginated, newest first. */
router.get(
  "/",
  h(async (req, res) => {
    const { where, params } = buildFilter(req);
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const totalRow = await q1<{ count: string }>(
      `select count(*)::text as count from audit_logs ${where}`,
      params,
    );
    const rows = await q<AuditRow>(
      `select ${COLS} from audit_logs ${where}
        order by created_at desc
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, limit, offset],
    );
    res.json({
      entries: rows,
      total: Number(totalRow?.count ?? 0),
      limit,
      offset,
    });
  }),
);

/**
 * Export the (filtered) audit log. Returns CSV when ?format=csv, otherwise a
 * JSON array. Capped to a generous bound so an export cannot exhaust memory.
 */
router.get(
  "/export",
  h(async (req, res) => {
    const { where, params } = buildFilter(req);
    const cap = Math.min(Math.max(Number(req.query.limit) || 5000, 1), 20000);
    const rows = await q<AuditRow>(
      `select ${COLS} from audit_logs ${where}
        order by created_at desc
        limit $${params.length + 1}`,
      [...params, cap],
    );

    if ((req.query.format as string) === "csv") {
      const header = [
        "id", "created_at", "actor_email", "actor_id", "action",
        "object_type", "object_id", "summary", "ip_address",
      ];
      const esc = (v: unknown): string => {
        const s = v == null ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [header.join(",")];
      for (const r of rows) {
        lines.push([
          r.id, r.created_at, r.actor_email, r.actor_id, r.action,
          r.object_type, r.object_id, r.summary, r.ip_address,
        ].map(esc).join(","));
      }
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="audit-log.csv"`);
      return res.send(lines.join("\n"));
    }

    res.json({ entries: rows, count: rows.length });
  }),
);

export default router;
