import { z } from "zod";

export type FieldType = "string" | "number" | "integer" | "boolean" | "email" | "url" | "csvList" | "unit";

export interface ImportField {
  key: string;
  label: string;
  required?: boolean;
  type: FieldType;
  aliases?: string[];
  description?: string;
}

export type Resource = "suppliers" | "products" | "specs" | "venues" | "branding-locations" | "zone-measurements" | "packages";

export const SUPPLIER_FIELDS: ImportField[] = [
  { key: "name", label: "Supplier Name", required: true, type: "string", aliases: ["supplier", "vendor", "vendor name"] },
  { key: "companyName", label: "Company Name", type: "string", aliases: ["company", "legal name", "business name"] },
  { key: "contactName", label: "Contact Name", type: "string", aliases: ["contact", "primary contact"] },
  { key: "contactEmail", label: "Email", type: "email", aliases: ["email", "e-mail", "contact email"] },
  { key: "contactPhone", label: "Phone", type: "string", aliases: ["phone", "telephone", "mobile"] },
  { key: "website", label: "Website", type: "url", aliases: ["url", "site", "web"] },
  { key: "addressLine", label: "Address", type: "string", aliases: ["address", "street", "address line 1"] },
  { key: "city", label: "City", type: "string" },
  { key: "state", label: "State / Province", type: "string", aliases: ["state", "province", "region"] },
  { key: "postalCode", label: "Postal Code", type: "string", aliases: ["postal code", "zip", "zip code", "postcode"] },
  { key: "country", label: "Country", type: "string" },
  { key: "categoriesJson", label: "Categories", type: "csvList", aliases: ["category", "categories"], description: "Comma-separated" },
  { key: "capabilitiesJson", label: "Capabilities", type: "csvList", aliases: ["capability", "capabilities"], description: "Comma-separated" },
  { key: "territoryJson", label: "Territory / Coverage", type: "csvList", aliases: ["territory", "coverage", "regions"], description: "Comma-separated" },
  { key: "defaultLeadTimeDays", label: "Default Lead Time (days)", type: "integer", aliases: ["lead time", "lead time days"] },
  { key: "fulfillmentNotes", label: "Fulfillment Notes", type: "string", aliases: ["fulfillment"] },
  { key: "notes", label: "Notes", type: "string", aliases: ["internal notes", "comments"] },
  { key: "isActive", label: "Active", type: "boolean", aliases: ["active", "enabled", "status"] },
];

export const PRODUCT_FIELDS: ImportField[] = [
  { key: "name", label: "Product Name", required: true, type: "string", aliases: ["product", "product name", "title"] },
  { key: "displayName", label: "Display Name", type: "string", aliases: ["display"] },
  { key: "sku", label: "SKU", type: "string", aliases: ["sku", "code", "item code"] },
  { key: "category", label: "Category", required: true, type: "string", aliases: ["cat", "type"] },
  { key: "description", label: "Description", type: "string", aliases: ["short description", "desc"] },
  { key: "supplierName", label: "Supplier (by name)", type: "string", aliases: ["supplier", "vendor"], description: "Existing supplier name to link" },
  { key: "isActive", label: "Active", type: "boolean", aliases: ["active", "enabled"] },
  { key: "isOrderable", label: "Orderable", type: "boolean" },
  { key: "pricingModel", label: "Pricing Model", type: "string", aliases: ["pricing"] },
  { key: "unitRate", label: "Unit Rate / Price", type: "number", aliases: ["price", "base price", "rate"] },
  { key: "pricingUnit", label: "Pricing Unit", type: "string" },
  { key: "printOnlyAvailable", label: "Print Only Available", type: "boolean", aliases: ["print only"] },
  { key: "hardwareIncluded", label: "Hardware Included", type: "boolean", aliases: ["hardware"] },
  { key: "rentalEligible", label: "Rental Eligible", type: "boolean", aliases: ["rental"] },
  { key: "attachmentMethod", label: "Attachment Method", type: "string", aliases: ["attachment"] },
  { key: "material", label: "Material", type: "string" },
  { key: "finishing", label: "Finishing", type: "string" },
  { key: "leadTimeDays", label: "Lead Time (days)", type: "integer", aliases: ["lead time"] },
  { key: "internalOpsSummary", label: "Internal Ops Notes", type: "string", aliases: ["ops notes", "internal notes"] },
];

