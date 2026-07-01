# Phase 4 Integration - Rental Inventory, Pricing Memory, Auto-Quote, Packages

Built per blueprint sections 12, 17, 18. All new files are self-contained; this
doc lists the wiring an integrator must add to `routes.ts`, `App.tsx`, the
dashboard nav, and the database.

## 1. Database (apply once, after `db/schema.sql`)

New file: `db/schema-phase4.sql` (additive, idempotent). It:

- Extends `inventory_items` with the remaining blueprint 12.2 columns
  (`add column if not exists`): `price_unit`, `delivery_fee`, `install_fee`,
  `labor_required`, `labor_hours`, `damage_deposit`, `replacement_value`,
  `venue_restrictions`, `add_ons`, `preferred_venue_pricing`, `status`,
  `updated_at`. (Base columns name, category, description, photos, dimensions,
  weight, quantity, price, fees, availability, warehouse_location,
  service_radius, lead_time, contract_pricing_eligible already exist.)
- Adds tables: `inventory_availability`, `vendor_pricing_memory`, `packages`.
- Adds supporting indexes.

Apply:

```
psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-phase4.sql
```

## 2. Backend routers - mount in `server/src/routes.ts`

Add the imports and mounts (the only edits needed in routes.ts; not done here
because routes.ts is owned by another agent):

```ts
import inventory from "./routes/inventory.js";
import packages from "./routes/packages.js";
import autoquote from "./routes/autoquote.js";

router.use("/inventory", inventory);
router.use("/packages", packages);
router.use("/autoquote", autoquote);
```

### Routes (method + full path)

Inventory (`/api/inventory`):

- `GET    /api/inventory`                       list + filter (blueprint 12.3)
- `GET    /api/inventory/:id`                   single item
- `POST   /api/inventory`                       create item (blueprint 12.2 fields)
- `PUT    /api/inventory/:id`                   update item
- `DELETE /api/inventory/:id`                   remove item
- `GET    /api/inventory/:id/availability`      list availability windows
- `POST   /api/inventory/:id/availability`      add availability window

  Search query params: `search, category, minPrice, maxPrice, priceUnit,
  warehouseLocation, maxLeadTime, laborRequired, contractEligible, status,
  availableFrom, minQuantity`.

Packages (`/api/packages`):

- `GET    /api/packages`        list (optional `?status=`)
- `GET    /api/packages/:id`    single package
- `POST   /api/packages`        create package
- `PUT    /api/packages/:id`    update package
- `DELETE /api/packages/:id`    delete package

Auto-Quote (`/api/autoquote`):

- `POST   /api/autoquote/generate`          body `{ bidId | eventId, contractDiscountRate? }`
                                            -> `{ draft, flags }` (not persisted)
- `GET    /api/autoquote/pricing-memory`    the org's pricing brain (or defaults)
- `PUT    /api/autoquote/pricing-memory`    upsert the org's pricing brain

All routes are `requireUser` and org-scoped: each handler resolves the actor via
`db.getActor` and constrains reads/writes to `actor.org.id`.

## 3. Backend modules (new, self-contained)

- `server/src/db/inventory.ts`        org-scoped inventory CRUD + availability + 12.3 filters
- `server/src/db/pricing-memory.ts`   per-vendor pricing brain CRUD + defaults + `recordPastQuote`
- `server/src/db/packages.ts`         package/bundle CRUD + `lineItemTotal`
- `server/src/lib/autoquote.ts`       deterministic `generateAutoQuote` + `quoteIntelligence`

The auto-quote engine is pure: total = (items + labor) - discount + fees +
platform fee, where platform fee rate comes from the org tier (`db.TIERS`), rush
multiplier and discount rules come from pricing memory, and quantities scale to
guest count for per-guest categories.

## 4. Frontend components + intended route paths - wire in `App.tsx`

(Not done here because App.tsx is owned by another agent.) Suggested routes:

- `src/pages/inventory/InventoryManager.tsx`   -> `/inventory`
- `src/pages/inventory/InventorySearch.tsx`    -> `/inventory/browse`
- `src/pages/pricing-memory/PricingMemory.tsx` -> `/pricing-memory`
- `src/pages/packages/PackageBuilder.tsx`      -> `/packages`
- `src/pages/quotes/AutoQuoteDraft.tsx`        -> `/quotes/auto/:bidId`
                                                  and `/quotes/auto-event/:eventId`
                                                  (also accepts `?bidId=` / `?eventId=`)

Example `App.tsx` additions:

```tsx
import InventoryManager from './pages/inventory/InventoryManager';
import InventorySearch from './pages/inventory/InventorySearch';
import PricingMemory from './pages/pricing-memory/PricingMemory';
import PackageBuilder from './pages/packages/PackageBuilder';
import AutoQuoteDraft from './pages/quotes/AutoQuoteDraft';

<Route path="/inventory" element={<InventoryManager />} />
<Route path="/inventory/browse" element={<InventorySearch />} />
<Route path="/pricing-memory" element={<PricingMemory />} />
<Route path="/packages" element={<PackageBuilder />} />
<Route path="/quotes/auto/:bidId" element={<AutoQuoteDraft />} />
<Route path="/quotes/auto-event/:eventId" element={<AutoQuoteDraft />} />
```

The VendorDashboard nav already has "Rental Inventory", "Pricing", "Packages",
and "My Quotes" items; point their `to` props at the routes above (those nav
items currently have no `to`, so the change is additive).

## 5. Cross-feature hooks

- Event Workspace "Inventory" tab: call `GET /api/inventory` (optionally filtered)
  to show the vendor catalogue inside an event context.
- Bid -> quote flow: from a bid, link to `AutoQuoteDraft` at
  `/quotes/auto/:bidId`. It calls `POST /api/autoquote/generate` to build the
  draft, then `POST /api/quotes` (existing quote flow) on submit. The submit
  payload is the standardized Divini format (`format: "divini.standard.v1"`).
  If the quotes router is not yet mounted, the submit call is the only thing to
  wire; everything up to and including the editable draft works standalone.
