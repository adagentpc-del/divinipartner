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
 * deleteMyAccount() is deliberately KEPT despite having no live caller or
 * backend route either: Apple Guideline 5.1.1(v) requires reachable in-app
 * account deletion (see AI_PROJECT_OS/52_COMPLIANCE.md), and this is the
 * one stub in the removed family that represents a real, still-needed
 * requirement rather than abandoned product direction. It is not wired to
 * any UI and POST /account/delete does not exist server-side -- flagged
 * separately as an open gap, not fixed here.
 */
import { apiSend } from './api';

export async function deleteMyAccount() {
  await apiSend('POST', '/account/delete');
}
