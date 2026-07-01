/**
 * Native e-signature routes (blueprint 30.2). Mounted by the parent at
 * /api/signatures. No DocuSign, no third party: a signer reviews an agreement,
 * signs by drawing or typing, and we store a signature record + a stamped signed
 * PDF + a sha256 content hash + IP + timestamp, then audit-log it.
 *
 *   POST   /api/signatures              capture a signature, render + store the PDF
 *   GET    /api/signatures/:id/pdf      stream the stored signed PDF (org-scoped)
 *   GET    /api/signatures?related_object_type=&related_object_id=  list for object
 *
 * Zero em dashes.
 */
import crypto from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { logAction } from "../lib/audit.js";
import { renderSignedAgreementPdf } from "../lib/pdf.js";
import { putObjectBytes, objectExistsAsync, streamObject } from "../storage.js";
import {
  recordSignature,
  listSignaturesFor,
  getSignature,
} from "../db/signatures.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

function clientIp(req: Request): string | null {
  return (
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    null
  );
}

const router = Router();

router.post(
  "/",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    const b = req.body ?? {};

    const documentType = typeof b.document_type === "string" ? b.document_type.trim() : "";
    const documentTitle = typeof b.document_title === "string" ? b.document_title.trim() : "";
    const bodyText = typeof b.body_text === "string" ? b.body_text : "";
    if (!documentType) return res.status(400).json({ error: "document_type required" });
    if (!documentTitle) return res.status(400).json({ error: "document_title required" });
    if (!bodyText) return res.status(400).json({ error: "body_text required" });

    const signatureImage =
      typeof b.signature_image === "string" && b.signature_image.startsWith("data:image/")
        ? b.signature_image
        : null;
    const typedName = typeof b.typed_name === "string" ? b.typed_name.trim() : "";
    if (!signatureImage && !typedName) {
      return res.status(400).json({ error: "signature_image or typed_name required" });
    }

    const signerName = (actor.user.name || typedName || actor.user.email || "Signer").trim();
    const signerEmail = actor.user.email ?? null;
    const signerRole = typeof b.signer_role === "string" && b.signer_role.trim()
      ? b.signer_role.trim()
      : actor.user.role ?? null;
    const relatedObjectType =
      typeof b.related_object_type === "string" && b.related_object_type.trim()
        ? b.related_object_type.trim()
        : null;
    const relatedObjectId =
      typeof b.related_object_id === "string" && b.related_object_id.trim()
        ? b.related_object_id.trim()
        : null;
    const ip = clientIp(req);
    const signedAt = new Date();

    // Tamper-evident content hash: bind body + signer identity + timestamp.
    const documentHash = crypto
      .createHash("sha256")
      .update(
        [bodyText, signerName, signerEmail ?? "", documentType, documentTitle, signedAt.toISOString()].join("\n"),
      )
      .digest("hex");

    const pdf = await renderSignedAgreementPdf({
      title: documentTitle,
      bodyText,
      signerName,
      signerRole,
      signerEmail,
      signedAt,
      ip,
      hash: documentHash,
      signatureImage,
    });

    // Store the stamped PDF on local disk under the org (or user) namespace.
    const sigId = crypto.randomUUID();
    const bucket = actor.org?.id ?? actor.user.id;
    const relKey = `${bucket}/signatures/${sigId}.pdf`;
    await putObjectBytes(relKey, pdf, "application/pdf");

    const row = await recordSignature({
      organizationId: actor.org?.id ?? null,
      signerUserId: actor.user.id,
      signerName,
      signerEmail,
      signerRole,
      documentType,
      documentTitle,
      relatedObjectType,
      relatedObjectId,
      documentHash,
      signatureImage,
      signedPdfPath: relKey,
      ipAddress: ip,
    });

    await logAction(
      actor,
      "document.signed",
      "document_signature",
      row.id,
      null,
      {
        document_type: documentType,
        document_title: documentTitle,
        related_object_type: relatedObjectType,
        related_object_id: relatedObjectId,
        document_hash: documentHash,
      },
      { summary: `${signerName} signed ${documentTitle}`, ip },
    );

    res.status(201).json({
      signature: row,
      download_path: `/signatures/${row.id}/pdf`,
    });
  }),
);

router.get(
  "/",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    const relatedType =
      typeof req.query.related_object_type === "string" ? req.query.related_object_type : null;
    const relatedId =
      typeof req.query.related_object_id === "string" ? req.query.related_object_id : null;
    if (!relatedType || !relatedId) {
      return res.status(400).json({ error: "related_object_type and related_object_id required" });
    }
    const rows = await listSignaturesFor(relatedType, relatedId);
    // Org-scope: only return signatures recorded under the actor's org (or their own).
    const scoped = rows.filter(
      (r) =>
        (actor.org && r.organization_id === actor.org.id) ||
        r.signer_user_id === actor.user.id,
    );
    res.json({ signatures: scoped });
  }),
);

router.get(
  "/:id/pdf",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    const row = await getSignature(req.params.id);
    if (!row || !row.signed_pdf_path) return res.status(404).json({ error: "not found" });

    // Org-scoped: only a party (same org, or the signer) may fetch.
    const isParty =
      (actor.org && row.organization_id === actor.org.id) ||
      row.signer_user_id === actor.user.id;
    if (!isParty) return res.status(403).json({ error: "forbidden" });

    if (!(await objectExistsAsync(row.signed_pdf_path))) return res.status(404).json({ error: "file missing" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="signed-${(row.document_title ?? "agreement").replace(/[^\w.\-]+/g, "_")}-${row.id.slice(0, 8)}.pdf"`,
    );
    // Provider-agnostic + encryption-aware streaming.
    await streamObject(row.signed_pdf_path, res);
  }),
);

export default router;
