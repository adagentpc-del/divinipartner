/**
 * Data calls - same public API as before, but every call now hits the Express
 * backend (src/lib/api.ts) instead of Supabase PostgREST/Storage. Function
 * signatures are unchanged so the pages need no rewrites for data access.
 *
 * A full companies/buildings/packages/line-items/documents/questions/
 * feature-flags family was removed from this file 2026-08-03 (launch
 * readiness audit follow-up): none of it had a live backend route (the app
 * moved to a different real data model -- organizations/events/quotes/bids
 * -- long ago), and every caller was itself either unregistered
 * (src/pages/Onboarding.tsx, never imported by App.tsx) or unreachable
 * (src/pages/Projects.tsx, src/pages/AdminFeatures.tsx, both only linked
 * from src/components/Shell.tsx, a nav component imported nowhere). All
 * four files were removed alongside this cleanup.
 *
 * deleteMyAccount() is wired to a real backend as of 2026-08-03: Apple
 * Guideline 5.1.1(v) requires reachable in-app account deletion (see
 * AI_PROJECT_OS/52_COMPLIANCE.md). POST /account/delete re-confirms the
 * caller's password, then anonymizes + deactivates their account (see
 * server/src/db.ts's deleteAccount) -- never a hard delete, so financial and
 * audit records tied to their id stay intact. Called from the "Delete
 * account" danger zone in src/pages/profile/ProfileEditor.tsx.
 */
import { apiSend } from './api';

export async function deleteMyAccount(password: string): Promise<void> {
  await apiSend('POST', '/account/delete', { password });
}
