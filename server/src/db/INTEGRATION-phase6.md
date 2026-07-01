# Divini Partners - Phase 6 Integration (Guests, Floorplans, Seating, Itinerary, Timeline, Tasks)

Phase 6 ships the Guest List, Floorplans, interactive Seating Chart builder, the
auto-built Itinerary (with role views + deterministic checks), and the Timeline /
Tasks system. All files below are NEW. No existing files were edited. This doc
lists every route, every frontend tab component + the EventWorkspace tab key it
replaces, and the schema additions, so the integration step can wire it in.

## 1. Server mounts to add (in server/src/routes.ts)

```ts
import guests from "./routes/guests.js";
import seating from "./routes/seating.js";
import itinerary from "./routes/itinerary.js";
import tasks from "./routes/tasks.js";

router.use("/guests", guests);
router.use("/seating", seating);
router.use("/itinerary", itinerary);
router.use("/tasks", tasks);
```

(Phase 6 does NOT edit routes.ts itself; that file is owned by integration.)

## 2. Backend routes (method + full path)

All routes require a signed-in user (router-level `requireUser`). Read needs
event access; mutation needs event ownership (org match / named client / planner
/ admin). Enforcement lives in the db modules and reuses `events.getEvent`.

### Guests - base `/api/guests`
| Method | Path | Purpose |
|--------|------|---------|
| GET    | `/api/guests/meta` | RSVP statuses + meal preference options |
| GET    | `/api/guests/event/:eventId` | list guests on an event |
| GET    | `/api/guests/event/:eventId/counts` | RSVP / VIP / meal / accessibility / check-in rollups |
| POST   | `/api/guests/event/:eventId` | add a guest |
| POST   | `/api/guests/event/:eventId/bulk` | bulk add (body: `{ guests: [...] }`) |
| PATCH  | `/api/guests/:id` | patch a guest |
| POST   | `/api/guests/:id/rsvp` | set RSVP (body: `{ status }`) |
| POST   | `/api/guests/:id/check-in` | toggle check-in (body: `{ checked_in }`) |
| DELETE | `/api/guests/:id` | delete a guest |

### Seating (Floorplans + Charts) - base `/api/seating`
| Method | Path | Purpose |
|--------|------|---------|
| GET    | `/api/seating/meta` | zone types + table shapes |
| GET    | `/api/seating/floorplans/event/:eventId` | list floorplans |
| POST   | `/api/seating/floorplans/event/:eventId` | add floorplan reference |
| PATCH  | `/api/seating/floorplans/:id` | patch floorplan |
| DELETE | `/api/seating/floorplans/:id` | delete floorplan |
| GET    | `/api/seating/charts/event/:eventId` | list seating charts |
| GET    | `/api/seating/charts/:id` | single seating chart |
| POST   | `/api/seating/charts/event/:eventId` | create chart (body: name, floorplan_id, layout) |
| PATCH  | `/api/seating/charts/:id` | save chart layout / metadata |
| DELETE | `/api/seating/charts/:id` | delete chart |

### Itinerary - base `/api/itinerary`
| Method | Path | Purpose |
|--------|------|---------|
| GET    | `/api/itinerary/meta` | categories, statuses, roles |
| GET    | `/api/itinerary/event/:eventId/build` | auto-built itinerary (items, by_role views, deterministic checks) |
| GET    | `/api/itinerary/event/:eventId/items` | persisted itinerary items |
| POST   | `/api/itinerary/event/:eventId/items` | add a persisted item |
| PATCH  | `/api/itinerary/items/:id` | patch a persisted item |
| DELETE | `/api/itinerary/items/:id` | delete a persisted item |

`buildItinerary(actor, eventId)` derives load-in / setup / doors / program /
breakdown / load-out windows from the event start, vendor service windows from
accepted/submitted quotes, payment deadlines from invoices, then layers any
persisted `itinerary_items` on top. It returns role-specific views
(all/client/venue/vendor/installer/planner) and deterministic checks
(missing event time, missing guest count, no venue, no accepted quotes,
delivery scheduled after load-in). Nothing is fabricated; absent data becomes a
check, not invented content.

