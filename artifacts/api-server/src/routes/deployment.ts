// @ts-nocheck
import { Router } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, commercialAccountsTable, partnersTable, suppliersTable, userRolesTable } from "@workspace/db";
import { GetDeploymentReadinessResponse } from "@workspace/api-zod";
import { sendValidated } from "../lib/validateResponse";

const router = Router();

function checkEnv(name: string) {
  const v = process.env[name];
  return { name, set: !!v && v.length > 0 };
}

const ADMIN_ROLES = new Set(["super_admin", "internal_admin", "admin"]);

async function requireAdmin(req: any, res: any): Promise<boolean> {
  try {
    const auth = getAuth(req);
    const userId = auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "unauthenticated" });
      return false;
    }
    const rows = await db.select().from(userRolesTable).where(eq(userRolesTable.userId, userId));
    const ok = rows.some(r => r.isActive && ADMIN_ROLES.has((r.role || "").toLowerCase()));
    if (!ok) {
      res.status(403).json({ error: "admin_required" });
      return false;
    }
    return true;
  } catch (e) {
    res.status(401).json({ error: "auth_failed" });
    return false;
  }
}

router.get("/deployment/readiness", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const env = [
      checkEnv("DATABASE_URL"),
      checkEnv("SESSION_SECRET"),
      checkEnv("DEFAULT_OBJECT_STORAGE_BUCKET_ID"),
      checkEnv("PRIVATE_OBJECT_DIR"),
      checkEnv("PUBLIC_OBJECT_SEARCH_PATHS"),
      checkEnv("RESEND_API_KEY"),
      checkEnv("VITE_CLERK_PUBLISHABLE_KEY"),
      checkEnv("CLERK_SECRET_KEY"),
    ];

    const [accounts, partners, suppliers] = await Promise.all([
      db.select().from(commercialAccountsTable),
      db.select().from(partnersTable),
      db.select().from(suppliersTable),
    ]);

    const integrations = [
      {
        key: "object_storage",
        label: "Object storage (assets, exports)",
        ok: !!process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID && !!process.env.PRIVATE_OBJECT_DIR,
        why: "Required for asset uploads, supplier packets, and exports.",
      },
      {
        key: "email",
        label: "Outbound email (Resend)",
        ok: !!process.env.RESEND_API_KEY,
        why: "Required for transactional notifications and supplier packets.",
      },
      {
        key: "auth",
        label: "Clerk authentication",
        ok: !!process.env.CLERK_SECRET_KEY && !!process.env.VITE_CLERK_PUBLISHABLE_KEY,
        why: "Required for admin and partner sign-in.",
      },
      {
        key: "session",
        label: "Session secret",
        ok: !!process.env.SESSION_SECRET,
        why: "Required for any server-side session usage.",
      },
    ];

    const demoAccountSlugs = ["acme", "betaco", "newvenue"];
    const demoAccounts = accounts.filter(a => demoAccountSlugs.some(s => a.slug?.toLowerCase().includes(s)));
    const liveAccounts = accounts.filter(a => !demoAccountSlugs.some(s => a.slug?.toLowerCase().includes(s)));

    const checklist = [
      { ok: env.find(e => e.name === "DATABASE_URL")?.set, label: "Database is provisioned" },
      { ok: integrations.find(i => i.key === "auth")?.ok, label: "Auth is configured" },
      { ok: integrations.find(i => i.key === "object_storage")?.ok, label: "Object storage is configured" },
      { ok: integrations.find(i => i.key === "email")?.ok, label: "Email sender is configured" },
      { ok: suppliers.length > 0, label: "At least one supplier configured" },
      { ok: partners.length > 0, label: "At least one partner configured" },
      { ok: liveAccounts.length > 0, label: "At least one non-demo commercial account" },
    ];

    const payload = {
      env,
      integrations,
      counts: {
        accounts: accounts.length,
        partners: partners.length,
        suppliers: suppliers.length,
        demoAccounts: demoAccounts.length,
        liveAccounts: liveAccounts.length,
      },
      checklist,
      readyToDeploy: checklist.every(c => c.ok),
    };
    sendValidated(req, res, GetDeploymentReadinessResponse, payload, "Get deployment readiness");
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
