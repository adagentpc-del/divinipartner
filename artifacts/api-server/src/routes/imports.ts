import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { eq, sql, ilike, or, and } from "drizzle-orm";
import { db, suppliersTable, productCatalogTable, venuesTable, citiesTable, partnersTable, partnerBrandingLocationsTable, withMmColumns, withWeightColumns } from "@workspace/db";
import { z } from "zod";
import { parseBuffer, buildCsvTemplate } from "../lib/importParse";
import {
  FIELDS_BY_RESOURCE,
  SUPPLIER_FIELDS,
  PRODUCT_FIELDS,
  SPEC_FIELDS,
  VENUE_FIELDS,
  BRANDING_LOCATION_FIELDS,
  ZONE_MEASUREMENT_FIELDS,
  autoMapHeaders,
  coerceValue,
  type Resource,
  type ImportField,
} from "../lib/importSchemas";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router: IRouter = Router();

const ResourceParam = z.enum(["suppliers", "products", "specs", "venues", "branding-locations", "zone-measurements"]);

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || `row-${Date.now()}`;
}

router.get("/imports/fields/:resource", (req: Request, res: Response): void => {
  const r = ResourceParam.safeParse(req.params.resource);
  if (!r.success) { res.status(400).json({ error: "Invalid resource" }); return; }
  res.json({ fields: FIELDS_BY_RESOURCE[r.data] });
});

router.get("/imports/template/:resource", (req: Request, res: Response): void => {
  const r = ResourceParam.safeParse(req.params.resource);
  if (!r.success) { res.status(400).json({ error: "Invalid resource" }); return; }
  const fields = FIELDS_BY_RESOURCE[r.data];
  const samples = SAMPLES[r.data];
  const csv = buildCsvTemplate(fields.map(f => f.label), samples);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${r.data}-import-template.csv"`);
  res.send(csv);
});

router.post("/imports/parse", upload.single("file"), async (req: Request, res: Response): Promise<void> => {
  const r = ResourceParam.safeParse(req.body.resource);
  if (!r.success) { res.status(400).json({ error: "Invalid resource" }); return; }
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
  const lower = req.file.originalname.toLowerCase();
  if (!/\.(csv|tsv|xlsx|xls)$/.test(lower)) { res.status(415).json({ error: "Unsupported file type. Use CSV or XLSX." }); return; }
  try {
    const sheet = parseBuffer(req.file.buffer, req.file.originalname);
    const fields = FIELDS_BY_RESOURCE[r.data];
    const suggestedMap = autoMapHeaders(sheet.headers, fields);
    res.json({ ...sheet, suggestedMap, sample: sheet.rows.slice(0, 25) });
  } catch (e: any) {
    req.log.error({ err: e }, "Import parse failed");
    res.status(400).json({ error: `Parse failed: ${e.message}` });
  }
});

const CommitBody = z.object({
  resource: ResourceParam,
  mode: z.enum(["create", "update", "upsert"]).default("upsert"),
  rows: z.array(z.record(z.string(), z.any())).max(5000),
  context: z.object({
    partnerId: z.number().int().optional(),
    venueId: z.number().int().optional(),
  }).optional(),
});

router.post("/imports/commit", async (req: Request, res: Response): Promise<void> => {
  const parsed = CommitBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { resource, mode, rows, context } = parsed.data;
  try {
    const result =
      resource === "suppliers" ? await commitSuppliers(rows, mode)
      : resource === "products" ? await commitProducts(rows, mode)
      : resource === "specs" ? await commitSpecs(rows, mode)
      : resource === "venues" ? await commitVenues(rows, mode, context)
      : resource === "branding-locations" ? await commitBrandingLocations(rows, mode, context)
      : await commitZoneMeasurements(rows, mode, context);
    res.json(result);
  } catch (e: any) {
    req.log.error({ err: e }, "Import commit failed");
    res.status(500).json({ error: e.message });
  }
});

interface CommitResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: { row: number; error: string; data?: any }[];
  createdIds: number[];
  updatedIds: number[];
}