### Tasks + Timeline - base `/api/tasks`
| Method | Path | Purpose |
|--------|------|---------|
| GET    | `/api/tasks/meta` | categories, statuses, priorities, workflow template |
| GET    | `/api/tasks/event/:eventId` | list tasks |
| GET    | `/api/tasks/event/:eventId/timeline` | tasks grouped by month + milestones + progress |
| POST   | `/api/tasks/event/:eventId` | add a task |
| POST   | `/api/tasks/event/:eventId/seed-workflow` | seed the standard event workflow template (idempotent by template_key) |
| PATCH  | `/api/tasks/:id` | patch a task |
| POST   | `/api/tasks/:id/status` | quick status set (body: `{ status }`) |
| DELETE | `/api/tasks/:id` | delete a task |

## 3. Frontend tab components + EventWorkspace tab keys to replace

All components are in `src/pages/event/tabs/`, default-export, take
`{ eventId: string }`, import only react / react-router-dom + `../../../lib/api`
(apiGet, apiSend), self-contained `<style>` blocks (emerald #123c2e/#1E5D4A,
gold #C9A35B, ivory, Cormorant Garamond + Inter). Zero em dashes.

In `src/pages/event/EventWorkspace.tsx`, swap the `Placeholder` element for these
tab keys (and add the import at the top):

| Tab key | Label | Replace `element` with | File |
|---------|-------|------------------------|------|
| `guest_list`    | Guest List    | `<GuestListTab eventId={id} />`    | `src/pages/event/tabs/GuestListTab.tsx` |
| `seating_chart` | Seating Chart | `<SeatingChartTab eventId={id} />` | `src/pages/event/tabs/SeatingChartTab.tsx` |
| `floorplans`    | Floorplans    | `<FloorplansTab eventId={id} />`   | `src/pages/event/tabs/FloorplansTab.tsx` |
| `timeline`      | Timeline      | `<TimelineTab eventId={id} />`     | `src/pages/event/tabs/TimelineTab.tsx` |
| `tasks`         | Tasks         | `<TasksTab eventId={id} />`        | `src/pages/event/tabs/TasksTab.tsx` |
| `itinerary`     | Itinerary     | `<ItineraryTab eventId={id} />`    | `src/pages/event/tabs/ItineraryTab.tsx` |

Imports to add to EventWorkspace.tsx:
```ts
import GuestListTab from './tabs/GuestListTab';
import SeatingChartTab from './tabs/SeatingChartTab';
import FloorplansTab from './tabs/FloorplansTab';
import TimelineTab from './tabs/TimelineTab';
import TasksTab from './tabs/TasksTab';
import ItineraryTab from './tabs/ItineraryTab';
```

The SeatingChartTab is a usable interactive builder: add tables (drag to
position via SVG pointer events), add zones (catering/dance/stage/check-in/
photo/vendor/bar/lounge), mark VIP tables, set seats/shape, assign guests to
tables from the side panel, and export the layout as JSON. The whole layout is
persisted as a single jsonb blob via PATCH `/api/seating/charts/:id`.

## 4. Schema additions (db/schema-phase6.sql)

Additive only, apply AFTER db/schema.sql:

- Extends `guests` (already in schema.sql) with: party_size, plus_one_name,
  guest_group, invited_by, seating_table_id, checked_in, checked_in_at,
  created_by, updated_at. Adds idx on rsvp_status and vip.
- Extends `tasks` (already in schema.sql) with: description, organization_id,
  assigned_role, start_date, completed_at, depends_on, milestone, template_key,
  sort_order, created_by, updated_at. Adds idx on status / category / due_date.
- NEW table `floorplans` (event-scoped uploaded floorplan references).
- NEW table `seating_charts` (jsonb `layout` = tables / zones / assignments).
- NEW table `itinerary_items` (persisted, role-scoped schedule items).

Every column add is guarded with `if not exists`; safe to re-run.

Apply: `psql "<url>" -f db/schema-phase6.sql`

## 5. Notes

- The `guests` and `tasks` base tables already shipped in db/schema.sql; Phase 6
  only adds columns + the three new tables, so no conflict with earlier phases.
- Itinerary derivation reads `quotes` and `invoices` (Phase 3 / Phase 5 tables)
  but only via SELECT; it degrades gracefully if those are empty.
- Owner-only mutation mirrors the access model in server/src/db/events.ts; a
  vendor attached to an event can read guests/seating/itinerary/tasks but cannot
  mutate them.
