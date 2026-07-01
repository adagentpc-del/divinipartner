/**
 * Payment Protection Notice modal (blueprint section 21.4).
 *
 * Reusable platform-wide: any surface that takes free text (messages, invoice
 * notes, quote terms) can run useLeakageGuard(text) and, when it returns true,
 * render <LeakageModal /> to surface the notice before an off-platform payment.
 *
 * The exact notice copy mirrors server/src/lib/leakage.ts PAYMENT_PROTECTION_NOTICE.
 * Self-contained styles; brand colors emerald / gold / ivory. Zero em dashes.
 */
import { useMemo, useState } from 'react';

// Exact copy from blueprint 21.4 (kept in sync with the backend).
export const PAYMENT_PROTECTION_NOTICE = {
  title: 'Payment Protection Notice',
  body:
    'It looks like this conversation mentions paying outside of Divini Partners. ' +
    'Payments made through the platform are protected: deposits are held, balances ' +
    'are tracked, disputes are mediated, and both sides are covered by the Divini ' +
    'service guarantee. Paying off-platform voids these protections and breaches the ' +
    'partner agreement, and the platform fee remains owed.',
  ctas: {
    continue: 'Continue Payment Through Divini',
    external: 'Mark as External Payment',
    support: 'Contact Support',
    policy: 'View Payment Policy',
  },
} as const;

// Mirror of LEAKAGE_TERMS in server/src/lib/leakage.ts (client-side pre-check).
const LEAKAGE_PATTERNS: RegExp[] = [
  /\bvenmo\b/i,
  /\bzelle\b/i,
  /\bcash[\s-]?app\b/i,
  /\bpay[\s-]?pal\b/i,
  /\bwire(\s+transfer)?\b/i,
  /\bach\b/i,
  /\bcash\b(?!\s*app)/i,
  /\b(che(ck|que)s?|by\s+check)\b/i,
  /\bpay(ing)?\s+(outside|off[\s-]?platform|directly)\b/i,
  /\boff[\s-]?platform\b/i,
  /\boff\s+the\s+platform\b/i,
  /\binvoice\s+(you\s+)?separately\b/i,
  /\bbill\s+(you\s+)?separately\b/i,
  /\b(skip|avoid|save\s+on)\s+(the\s+)?(platform\s+)?fee\b/i,
  /\bdirect\s+deposit\b/i,
  /\bsend\s+(it\s+)?to\s+my\s+(bank\s+)?account\b/i,
  /\bhandle\s+(it|payment)\s+(ourselves|between us)\b/i,
];

/**
 * Hook: returns whether the Payment Protection Notice should be shown for the
 * given text, plus the open/close controls so a host can drive the modal.
 */
export function useLeakageGuard(text: string | null | undefined): {
  flagged: boolean;
  open: boolean;
  show: () => void;
  dismiss: () => void;
} {
  const flagged = useMemo(() => {
    if (!text) return false;
    return LEAKAGE_PATTERNS.some((re) => re.test(text));
  }, [text]);
  const [open, setOpen] = useState(false);
  return {
    flagged,
    open,
    show: () => setOpen(true),
    dismiss: () => setOpen(false),
  };
}

export type LeakageAction = 'continue' | 'external' | 'support' | 'policy';

export default function LeakageModal({
  open,
  onClose,
  onAction,
}: {
  open: boolean;
  onClose: () => void;
  onAction?: (action: LeakageAction) => void;
}) {
  if (!open) return null;

  const act = (a: LeakageAction) => {
    onAction?.(a);
  };

  return (
    <div className="dplk-overlay" role="dialog" aria-modal="true" aria-labelledby="dplk-title">
      <style>{CSS}</style>
      <div className="dplk-card">
        <div className="dplk-head">
          <span className="dplk-shield" aria-hidden="true">!</span>
          <h2 id="dplk-title" className="dplk-title">{PAYMENT_PROTECTION_NOTICE.title}</h2>
        </div>

        <p className="dplk-body">{PAYMENT_PROTECTION_NOTICE.body}</p>

        <div className="dplk-actions">
          <button type="button" className="dplk-btn primary" onClick={() => act('continue')}>
            {PAYMENT_PROTECTION_NOTICE.ctas.continue}
          </button>
          <button type="button" className="dplk-btn warn" onClick={() => act('external')}>
            {PAYMENT_PROTECTION_NOTICE.ctas.external}
          </button>
          <button type="button" className="dplk-btn ghost" onClick={() => act('support')}>
            {PAYMENT_PROTECTION_NOTICE.ctas.support}
          </button>
          <button type="button" className="dplk-btn ghost" onClick={() => act('policy')}>
            {PAYMENT_PROTECTION_NOTICE.ctas.policy}
          </button>
        </div>

        <button type="button" className="dplk-close" onClick={onClose} aria-label="Close">x</button>
      </div>
    </div>
  );
}

const CSS = `
.dplk-overlay {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  background: rgba(18,60,46,.55); padding: 20px;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}
.dplk-card {
  position: relative; width: 100%; max-width: 460px;
  background: #F7F4EE; color: #2c2a26;
  border: 1px solid #C9A35B; border-radius: 16px;
  padding: 26px 26px 22px;
  box-shadow: 0 24px 60px rgba(0,0,0,.32);
}
.dplk-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.dplk-shield {
  width: 38px; height: 38px; flex: 0 0 38px; border-radius: 10px;
  background: linear-gradient(135deg, #C9A35B, #b58e44); color: #123c2e;
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 20px;
}
.dplk-title {
  font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600;
  font-size: 24px; color: #123c2e; margin: 0; line-height: 1.1;
}
.dplk-body { font-size: 13.5px; line-height: 1.6; color: #4a463f; margin: 0 0 18px; }
.dplk-actions { display: flex; flex-direction: column; gap: 9px; }
.dplk-btn {
  width: 100%; font: inherit; font-size: 13.5px; font-weight: 600;
  padding: 11px 14px; border-radius: 10px; cursor: pointer;
  border: 1px solid transparent; text-align: center;
  transition: background .15s ease, border-color .15s ease, color .15s ease;
}
.dplk-btn.primary { background: #123c2e; color: #fff; }
.dplk-btn.primary:hover { background: #1E5D4A; }
.dplk-btn.warn { background: #fff; color: #8a5a12; border-color: #C9A35B; }
.dplk-btn.warn:hover { background: rgba(201,163,91,.12); }
.dplk-btn.ghost { background: transparent; color: #123c2e; border-color: #e7e1d6; }
.dplk-btn.ghost:hover { border-color: #123c2e; background: rgba(18,60,46,.04); }
.dplk-close {
  position: absolute; top: 12px; right: 14px;
  width: 28px; height: 28px; border-radius: 8px;
  background: transparent; border: 0; cursor: pointer;
  color: #7d776c; font-size: 16px; line-height: 1;
}
.dplk-close:hover { color: #123c2e; background: rgba(18,60,46,.06); }
`;
