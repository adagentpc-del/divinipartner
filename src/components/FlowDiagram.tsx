import { useEffect, useState } from 'react';

/**
 * FlowDiagram - an elegant, animated "how it works" flow. Renders connected
 * steps (icon + title + line) with a moving highlight that walks the path.
 * Self-contained, brand styled. Pass role-specific steps.
 */

export type FlowStep = { icon?: string; title: string; desc?: string };

export default function FlowDiagram({ steps, title, intro }: { steps: FlowStep[]; title?: string; intro?: string }) {
  const [active, setActive] = useState(0);
  const n = steps.length || 1;
  useEffect(() => {
    const t = setInterval(() => setActive((i) => (i + 1) % n), 2200);
    return () => clearInterval(t);
  }, [n]);

  return (
    <div className="fd">
      <style>{FD_CSS}</style>
      {title ? <h3 className="fd-title">{title}</h3> : null}
      {intro ? <p className="fd-intro">{intro}</p> : null}
      <div className="fd-track">
        {steps.map((s, i) => (
          <div className={'fd-step' + (i <= active ? ' lit' : '') + (i === active ? ' now' : '')} key={i}>
            <div className="fd-node">
              <span className="fd-ic">{s.icon ?? String(i + 1)}</span>
            </div>
            <div className="fd-body">
              <div className="fd-st">{s.title}</div>
              {s.desc ? <div className="fd-sd">{s.desc}</div> : null}
            </div>
            {i < steps.length - 1 ? <div className={'fd-conn' + (i < active ? ' lit' : '')} /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

const FD_CSS = `
.fd{--em:#123c2e;--em2:#1E5D4A;--gold:#C9A35B;--ink:#2c2a26;--mut:#7d776c;--line:#e7e1d6;font-family:Inter,system-ui,sans-serif}
.fd *{box-sizing:border-box}
.fd-title{font-family:'Cormorant Garamond',Georgia,serif;font-size:30px;color:var(--em);text-align:center;margin:0 0 6px;font-weight:600}
.fd-intro{text-align:center;color:var(--mut);font-size:15px;max-width:580px;margin:0 auto 30px;line-height:1.6}
.fd-track{display:flex;flex-wrap:wrap;gap:0;justify-content:center}
.fd-step{position:relative;flex:1 1 0;min-width:150px;max-width:230px;display:flex;flex-direction:column;align-items:center;text-align:center;padding:0 8px}
.fd-node{width:56px;height:56px;border-radius:16px;display:grid;place-items:center;background:#fff;border:1px solid var(--line);color:var(--mut);transition:.5s;position:relative;z-index:2}
.fd-ic{font-size:22px;line-height:1}
.fd-step.lit .fd-node{border-color:var(--em);color:var(--em);background:#f0f6f2}
.fd-step.now .fd-node{background:var(--em);color:#fff;border-color:var(--em);transform:translateY(-4px);box-shadow:0 16px 30px -16px rgba(18,60,46,.6)}
.fd-body{margin-top:12px}
.fd-st{font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;color:var(--em);font-weight:600;line-height:1.15}
.fd-sd{font-size:12.5px;color:var(--mut);line-height:1.5;margin-top:5px}
.fd-conn{position:absolute;top:28px;left:calc(50% + 30px);width:calc(100% - 60px);height:2px;background:var(--line);z-index:1;transition:.5s}
.fd-conn.lit{background:linear-gradient(90deg,var(--em),var(--gold))}
@media(max-width:760px){.fd-track{flex-direction:column;align-items:stretch}.fd-step{flex-direction:row;text-align:left;gap:14px;max-width:none;padding:10px 0}.fd-body{margin-top:0}.fd-conn{display:none}}
`;
