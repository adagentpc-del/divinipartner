# 50 Testing

## Automated tests

- Runner: Node's built-in test runner. Script: `npm test` = `node --experimental-strip-types --test "tests/**/*.test.ts"` (TypeScript stripped at runtime, no build step).
- Suites:
  - `tests/pricingMath.test.ts` - the Pricing V2 on-top money math. Imports ONLY the pure `server/src/lib/pricingMath.ts` (no DB, no config). Asserts exact cents across many booking sizes, plus a round-trip sweep (decompose of round(Q*1.05) recovers Q). Validates the model invariants: vendor made whole, venue share = 20% of fee, no rounding leak.
  - `tests/passwordHash.test.ts` - scrypt password hashing/verification (`server/src/lib/passwordHash.ts`).
- Design principle: tests target PURE modules so they run with zero side effects and are fast and deterministic. This is the model to follow when adding tests.

## CI

- `.github/workflows/ci.yml` on push and PR (Node 22):
  1. Install root deps, install server deps.
  2. Typecheck server (`tsc -p server/tsconfig.json --noEmit`).
  3. Typecheck SPA (`tsc -p tsconfig.json --noEmit`).
  4. `npm test`.
- Keep CI green before deploying.

## Definition of "done" for code work

- Server tsc clean, SPA tsc clean, Vite build clean, tests passing. (This is the bar that the Pricing V2 work was held to.)

## Manual QA checklist (V2 flip and general)

After deploy / flip, verify:

- `curl localhost:PORT/api/healthz` -> 200 `{ ok: true }`.
- `https://divinipartners.com/` -> 200.
- `/api/payments/processors` shows `pricing_v2:true`.
- A gated endpoint (e.g. `/api/venue-metrics/summary`) returns 401 unauthenticated.
- Public Pricing page: roles free, no tier picker at signup, $49 Featured shown.
- Landing copy reads "Event Commerce Infrastructure."
- Quote -> invoice -> checkout shows "Platform fee (5%)" and the vendor's full quote.
- Test payment writes: `platform_revenue` fee = 5% of subtotal, vendor net = full subtotal, `venue_revenue_share` row = 20% of fee.
- Featured Vendor buy/cancel toggles badge + ranking boost.
- Dashboards show GMV / fees / venue-share tiles.
- Security: rapid repeated logins on `/api/auth` return 429; file upload + signed download works (decrypts if encryption on); no empty-CORS warning in logs.
- Auth flow: register -> verify email -> login works (requires email configured).
- Legal: `/terms` and the policy pages load.

## Gaps

- No DB/integration tests and no SPA tests yet. See `16_TECH_DEBT.md`.
