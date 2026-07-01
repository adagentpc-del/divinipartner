/**
 * Native e-signature data layer (blueprint 30.2 - the e-sign layer above the MVP).
 *
 * Backed by the document_signatures table in db/schema.sql. Every signature is an
 * immutable record: who signed, what they signed (document_type + title), the
 * related object (optional), a sha256 content hash for tamper-evidence, the stored
 * signature image (data URL) or typed name, the path to the stamped signed PDF, the
 * signer IP, and a timestamp. Org-scoped reads keep parties from peeking at others.
 * Zero em dashes.
 */
import { q, q1 } from "../pool.js";

export interface SignatureRow {
  id: string;
  organization_id: string | null;
  signer_user_id: string | null;
  signer_name: string | null;
  signer_email: string | null;
  signer_role: string | null;
  document_type: string | null;
  document_title: string | null;
  related_object_type: string | null;
  related_object_id: string | null;
  document_hash: string | null;
  signature_image: string | null;
  signed_pdf_path: string | null;
  ip_address: string | null;
  signed_at: string;
  created_at: string;
}

export interface RecordSignatureInput {
  organizationId: string | null;
  signerUserId: string | null;
  signerName: string | null;
  signerEmail: string | null;
  signerRole: string | null;
  documentType: string;
  documentTitle: string;
  relatedObjectType?: string | null;
  relatedObjectId?: string | null;
  documentHash: string;
  signatureImage: string | null;
  signedPdfPath: string;
  ipAddress: string | null;
}

/** Insert one signature record. Returns the stored row. */
export async function recordSignature(input: RecordSignatureInput): Promise<SignatureRow> {
  const row = await q1<SignatureRow>(
    `insert into document_signatures
       (organization_id, signer_user_id, signer_name, signer_email, signer_role,
        document_type, document_title, related_object_type, related_object_id,
        document_hash, signature_image, signed_pdf_path, ip_address)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     returning *`,
    [
      input.organizationId,
      input.signerUserId,
      input.signerName,
      input.signerEmail,
      input.signerRole,
      input.documentType,
      input.documentTitle,
      input.relatedObjectType ?? null,
      input.relatedObjectId ?? null,
      input.documentHash,
      input.signatureImage,
      input.signedPdfPath,
      input.ipAddress,
    ],
  );
  return row as SignatureRow;
}

/** List the signatures recorded against a related object (newest first). */
export async function listSignaturesFor(
  relatedType: string,
  relatedId: string,
): Promise<SignatureRow[]> {
  return q<SignatureRow>(
    `select * from document_signatures
      where related_object_type = $1 and related_object_id = $2
      order by signed_at desc`,
    [relatedType, relatedId],
  );
}

/** List every signature for an organization (newest first). */
export async function listSignaturesByOrg(orgId: string): Promise<SignatureRow[]> {
  return q<SignatureRow>(
    `select * from document_signatures
      where organization_id = $1
      order by signed_at desc`,
    [orgId],
  );
}

/** Fetch a single signature record by id. */
export async function getSignature(id: string): Promise<SignatureRow | null> {
  return q1<SignatureRow>(`select * from document_signatures where id = $1`, [id]);
}
