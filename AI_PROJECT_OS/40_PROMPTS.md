# 40 Prompts

Reusable prompts and instructions for AI work on this repo. Adapt, but keep the guardrails.

## Session bootstrap prompt

```
You are working on Divini Partners (event-partnership marketplace OS).
Before doing anything:
1. Read AI_PROJECT_OS/01_PROJECT_OVERVIEW.md, 04_SYSTEM_ARCHITECTURE.md,
   10_CURRENT_STATE.md, 11_ACTIVE_SPRINT.md, 12_TASK_QUEUE.md, 14_DECISIONS.md.
2. Verify every claim against the actual code/schema/config. The code is the
   source of truth; if the OS disagrees with the code, fix the OS.
3. Do only the requested task. Do not refactor or gold-plate outside scope.
4. House rule: no em dashes anywhere.
When done, update 10_CURRENT_STATE.md, 11_ACTIVE_SPRINT.md, 13_CHANGELOG.md,
12_TASK_QUEUE.md, and 14_DECISIONS.md as applicable.
```

## Guardrails (always apply)

- Money math: never hand-roll fee math. Use `server/src/lib/pricingMath.ts` (`computeOnTopCharge`, `decomposeGrossOnTop`, `venueShareOfFee`). Vendor is always made whole; venue share never exceeds the fee.
- Secrets: do not weaken the production fail-closed guards in `server/src/config.ts` / `server/src/lib/session.ts`. Do not reintroduce the hardcoded admin email into the SPA.
- Pricing flag: keep new pricing behavior behind `PRICING_V2` / `VITE_PRICING_V2` until the legacy path is intentionally removed.
- Deploy: never put `rsync` and `deploy.sh`/`psql` in the same place; never sync `.env.local`.
- Stripe: do not enable real money (`STRIPE_SECRET_KEY`) without explicit instruction and legal sign-off.

## Useful task prompts

- Add an API route:
  ```
  Add a route module under server/src/routes/, mount it in server/src/routes.ts,
  guard it with requireUser/requireAdmin via getAuth, put DB access in
  server/src/db/ and business logic in server/src/lib/. Add a node:test if the
  logic is pure. Keep tsc clean for both server and SPA.
  ```
- Change pricing-adjacent behavior:
  ```
  Route all fee/venue-share computation through server/src/lib/pricingMath.ts.
  Update tests/pricingMath.test.ts to cover the new case. Verify the ledger
  invariants in AI_PROJECT_OS/21_DATABASE.md still hold.
  ```
- Update the OS after work:
  ```
  Update 10_CURRENT_STATE.md (status, blockers, completion %, last-updated date),
  append a 13_CHANGELOG.md entry (what/why/files/risks/next), and move the task
  in 12_TASK_QUEUE.md. Record any new architectural decision in 14_DECISIONS.md.
  ```

> TODO(owner): Add project-specific prompt snippets for the LLM-backed features (quote assist, COO briefing) once the live provider and expected output format are documented.
