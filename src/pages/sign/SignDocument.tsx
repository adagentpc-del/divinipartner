/**
 * Native e-signature flow (blueprint 30.2). Route: /sign/:type.
 *
 * The signer reviews an agreement (a sensible default body per document type, or
 * one passed in the querystring), signs by drawing or typing, checks the adoption
 * box, and submits. We POST /signatures; the server hashes the content, renders a
 * stamped signed PDF, stores it with an audit log, and returns the record. On
 * success we show a confirmation with a Download Signed PDF link. The querystring
 * may carry related_object_type, related_object_id, and a title. Self-contained,
 * brand styled, zero em dashes.
 */
import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { apiSend, apiBlob } from '../../lib/api';
import SignaturePad, { type SignatureValue } from '../../components/SignaturePad';
import { useAuth } from '../../lib/auth';

type SignatureRecord = {
  id: string;
  document_type: string | null;
  document_title: string | null;
  document_hash: string | null;
  signer_name: string | null;
  signed_at: string;
};

type SignResponse = { signature: SignatureRecord; download_path: string };

const DOC_DEFAULTS: Record<string, { title: string; body: string }> = {
  vendor_agreement: {
    title: 'Vendor Agreement',
    body:
      'This Vendor Agreement is entered into between the vendor and Divini Partners. The vendor agrees to provide the services and goods described in the associated quote and event scope, to honor the standardized pricing and platform fee terms, to maintain the insurance and licensing applicable to their category, and to communicate and transact through the Divini Partners platform. Payments are protected when made through Divini Partners. The vendor confirms the accuracy of the information provided and agrees to the platform terms and policies in effect on the date of signature.',
  },
  contract_pricing_agreement: {
    title: 'Contract Pricing Agreement',
    body:
      'This Contract Pricing Agreement establishes preferential pricing between the participating organizations. The parties agree to the discount, fixed rate, or volume tier defined in the partnership, scoped to the listed categories and venues over the stated date range. Pricing applies to qualifying bookings transacted through Divini Partners and remains subject to the platform terms. Either party may request a change to the terms in writing, subject to mutual approval. The signer confirms authority to bind their organization to these terms.',
  },
  change_order_approval: {
    title: 'Change Order Approval',
    body:
      'This Change Order Approval confirms acceptance of the scope change and price delta described in the associated change order. The signer acknowledges the revised scope, the adjusted total including any applicable platform fee, and that the change order will be added to the invoice for the event. Approval of this change order does not alter the remaining terms of the original agreement except as expressly stated here.',
  },
  platform_terms: {
    title: 'Platform Terms',
    body:
      'These Platform Terms govern your use of Divini Partners. By signing, you agree to use the platform in good faith, to keep your account and organization information accurate, to transact and communicate through the platform, and to honor the standardized invoices, quotes, and payment-protection practices. You acknowledge the privacy policy and the fee schedule applicable to your tier. Divini Partners may update these terms with notice; continued use after an update constitutes acceptance.',
  },
  rental_agreement: {
    title: 'Rental Agreement',
    body:
      'This Rental Agreement covers the rental items listed in the associated quote or package. The renter agrees to the rental period, the condition and return expectations, and responsibility for loss or damage beyond normal wear. Delivery, setup, and pickup are as scheduled for the event. Charges, deposits, and any platform fee are as stated in the quote. The signer confirms acceptance of these rental terms.',
  },
  nda: {
    title: 'Mutual Non-Disclosure Agreement',
    body:
      'This Mutual Non-Disclosure Agreement protects confidential information exchanged between the parties in connection with a potential or active engagement on Divini Partners. Each party agrees to use the other party confidential information solely to evaluate and perform the engagement, to protect it with reasonable care, and not to disclose it to third parties without consent, except as required by law. The obligations survive the engagement for the period stated in the platform terms. The signer confirms authority to accept these obligations.',
  },
};

function fallbackDoc(type: string): { title: string; body: string } {
  const title = type
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
  return {
    title,
    body:
      'By signing below you adopt this signature as your own and agree to be bound by the terms of this document as presented on Divini Partners on the date of signature. Payments are protected when made through Divini Partners.',
  };
}

