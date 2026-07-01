# AI Project Operating System (Divini Partners)

This folder is the single source of truth for the Divini Partners project. It exists so that any AI (or human) can pick up the project from the repository alone, with no chat history, and act correctly.

If you are an AI working on this repo, you MUST use this folder. It is not optional documentation. It is the operating system for how work happens here.

## Purpose

- Give every contributor the same accurate picture of what this product is, how it is built, where it stands, and what to do next.
- Replace tribal knowledge and chat history with durable, version-controlled facts.
- Keep state (current status, sprint, tasks, decisions) honest and current so the next session starts from truth, not assumption.

## How every AI must use this folder

### Always read first (before doing anything)

1. `01_PROJECT_OVERVIEW.md` - what this is
2. `04_SYSTEM_ARCHITECTURE.md` - how it runs
3. `10_CURRENT_STATE.md` - where it stands right now
4. `11_ACTIVE_SPRINT.md` - the current focus
5. `12_TASK_QUEUE.md` - the prioritized backlog
6. `14_DECISIONS.md` - locked decisions you must not relitigate

### Always update after work

1. `10_CURRENT_STATE.md` - new status, blockers, completion estimate
2. `11_ACTIVE_SPRINT.md` - progress on the active sprint
3. `13_CHANGELOG.md` - what you changed, why, files, risk, next
4. `12_TASK_QUEUE.md` - move tasks between done / in-progress / queued
5. `14_DECISIONS.md` - record any new architectural decision you made

## Standard AI Workflow

Follow these four steps every time.

- Step 1 - Read. Read the "Always read first" files above. Do not skip them.
- Step 2 - Analyze the repo, never assume. Verify against the actual code, schema, and config in the repo. The OS describes reality but reality is the code. If the OS and the code disagree, trust the code and fix the OS.
- Step 3 - Do only the requested work. Do not gold-plate. Do not refactor or "improve" things outside the task. Stay inside the scope you were given.
- Step 4 - Update the OS. Before you finish, update the files listed under "Always update after work" so the next session inherits truth.

## Self-maintenance

This OS is a living system. It rots if it is not maintained.

- When a fact here is proven wrong by the code, fix the fact in the same session.
- When you complete a task, the change must be reflected in `10_CURRENT_STATE.md` and `13_CHANGELOG.md` in that same session.
- Placeholders are explicit. Anything not yet known is written as `> TODO(owner): ...` so it is searchable and obviously incomplete. Do not silently invent a value to fill a gap.
- Numbers that drift (table count, route count, completion percentages, dates) are estimates captured at a point in time. When you touch the relevant area, refresh them.
- Keep files focused. Each file owns one concern. Do not duplicate large blocks across files; cross-reference instead.

## File index

| File | Concern |
|---|---|
| 01_PROJECT_OVERVIEW.md | What Divini Partners is |
| 02_MISSION_AND_VISION.md | Why it exists, where it is going |
| 03_PRODUCT_REQUIREMENTS.md | What it must do (incl. Pricing V2) |
| 04_SYSTEM_ARCHITECTURE.md | How it is built and runs |
| 05_BUSINESS_CONTEXT.md | Monetization, market, audit context |
| 10_CURRENT_STATE.md | Live status, blockers, next task |
| 11_ACTIVE_SPRINT.md | Current sprint focus |
| 12_TASK_QUEUE.md | Prioritized backlog |
| 13_CHANGELOG.md | Major implementations |
| 14_DECISIONS.md | Architectural decision log |
| 15_KNOWN_ISSUES.md | Open bugs / rough edges |
| 16_TECH_DEBT.md | Debt and cleanup |
| 20_CODEBASE_MAP.md | Folders, modules, entry points |
| 21_DATABASE.md | Schema, migrations, ledgers |
| 22_APIS_AND_INTEGRATIONS.md | Internal API + external services |
| 23_DEPLOYMENT.md | Deploy loop |
| 24_ENVIRONMENTS.md | Env vars, flags |
| 30_UI_UX_GUIDELINES.md | UX conventions |
| 31_DESIGN_SYSTEM.md | Tokens, components |
| 32_BRAND_GUIDELINES.md | Brand voice and identity |
| 40_PROMPTS.md | Reusable prompts |
| 41_AI_WORKFLOWS.md | How AI work is structured here |
| 42_AUTOMATIONS.md | Background jobs, scheduled work |
| 50_TESTING.md | Tests, CI, manual QA |
| 51_SECURITY.md | Security controls |
| 52_COMPLIANCE.md | Legal and store compliance |
| 90_FUTURE_IDEAS.md | Parking lot |

Last updated: 2026-06-24
