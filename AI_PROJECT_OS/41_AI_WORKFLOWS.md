# 41 AI Workflows

How AI-driven work is structured on this project, both the in-product AI features and the way AI agents build the codebase.

## In-product AI features

The backend has an LLM-backed intelligence layer (`server/src/lib/llm.ts` plus engine modules). Notable AI-assisted capabilities:

- AI COO: daily briefing, executive tasks, revenue intelligence, forecasting, business health, command-center Q&A (`cooBriefing.ts`, `cooTasks.ts`, `commandCenter.ts`, `forecasting.ts`, `businessHealth.ts`, `revenueIntel.ts`).
- Quote assistance / automation: `aiQuoteAssist.ts`, `draftQuote.ts`, `quoteAutomation.ts`, `autoquote.ts`.
- Marketplace and pricing intelligence: `marketplaceIntel.ts`, `pricingIntel.ts`, `recommend.ts`, `nextbestaction.ts`.
- Intelligence moat: Divini Score, playbooks, relationship graph, partnership matching, event memory, war room (`diviniScore.ts`, `playbooks.ts`, `relationshipGraph.ts`, `partnershipMatch.ts`, `eventMemory.ts`, `eventWarRoom.ts`).

Design note: these engines are largely deterministic logic on top of the data, with the LLM used for natural-language synthesis where useful. They degrade gracefully and should not block core flows.

> TODO(owner): Document the live LLM provider, the key/env it uses, rate limits, and the expected I/O contract for each AI feature. Not specified in the reviewed docs.

## AI agent build workflow (how this repo was built and is maintained)

This codebase is built and maintained largely by AI agents working in parallel waves. The conventions that keep that safe:

1. Read the OS first (see `README.md` "Standard AI Workflow").
2. Verify against the code, never assume.
3. Work in additive, idempotent, flag-gated increments (e.g. Pricing V2 waves W1-W6 behind `PRICING_V2`; schema changes as `create ... if not exists`).
4. Keep both typecheckers green (server tsc, SPA tsc) and the Vite build clean as the definition of "done" for code work; run `npm test`.
5. Update the OS state files before finishing.

## When to delegate to sub-agents

- Large read-only investigations (sweeping many files) - delegate to a search/explore agent and keep only the conclusion.
- Independent parallel build tasks - run as parallel agents, each scoped to one concern, each verified green before merge.
- Never let two agents edit overlapping money or schema logic concurrently without reconciliation.

## Verification loop

- Pure logic: add/extend a node:test (the money math and password hash suites are the model).
- Integration: smoke test against `/api/healthz` and a gated route after deploy.
- Money: re-check the ledger invariants in `21_DATABASE.md`.