function validateRow(row: Record<string, unknown>, fields: ImportField[]): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  const data: Record<string, unknown> = {};
  for (const f of fields) {
    if (!(f.key in row) && !f.required) continue;
    const v = row[f.key];
    const r = coerceValue(v, f);
    if (!r.ok) return { ok: false, error: r.error };
    if (r.value !== null && r.value !== undefined) data[f.key] = r.value;
    else if (f.required) return { ok: false, error: `${f.label} is required` };
  }
  return { ok: true, data };
}

async function commitSuppliers(rows: Record<string, unknown>[], mode: "create" | "update" | "upsert"): Promise<CommitResult> {
  const result: CommitResult = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [], createdIds: [], updatedIds: [] };
  await db.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i++) {
      const v = validateRow(rows[i], SUPPLIER_FIELDS);
      if (!v.ok) { result.failed++; result.errors.push({ row: i + 2, error: v.error }); continue; }
      const data = v.data as any;
      if (!data.name) { result.failed++; result.errors.push({ row: i + 2, error: "Supplier Name is required" }); continue; }
      try {
        const existing = await tx.select({ id: suppliersTable.id }).from(suppliersTable)
          .where(or(eq(suppliersTable.name, data.name), data.contactEmail ? eq(suppliersTable.contactEmail, data.contactEmail) : sql`false`))
          .limit(1);
        if (existing.length > 0) {
          if (mode === "create") { result.skipped++; continue; }
          const [row] = await tx.update(suppliersTable).set(data).where(eq(suppliersTable.id, existing[0].id)).returning({ id: suppliersTable.id });
          result.updated++; result.updatedIds.push(row.id);
        } else {
          if (mode === "update") { result.skipped++; continue; }
          const [row] = await tx.insert(suppliersTable).values({ ...data, slug: data.slug || slugify(data.name) }).returning({ id: suppliersTable.id });
          result.created++; result.createdIds.push(row.id);
        }
      } catch (e: any) {
        result.failed++; result.errors.push({ row: i + 2, error: e.message });
      }
    }
  });
  return result;
}

async function resolveSupplierId(tx: typeof db, name: string | undefined): Promise<number | null> {
  if (!name) return null;
  const [s] = await tx.select({ id: suppliersTable.id }).from(suppliersTable).where(ilike(suppliersTable.name, name)).limit(1);
  return s?.id ?? null;
}

async function commitProducts(rows: Record<string, unknown>[], mode: "create" | "update" | "upsert"): Promise<CommitResult> {
  const result: CommitResult = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [], createdIds: [], updatedIds: [] };
  await db.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i++) {
      const v = validateRow(rows[i], PRODUCT_FIELDS);
      if (!v.ok) { result.failed++; result.errors.push({ row: i + 2, error: v.error }); continue; }
      const data = v.data as any;
      if (!data.name) { result.failed++; result.errors.push({ row: i + 2, error: "Product Name is required" }); continue; }
      if (!data.category) { result.failed++; result.errors.push({ row: i + 2, error: "Category is required" }); continue; }
      try {
        const supplierName = data.supplierName as string | undefined;
        delete data.supplierName;
        if (supplierName) {
          const sid = await resolveSupplierId(tx as any, supplierName);
          if (!sid) { result.failed++; result.errors.push({ row: i + 2, error: `Supplier "${supplierName}" not found — create it first` }); continue; }
          data.supplierId = sid;
        }
        const matchConds = [];
        if (data.sku) matchConds.push(eq(productCatalogTable.sku, data.sku));
        matchConds.push(eq(productCatalogTable.name, data.name));
        const existing = await tx.select({ id: productCatalogTable.id }).from(productCatalogTable)
          .where(matchConds.length === 1 ? matchConds[0] : or(...matchConds)).limit(1);
        if (existing.length > 0) {
          if (mode === "create") { result.skipped++; continue; }
          const [row] = await tx.update(productCatalogTable).set(data).where(eq(productCatalogTable.id, existing[0].id)).returning({ id: productCatalogTable.id });
          result.updated++; result.updatedIds.push(row.id);
        } else {
          if (mode === "update") { result.skipped++; continue; }
          const [row] = await tx.insert(productCatalogTable).values({ ...data, slug: data.slug || slugify(data.name) }).returning({ id: productCatalogTable.id });
          result.created++; result.createdIds.push(row.id);
        }
      } catch (e: any) {
        result.failed++; result.errors.push({ row: i + 2, error: e.message });
      }
    }
  });
  return result;
}

