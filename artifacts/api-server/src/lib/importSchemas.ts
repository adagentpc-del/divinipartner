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

export type Resource = "suppliers" | "products" | "specs";

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

export const FIELDS_BY_RESOURCE: Record<Resource, ImportField[]> = {
  suppliers: SUPPLIER_FIELDS,
  products: PRODUCT_FIELDS,
  specs: SPEC_FIELDS,
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
