---
name: Sales Intake module auth & roles
description: How the Sales Intake + Opportunity Routing module does roles/login (reuses Clerk, not Supabase)
---

# Sales module roles & auth

The Sales Intake + Opportunity Routing module reuses the portal's existing Clerk login — it does NOT use Supabase (user explicitly chose Supabase first, then reversed and confirmed "existing database + login"). Do not reintroduce Supabase for this module.

**Identity resolution** (`requireSalesUser.ts` → `resolveSalesUser`):
- Map the signed-in Clerk user's email → `sales_reps` row (case-insensitive). Role comes from that row (`super_admin` | `sales_rep`); only `status='active'` reps are admitted.
- Bootstrap: an email on `ADMIN_ALLOWED_EMAILS` with no `sales_reps` row resolves as a `super_admin` with `repId=null`, so the existing portal admin can reach the sales module before the Sales Team is seeded.
- On first match, `clerkUserId` is backfilled onto the rep row.

**Why:** keeps one login for the whole portal, lets reps see only their own records via `repId` scoping, and avoids a second auth system.

**How to apply:** gate sales routes with `requireSalesUser()` / `requireSuperAdmin()`; read the resolved user via `getSalesUser(res)` (stored on `res.locals.salesUser`). Row-level scoping for reps = filter by `assignedRepId/ownerRepId === repId`; super admins see all.

Big intake forms are stored as `payloadJson` (jsonb) on `sales_intake_submissions` with a few promoted columns (company/contact/email/phone, formType, linkSource) for routing/matching/display.