export const SPEC_FIELDS: ImportField[] = [
  { key: "name", label: "Product Name (match)", type: "string", aliases: ["product", "name"], description: "Match existing by name if no SKU" },
  { key: "sku", label: "SKU (match)", type: "string", aliases: ["sku"], description: "Preferred match key" },
  { key: "supplierName", label: "Supplier (by name)", type: "string", aliases: ["supplier", "vendor"] },
  { key: "sizeWidth", label: "Width", type: "number", aliases: ["w", "width"] },
  { key: "sizeHeight", label: "Height", type: "number", aliases: ["h", "height"] },
  { key: "sizeDepth", label: "Depth", type: "number", aliases: ["d", "depth"] },
  { key: "sizeDiameter", label: "Diameter", type: "number", aliases: ["dia", "diameter"] },
  { key: "sizeUnit", label: "Size Unit", type: "unit", aliases: ["unit", "units"], description: "in, ft, mm, cm, m" },
  { key: "visibleDimensions", label: "Finished Size (text)", type: "string", aliases: ["finished size", "visible"] },
  { key: "artworkWidth", label: "Artwork Width", type: "number", aliases: ["art w"] },
  { key: "artworkHeight", label: "Artwork Height", type: "number", aliases: ["art h"] },
  { key: "artworkUnit", label: "Artwork Unit", type: "unit" },
  { key: "bleed", label: "Bleed", type: "number" },
  { key: "safeArea", label: "Safe Zone", type: "number", aliases: ["safe zone", "safe area"] },
  { key: "visibleWidth", label: "Visible Width", type: "number" },
  { key: "visibleHeight", label: "Visible Height", type: "number" },
  { key: "packedWidth", label: "Packed Width", type: "number" },
  { key: "packedHeight", label: "Packed Height", type: "number" },
  { key: "packedDepth", label: "Packed Depth", type: "number" },
  { key: "packedSizeUnit", label: "Packed Unit", type: "unit" },
  { key: "shippingWeight", label: "Weight", type: "number", aliases: ["weight"] },
  { key: "shippingWeightUnit", label: "Weight Unit", type: "string", aliases: ["weight unit"], description: "kg, g, lb, oz" },
];

export const VENUE_FIELDS: ImportField[] = [
  { key: "name", label: "Venue Name", required: true, type: "string", aliases: ["venue", "venue name", "site"] },
  { key: "partnerName", label: "Partner (by name)", type: "string", aliases: ["partner", "partner name", "client"], description: "Existing partner name to link" },
  { key: "cityName", label: "City", type: "string", aliases: ["city", "town"] },
  { key: "venueAddress", label: "Venue Address", type: "string", aliases: ["address"] },
  { key: "shippingAddress", label: "Shipping Address", type: "string", aliases: ["ship address"] },
  { key: "country", label: "Country (ISO)", type: "string", aliases: ["country", "country code"], description: "ISO code (US, GB, FR, …)" },
  { key: "unitPreference", label: "Unit Preference", type: "string", aliases: ["units", "measurement system"], description: "imperial or metric" },
  { key: "onsiteContactName", label: "Onsite Contact", type: "string", aliases: ["contact", "site contact"] },
  { key: "onsiteContactPhone", label: "Onsite Phone", type: "string", aliases: ["contact phone"] },
  { key: "onsiteContactEmail", label: "Onsite Email", type: "email", aliases: ["contact email"] },
  { key: "installNotes", label: "Install Notes", type: "string", aliases: ["installation"] },
  { key: "shippingInstructions", label: "Shipping Instructions", type: "string", aliases: ["shipping notes"] },
  { key: "deadlineNotes", label: "Deadline Notes", type: "string" },
  { key: "imageUrl", label: "Image URL", type: "url", aliases: ["image", "photo"] },
  { key: "isActive", label: "Active", type: "boolean", aliases: ["active", "enabled"] },
  { key: "sortOrder", label: "Display Order", type: "integer", aliases: ["order", "sort"] },
];