async function commitSpecs(rows: Record<string, unknown>[], mode: "create" | "update" | "upsert"): Promise<CommitResult> {
  const result: CommitResult = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [], createdIds: [], updatedIds: [] };
  await db.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i++) {
      const v = validateRow(rows[i], SPEC_FIELDS);
      if (!v.ok) { result.failed++; result.errors.push({ row: i + 2, error: v.error }); continue; }
      const data = v.data as any;
      if (!data.name && !data.sku) { result.failed++; result.errors.push({ row: i + 2, error: "Provide SKU or Product Name" }); continue; }
      try {
        const supplierName = data.supplierName as string | undefined;
        delete data.supplierName;
        const conds = [];
        if (data.sku) conds.push(eq(productCatalogTable.sku, data.sku));
        if (data.name) conds.push(eq(productCatalogTable.name, data.name));
        const existing = await tx.select({ id: productCatalogTable.id, sizeUnit: productCatalogTable.sizeUnit, packedSizeUnit: productCatalogTable.packedSizeUnit, shippingWeightUnit: productCatalogTable.shippingWeightUnit, artworkUnit: productCatalogTable.artworkUnit })
          .from(productCatalogTable).where(conds.length === 1 ? conds[0] : or(...conds)).limit(1);
        const writePayload: any = { ...data };
        if (supplierName) {
          const sid = await resolveSupplierId(tx as any, supplierName);
          if (sid) writePayload.supplierId = sid;
        }
        const exec = withWeightColumns(withMmColumns(writePayload, existing[0] || {}), existing[0] || {});
        if (existing.length > 0) {
          if (mode === "create") { result.skipped++; continue; }
          const [row] = await tx.update(productCatalogTable).set(exec).where(eq(productCatalogTable.id, existing[0].id)).returning({ id: productCatalogTable.id });
          result.updated++; result.updatedIds.push(row.id);
        } else {
          if (mode === "update") { result.skipped++; result.errors.push({ row: i + 2, error: `No matching product for "${data.sku || data.name}"` }); continue; }
          if (!data.name) { result.failed++; result.errors.push({ row: i + 2, error: "Cannot create new product spec without Product Name" }); continue; }
          const [row] = await tx.insert(productCatalogTable).values({ ...exec, slug: slugify(data.name), category: data.category || "uncategorized" }).returning({ id: productCatalogTable.id });
          result.created++; result.createdIds.push(row.id);
        }
      } catch (e: any) {
        result.failed++; result.errors.push({ row: i + 2, error: e.message });
      }
    }
  });
  return result;
}

async function resolvePartnerId(tx: typeof db, name: string | undefined): Promise<number | null> {
  if (!name) return null;
  const [p] = await tx.select({ id: partnersTable.id }).from(partnersTable)
    .where(or(ilike(partnersTable.companyName, name), ilike(partnersTable.slug, name))).limit(1);
  return p?.id ?? null;
}

async function resolveCityId(tx: typeof db, partnerId: number | null, name: string | undefined): Promise<number | null> {
  if (!name) return null;
  const conds = [ilike(citiesTable.name, name)];
  if (partnerId) conds.push(eq(citiesTable.partnerId, partnerId));
  const [c] = await tx.select({ id: citiesTable.id }).from(citiesTable).where(and(...conds)).limit(1);
  return c?.id ?? null;
}

