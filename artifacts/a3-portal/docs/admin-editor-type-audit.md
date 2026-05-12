# Admin editor row-type audit

Goal: flag admin editors in `artifacts/a3-portal/src/pages/admin/` that still
hand-maintain row-shaped TypeScript types instead of importing from the shared
`@workspace/db/schema` Drizzle types (or generated OpenAPI types). These are
the same drift-risk class that produced the `sizeWidthMm` / `sizeHeightMm`
typo in the product editor.

Fixed in this task:
- `ProductCatalog.tsx` — replaced hand-rolled `interface Product` with
  `Omit<ProductCatalog, ...> & { ... }` derived from
  `@workspace/db/schema.productCatalogTable.$inferSelect`.

## Hand-maintained row types worth migrating next

These declare row shapes that mirror server tables and would silently drift
the same way `Product` did. Each one is a candidate for sourcing from
`@workspace/db/schema`:

Orders / fulfillment
- `OrdersDashboard.tsx` — `Order` (mirrors `ordersTable`)
- `OrderDetail.tsx` — `OrderItem`, `OrderFull` (mirror `ordersTable` +
  `orderItemsTable`); `Supplier`, `City` are tiny lookups, lower priority

Partners / themes / sections
- `PartnerSections.tsx` — `Section`, `Partner`, `SectionTypeDef`
- `PartnerAddons.tsx` — `Product` (lookup; lower priority)

Assets & inventory
- `AssetsLibrary.tsx`, `Assets.tsx` — verify against `assetsTable`
- `InventoryDashboard.tsx` — `Reservation`, `Product`, `Partner`, `City`
- `CommittedInventory.tsx` — `Summary` (aggregate; not a row mirror)

Catalog & packages
- `PackagesList.tsx` — `Pkg`, `PkgItem`, `PkgFull` (mirror `packagesTable` +
  items table)
- `ProductFamilies.tsx` — `Product`, `Family`, `Member`
- `SuppliersList.tsx` — `Supplier`
- `ApprovedMaterials.tsx` — `Material`

Other domain rows
- `Reconciliation.tsx` — `Discrepancy`
- `CitiesAndVenues.tsx` — `City`, `Venue`
- `BrandingLocations.tsx` — `BrandingLocation`
- `UserRoles.tsx` — `Role`
- `OnboardingSubmissions.tsx` — `Submission`
- `DocumentCenter.tsx` — `Doc`, `DocRequest`, `DocEvent`
- `HelpFaq.tsx` — `Faq`
- `EventsList.tsx` — `PartnerAddon`, `Pkg`, `City`, `Venue`
- `DemoFollowups.tsx` — `Followup`
- `ObjectionsBoard.tsx` — `Objection`
- `QuoteIngestion.tsx` — `Source`, `Mapping`, `Supplier`, `Product`, `Pkg`,
  `Zone`
- `DeckExtractionReview.tsx` — `Extraction`, `ExtractionItem`
- `SupplierPacket.tsx` — `Packet`, `ItemSpecs`, `PacketAsset`
- `VendorPortal.tsx` — `Supplier`, `VItem`
- `RequestsList.tsx` — `UnifiedRequest`

## Not a concern (dashboard / aggregate / readiness DTOs)

These shapes are server-aggregated DTOs without a single backing table, so a
shared row type would not help. They should still get OpenAPI-generated
types eventually, but that is a different effort:

- `Dashboard.tsx` `Summary`
- `EmailReadiness.tsx` `Readiness`, `DnsCheck`, `DnsReadiness`
- `LiveReadiness.tsx` `Readiness`, `Check`, `Blocker`
- `DeploymentReadiness.tsx` `Readiness`
- `RolloutStabilization.tsx` `Dashboard`
- `Production.tsx` `DashboardData`
- `AccountBlockers.tsx` `BlockersResp`
- `OperatorRunbook.tsx` `Section`

## Recommended pattern

```ts
import type { OrderRow } from "@workspace/db/schema";
// widen specific fields the form mutates differently than the DB column
type Order = Omit<OrderRow, "totalEstimate"> & { totalEstimate: number | string | null };
```

Numeric (`numeric` / `decimal`) columns come back as `string | null` from
Drizzle, so widen those when the form binds them as numbers. `notNull` text
columns may also need to be widened to `| null` if the editor uses a nullable
picker.
