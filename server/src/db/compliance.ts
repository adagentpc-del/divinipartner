/**
 * Phase 8 - Compliance data-access (blueprint 30 + availability 29).
 *
 * Three concerns, one module:
 *   1. DOCUMENTS / COI / W-9  - the `documents` table (extended in
 *      schema-phase8.sql with coverage_amount / carrier / policy_number /
 *      signed_status / expiration_date etc.). Includes a required-doc checklist
 *      per role and an expiration-alert reader.
 *   2. E-SIGN (MVP)           - the NEW `esign_requests` table: create a request,
 *      mark sent, mark signed (upload-signed file), read status. No external
 *      e-sign vendor is integrated; this is an in-platform lifecycle only.
 *   3. AVAILABILITY           - the NEW `availability_records` table for venue and
 *      vendor bookable / blocked windows.
 *
 * Everything is org-scoped; admins (role super_admin/admin) see across orgs.
 */
import { q, q1 } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";

// ---- Required-document checklist per role (blueprint 30) --------------------
export type DocStatus = "missing" | "uploaded" | "approved" | "rejected" | "expired";

export const REQUIRED_DOCS: Record<string, { key: string; label: string; coi?: boolean }[]> = {
  vendor: [
    { key: "w9", label: "W-9 tax form" },
    { key: "coi", label: "Certificate of Insurance", coi: true },
    { key: "business_license", label: "Business license" },
    { key: "service_agreement", label: "Service agreement" },
  ],
  supplier: [
    { key: "w9", label: "W-9 tax form" },
    { key: "coi", label: "Certificate of Insurance", coi: true },
  ],
  installer: [
    { key: "coi", label: "Certificate of Insurance", coi: true },
    { key: "safety_cert", label: "Safety certification" },
  ],
  venue: [
    { key: "coi", label: "Certificate of Insurance", coi: true },
    { key: "venue_agreement", label: "Venue agreement" },
    { key: "permits", label: "Operating permits" },
  ],
  planner: [{ key: "service_agreement", label: "Service agreement" }],
};

export function requiredDocsForRole(role: string | null | undefined): {
  key: string;
  label: string;
  coi?: boolean;
}[] {
  return REQUIRED_DOCS[role ?? ""] ?? [];
}

export type DocumentRow = {
  id: string;
  owner_id: string | null;
  organization_id: string | null;
  name: string | null;
  document_type: string | null;
  file_url: string | null;
  approval_status: string | null;
  expiration_date: string | null;
  coverage_amount: string | null;
  carrier: string | null;
  policy_number: string | null;
  signed_status: string | null;
  signed_at: string | null;
  created_at: string;
};

function isAdminActor(actor: Actor, isAdmin: boolean): boolean {
  return isAdmin || actor.user.role === "super_admin" || actor.user.role === "admin";
}

// ----------------------------------------------------------------------------
// DOCUMENTS / COI / W-9
// ----------------------------------------------------------------------------

/** List documents for the actor's org (or all, for admin). */
export async function listDocuments(
  actor: Actor,
  isAdmin: boolean,
  filter: { document_type?: string } = {},
): Promise<DocumentRow[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (!isAdminActor(actor, isAdmin)) {
    params.push(actor.org?.id ?? null, actor.user.id);
    where.push(`(organization_id = $1 or owner_id = $2)`);
  }
  if (filter.document_type) {
    params.push(filter.document_type);
    where.push(`document_type = $${params.length}`);
  }
  return q<DocumentRow>(
    `select id, owner_id, organization_id, name, document_type, file_url,
            approval_status, expiration_date, coverage_amount, carrier,
            policy_number, signed_status, signed_at, created_at
       from documents
       ${where.length ? `where ${where.join(" and ")}` : ""}
      order by created_at desc
      limit 500`,
    params,
  );
}

/** Record a document (COI fields optional). MVP: stores a file_url reference. */
export async function createDocument(
  actor: Actor,
  body: {
    name?: string;
    document_type?: string;
    file_url?: string;
    expiration_date?: string;
    coverage_amount?: number;
    carrier?: string;
    policy_number?: string;
  },
): Promise<DocumentRow> {
  const row = await q1<DocumentRow>(
    `insert into documents
       (owner_id, organization_id, name, document_type, file_url, approval_status,
        expiration_date, coverage_amount, carrier, policy_number, signed_status)
     values ($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9,'unsigned')
     returning id, owner_id, organization_id, name, document_type, file_url,
               approval_status, expiration_date, coverage_amount, carrier,
               policy_number, signed_status, signed_at, created_at`,
    [
      actor.user.id,
      actor.org?.id ?? null,
      body.name ?? null,
      body.document_type ?? null,
      body.file_url ?? null,
      body.expiration_date ?? null,
      body.coverage_amount ?? null,
      body.carrier ?? null,
      body.policy_number ?? null,
    ],
  );
  return row as DocumentRow;
}