async function commitVenues(rows: Record<string, unknown>[], mode: "create" | "update" | "upsert", context?: { partnerId?: number; venueId?: number }): Promise<CommitResult> {
  const result: CommitResult = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [], createdIds: [], updatedIds: [] };
  await db.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i++) {
      const v = validateRow(rows[i], VENUE_FIELDS);
      if (!v.ok) { result.failed++; result.errors.push({ row: i + 2, error: v.error }); continue; }
      const data = v.data as any;
      if (!data.name) { result.failed++; result.errors.push({ row: i + 2, error: "Venue Name is required" }); continue; }
      try {
        const partnerName = data.partnerName as string | undefined; delete data.partnerName;
        const cityName = data.cityName as string | undefined; delete data.cityName;
        let partnerId = context?.partnerId ?? null;
        if (!partnerId && partnerName) {
          partnerId = await resolvePartnerId(tx as any, partnerName);
          if (!partnerId) { result.failed++; result.errors.push({ row: i + 2, error: `Partner "${partnerName}" not found — flagged for review` }); continue; }
        }
        if (partnerId) data.partnerId = partnerId;
        if (cityName) {
          const cid = await resolveCityId(tx as any, partnerId, cityName);
          if (!cid) { result.failed++; result.errors.push({ row: i + 2, error: `City "${cityName}" not found for this partner — flagged for review` }); continue; }
          data.cityId = cid;
        }
        if (data.unitPreference) {
          const u = String(data.unitPreference).toLowerCase();
          if (u !== "imperial" && u !== "metric") { result.failed++; result.errors.push({ row: i + 2, error: "Unit Preference must be imperial or metric" }); continue; }
          data.unitPreference = u;
        }
        if (!partnerId) { result.failed++; result.errors.push({ row: i + 2, error: "Partner is required (provide a Partner column or import from a partner page)" }); continue; }
        const existing = await tx.select({ id: venuesTable.id }).from(venuesTable)
          .where(and(eq(venuesTable.name, data.name), eq(venuesTable.partnerId, partnerId))).limit(1);
        if (existing.length > 0) {
          if (mode === "create") { result.skipped++; continue; }
          const [row] = await tx.update(venuesTable).set(data).where(eq(venuesTable.id, existing[0].id)).returning({ id: venuesTable.id });
          result.updated++; result.updatedIds.push(row.id);
        } else {
          if (mode === "update") { result.skipped++; continue; }
          const [row] = await tx.insert(venuesTable).values(data).returning({ id: venuesTable.id });
          result.created++; result.createdIds.push(row.id);
        }
      } catch (e: any) {
        result.failed++; result.errors.push({ row: i + 2, error: e.message });
      }
    }
  });
  return result;
}

async function commitBrandingLocations(rows: Record<string, unknown>[], mode: "create" | "update" | "upsert", context?: { partnerId?: number; venueId?: number }): Promise<CommitResult> {
  const result: CommitResult = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [], createdIds: [], updatedIds: [] };
  await db.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i++) {
      const v = validateRow(rows[i], BRANDING_LOCATION_FIELDS);
      if (!v.ok) { result.failed++; result.errors.push({ row: i + 2, error: v.error }); continue; }
      const data = v.data as any;
      try {
        const partnerName = data.partnerName as string | undefined; delete data.partnerName;
        const supplierName = data.defaultSupplierName as string | undefined; delete data.defaultSupplierName;
        let partnerId = context?.partnerId ?? null;
        if (!partnerId && partnerName) {
          partnerId = await resolvePartnerId(tx as any, partnerName);
          if (!partnerId) { result.failed++; result.errors.push({ row: i + 2, error: `Partner "${partnerName}" not found — flagged for review` }); continue; }
        }
        if (!partnerId) { result.failed++; result.errors.push({ row: i + 2, error: "Partner is required (provide a Partner column or import from a partner page)" }); continue; }
        data.partnerId = partnerId;
        if (supplierName) {
          const sid = await resolveSupplierId(tx as any, supplierName);
          if (sid) data.defaultSupplierId = sid;
        }
        const baseCols = { id: partnerBrandingLocationsTable.id, sizeUnit: partnerBrandingLocationsTable.sizeUnit, artworkUnit: partnerBrandingLocationsTable.artworkUnit };
        let existing: { id: number; sizeUnit: string | null; artworkUnit: string | null }[] = [];
        if (data.internalCode) {
          existing = await tx.select(baseCols).from(partnerBrandingLocationsTable)
            .where(and(eq(partnerBrandingLocationsTable.partnerId, partnerId), eq(partnerBrandingLocationsTable.internalCode, data.internalCode))).limit(1);
        }
        if (existing.length === 0 && data.name) {
          existing = await tx.select(baseCols).from(partnerBrandingLocationsTable)
            .where(and(eq(partnerBrandingLocationsTable.partnerId, partnerId), eq(partnerBrandingLocationsTable.name, data.name))).limit(1);
        }
        const exec = withMmColumns(data, existing[0] || {});
        if (existing.length > 0) {
          if (mode === "create") { result.skipped++; continue; }
          const [row] = await tx.update(partnerBrandingLocationsTable).set(exec).where(eq(partnerBrandingLocationsTable.id, existing[0].id)).returning({ id: partnerBrandingLocationsTable.id });
          result.updated++; result.updatedIds.push(row.id);
        } else {
          if (mode === "update") { result.skipped++; continue; }
          if (!data.name) { result.failed++; result.errors.push({ row: i + 2, error: "Zone Name is required to create" }); continue; }
          if (!data.category) { result.failed++; result.errors.push({ row: i + 2, error: "Category is required to create" }); continue; }
          const [row] = await tx.insert(partnerBrandingLocationsTable).values(exec).returning({ id: partnerBrandingLocationsTable.id });
          result.created++; result.createdIds.push(row.id);
        }
      } catch (e: any) {
        result.failed++; result.errors.push({ row: i + 2, error: e.message });
      }
    }
  });
  return result;
}

