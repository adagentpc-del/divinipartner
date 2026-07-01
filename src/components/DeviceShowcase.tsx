import { useEffect, useState } from 'react';

/**
 * DeviceShowcase - a premium, animated product demo. Renders a desktop browser
 * frame and an iPhone frame side by side, both cycling through real-looking
 * platform screens with smooth motion. Fully coded (no external assets), brand
 * styled, data-driven. Pass role-specific screens; a synced caption rail shows
 * the active step. Looks like a Four Seasons brand film for software.
 */

export type ShowItem = { label: string; meta?: string; status?: 'ok' | 'warn' | 'gold' | 'mute' };
export type ShowScreen = {
  title: string;
  caption: string;       // the step caption shown in the rail
  items?: ShowItem[];
  chart?: number[];      // 0..100 bars
  big?: { value: string; label: string };
};

function ScreenView({ s }: { s: ShowScreen }) {
  return (
    <div className="ds-screen-inner">
      <div className="ds-scn-title">{s.title}</div>
      {s.big && (
        <div className="ds-big">
          <span className="ds-big-v">{s.big.value}</span>
          <span className="ds-big-l">{s.big.label}</span>
        </div>
      )}
      {s.items?.map((it, i) => (
        <div className="ds-row" key={i}>
          <div className="ds-row-main">
            <div className="ds-row-label">{it.label}</div>
            {it.meta ? <div className="ds-row-meta">{it.meta}</div> : null}
          </div>
          {it.status ? <span className="ds-pill" data-s={it.status}>{it.status === 'ok' ? 'Ready' : it.status === 'warn' ? 'Action' : it.status === 'gold' ? 'Premier' : 'Draft'}</span> : null}
        </div>
      ))}
      {s.chart && (
        <div className="ds-bars">
          {s.chart.map((h, i) => <div key={i} style={{ height: `${Math.max(8, Math.min(100, h))}%` }} />)}
        </div>
      )}
    </div>
  );
}