export const BRANDING_LOCATION_FIELDS: ImportField[] = [
  { key: "name", label: "Zone Name", required: true, type: "string", aliases: ["zone", "location", "branding zone", "name"] },
  { key: "partnerName", label: "Partner (by name)", type: "string", aliases: ["partner", "client"], description: "Required unless importing into a partner context" },
  { key: "internalCode", label: "Zone Code", type: "string", aliases: ["code", "internal code", "ref", "reference"] },
  { key: "category", label: "Category", required: true, type: "string", aliases: ["type", "zone category"] },
  { key: "description", label: "Description", type: "string", aliases: ["short description", "desc"] },
  { key: "sizeWidth", label: "Width", type: "number", aliases: ["w", "width"] },
  { key: "sizeHeight", label: "Height", type: "number", aliases: ["h", "height"] },
  { key: "sizeDepth", label: "Depth", type: "number", aliases: ["d", "depth"] },
  { key: "sizeDiameter", label: "Diameter", type: "number", aliases: ["dia", "diameter"] },
  { key: "sizeUnit", label: "Size Unit", type: "unit", aliases: ["unit", "units"], description: "in, ft, mm, cm, m" },
  { key: "artworkWidth", label: "Artwork Width", type: "number", aliases: ["art w"] },
  { key: "artworkHeight", label: "Artwork Height", type: "number", aliases: ["art h"] },
  { key: "artworkUnit", label: "Artwork Unit", type: "unit" },
  { key: "bleed", label: "Bleed", type: "number" },
  { key: "safeArea", label: "Safe Zone", type: "number", aliases: ["safe zone", "safe area"] },
  { key: "visibleWidth", label: "Visible Width", type: "number" },
  { key: "visibleHeight", label: "Visible Height", type: "number" },
  { key: "pricingModel", label: "Pricing Model", type: "string", aliases: ["pricing"], description: "fixed, per_sqft, per_sqm, custom" },
  { key: "unitRate", label: "Unit Rate / Price", type: "number", aliases: ["price", "base price", "rate"] },
  { key: "pricingUnit", label: "Pricing Unit", type: "string" },
  { key: "minBillableSize", label: "Min Billable Size", type: "number" },
  { key: "minCharge", label: "Min Charge", type: "number" },
  { key: "allowsCustomSize", label: "Allows Custom Size", type: "boolean", aliases: ["custom size", "custom quote"] },
  { key: "defaultSupplierName", label: "Recommended Supplier", type: "string", aliases: ["supplier", "recommended product supplier"] },
  { key: "productionNotesInternal", label: "Production Notes", type: "string", aliases: ["material", "finishing", "attachment", "install method"] },
  { key: "installNotesInternal", label: "Install Notes", type: "string", aliases: ["install"] },
  { key: "artworkGuidelines", label: "Artwork Guidelines", type: "string" },
  { key: "reviewStatus", label: "Review Status", type: "string", description: "needs_review, approved, rejected" },
  { key: "isActive", label: "Active", type: "boolean", aliases: ["active", "enabled"] },
  { key: "sortOrder", label: "Display Order", type: "integer", aliases: ["order", "sort"] },
];

export const ZONE_MEASUREMENT_FIELDS: ImportField[] = [
  { key: "name", label: "Zone Name (match)", type: "string", aliases: ["zone", "location"], description: "Match existing zone by name when no code" },
  { key: "internalCode", label: "Zone Code (match)", type: "string", aliases: ["code", "ref"], description: "Preferred match key" },
  { key: "partnerName", label: "Partner (by name)", type: "string", aliases: ["partner"], description: "Required unless importing into a partner context" },
  { key: "sizeWidth", label: "Width", type: "number", aliases: ["w"] },
  { key: "sizeHeight", label: "Height", type: "number", aliases: ["h"] },
  { key: "sizeDepth", label: "Depth", type: "number" },
  { key: "sizeDiameter", label: "Diameter", type: "number" },
  { key: "sizeUnit", label: "Size Unit", type: "unit", description: "in, ft, mm, cm, m" },
  { key: "artworkWidth", label: "Artwork Width", type: "number" },
  { key: "artworkHeight", label: "Artwork Height", type: "number" },
  { key: "artworkUnit", label: "Artwork Unit", type: "unit" },
  { key: "bleed", label: "Bleed", type: "number" },
  { key: "safeArea", label: "Safe Zone", type: "number" },
  { key: "visibleWidth", label: "Visible Width", type: "number" },
  { key: "visibleHeight", label: "Visible Height", type: "number" },
];

