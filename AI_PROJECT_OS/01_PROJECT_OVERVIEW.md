# 01 Project Overview

## What it is

Divini Partners is an event-partnership marketplace operating system. It connects the parties that make an event happen:

- Venues (host the event, list availability, earn a revenue share)
- Vendors (suppliers and service providers who quote and fulfill work)
- Planners (coordinate events and partners)
- Clients / event bookers (the buyers paying for the event)

On top of the marketplace sits a layer of business intelligence (AI COO, intelligence moat, venue intelligence, revenue/leakage engines) and a money layer (quotes, bids, invoices, platform fees, payouts, venue revenue share).

It is live in production at divinipartners.com (currently running the legacy pricing model; Pricing V2 is built behind a flag and not yet flipped - see `10_CURRENT_STATE.md`).

## Stack at a glance

- Frontend: Vite + React 18 single-page app (TypeScript), React Router.
- Backend: Express (TypeScript, ESM) using raw SQL through a Postgres pool. This is "Drizzle-raw-SQL" style: hand-written SQL, no heavy ORM in the hot path.
- Database: PostgreSQL (PostgreSQL 16 in production, Docker container on the droplet).
- One Node process serves both the built SPA and the `/api` router.
- Auth: native email/password (scrypt password hashing + jose HS256 session JWT). Authentik OIDC has been fully retired.
- Hosting: DigitalOcean droplet, Caddy reverse proxy (HTTPS), pm2 process manager.
- Mobile: Capacitor managed-webview shell for iOS (and Android), pointing at the hosted web app.

## Scale (point-in-time)

- ~133 `create table` statements in `db/apply-all.sql` (the consolidated schema). Described loosely as "~132 tables."
- ~115 route modules mounted under `/api` (count of `app.use(...)` style mounts in `server/src/routes.ts`); ~116 files in `server/src/routes/`. Described loosely as "~140 routes."
- ~116 page components in `src/pages/`.

These counts are estimates captured for orientation. When you change the schema or routing, refresh them.

## Sibling project

There is a sibling app, Divini Procure, that replicates much of this playbook for a procurement use case (diviniprocure.com). It is a separate codebase and is out of scope for this OS except where deploy/runbook docs reference both. Do not modify Procure from this repo.

## Where to go next

- Architecture: `04_SYSTEM_ARCHITECTURE.md`
- Business and money model: `05_BUSINESS_CONTEXT.md` and `03_PRODUCT_REQUIREMENTS.md`
- Current status and next task: `10_CURRENT_STATE.md`
