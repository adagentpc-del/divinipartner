import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * OnboardingGuide - first-run guided onboarding for new members.
 *
 * Two parts, both role-aware and self-contained (no external tour library):
 *   1. A spotlight TOUR that runs once on first app entry. It dims the screen,
 *      cuts a spotlight hole around the real nav item for each step, and shows a
 *      popover that tells the person where they are and what to do next
 *      (Back / Skip / Next). Steps whose target is not on the page are skipped
 *      gracefully. Completion is remembered in localStorage.
 *   2. A persistent "Getting started" CHECKLIST card (dismissible) that tracks
 *      setup progress. Each item links straight to the right page; items are
 *      remembered in localStorage and the card auto-hides once everything is done
 *      or the user dismisses it. A "Take the tour" link re-opens the tour.
 *
 * Mounted inside Shell for signed-in members with a company. Zero server calls,
 * so it can never break a page. Zero em dashes in user copy is not required here,
 * but styling is kept in the Divini palette.
 */

type Role = string;

type TourStep = {
  navLabel?: string; // nav item text to spotlight; omit for a centered card
  title: string;
  body: string;
};

type CheckItem = {
  key: string;
  label: string;
  link: string;
  auto?: boolean; // pre-completed (e.g. account created)
};

const TOUR_KEY = 'divini_tour_v1';
const CHECK_KEY = 'divini_checklist_v1';
const CHECK_DISMISS_KEY = 'divini_checklist_dismissed_v1';

function isVendorRole(role: Role): boolean {
  return role === 'vendor' || role === 'supplier' || role === 'installer';
}

function tourSteps(role: Role): TourStep[] {
  const welcome: TourStep = {
    title: 'Welcome to Divini Partners',
    body: 'Let us take 30 seconds to show you around so you know exactly where to go and what to do next.',
  };
  const refer: TourStep = {
    navLabel: 'Refer & Earn',
    title: 'Refer & Earn',
    body: 'Invite venues, vendors, planners, or clients. When they join you earn a $10 credit, and they get 50% off their first two months.',
  };
  if (isVendorRole(role)) {
    return [
      welcome,
      { navLabel: 'Dashboard', title: 'Your Dashboard', body: 'This is your command center. Your activity, matches, and next best actions all live here.' },
      { navLabel: 'Search Bids', title: 'Find work', body: 'Browse open opportunities matched to your services. This is where new business comes from.' },
      { navLabel: 'My Bids', title: 'Track your quotes', body: 'Everything you have quoted or won is here, from first response to booked event.' },
      { navLabel: 'Pricing Rules', title: 'Set your pricing', body: 'Add your services and pricing so you can quote fast and get matched to the right jobs.' },
      refer,
      { navLabel: 'Profile', title: 'Finish your profile', body: 'Complete your profile so clients can find and trust you. When you are done, use the Getting started checklist below to finish setup.' },
    ];
  }
  return [
    welcome,
    { navLabel: 'Dashboard', title: 'Your Dashboard', body: 'This is your command center. Your events, quotes, and next best actions all live here.' },
    { navLabel: 'Projects', title: 'Create an event', body: 'Start an event or project here, then source and compare vendors in one place.' },
    { navLabel: 'Command Center', title: 'Your daily priorities', body: 'What needs your attention today, ranked. Check this first each day.' },
    refer,
    { navLabel: 'Company', title: 'Finish your profile', body: 'Complete your company profile so you get matched to the right partners. When you are done, use the Getting started checklist below.' },
  ];
}

function checkItems(role: Role): CheckItem[] {
  const common: CheckItem[] = [
    { key: 'account', label: 'Create your account', link: '/app', auto: true },
    { key: 'profile', label: 'Complete your profile', link: isVendorRole(role) ? '/profile' : '/profile' },
    { key: 'refer', label: 'Invite a partner and earn $10', link: '/referral-dashboard' },
  ];
  if (isVendorRole(role)) {
    return [
      common[0],
      common[1],
      { key: 'pricing', label: 'List your services and pricing', link: '/vendor-pricing' },
      { key: 'bid', label: 'Find and bid on your first job', link: '/search-bids' },
      common[2],
    ];
  }
  return [
    common[0],
    common[1],
    { key: 'project', label: 'Create your first event', link: '/projects' },
    { key: 'marketplace', label: 'Explore the marketplace', link: '/marketplace' },
    common[2],
  ];
}