export const PACKAGE_FIELDS: ImportField[] = [
  { key: "packageName", label: "Package Name", type: "string", aliases: ["package", "name", "bundle", "bundle name"], description: "Required on the first row of each package; subsequent itemized rows may leave it blank to inherit" },
  { key: "packageCode", label: "Package Code", type: "string", aliases: ["code", "package id", "internal code", "ref"], description: "Optional unique code; preferred match key when present" },
  { key: "partnerName", label: "Partner / Client (by name)", type: "string", aliases: ["partner", "client", "customer"], description: "Required unless importing into a partner profile" },
  { key: "displayName", label: "Display Name", type: "string", aliases: ["display", "label"] },
  { key: "tier", label: "Package Tier", type: "integer", aliases: ["tier", "level"], description: "1-10" },
  { key: "description", label: "Package Description", type: "string", aliases: ["desc", "details"] },
  { key: "category", label: "Package Category", type: "string", aliases: ["cat", "type"] },
  { key: "supplierName", label: "Vendor / Source", type: "string", aliases: ["supplier", "vendor", "source"] },
  { key: "price", label: "Package Price", type: "number", aliases: ["price", "package price", "total"] },
  { key: "currency", label: "Currency", type: "string", aliases: ["ccy"] },
  { key: "sizeWidth", label: "Width", type: "number", aliases: ["w"] },
  { key: "sizeHeight", label: "Height", type: "number", aliases: ["h"] },
  { key: "sizeDepth", label: "Depth", type: "number" },
  { key: "sizeDiameter", label: "Diameter", type: "number" },
  { key: "sizeUnit", label: "Size Unit", type: "unit", description: "in, ft, mm, cm, m" },
  { key: "imageUrl", label: "Image URL", type: "url" },
  { key: "city", label: "City Applicability", type: "string", aliases: ["cities"] },
  { key: "venue", label: "Venue Applicability", type: "string", aliases: ["venues"] },
  { key: "notes", label: "Package Notes", type: "string", aliases: ["package notes"] },
  { key: "isActive", label: "Active", type: "boolean", aliases: ["active", "enabled", "status"] },
  // Item-level columns (each row that has any of these becomes a package item)
  { key: "itemName", label: "Item Name", type: "string", aliases: ["product", "product name", "item", "included item"] },
  { key: "itemSku", label: "Item SKU", type: "string", aliases: ["sku", "item code"] },
  { key: "itemCategory", label: "Item Category", type: "string", aliases: ["product category"] },
  { key: "quantity", label: "Quantity", type: "integer", aliases: ["qty", "count"] },
  { key: "isOptional", label: "Optional Add-on", type: "boolean", aliases: ["optional", "add-on", "addon"] },
  { key: "itemNotes", label: "Item Notes", type: "string", aliases: ["notes per item"] },
  { key: "itemWidth", label: "Item Width", type: "number" },
  { key: "itemHeight", label: "Item Height", type: "number" },
  { key: "itemDepth", label: "Item Depth", type: "number" },
  { key: "itemDiameter", label: "Item Diameter", type: "number" },
  { key: "itemSizeUnit", label: "Item Size Unit", type: "unit" },
  { key: "itemMaterial", label: "Item Material", type: "string", aliases: ["material"] },
  { key: "itemFinishing", label: "Item Finishing", type: "string", aliases: ["finishing", "finish"] },
  { key: "itemHardwareIncluded", label: "Hardware Included", type: "boolean", aliases: ["hardware"] },
  { key: "itemPrintOnly", label: "Print Only", type: "boolean", aliases: ["print only"] },
  { key: "itemRentalEligible", label: "Rental Eligible", type: "boolean", aliases: ["rental"] },
  { key: "itemPrice", label: "Item Price", type: "number", aliases: ["base price", "unit price"] },
];