/** Approve / reject a document (admin only). */
export async function setDocApproval(
  actor: Actor,
  isAdmin: boolean,
  id: string,
  approval: "approved" | "rejected" | "pending",
): Promise<DocumentRow> {
  if (!isAdminActor(actor, isAdmin)) throw new ForbiddenError("admins only");
  const row = await q1<DocumentRow>(
    `update documents set approval_status = $2, updated_at = now()
      where id = $1
      returning id, owner_id, organization_id, name, document_type, file_url,
                approval_status, expiration_date, coverage_amount, carrier,
                policy_number, signed_status, signed_at, created_at`,
    [id, approval],
  );
  if (!row) throw new NotFoundError("document not found");
  return row;
}

/**
 * Compliance checklist for the actor's org: which required docs exist, their
 * approval status, and COI expiration flags.
 */
export interface ChecklistEntry {
  key: string;
  label: string;
  coi: boolean;
  status: DocStatus;
  document_id: string | null;
  expiration_date: string | null;
  expires_in_days: number | null;
}

export async function complianceChecklist(actor: Actor): Promise<{
  role: string | null;
  entries: ChecklistEntry[];
}> {
  const role = actor.user.role ?? null;
  const required = requiredDocsForRole(role);
  const docs = await q<DocumentRow>(
    `select id, document_type, approval_status, expiration_date
       from documents where organization_id = $1`,
    [actor.org?.id ?? null],
  );
  const now = Date.now();
  const entries: ChecklistEntry[] = required.map((r) => {
    const doc = docs.find((d) => d.document_type === r.key);
    let status: DocStatus = "missing";
    let expiresIn: number | null = null;
    if (doc) {
      if (doc.expiration_date) {
        const days = Math.floor((new Date(doc.expiration_date).getTime() - now) / 86400000);
        expiresIn = days;
        if (days < 0) status = "expired";
        else status = (doc.approval_status as DocStatus) ?? "uploaded";
      } else {
        status = (doc.approval_status as DocStatus) ?? "uploaded";
      }
      if (status === "pending" as DocStatus) status = "uploaded";
    }
    return {
      key: r.key,
      label: r.label,
      coi: !!r.coi,
      status,
      document_id: doc?.id ?? null,
      expiration_date: doc?.expiration_date ?? null,
      expires_in_days: expiresIn,
    };
  });
  return { role, entries };
}

/** Documents expiring within `days` (admin: all orgs; user: own org). */
export async function expiringDocuments(
  actor: Actor,
  isAdmin: boolean,
  days = 30,
): Promise<DocumentRow[]> {
  const params: unknown[] = [days];
  let scope = "";
  if (!isAdminActor(actor, isAdmin)) {
    params.push(actor.org?.id ?? null);
    scope = `and organization_id = $2`;
  }
  return q<DocumentRow>(
    `select id, owner_id, organization_id, name, document_type, file_url,
            approval_status, expiration_date, coverage_amount, carrier,
            policy_number, signed_status, signed_at, created_at
       from documents
      where expiration_date is not null
        and expiration_date <= now() + ($1 || ' days')::interval
        ${scope}
      order by expiration_date asc
      limit 200`,
    params,
  );
}

// ----------------------------------------------------------------------------
// E-SIGN (MVP)
// ----------------------------------------------------------------------------
export type EsignStatus = "draft" | "sent" | "viewed" | "signed" | "declined" | "expired";

export type EsignRow = {
  id: string;
  document_id: string | null;
  organization_id: string | null;
  requested_by: string | null;
  signer_email: string | null;
  title: string | null;
  status: string | null;
  signed_file_url: string | null;
  sent_at: string | null;
  signed_at: string | null;
  created_at: string;
};

export async function listEsign(actor: Actor, isAdmin: boolean): Promise<EsignRow[]> {
  const params: unknown[] = [];
  let where = "";
  if (!isAdminActor(actor, isAdmin)) {
    params.push(actor.org?.id ?? null);
    where = `where organization_id = $1`;
  }
  return q<EsignRow>(
    `select * from esign_requests ${where} order by created_at desc limit 300`,
    params,
  );
}