function readDone(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(CHECK_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

export default function OnboardingGuide({ role }: { role: Role }) {
  const nav = useNavigate();
  const steps = useMemo(() => tourSteps(role), [role]);
  const items = useMemo(() => checkItems(role), [role]);

  // ---- Tour state ----
  const [tourActive, setTourActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // ---- Checklist state ----
  const [done, setDone] = useState<Record<string, boolean>>(() => readDone());
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(TOUR_KEY)) setTourActive(true);
      setDismissed(Boolean(localStorage.getItem(CHECK_DISMISS_KEY)));
    } catch {
      /* storage unavailable: default to showing nothing intrusive */
    }
  }, []);

  const finishTour = (markDone = true) => {
    setTourActive(false);
    if (markDone) {
      try {
        localStorage.setItem(TOUR_KEY, '1');
      } catch {
        /* ignore */
      }
    }
  };

  // Find the DOM node for the current step's nav label (best-effort).
  const findTarget = (label?: string): HTMLElement | null => {
    if (!label) return null;
    const anchors = Array.from(document.querySelectorAll('aside.sidebar nav.nav a')) as HTMLElement[];
    return anchors.find((a) => (a.textContent || '').trim().includes(label)) || null;
  };

  // Advance past steps whose target is missing so the tour never dead-ends.
  const resolveStep = (idx: number, dir: 1 | -1): number => {
    let i = idx;
    while (i >= 0 && i < steps.length) {
      const s = steps[i];
      if (!s.navLabel || findTarget(s.navLabel)) return i;
      i += dir;
    }
    return -1;
  };

  useLayoutEffect(() => {
    if (!tourActive) return;
    const step = steps[stepIdx];
    const measure = () => {
      const el = findTarget(step?.navLabel);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [tourActive, stepIdx, steps]);

  const go = (dir: 1 | -1) => {
    const next = resolveStep(stepIdx + dir, dir);
    if (next === -1) {
      finishTour(true);
      return;
    }
    setStepIdx(next);
  };

  const startTour = () => {
    setStepIdx(resolveStep(0, 1));
    setTourActive(true);
  };

  const toggleItem = (key: string, auto?: boolean) => {
    if (auto) return;
    setDone((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(CHECK_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const isItemDone = (it: CheckItem) => it.auto || done[it.key];
  const doneCount = items.filter(isItemDone).length;
  const allDone = doneCount >= items.length;

  const dismissChecklist = () => {
    setDismissed(true);
    try {
      localStorage.setItem(CHECK_DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  // ---- Popover placement ----
  const popStyle = useMemo(() => {
    if (!rect) {
      return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' } as const;
    }
    const gap = 16;
    const vw = window.innerWidth;
    // Sidebar is on the left; place popover to the RIGHT of the nav item when
    // there is room, otherwise below it (mobile bottom nav / narrow screens).
    if (vw > 720 && rect.right + 340 < vw) {
      return { left: `${rect.right + gap}px`, top: `${Math.max(12, rect.top - 8)}px` } as const;
    }
    return { left: '50%', top: `${Math.min(window.innerHeight - 240, rect.bottom + gap)}px`, transform: 'translateX(-50%)' } as const;
  }, [rect]);

  const step = steps[stepIdx];
  const showChecklist = !dismissed && !allDone;

  return (
    <>
      {/* ---- Getting started checklist ---- */}
      {showChecklist && (
        <div className="dg-checklist">
          <div className="dg-ck-head">
            <div>
              <div className="dg-ck-title">Getting started</div>
              <div className="dg-ck-sub">{doneCount} of {items.length} done</div>
            </div>
            <button className="dg-x" onClick={dismissChecklist} aria-label="Dismiss">×</button>
          </div>
          <div className="dg-bar"><div className="dg-bar-fill" style={{ width: `${(doneCount / items.length) * 100}%` }} /></div>
          <ul className="dg-ck-list">
            {items.map((it) => {
              const d = isItemDone(it);
              return (
                <li key={it.key} className={d ? 'done' : ''}>
                  <button className="dg-check" onClick={() => toggleItem(it.key, it.auto)} aria-label={d ? 'Completed' : 'Mark complete'}>
                    {d ? '✓' : ''}
                  </button>
                  <span className="dg-ck-label">{it.label}</span>
                  {!d && (
                    <button className="dg-go" onClick={() => nav(it.link)}>Go</button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="dg-ck-foot">
            <button className="dg-link" onClick={startTour}>↻ Take the guided tour</button>
          </div>
        </div>
      )}

      {/* ---- Spotlight tour ---- */}
      {tourActive && step && (
        <div className="dg-tour" role="dialog" aria-modal="true">
          {rect ? (
            <div
              className="dg-spot"
              style={{
                left: `${rect.left - 6}px`,
                top: `${rect.top - 6}px`,
                width: `${rect.width + 12}px`,
                height: `${rect.height + 12}px`,
              }}
            />
          ) : (
            <div className="dg-dim" />
          )}
          <div className="dg-pop" style={popStyle}>
            <div className="dg-steps">Step {stepIdx + 1} of {steps.length}</div>
            <div className="dg-title">{step.title}</div>
            <div className="dg-body">{step.body}</div>
            <div className="dg-actions">
              <button className="dg-skip" onClick={() => finishTour(true)}>Skip tour</button>
              <div className="dg-right">
                {stepIdx > 0 && <button className="dg-back" onClick={() => go(-1)}>Back</button>}
                <button className="dg-next" onClick={() => go(1)}>
                  {stepIdx >= steps.length - 1 ? 'Finish' : 'Next →'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .dg-checklist{background:#fff;border:1px solid #e4ddcd;border-radius:14px;padding:16px 18px;margin:0 0 18px;box-shadow:0 20px 40px -32px rgba(18,60,46,.35)}
        .dg-ck-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
        .dg-ck-title{font-weight:800;color:#123c2e;font-size:16px}
        .dg-ck-sub{color:#8a836f;font-size:12.5px;margin-top:1px}
        .dg-x{border:0;background:transparent;color:#a49b86;font-size:20px;line-height:1;cursor:pointer;padding:0 2px}
        .dg-x:hover{color:#6b6350}
        .dg-bar{height:6px;background:#eee7d8;border-radius:99px;margin:12px 0 12px;overflow:hidden}
        .dg-bar-fill{height:100%;background:linear-gradient(90deg,#1E5D4A,#2c7a5f);border-radius:99px;transition:width .3s}
        .dg-ck-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
        .dg-ck-list li{display:flex;align-items:center;gap:10px;padding:6px 0}
        .dg-check{width:22px;height:22px;min-width:22px;border-radius:6px;border:1.5px solid #cdc6b3;background:#fff;color:#1E5D4A;font-size:13px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center}
        .dg-ck-list li.done .dg-check{background:#1E5D4A;border-color:#1E5D4A;color:#fff}
        .dg-ck-list li.done .dg-ck-label{color:#9a9280;text-decoration:line-through}
        .dg-ck-label{flex:1;color:#2c2a26;font-size:14px}
        .dg-go{border:1px solid #1E5D4A;background:#f0f6f2;color:#1E5D4A;font-weight:700;font-size:12.5px;padding:4px 12px;border-radius:8px;cursor:pointer}
        .dg-go:hover{background:#1E5D4A;color:#fff}
        .dg-ck-foot{margin-top:12px;border-top:1px solid #efe9db;padding-top:10px}
        .dg-link{border:0;background:transparent;color:#1E5D4A;font-weight:700;font-size:13px;cursor:pointer;padding:0}
        .dg-link:hover{text-decoration:underline}

        .dg-tour{position:fixed;inset:0;z-index:9999}
        .dg-dim{position:absolute;inset:0;background:rgba(10,20,15,.62)}
        .dg-spot{position:absolute;border-radius:10px;box-shadow:0 0 0 9999px rgba(10,20,15,.62),0 0 0 3px #c9a86a inset;pointer-events:none;transition:all .2s ease}
        .dg-pop{position:absolute;width:320px;max-width:calc(100vw - 32px);background:#fff;border-radius:14px;padding:18px;box-shadow:0 24px 60px -18px rgba(0,0,0,.5);z-index:10000}
        .dg-steps{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#c9a86a}
        .dg-title{font-size:18px;font-weight:800;color:#123c2e;margin:6px 0 6px}
        .dg-body{font-size:14px;color:#4a4a44;line-height:1.5}
        .dg-actions{display:flex;align-items:center;justify-content:space-between;margin-top:16px}
        .dg-right{display:flex;gap:8px}
        .dg-skip{border:0;background:transparent;color:#9a9280;font-size:13px;cursor:pointer}
        .dg-skip:hover{color:#6b6350}
        .dg-back{border:1px solid #d9d2c1;background:#fff;color:#4a4a44;font-weight:700;font-size:13px;padding:7px 14px;border-radius:9px;cursor:pointer}
        .dg-next{border:0;background:#1E5D4A;color:#fff;font-weight:700;font-size:13px;padding:7px 16px;border-radius:9px;cursor:pointer}
        .dg-next:hover{background:#174a3b}
      `}</style>
    </>
  );
}