export const FIELDS_BY_RESOURCE: Record<Resource, ImportField[]> = {
  suppliers: SUPPLIER_FIELDS,
  products: PRODUCT_FIELDS,
  specs: SPEC_FIELDS,
  venues: VENUE_FIELDS,
  "branding-locations": BRANDING_LOCATION_FIELDS,
  "zone-measurements": ZONE_MEASUREMENT_FIELDS,
  packages: PACKAGE_FIELDS,
};

const VALID_LENGTH_UNITS = new Set(["in", "ft", "mm", "cm", "m"]);
const VALID_WEIGHT_UNITS = new Set(["g", "kg", "lb", "oz"]);

export function normalizeUnit(raw: string): string | null {
  const v = raw.trim().toLowerCase().replace(/[\."]/g, "").replace(/inches?$/, "in").replace(/feet|foot/, "ft")
    .replace(/millimeters?|millimetres?/, "mm").replace(/centimeters?|centimetres?/, "cm").replace(/meters?|metres?/, "m");
  return VALID_LENGTH_UNITS.has(v) ? v : null;
}

export function coerceValue(value: unknown, field: ImportField): { ok: true; value: unknown } | { ok: false; error: string } {
  if (value === null || value === undefined || value === "") {
    if (field.required) return { ok: false, error: `${field.label} is required` };
    return { ok: true, value: null };
  }
  const raw = typeof value === "string" ? value.trim() : value;
  switch (field.type) {
    case "string":
      return { ok: true, value: String(raw) };
    case "email": {
      const s = String(raw);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { ok: false, error: `${field.label} is not a valid email` };
      return { ok: true, value: s };
    }
    case "url": {
      const s = String(raw);
      if (!/^https?:\/\//i.test(s) && !/^[\w.-]+\.[a-z]{2,}/i.test(s)) return { ok: false, error: `${field.label} is not a valid URL` };
      return { ok: true, value: s };
    }
    case "number": {
      const n = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/,/g, ""));
      if (!Number.isFinite(n)) return { ok: false, error: `${field.label} must be a number` };
      return { ok: true, value: n };
    }
    case "integer": {
      const n = typeof raw === "number" ? raw : parseInt(String(raw).replace(/,/g, ""), 10);
      if (!Number.isFinite(n)) return { ok: false, error: `${field.label} must be a whole number` };
      return { ok: true, value: Math.trunc(n) };
    }
    case "boolean": {
      const s = String(raw).toLowerCase();
      if (["true", "yes", "y", "1", "active", "on"].includes(s)) return { ok: true, value: true };
      if (["false", "no", "n", "0", "inactive", "off"].includes(s)) return { ok: true, value: false };
      return { ok: false, error: `${field.label} must be yes/no` };
    }
    case "csvList": {
      const arr = String(raw).split(/[,;|]/).map(s => s.trim()).filter(Boolean);
      return { ok: true, value: arr };
    }
    case "unit": {
      const u = normalizeUnit(String(raw));
      if (!u) return { ok: false, error: `${field.label} must be one of: in, ft, mm, cm, m` };
      return { ok: true, value: u };
    }
  }
}

export function autoMapHeaders(headers: string[], fields: ImportField[]): Record<string, string> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const map: Record<string, string> = {};
  for (const h of headers) {
    const nh = norm(h);
    let best: string | null = null;
    for (const f of fields) {
      const candidates = [f.key, f.label, ...(f.aliases || [])].map(norm);
      if (candidates.includes(nh)) { best = f.key; break; }
    }
    if (best) map[h] = best;
  }
  return map;
}

export const ParseRequest = z.object({}); // multipart - validated separately
export const CommitRequest = z.object({
  resource: z.enum(["suppliers", "products", "specs"]),
  mode: z.enum(["create", "update", "upsert"]).default("upsert"),
  rows: z.array(z.record(z.string(), z.any())).max(5000),
});
export type CommitBody = z.infer<typeof CommitRequest>;