export default function SignDocument() {
  const { type = 'platform_terms' } = useParams();
  const [params] = useSearchParams();
  const { session, company } = useAuth();

  const relatedType = params.get('related_object_type');
  const relatedId = params.get('related_object_id');
  const titleOverride = params.get('title');

  const doc = useMemo(() => {
    const base = DOC_DEFAULTS[type] ?? fallbackDoc(type);
    return { title: titleOverride || base.title, body: base.body };
  }, [type, titleOverride]);

  const defaultName = company?.contact_name || session?.user.email || '';

  const [sig, setSig] = useState<SignatureValue>({ mode: 'draw', dataUrl: null });
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<SignResponse | null>(null);

  const hasSignature =
    (sig.mode === 'draw' && !!sig.dataUrl) || (sig.mode === 'type' && sig.typedName.trim().length > 1);
  const canSubmit = agreed && hasSignature && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        document_type: type,
        document_title: doc.title,
        body_text: doc.body,
      };
      if (relatedType) payload.related_object_type = relatedType;
      if (relatedId) payload.related_object_id = relatedId;
      if (sig.mode === 'draw') payload.signature_image = sig.dataUrl;
      else payload.typed_name = sig.typedName.trim();
      const res = await apiSend<SignResponse>('POST', '/signatures', payload);
      setDone(res);
    } catch (e) {
      setError((e as Error)?.message ?? 'Failed to sign');
    } finally {
      setSubmitting(false);
    }
  }

  async function download() {
    if (!done) return;
    try {
      const blob = await apiBlob(`/signatures/${done.signature.id}/pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `signed-${done.signature.id.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error)?.message ?? 'Failed to download');
    }
  }

  return (
    <div className="dpsd">
      <style>{CSS}</style>

      <header className="dpsd-head">
        <span className="dpsd-kicker">Divini Partners e-signature</span>
        <h1 className="dpsd-title">{doc.title}</h1>
        <p className="dpsd-sub">Review the agreement, then sign to adopt it. Your signature is captured securely with a timestamp and content hash.</p>
      </header>

      {done ? (
        <div className="dpsd-success">
          <span className="dpsd-check" aria-hidden="true">OK</span>
          <h2>Signed</h2>
          <p>Thank you, {done.signature.signer_name ?? 'signer'}. Your signature for <strong>{done.signature.document_title}</strong> has been recorded.</p>
          <div className="dpsd-hashrow">
            <span className="dpsd-hashlabel">Content hash (SHA-256)</span>
            <code className="dpsd-hash">{done.signature.document_hash}</code>
          </div>
          <button type="button" className="dpsd-btn primary" onClick={download}>Download signed PDF</button>
        </div>
      ) : (
        <>
          <section className="dpsd-doc">
            <div className="dpsd-doc-label">Agreement</div>
            <p className="dpsd-body">{doc.body}</p>
          </section>

          <section className="dpsd-sign">
            <div className="dpsd-doc-label">Your signature</div>
            <SignaturePad onChange={setSig} defaultName={defaultName} />
          </section>

          <label className="dpsd-agree">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>I agree and adopt this as my signature, and agree to be bound by the terms of this document.</span>
          </label>

          {error ? <div className="dpsd-error">{error}</div> : null}

          <div className="dpsd-foot">
            <button type="button" className="dpsd-btn primary" disabled={!canSubmit} onClick={submit}>
              {submitting ? 'Signing...' : 'Sign'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const CSS = `
.dpsd {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--dp-ink);
  max-width: 720px; margin: 0 auto;
}
.dpsd h1, .dpsd h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }
.dpsd-head { margin-bottom: 20px; }
.dpsd-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--dp-gold); font-weight: 600; }
.dpsd-title { font-size: 32px; color: var(--dp-emerald); line-height: 1.1; margin-top: 2px; }
.dpsd-sub { font-size: 13px; color: var(--dp-muted); margin: 6px 0 0; line-height: 1.55; }

.dpsd-doc-label { font-size: 11px; letter-spacing: .6px; text-transform: uppercase; color: var(--dp-emerald-2); font-weight: 700; margin-bottom: 8px; }
.dpsd-doc { background: #fff; border: 1px solid var(--dp-line); border-radius: 14px; padding: 20px 22px; margin-bottom: 18px; }
.dpsd-body { font-size: 13.5px; color: var(--dp-ink); line-height: 1.65; margin: 0; }
.dpsd-sign { background: var(--dp-ivory); border: 1px solid var(--dp-line); border-radius: 14px; padding: 18px 20px; margin-bottom: 16px; }

.dpsd-agree { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; color: var(--dp-ink); line-height: 1.5; margin-bottom: 16px; cursor: pointer; }
.dpsd-agree input { margin-top: 2px; width: 16px; height: 16px; accent-color: var(--dp-emerald); }

.dpsd-error { background: rgba(155,44,44,.08); border: 1px solid rgba(155,44,44,.35); color: #9b2c2c; border-radius: 10px; padding: 10px 14px; font-size: 13px; margin-bottom: 14px; }

.dpsd-foot { display: flex; justify-content: flex-end; }
.dpsd-btn { font: inherit; font-size: 14px; font-weight: 600; padding: 11px 22px; border-radius: 10px; cursor: pointer; border: 1px solid transparent; }
.dpsd-btn.primary { background: var(--dp-emerald); color: #fff; }
.dpsd-btn.primary:hover:not(:disabled) { background: var(--dp-emerald-2); }
.dpsd-btn:disabled { opacity: .5; cursor: not-allowed; }

.dpsd-success { background: linear-gradient(120deg, var(--dp-emerald), var(--dp-emerald-2)); color: var(--dp-ivory); border: 1px solid rgba(201,163,91,.4); border-radius: 16px; padding: 30px; text-align: center; }
.dpsd-success h2 { font-size: 28px; color: #fff; margin: 10px 0 6px; }
.dpsd-success p { font-size: 13.5px; color: rgba(247,244,238,.9); line-height: 1.6; max-width: 480px; margin: 0 auto 16px; }
.dpsd-success strong { color: var(--dp-gold); }
.dpsd-check { display: inline-flex; align-items: center; justify-content: center; width: 46px; height: 46px; border-radius: 12px; background: linear-gradient(135deg, var(--dp-gold), #b58e44); color: var(--dp-emerald); font-weight: 800; font-size: 16px; }
.dpsd-hashrow { background: rgba(0,0,0,.18); border-radius: 10px; padding: 12px 14px; margin: 0 auto 18px; max-width: 520px; text-align: left; }
.dpsd-hashlabel { display: block; font-size: 10px; letter-spacing: .6px; text-transform: uppercase; color: rgba(247,244,238,.7); margin-bottom: 4px; }
.dpsd-hash { font-family: ui-monospace, Menlo, monospace; font-size: 10.5px; color: var(--dp-ivory); word-break: break-all; }
.dpsd-success .dpsd-btn.primary { background: var(--dp-gold); color: var(--dp-emerald); }
.dpsd-success .dpsd-btn.primary:hover { background: #d8b46b; }
`;