async function commitZoneMeasurements(rows: Record<string, unknown>[], _mode: "create" | "update" | "upsert", context?: { partnerId?: number; venueId?: number }): Promise<CommitResult> {
  const result: CommitResult = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [], createdIds: [], updatedIds: [] };
  await db.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i++) {
      const v = validateRow(rows[i], ZONE_MEASUREMENT_FIELDS);
      if (!v.ok) { result.failed++; result.errors.push({ row: i + 2, error: v.error }); continue; }
      const data = v.data as any;
      if (!data.name && !data.internalCode) { result.failed++; result.errors.push({ row: i + 2, error: "Provide Zone Code or Zone Name" }); continue; }
      try {
        const partnerName = data.partnerName as string | undefined; delete data.partnerName;
        let partnerId = context?.partnerId ?? null;
        if (!partnerId && partnerName) {
          partnerId = await resolvePartnerId(tx as any, partnerName);
          if (!partnerId) { result.failed++; result.errors.push({ row: i + 2, error: `Partner "${partnerName}" not found — flagged for review` }); continue; }
        }
        if (!partnerId) { result.failed++; result.errors.push({ row: i + 2, error: "Partner is required (provide a Partner column or import from a partner page)" }); continue; }
        const baseCols = { id: partnerBrandingLocationsTable.id, sizeUnit: partnerBrandingLocationsTable.sizeUnit, artworkUnit: partnerBrandingLocationsTable.artworkUnit };
        let existing: { id: number; sizeUnit: string | null; artworkUnit: string | null }[] = [];
        if (data.internalCode) {
          existing = await tx.select(baseCols).from(partnerBrandingLocationsTable)
            .where(and(eq(partnerBrandingLocationsTable.partnerId, partnerId), eq(partnerBrandingLocationsTable.internalCode, data.internalCode))).limit(1);
        }
        if (existing.length === 0 && data.name) {
          existing = await tx.select(baseCols).from(partnerBrandingLocationsTable)
            .where(and(eq(partnerBrandingLocationsTable.partnerId, partnerId), eq(partnerBrandingLocationsTable.name, data.name))).limit(1);
        }
        if (existing.length === 0) {
          result.skipped++;
          result.errors.push({ row: i + 2, error: `No matching zone for "${data.internalCode || data.name}" under this partner — flagged for review` });
          continue;
        }
        const updatePayload = { ...data };
        delete updatePayload.name; delete updatePayload.internalCode;
        const exec = withMmColumns(updatePayload, existing[0]);
        const [row] = await tx.update(partnerBrandingLocationsTable).set(exec).where(eq(partnerBrandingLocationsTable.id, existing[0].id)).returning({ id: partnerBrandingLocationsTable.id });
        result.updated++; result.updatedIds.push(row.id);
      } catch (e: any) {
        result.failed++; result.errors.push({ row: i + 2, error: e.message });
      }
    }
  });
  return result;
}

