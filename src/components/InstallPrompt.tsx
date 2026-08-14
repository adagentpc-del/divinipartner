/**
 * PWA install prompt (moat roadmap Phase 2b, 2026-08-14). The platform is
 * installable (manifest.webmanifest + sw.js already precache the app
 * shell) but had no discoverable UI: on Android Chrome the native mini
 * infobar is easy to miss or dismiss, and iOS Safari never fires
 * `beforeinstallprompt` at all -- Add to Home Screen only exists behind the
 * Share sheet. This surfaces a real "Install" banner (Android/desktop
 * Chrome, via the captured native prompt) or a one-time instructional hint
 * (iOS Safari), and stays hidden once dismissed or once already installed.
 *
 * Zero em dashes.
 */
import { useEffect, useState } from 'react';

const DISMISS_KEY = 'divini_install_dismissed_v1';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* ignore */
  }
}

// Avoid stacking this on top of CookieBanner (components/CookieBanner.tsx),
// which owns the same fixed bottom-of-screen slot for first-time visitors --
// wait until that decision is made (its key is set either way, accept or
// reject) before offering the install prompt.
function cookieDecisionMade(): boolean {
  try {
    return localStorage.getItem('divini_consent_v1') !== null;
  } catch {
    return true;
  }
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone() || dismissed()) return;
    let cancelled = false;
    let pendingReveal: (() => void) | null = null;

    // Defer actually SHOWING the banner until the cookie-consent decision is
    // made (or 20s pass, so this never permanently hides for a visitor who
    // just ignores the cookie banner) -- both are the same fixed
    // bottom-of-screen slot, and this one is the less urgent of the two.
    function revealWhenReady(reveal: () => void) {
      if (cookieDecisionMade()) {
        reveal();
        return;
      }
      pendingReveal = reveal;
      const started = Date.now();
      const check = setInterval(() => {
        if (cancelled) return clearInterval(check);
        if (cookieDecisionMade() || Date.now() - started > 20_000) {
          clearInterval(check);
          if (pendingReveal) pendingReveal();
        }
      }, 1000);
    }

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      revealWhenReady(() => setVisible(true));
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);

    // iOS Safari never fires beforeinstallprompt. Show the manual-steps hint
    // instead, once, for visitors who are actually in Safari (not an
    // in-app browser, which cannot install anything).
    if (isIos() && /safari/i.test(window.navigator.userAgent) && !/crios|fxios/i.test(window.navigator.userAgent)) {
      setShowIosHint(true);
      revealWhenReady(() => setVisible(true));
    }

    return () => {
      cancelled = true;
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    };
  }, []);

  if (!visible) return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setVisible(false);
    dismiss();
  }

  function close() {
    setVisible(false);
    dismiss();
  }

  return (
    <div
      role="dialog"
      aria-label="Install Divini Partners"
      style={{
        position: 'fixed', left: 16, right: 16, bottom: 16, maxWidth: 480, margin: '0 auto', zIndex: 9998,
        background: '#123c2e', color: '#f3efe6', borderRadius: 16, padding: '16px 18px',
        fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13.5, lineHeight: 1.5,
        boxShadow: '0 30px 60px -30px rgba(0,0,0,.5)', display: 'flex', gap: 12, alignItems: 'center',
      }}
    >
      <img src="/brand/icon-192.png" alt="" width={40} height={40} style={{ borderRadius: 9, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, marginBottom: 2 }}>Install Divini Partners</div>
        {showIosHint ? (
          <div style={{ opacity: 0.9 }}>Tap the Share icon, then "Add to Home Screen" for one-tap access.</div>
        ) : (
          <div style={{ opacity: 0.9 }}>Add it to your home screen for one-tap access to your events.</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {!showIosHint && (
          <button
            onClick={install}
            style={{ background: '#d8c8a0', color: '#123c2e', border: 'none', borderRadius: 9, padding: '9px 13px', fontWeight: 700, cursor: 'pointer', font: 'inherit', fontSize: 13 }}
          >
            Install
          </button>
        )}
        <button
          onClick={close}
          aria-label="Dismiss"
          style={{ background: 'transparent', color: '#f3efe6', border: '1px solid rgba(243,239,230,.5)', borderRadius: 9, padding: '9px 11px', cursor: 'pointer', font: 'inherit', fontSize: 13 }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