export default function DeviceShowcase({ screens, label }: { screens: ShowScreen[]; label?: string }) {
  const [active, setActive] = useState(0);
  const n = screens.length || 1;
  useEffect(() => {
    const t = setInterval(() => setActive((i) => (i + 1) % n), 3000);
    return () => clearInterval(t);
  }, [n]);

  return (
    <div className="ds">
      <style>{DS_CSS}</style>
      <div className="ds-stage">
        {/* Browser */}
        <div className="ds-browser">
          <div className="ds-chrome">
            <span className="ds-dot" /><span className="ds-dot" /><span className="ds-dot" />
            <div className="ds-url">divinipartners.com/app</div>
          </div>
          <div className="ds-viewport">
            {screens.map((s, i) => (
              <div className={'ds-screen' + (i === active ? ' on' : '')} key={i}><ScreenView s={s} /></div>
            ))}
          </div>
        </div>

        {/* iPhone */}
        <div className="ds-phone">
          <div className="ds-notch" />
          <div className="ds-phone-vp">
            {screens.map((s, i) => (
              <div className={'ds-pscreen' + (i === active ? ' on' : '')} key={i}><ScreenView s={s} /></div>
            ))}
          </div>
        </div>
      </div>

      {/* caption rail */}
      <div className="ds-rail">
        {label ? <div className="ds-rail-label">{label}</div> : null}
        <ol className="ds-steps">
          {screens.map((s, i) => (
            <li key={i} className={i === active ? 'on' : ''} onClick={() => setActive(i)}>
              <span className="ds-num">{i + 1}</span>
              <span className="ds-cap">{s.caption}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

const DS_CSS = `
.ds{--em:#123c2e;--em2:#1E5D4A;--gold:#C9A35B;--ivory:#F7F4EE;--ink:#2c2a26;--mut:#7d776c;--line:#e7e1d6;
  display:grid;grid-template-columns:1.45fr .9fr;gap:34px;align-items:center;font-family:Inter,system-ui,sans-serif}
.ds *{box-sizing:border-box}
.ds-stage{position:relative;display:flex;align-items:flex-end;gap:0;min-height:360px}
.ds-browser{flex:1;background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden;box-shadow:0 40px 80px -40px rgba(18,60,46,.5)}
.ds-chrome{height:34px;background:#f4f0e8;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:6px;padding:0 12px}
.ds-dot{width:9px;height:9px;border-radius:50%;background:#dcd5c8}
.ds-url{margin-left:10px;font-size:11px;color:var(--mut);background:#fff;border:1px solid var(--line);border-radius:20px;padding:3px 12px}
.ds-viewport{position:relative;height:330px;background:linear-gradient(170deg,#fbf9f4,#f1ece1)}
.ds-screen{position:absolute;inset:0;padding:18px 20px;opacity:0;transform:translateY(10px) scale(.99);transition:opacity .7s ease,transform .7s ease}
.ds-screen.on{opacity:1;transform:none}

.ds-phone{position:relative;width:170px;margin-left:-46px;margin-bottom:6px;background:#16181d;border-radius:30px;padding:9px;box-shadow:0 40px 70px -34px rgba(0,0,0,.6);border:1px solid #2b2b30}
.ds-notch{position:absolute;top:14px;left:50%;transform:translateX(-50%);width:54px;height:7px;background:#000;border-radius:10px;z-index:2}
.ds-phone-vp{position:relative;height:330px;background:linear-gradient(170deg,#fbf9f4,#efe9dd);border-radius:23px;overflow:hidden}
.ds-pscreen{position:absolute;inset:0;padding:22px 12px 12px;opacity:0;transform:translateY(8px);transition:opacity .7s ease,transform .7s ease}
.ds-pscreen.on{opacity:1;transform:none}

.ds-scn-title{font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;color:var(--em);font-weight:600;margin-bottom:12px}
.ds-row{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#fff;border:1px solid var(--line);border-radius:9px;padding:9px 11px;margin-bottom:8px;box-shadow:0 6px 14px -12px rgba(0,0,0,.25)}
.ds-row-label{font-size:12.5px;font-weight:600;color:var(--ink)}
.ds-row-meta{font-size:10.5px;color:var(--mut);margin-top:2px}
.ds-pill{font-size:9.5px;font-weight:700;padding:3px 8px;border-radius:20px;white-space:nowrap}
.ds-pill[data-s=ok]{background:#e7f3ec;color:#1f7a4d}
.ds-pill[data-s=warn]{background:#fbf2dc;color:#8a6d1a}
.ds-pill[data-s=gold]{background:rgba(201,163,91,.22);color:#8a6d1a}
.ds-pill[data-s=mute]{background:#eee9df;color:#6b6358}
.ds-big{display:flex;flex-direction:column;align-items:center;padding:14px 0 10px}
.ds-big-v{font-family:'Cormorant Garamond',Georgia,serif;font-size:42px;color:var(--em);line-height:1}
.ds-big-l{font-size:11px;color:var(--mut);letter-spacing:.5px;text-transform:uppercase;margin-top:4px}
.ds-bars{display:flex;align-items:flex-end;gap:7px;height:88px;margin-top:10px}
.ds-bars div{flex:1;background:linear-gradient(180deg,var(--em2),var(--em));border-radius:5px 5px 0 0;opacity:.9}

.ds-rail-label{font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:var(--gold);font-weight:700;margin-bottom:12px}
.ds-steps{list-style:none;margin:0;padding:0}
.ds-steps li{display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:11px;cursor:pointer;color:var(--mut);transition:.25s}
.ds-steps li.on{background:#fff;color:var(--em);box-shadow:0 10px 26px -18px rgba(18,60,46,.5)}
.ds-num{flex-shrink:0;width:26px;height:26px;border-radius:8px;display:grid;place-items:center;font-size:12px;font-weight:700;background:var(--line);color:var(--mut)}
.ds-steps li.on .ds-num{background:var(--em);color:#fff}
.ds-cap{font-size:13.5px;font-weight:500;line-height:1.4}

@media(max-width:860px){.ds{grid-template-columns:1fr;gap:22px}.ds-phone{display:none}}
`;