const SAMPLES: Record<Resource, Record<string, string>[]> = {
  suppliers: [
    { "Supplier Name": "Bright Banner Co", "Company Name": "Bright Banner LLC", "Contact Name": "Sam Patel", "Email": "sam@brightbanner.com", "Phone": "+1 555-0101", "Website": "https://brightbanner.com", "Address": "123 Print Way", "City": "Austin", "State / Province": "TX", "Postal Code": "78701", "Country": "USA", "Categories": "banners,signage", "Capabilities": "large-format,vinyl", "Territory / Coverage": "TX,OK,NM", "Default Lead Time (days)": "5", "Active": "yes" },
    { "Supplier Name": "Euro Display Group", "Company Name": "Euro Display GmbH", "Contact Name": "Lena Müller", "Email": "lena@eurodisplay.eu", "Phone": "+49 30 555 0102", "Website": "https://eurodisplay.eu", "Address": "Hauptstr. 12", "City": "Berlin", "State / Province": "BE", "Postal Code": "10115", "Country": "Germany", "Categories": "tradeshow,modular", "Capabilities": "modular,backlit", "Territory / Coverage": "EU", "Default Lead Time (days)": "10", "Active": "yes" },
  ],
  products: [
    { "Product Name": "Retractable Banner 33in", "Display Name": "Standard Retractable", "SKU": "RB-33", "Category": "banners", "Description": "33-inch retractable banner stand with print", "Supplier (by name)": "Bright Banner Co", "Active": "yes", "Orderable": "yes", "Pricing Model": "fixed", "Unit Rate / Price": "189.00", "Pricing Unit": "per_unit", "Print Only Available": "yes", "Hardware Included": "yes", "Rental Eligible": "no", "Attachment Method": "clip", "Material": "vinyl", "Finishing": "matte", "Lead Time (days)": "5", "Internal Ops Notes": "Ship in carton" },
    { "Product Name": "Modular Backwall 10ft", "Display Name": "10ft Modular Backwall", "SKU": "MBW-10", "Category": "tradeshow", "Description": "Tension-fabric backwall, 10ft", "Supplier (by name)": "Euro Display Group", "Active": "yes", "Orderable": "yes", "Pricing Model": "fixed", "Unit Rate / Price": "1450.00", "Pricing Unit": "per_unit", "Print Only Available": "no", "Hardware Included": "yes", "Rental Eligible": "yes", "Attachment Method": "velcro", "Material": "tension-fabric", "Finishing": "stretch", "Lead Time (days)": "10", "Internal Ops Notes": "Includes hard case" },
  ],
  specs: [
    { "Product Name (match)": "Retractable Banner 33in", "SKU (match)": "RB-33", "Supplier (by name)": "Bright Banner Co", "Width": "33", "Height": "78.74", "Size Unit": "in", "Finished Size (text)": "33\" x 78.74\"", "Artwork Width": "33", "Artwork Height": "80", "Artwork Unit": "in", "Bleed": "0.125", "Safe Zone": "0.5", "Visible Width": "33", "Visible Height": "78.74", "Packed Width": "37", "Packed Height": "6", "Packed Depth": "6", "Packed Unit": "in", "Weight": "8", "Weight Unit": "lb" },
    { "Product Name (match)": "Modular Backwall 10ft", "SKU (match)": "MBW-10", "Supplier (by name)": "Euro Display Group", "Width": "3", "Height": "2.3", "Depth": "0.5", "Size Unit": "m", "Finished Size (text)": "3m x 2.3m", "Artwork Width": "3", "Artwork Height": "2.3", "Artwork Unit": "m", "Bleed": "5", "Safe Zone": "20", "Visible Width": "3", "Visible Height": "2.3", "Packed Width": "120", "Packed Height": "30", "Packed Depth": "30", "Packed Unit": "cm", "Weight": "32", "Weight Unit": "kg" },
  ],
  venues: [
    { "Venue Name": "Convention Center West Hall", "Partner (by name)": "Acme Events", "City": "Austin", "Venue Address": "500 E Cesar Chavez St, Austin, TX 78701", "Shipping Address": "500 E Cesar Chavez St — Loading Dock 4", "Country (ISO)": "US", "Unit Preference": "imperial", "Onsite Contact": "Maria Lopez", "Onsite Phone": "+1 555-0140", "Onsite Email": "maria@venue.example", "Install Notes": "Use freight elevator B", "Shipping Instructions": "Deliver after 7am", "Deadline Notes": "Setup must finish by 4pm day-prior", "Image URL": "", "Active": "yes", "Display Order": "1" },
    { "Venue Name": "Messe Berlin Hall 7", "Partner (by name)": "Acme Events", "City": "Berlin", "Venue Address": "Messedamm 22, 14055 Berlin", "Shipping Address": "Messedamm 22, Tor 17", "Country (ISO)": "DE", "Unit Preference": "metric", "Onsite Contact": "Jonas Weber", "Onsite Phone": "+49 30 555 0142", "Onsite Email": "jonas@venue.example", "Install Notes": "Forklift available", "Shipping Instructions": "Coordinate with hall ops 48h prior", "Deadline Notes": "", "Image URL": "", "Active": "yes", "Display Order": "2" },
  ],
  "branding-locations": [
    { "Zone Name": "Main Stage Backdrop", "Partner (by name)": "Acme Events", "Zone Code": "STG-BACK-01", "Category": "stage", "Description": "Primary stage backdrop visible to camera", "Width": "20", "Height": "10", "Size Unit": "ft", "Artwork Width": "240", "Artwork Height": "120", "Artwork Unit": "in", "Bleed": "0.5", "Safe Zone": "2", "Visible Width": "20", "Visible Height": "10", "Pricing Model": "fixed", "Unit Rate / Price": "2400", "Pricing Unit": "per_unit", "Min Billable Size": "", "Min Charge": "", "Allows Custom Size": "no", "Recommended Supplier": "Bright Banner Co", "Production Notes": "Tension-fabric, single-piece print", "Install Notes": "Mount with bungees to existing frame", "Artwork Guidelines": "Provide CMYK PDF at 100%", "Review Status": "approved", "Active": "yes", "Display Order": "1" },
    { "Zone Name": "Entrance Arch Wrap", "Partner (by name)": "Acme Events", "Zone Code": "ENT-ARCH-01", "Category": "entrance", "Description": "Front-facing wrap on main entrance arch", "Width": "5", "Height": "3", "Size Unit": "m", "Artwork Width": "5", "Artwork Height": "3", "Artwork Unit": "m", "Bleed": "5", "Safe Zone": "20", "Visible Width": "5", "Visible Height": "3", "Pricing Model": "per_sqm", "Unit Rate / Price": "85", "Pricing Unit": "per_sqm", "Min Billable Size": "10", "Min Charge": "850", "Allows Custom Size": "yes", "Recommended Supplier": "Euro Display Group", "Production Notes": "Vinyl wrap with laminated finish", "Install Notes": "Squeegee install, two installers", "Artwork Guidelines": "Allow 50mm safe area on all edges", "Review Status": "needs_review", "Active": "yes", "Display Order": "2" },
  ],
  "zone-measurements": [
    { "Zone Name (match)": "Main Stage Backdrop", "Zone Code (match)": "STG-BACK-01", "Partner (by name)": "Acme Events", "Width": "20", "Height": "10", "Size Unit": "ft", "Artwork Width": "240", "Artwork Height": "120", "Artwork Unit": "in", "Bleed": "0.5", "Safe Zone": "2", "Visible Width": "19.5", "Visible Height": "9.75" },
    { "Zone Name (match)": "Entrance Arch Wrap", "Zone Code (match)": "ENT-ARCH-01", "Partner (by name)": "Acme Events", "Width": "5", "Height": "3", "Size Unit": "m", "Artwork Width": "5000", "Artwork Height": "3000", "Artwork Unit": "mm", "Bleed": "5", "Safe Zone": "20", "Visible Width": "4.95", "Visible Height": "2.95" },
  ],
};

export default router;
