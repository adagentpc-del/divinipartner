import type { Request, Response, NextFunction, RequestHandler } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db, salesRepsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getAdminAllowedEmails } from "../lib/securityConfig.js";

export type SalesUserRole = "super_admin" | "sales_rep";

/**
 * The resolved sales identity for the current request.
 *
 * `repId` is null for a "bootstrap" super admin — an email that is on the
 * ADMIN_ALLOWED_EMAILS allowlist but does not (yet) have a sales_reps row.
 * This lets the existing portal admin (e.g. Alyssa) reach the sales module
 * before the Sales Team has been seeded.
 */
export interface SalesUser {
  repId: number | null;
  email: string;
  role: SalesUserRole;
  firstName: string | null;
  lastName: string | null;
}

/**
 * Resolve the signed-in Clerk user to a sales identity, or null if they are
 * neither a known active sales rep nor an allowlisted admin.
 *
 * Side effect: if a sales_reps row matches the email but has no clerkUserId
 * recorded yet, we backfill it so future lookups can be id-based.
 */
export async function resolveSalesUser(req: Request): Promise<SalesUser | null> {
  const auth = getAuth(req);
  if (!auth?.userId) return null;

  let emails: string[] = [];
  let userId = auth.userId;
  try {
    const user = await clerkClient.users.getUser(userId);
    emails = (user.emailAddresses || []).map((e) => (e.emailAddress || "").toLowerCase()).filter(Boolean);
  } catch (err) {
    req.log?.error({ err }, "resolveSalesUser: Clerk lookup failed");
    return null;
  }
  if (emails.length === 0) return null;

  // Active sales rep match (case-insensitive on email).
  for (const email of emails) {
    const [rep] = await db
      .select()
      .from(salesRepsTable)
      .where(sql`lower(${salesRepsTable.email}) = ${email}`)
      .limit(1);
    if (rep && rep.status === "active") {
      if (!rep.clerkUserId) {
        await db.update(salesRepsTable).set({ clerkUserId: userId }).where(eq(salesRepsTable.id, rep.id));
      }
      const role: SalesUserRole = rep.role === "super_admin" ? "super_admin" : "sales_rep";
      return { repId: rep.id, email: rep.email, role, firstName: rep.firstName, lastName: rep.lastName };
    }
  }

  // Bootstrap: portal admins are treated as super admins for the sales module.
  const allowlist = getAdminAllowedEmails();
  const adminEmail = emails.find((e) => allowlist.includes(e));
  if (adminEmail) {
    return { repId: null, email: adminEmail, role: "super_admin", firstName: null, lastName: null };
  }

  return null;
}

/** Gate a route behind any active sales user (rep or super admin). */
export function requireSalesUser(): RequestHandler {
  return async function requireSalesUserMw(req: Request, res: Response, next: NextFunction) {
    const user = await resolveSalesUser(req);
    if (!user) {
      res.status(403).json({ error: "This account does not have sales portal access." });
      return;
    }
    res.locals.salesUser = user;
    next();
  };
}

/** Gate a route behind a super admin only. */
export function requireSuperAdmin(): RequestHandler {
  return async function requireSuperAdminMw(req: Request, res: Response, next: NextFunction) {
    const user = await resolveSalesUser(req);
    if (!user) {
      res.status(403).json({ error: "This account does not have sales portal access." });
      return;
    }
    if (user.role !== "super_admin") {
      res.status(403).json({ error: "Super Admin access required." });
      return;
    }
    res.locals.salesUser = user;
    next();
  };
}

/** Convenience accessor for handlers running after requireSalesUser. */
export function getSalesUser(res: Response): SalesUser {
  return res.locals.salesUser as SalesUser;
}
