import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { NavItem } from '../pages/dashboards/DashboardShell';

/**
 * Guided onboarding for first-time members.
 *
 * Two coordinated surfaces, both driven off the SAME nav `items` the live
 * DashboardShell renders, so the guidance always points at real routes:
 *   1. A spotlight TOUR that dims the app and highlights real sidebar buttons
 *      (`.dpdash-navitem`), stepping through the highest-value places to start.
 *   2. A persistent "Getting started" CHECKLIST that deep-links into the same
 *      routes and remembers what's done.
 *
 * Zero server calls. State lives in localStorage so it never nags twice and
 * survives reloads. Rendered inside DashboardShell's content area; it anchors
 * to the sidebar that is guaranteed to be on-screen there.
 */

type Props = {
  items: NavItem[];
  navLabel: string;
  onNavigate: (to: string) => void;
};

const K_TOUR = 'divini_onboard_tour_v2';
const K_CHECK = 'divini_onboard_checklist_v2';
const K_DISMISS = 'divini_onboard_dismissed_v2';

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage may be unavailable (private mode); guidance is best-effort */
  }
}

type Rect = { top: number; left: number; width: number; height: number } | null;

function navButtonRect(label: string): Rect {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('.dpdash-navitem'));
  const match = nodes.find((n) => {
    const t = n.querySelector('.dpdash-navtext')?.textContent ?? n.textContent ?? '';
    return t.trim() === label.trim();
  });
  if (!match) return null;
  const r = match.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export default function OnboardingGuide({ items, navLabel, onNavigate }: Props) {
  // Resolve the meaningful destinations out of the live nav so nothing is a dead link.
  const find = (pred: (i: NavItem) => boolean) => items.find((i) => i.to && pred(i));
  const profile = find((i) => i.to === '/profile') ?? find((i) => /profile|company|account/i.test(i.label));
  const referral = find((i) => i.to === '/referral-dashboard') ?? find((i) => /refer/i.test(i.label));
  const payout = find((i) => /payout|connect-payouts/i.test(i.to || '')) ?? find((i) => /payout|bank/i.test(i.label));
  const primary = items.find((i) => i.to && i.to !== '/app') ?? items[0];
  const first = items[0];

  const workspaceName = (navLabel || '').replace(/workspace/i, '').trim();

  // ---- TOUR ------------------------------------------------------------
  type Step = { title: string; body: string; targetLabel?: string };
  const steps = useMemo<Step[]>(() => {
    const s: Step[] = [
      {
        title: `Welcome to Divini Partners`,
        body: `You're all set up. This quick tour shows the three things worth doing first so you start getting value today. Takes about 20 seconds.`,
      },
    ];
    if (first) {
      s.push({
        title: 'This is your navigation',
        body: `Every tool for ${workspaceName ? workspaceName : 'your'} workspace lives in this sidebar. You can always get back here from any page.`,
        targetLabel: first.label,
      });
    }
    if (profile) {
      s.push({
        title: 'Complete your profile first',
        body: `A complete profile is what wins work and builds trust. Add your details, logo, and what you offer — it only takes a few minutes.`,
        targetLabel: profile.label,
      });
    }
    if (referral) {
      s.push({
        title: 'Refer & earn',
        body: `Share your referral link and earn rewards when partners you invite join and transact. Your link and earnings live here.`,
        targetLabel: referral.label,
      });
    }
    s.push({
      title: `You're ready to go`,
      body: `That's the tour. Your "Getting started" checklist stays in the corner so you can finish setup whenever you like.`,
    });
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, navLabel]);

  const [tourStep, setTourStep] = useState<number>(() => (localStorage.getItem(K_TOUR) ? -1 : 0));
  const [rect, setRect] = useState<Rect>(null);

  const measure = () => {
    const step = steps[tourStep];
    if (tourStep < 0 || !step || !step.targetLabel) {
      setRect(null);
      return;
    }
    setRect(navButtonRect(step.targetLabel));
  };

  useLayoutEffect(() => {
    measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourStep, steps]);

  useEffect(() => {
    if (tourStep < 0) return;
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourStep, steps]);

  const endTour = () => {
    localStorage.setItem(K_TOUR, 'done');
    setTourStep(-1);
  };

  // ---- CHECKLIST -------------------------------------------------------
  type Task = { id: string; label: string; hint: string; to: string };
  const tasks = useMemo<Task[]>(() => {
    const t: Task[] = [];
    if (profile && profile.to) t.push({ id: 'profile', label: 'Complete your company profile', hint: 'Logo, details, and what you offer', to: profile.to });
    if (primary && primary.to) t.push({ id: 'explore', label: `Explore ${primary.label}`, hint: 'See your workspace in action', to: primary.to });
    if (payout && payout.to) t.push({ id: 'payout', label: 'Set up how you get paid', hint: 'Connect your payout account', to: payout.to });
    if (referral && referral.to) t.push({ id: 'referral', label: 'Grab your referral link', hint: 'Invite partners and earn rewards', to: referral.to });
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const [done, setDone] = useState<Record<string, boolean>>(() => readJSON<Record<string, boolean>>(K_CHECK, {}));
  const [dismissed, setDismissed] = useState<boolean>(() => localStorage.getItem(K_DISMISS) === '1');
  const [collapsed, setCollapsed] = useState<boolean>(false);

  const markDone = (id: string) => {
    setDone((prev) => {
      const next = { ...prev, [id]: true };
      writeJSON(K_CHECK, next);
      return next;
    });
  };
  const dismissChecklist = () => {
    localStorage.setItem(K_DISMISS, '1');
    setDismissed(true);
  };

  const doneCount = tasks.filter((t) => done[t.id]).length;
  const allDone = tasks.length > 0 && doneCount === tasks.length;

  const goTask = (t: Task) => {
    markDone(t.id);
    onNavigate(t.to);
  };
  const goStepTarget = () => {
    const step = steps[tourStep];
    const item = step?.targetLabel ? items.find((i) => i.label === step.targetLabel) : undefined;
    if (item?.to) {
      endTour();
      onNavigate(item.to);
    }
  };

  const showTour = tourStep >= 0 && steps.length > 0;
  const showChecklist = !showTour && !dismissed && tasks.length > 0 && !allDone;

  // Tooltip placement: beside the highlighted sidebar button, else centered.
  const tip: React.CSSProperties = rect
    ? {
        position: 'fixed',
        top: Math.max(16, Math.min(rect.top - 8, window.innerHeight - 260)),
        left: Math.min(rect.left + rect.width + 18, window.innerWidth - 360),
      }
    : { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

  if (!showTour && !showChecklist) return null;

  return (
    <>
      <style>{CSS}</style>

      {showTour && (
        <div className="dgo-tour" role="dialog" aria-modal="true" aria-label="Getting started tour">
          {rect ? (
            <div
              className="dgo-spot"
              style={{ position: 'fixed', top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
            />
          ) : (
            <div className="dgo-scrim" />
          )}

          <div className="dgo-card" style={tip}>
            <div className="dgo-step">
              Step {tourStep + 1} of {steps.length}
            </div>
            <h3 className="dgo-title">{steps[tourStep].title}</h3>
            <p className="dgo-body">{steps[tourStep].body}</p>
            <div className="dgo-row">
              <button type="button" className="dgo-skip" onClick={endTour}>
                Skip
              </button>
              <div className="dgo-actions">
                {tourStep > 0 && (
                  <button type="button" className="dgo-ghost" onClick={() => setTourStep((s) => Math.max(0, s - 1))}>
                    Back
                  </button>
                )}
                {steps[tourStep].targetLabel && (
                  <button type="button" className="dgo-ghost" onClick={goStepTarget}>
                    Take me there
                  </button>
                )}
                {tourStep < steps.length - 1 ? (
                  <button type="button" className="dgo-primary" onClick={() => setTourStep((s) => s + 1)}>
                    Next
                  </button>
                ) : (
                  <button type="button" className="dgo-primary" onClick={endTour}>
                    Done
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showChecklist && (
        <div className={`dgo-check${collapsed ? ' is-collapsed' : ''}`}>
          <button type="button" className="dgo-check-head" onClick={() => setCollapsed((c) => !c)}>
            <span className="dgo-check-title">Getting started</span>
            <span className="dgo-check-count">
              {doneCount}/{tasks.length}
            </span>
            <span className="dgo-check-chev" aria-hidden="true">
              {collapsed ? '▲' : '▼'}
            </span>
          </button>

          {!collapsed && (
            <div className="dgo-check-body">
              <div className="dgo-progress" aria-hidden="true">
                <span style={{ width: `${tasks.length ? (doneCount / tasks.length) * 100 : 0}%` }} />
              </div>
              <ul className="dgo-tasks">
                {tasks.map((t) => (
                  <li key={t.id} className={done[t.id] ? 'is-done' : ''}>
                    <button type="button" className="dgo-check-box" onClick={() => markDone(t.id)} aria-label={done[t.id] ? 'Done' : 'Mark done'}>
                      {done[t.id] ? '✓' : ''}
                    </button>
                    <button type="button" className="dgo-task-link" onClick={() => goTask(t)}>
                      <span className="dgo-task-label">{t.label}</span>
                      <span className="dgo-task-hint">{t.hint}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="dgo-dismiss" onClick={dismissChecklist}>
                Dismiss checklist
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

const CSS = `
.dgo-tour { position: fixed; inset: 0; z-index: 4000; }
.dgo-scrim { position: fixed; inset: 0; background: rgba(18,28,24,.55); }
.dgo-spot {
  border-radius: 11px;
  box-shadow: 0 0 0 3px #C9A35B, 0 0 0 9999px rgba(18,28,24,.62);
  pointer-events: none;
  transition: top .18s ease, left .18s ease, width .18s ease, height .18s ease;
}
.dgo-card {
  width: 340px; max-width: calc(100vw - 32px);
  background: #fff; color: #2c2a26; border-radius: 16px;
  border: 1px solid #e7e1d6;
  box-shadow: 0 24px 60px rgba(18,28,24,.32);
  padding: 20px 20px 16px; z-index: 4001;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}
.dgo-step { font-size: 10.5px; letter-spacing: 1.3px; text-transform: uppercase; color: #C9A35B; font-weight: 700; }
.dgo-title { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 23px; color: #123c2e; margin: 4px 0 8px; line-height: 1.12; }
.dgo-body { font-size: 13.5px; line-height: 1.6; color: #5c574e; margin: 0 0 16px; }
.dgo-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.dgo-actions { display: flex; align-items: center; gap: 8px; }
.dgo-skip { background: transparent; border: 0; color: #9a9488; font: inherit; font-size: 12.5px; cursor: pointer; padding: 6px 2px; }
.dgo-skip:hover { color: #5c574e; }
.dgo-ghost, .dgo-primary {
  font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer;
  border-radius: 9px; padding: 8px 14px; transition: background .15s ease, border-color .15s ease;
}
.dgo-ghost { background: transparent; color: #123c2e; border: 1px solid #e2dccf; }
.dgo-ghost:hover { border-color: #123c2e; background: rgba(18,60,46,.04); }
.dgo-primary { background: #123c2e; color: #fff; border: 1px solid #123c2e; }
.dgo-primary:hover { background: #1E5D4A; }

.dgo-check {
  position: fixed; right: 22px; bottom: 22px; z-index: 3500;
  width: 320px; max-width: calc(100vw - 32px);
  background: #fff; border: 1px solid #e7e1d6; border-radius: 15px;
  box-shadow: 0 18px 44px rgba(18,28,24,.22);
  overflow: hidden;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}
.dgo-check-head {
  display: flex; align-items: center; gap: 10px; width: 100%;
  background: linear-gradient(120deg, #123c2e, #1E5D4A); color: #F7F4EE;
  border: 0; cursor: pointer; font: inherit; padding: 13px 15px; text-align: left;
}
.dgo-check-title { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 17px; font-weight: 600; flex: 1 1 auto; }
.dgo-check-count {
  font-size: 11.5px; font-weight: 700; color: #123c2e; background: #C9A35B;
  border-radius: 999px; padding: 2px 9px;
}
.dgo-check-chev { font-size: 10px; color: rgba(247,244,238,.8); }

.dgo-check-body { padding: 12px 14px 14px; }
.dgo-progress { height: 6px; border-radius: 999px; background: #eee7da; overflow: hidden; margin: 2px 0 12px; }
.dgo-progress span { display: block; height: 100%; background: linear-gradient(90deg, #C9A35B, #b58e44); transition: width .3s ease; }

.dgo-tasks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.dgo-tasks li { display: flex; align-items: flex-start; gap: 10px; padding: 6px 4px; border-radius: 9px; }
.dgo-tasks li:hover { background: rgba(18,60,46,.04); }
.dgo-check-box {
  flex: 0 0 20px; width: 20px; height: 20px; margin-top: 1px;
  border-radius: 6px; border: 1.5px solid #cfc7b6; background: #fff;
  color: #123c2e; font-size: 12px; font-weight: 800; cursor: pointer;
  display: flex; align-items: center; justify-content: center; transition: all .15s ease;
}
.dgo-tasks li.is-done .dgo-check-box { background: #123c2e; border-color: #123c2e; color: #C9A35B; }
.dgo-task-link { flex: 1 1 auto; text-align: left; background: transparent; border: 0; cursor: pointer; font: inherit; padding: 0; display: flex; flex-direction: column; gap: 1px; }
.dgo-task-label { font-size: 13px; font-weight: 600; color: #2c2a26; }
.dgo-tasks li.is-done .dgo-task-label { color: #9a9488; text-decoration: line-through; }
.dgo-task-hint { font-size: 11.5px; color: #9a9488; }
.dgo-dismiss { margin-top: 10px; background: transparent; border: 0; color: #9a9488; font: inherit; font-size: 12px; cursor: pointer; padding: 4px 2px; }
.dgo-dismiss:hover { color: #5c574e; }

@media (max-width: 760px) {
  .dgo-card { position: fixed !important; top: auto !important; bottom: 16px; left: 16px !important; right: 16px; transform: none !important; width: auto; }
  .dgo-check { right: 12px; left: 12px; bottom: 12px; width: auto; }
}
`;