/** Create an e-sign request (status sent so it appears actionable). */
export async function createEsign(
  actor: Actor,
  body: { document_id?: string; signer_email?: string; title?: string },
): Promise<EsignRow> {
  const row = await q1<EsignRow>(
    `insert into esign_requests
       (document_id, organization_id, requested_by, signer_email, title, status, sent_at)
     values ($1,$2,$3,$4,$5,'sent',now())
     returning *`,
    [
      body.document_id ?? null,
      actor.org?.id ?? null,
      actor.user.id,
      body.signer_email ?? null,
      body.title ?? null,
    ],
  );
  return row as EsignRow;
}

/** Mark an e-sign request signed (MVP: upload-signed file + mark-signed). */
export async function markSigned(
  actor: Actor,
  id: string,
  signedFileUrl?: string,
): Promise<EsignRow> {
  const existing = await q1<EsignRow>(`select * from esign_requests where id = $1`, [id]);
  if (!existing) throw new NotFoundError("e-sign request not found");
  const row = await q1<EsignRow>(
    `update esign_requests
        set status = 'signed', signed_file_url = coalesce($2, signed_file_url),
            signed_at = now(), updated_at = now()
      where id = $1 returning *`,
    [id, signedFileUrl ?? null],
  );
  // mirror onto the linked document
  if (existing.document_id) {
    await q1(
      `update documents set signed_status = 'signed', signed_at = now(),
              signed_by = $2, updated_at = now()
        where id = $1`,
      [existing.document_id, actor.user.id],
    );
  }
  return row as EsignRow;
}

// ----------------------------------------------------------------------------
// AVAILABILITY (blueprint 29)
// ----------------------------------------------------------------------------
export type AvailStatus = "available" | "blocked" | "tentative" | "booked";
export const AVAIL_STATUSES: AvailStatus[] = ["available", "blocked", "tentative", "booked"];

export type AvailabilityRow = {
  id: string;
  organization_id: string | null;
  resource_type: string | null;
  venue_id: string | null;
  vendor_id: string | null;
  start_at: string;
  end_at: string;
  status: string | null;
  event_id: string | null;
  note: string | null;
  created_at: string;
};

/** List availability windows for the org (or all, for admin), within an optional range. */
export async function listAvailability(
  actor: Actor,
  isAdmin: boolean,
  filter: { from?: string; to?: string; resource_type?: string } = {},
): Promise<AvailabilityRow[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (!isAdminActor(actor, isAdmin)) {
    params.push(actor.org?.id ?? null);
    where.push(`organization_id = $${params.length}`);
  }
  if (filter.resource_type) {
    params.push(filter.resource_type);
    where.push(`resource_type = $${params.length}`);
  }
  if (filter.from) {
    params.push(filter.from);
    where.push(`end_at >= $${params.length}`);
  }
  if (filter.to) {
    params.push(filter.to);
    where.push(`start_at <= $${params.length}`);
  }
  return q<AvailabilityRow>(
    `select * from availability_records
       ${where.length ? `where ${where.join(" and ")}` : ""}
      order by start_at asc
      limit 500`,
    params,
  );
}

/** Create an availability / block window for the actor's org. */
export async function createAvailability(
  actor: Actor,
  body: {
    resource_type?: string;
    venue_id?: string;
    vendor_id?: string;
    start_at?: string;
    end_at?: string;
    status?: string;
    note?: string;
    event_id?: string;
  },
): Promise<AvailabilityRow> {
  if (!body.start_at || !body.end_at) throw new NotFoundError("start_at and end_at required");
  const status = AVAIL_STATUSES.includes(body.status as AvailStatus)
    ? (body.status as AvailStatus)
    : "available";
  const resourceType = body.resource_type === "vendor" ? "vendor" : "venue";
  const row = await q1<AvailabilityRow>(
    `insert into availability_records
       (organization_id, resource_type, venue_id, vendor_id, start_at, end_at,
        status, note, event_id, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     returning *`,
    [
      actor.org?.id ?? null,
      resourceType,
      body.venue_id ?? null,
      body.vendor_id ?? null,
      body.start_at,
      body.end_at,
      status,
      body.note ?? null,
      body.event_id ?? null,
      actor.user.id,
    ],
  );
  return row as AvailabilityRow;
}

/** Remove an availability window (must belong to the org, or admin). */
export async function deleteAvailability(
  actor: Actor,
  isAdmin: boolean,
  id: string,
): Promise<void> {
  const row = await q1<AvailabilityRow>(`select * from availability_records where id = $1`, [id]);
  if (!row) throw new NotFoundError("availability not found");
  if (!isAdminActor(actor, isAdmin) && row.organization_id !== (actor.org?.id ?? null)) {
    throw new ForbiddenError("not your availability record");
  }
  await q1(`delete from availability_records where id = $1`, [id]);
}
