import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';

export type NavItem = { label: string; icon?: string; to?: string };

export type Me = {
  name?: string;
  email?: string | null;
  role?: string;
  isAdmin?: boolean;
  organization?: { name?: string; tier?: string } | null;
};

/**
 * Adapts the live auth context into the `{ me, loading, signOut }` shape the
 * dashboard shells are designed against. The underlying provider exposes
 * `session`, `company`, `isAdmin`, `loading` and `signOut`; we project those
 * onto a stable `me` object so each role dashboard reads from one contract.
 */
export function useMe(): { me: Me | null; loading: boolean; signOut: () => void } {
  const auth = useAuth();
  const loading = !!auth?.loading;
  const session = auth?.session ?? null;
  const company = auth?.company ?? null;

  if (!session) {
    return { me: null, loading, signOut: () => { void auth?.signOut?.(); } };
  }

  const me: Me = {
    name: company?.name ?? company?.contact_name ?? undefined,
    email: session.user?.email ?? null,
    role: auth?.isAdmin ? 'admin' : company?.kind ?? undefined,
    isAdmin: !!auth?.isAdmin,
    organization: company ? { name: company.name, tier: undefined } : null,
  };

  return { me, loading, signOut: () => { void auth?.signOut?.(); } };
}

function initials(text?: string | null): string {
  if (!text) return 'D';
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'D';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function DashboardShell({
  title,
  navLabel,
  items,
  children,
}: {
  title: string;
  navLabel: string;
  items: NavItem[];
  children: React.ReactNode;
}) {
  const nav = useNavigate();
  const { me, loading, signOut } = useMe();

  const orgName = me?.organization?.name ?? me?.name ?? 'Your organization';
  const tier = me?.organization?.tier;
  const personLabel = me?.name ?? me?.email ?? 'Member';
  const roleLabel = me?.role ?? 'Member';

  return (
    <div className="dpdash">
      <style>{CSS}</style>

      <aside className="dpdash-side">
        <div className="dpdash-brand">
          <div className="dpdash-logomark">D</div>
          <div className="dpdash-brandtext">
            <span className="dpdash-brandname">Divini Partners</span>
            <span className="dpdash-brandby">by Divini Group</span>
          </div>
        </div>

        <div className="dpdash-navlabel">{navLabel}</div>

        <nav className="dpdash-nav" aria-label={navLabel}>
          {items.map((item, i) => (
            <button
              key={`${item.label}-${i}`}
              type="button"
              className={`dpdash-navitem${i === 0 ? ' is-active' : ''}`}
              onClick={() => { if (item.to) nav(item.to); }}
            >
              <span className="dpdash-navglyph" aria-hidden="true">{item.icon ?? item.label.slice(0, 1)}</span>
              <span className="dpdash-navtext">{item.label}</span>
            </button>
          ))}
        </nav>

        <button type="button" className="dpdash-signout" onClick={() => signOut()}>
          <span className="dpdash-navglyph" aria-hidden="true">x</span>
          <span className="dpdash-navtext">Sign out</span>
        </button>
      </aside>

      <div className="dpdash-main">
        <header className="dpdash-topbar">
          <div className="dpdash-topbar-left">
            <h1 className="dpdash-title">{title}</h1>
            {loading ? (
              <span className="dpdash-org dpdash-muted">Loading account</span>
            ) : (
              <span className="dpdash-org">
                {orgName}
                {tier ? <span className="dpdash-tier">{tier}</span> : null}
              </span>
            )}
          </div>

          <div className="dpdash-user">
            <div className="dpdash-usermeta">
              <span className="dpdash-username">{loading ? 'Loading' : personLabel}</span>
              <span className="dpdash-userrole">{loading ? '' : roleLabel}</span>
            </div>
            <div className="dpdash-avatar" aria-hidden="true">
              {loading ? '-' : initials(me?.name ?? me?.email)}
            </div>
          </div>
        </header>

        <main className="dpdash-content">
          {loading ? (
            <div className="dpdash-loading">
              <div className="dpdash-spinner" aria-hidden="true" />
              <p>Loading your dashboard</p>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}

const CSS = `
.dpdash {
  --dp-emerald: #123c2e;
  --dp-emerald-2: #1E5D4A;
  --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE;
  --dp-ink: #2c2a26;
  --dp-muted: #7d776c;
  --dp-line: #e7e1d6;
  display: flex;
  min-height: 100vh;
  width: 100%;
  background: var(--dp-ivory);
  color: var(--dp-ink);
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}
.dpdash *, .dpdash *::before, .dpdash *::after { box-sizing: border-box; }
.dpdash h1, .dpdash h2, .dpdash h3 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }

.dpdash-side {
  width: 248px;
  flex: 0 0 248px;
  background: var(--dp-emerald);
  color: var(--dp-ivory);
  display: flex;
  flex-direction: column;
  padding: 22px 14px 18px;
  position: sticky;
  top: 0;
  height: 100vh;
}
.dpdash-brand { display: flex; align-items: center; gap: 11px; padding: 4px 8px 18px; }
.dpdash-logomark {
  width: 40px; height: 40px; flex: 0 0 40px;
  border-radius: 11px;
  background: linear-gradient(135deg, var(--dp-gold), #b58e44);
  color: var(--dp-emerald);
  display: flex; align-items: center; justify-content: center;
  font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 700; font-size: 22px;
}
.dpdash-brandtext { display: flex; flex-direction: column; line-height: 1.1; }
.dpdash-brandname { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 19px; font-weight: 600; letter-spacing: .2px; }
.dpdash-brandby { font-size: 10.5px; color: rgba(247,244,238,.6); letter-spacing: .4px; text-transform: uppercase; }

.dpdash-navlabel {
  font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase;
  color: var(--dp-gold); padding: 6px 10px 8px; font-weight: 600;
}
.dpdash-nav { display: flex; flex-direction: column; gap: 1px; overflow-y: auto; flex: 1 1 auto; padding-right: 2px; }
.dpdash-nav::-webkit-scrollbar { width: 6px; }
.dpdash-nav::-webkit-scrollbar-thumb { background: rgba(201,163,91,.3); border-radius: 4px; }

.dpdash-navitem, .dpdash-signout {
  display: flex; align-items: center; gap: 11px;
  width: 100%; text-align: left;
  background: transparent; border: 0; cursor: pointer;
  color: rgba(247,244,238,.82);
  font: inherit; font-size: 13.5px;
  padding: 8.5px 10px; border-radius: 9px;
  transition: background .15s ease, color .15s ease;
}
.dpdash-navitem:hover { background: rgba(255,255,255,.06); color: var(--dp-ivory); }
.dpdash-navitem.is-active { background: var(--dp-emerald-2); color: #fff; }
.dpdash-navitem.is-active .dpdash-navglyph { background: var(--dp-gold); color: var(--dp-emerald); border-color: transparent; }

.dpdash-navglyph {
  width: 24px; height: 24px; flex: 0 0 24px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 7px; font-size: 12px; font-weight: 600;
  background: rgba(255,255,255,.07);
  border: 1px solid rgba(255,255,255,.08);
  text-transform: uppercase;
}
.dpdash-navtext { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.dpdash-signout {
  margin-top: 10px; border-top: 1px solid rgba(255,255,255,.08);
  border-radius: 0; padding-top: 14px; color: rgba(247,244,238,.7);
}
.dpdash-signout:hover { color: var(--dp-gold); }

.dpdash-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.dpdash-topbar {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; padding: 16px 30px;
  background: #fff; border-bottom: 1px solid var(--dp-line);
  position: sticky; top: 0; z-index: 5;
}
.dpdash-topbar-left { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dpdash-title { font-size: 25px; line-height: 1.1; color: var(--dp-emerald); }
.dpdash-org { font-size: 12.5px; color: var(--dp-muted); display: flex; align-items: center; gap: 8px; }
.dpdash-muted { color: var(--dp-muted); }
.dpdash-tier {
  font-size: 10px; letter-spacing: .6px; text-transform: uppercase; font-weight: 600;
  color: var(--dp-emerald); background: rgba(201,163,91,.22);
  border: 1px solid rgba(201,163,91,.5);
  padding: 1px 7px; border-radius: 999px;
}
.dpdash-user { display: flex; align-items: center; gap: 11px; flex: 0 0 auto; }
.dpdash-usermeta { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.2; }
.dpdash-username { font-size: 13px; font-weight: 600; color: var(--dp-ink); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dpdash-userrole { font-size: 11px; color: var(--dp-muted); text-transform: capitalize; }
.dpdash-avatar {
  width: 38px; height: 38px; flex: 0 0 38px; border-radius: 50%;
  background: var(--dp-emerald); color: var(--dp-gold);
  display: flex; align-items: center; justify-content: center;
  font-weight: 600; font-size: 13px; letter-spacing: .5px;
}

.dpdash-content { padding: 26px 30px 48px; max-width: 1180px; width: 100%; }

.dpdash-loading { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 80px 0; color: var(--dp-muted); }
.dpdash-spinner {
  width: 30px; height: 30px; border-radius: 50%;
  border: 3px solid var(--dp-line); border-top-color: var(--dp-emerald);
  animation: dpspin 0.8s linear infinite;
}
@keyframes dpspin { to { transform: rotate(360deg); } }

/* Shared content primitives used by the role dashboards */
.dpdash-nba {
  display: flex; flex-wrap: wrap; align-items: center; gap: 14px;
  background: linear-gradient(120deg, var(--dp-emerald), var(--dp-emerald-2));
  color: var(--dp-ivory);
  border-radius: 16px; padding: 18px 22px; margin-bottom: 24px;
  border: 1px solid rgba(201,163,91,.35);
}
.dpdash-nba-head { display: flex; flex-direction: column; gap: 2px; flex: 1 1 220px; min-width: 200px; }
.dpdash-nba-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--dp-gold); font-weight: 600; }
.dpdash-nba-title { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 21px; }
.dpdash-nba-prompts { display: flex; flex-wrap: wrap; gap: 9px; flex: 2 1 380px; }
.dpdash-prompt {
  background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.16);
  color: var(--dp-ivory); font: inherit; font-size: 12.5px;
  padding: 8px 13px; border-radius: 999px; cursor: pointer; text-align: left;
  transition: background .15s ease, border-color .15s ease;
}
.dpdash-prompt:hover { background: rgba(201,163,91,.25); border-color: var(--dp-gold); }

.dpdash-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 26px; }
.dpdash-stat {
  background: #fff; border: 1px solid var(--dp-line); border-radius: 14px; padding: 16px 18px;
}
.dpdash-stat-k { font-size: 11.5px; color: var(--dp-muted); letter-spacing: .3px; }
.dpdash-stat-v { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 32px; color: var(--dp-emerald); line-height: 1.05; margin: 4px 0 2px; }
.dpdash-stat-d { font-size: 11px; color: var(--dp-muted); }

.dpdash-sectiontitle { font-size: 16px; letter-spacing: .8px; text-transform: uppercase; color: var(--dp-muted); font-family: 'Inter', sans-serif; font-weight: 600; margin: 8px 0 12px; }
.dpdash-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.dpdash-card {
  background: #fff; border: 1px solid var(--dp-line); border-radius: 14px;
  padding: 20px; display: flex; flex-direction: column; gap: 8px;
}
.dpdash-card h3 { font-size: 20px; color: var(--dp-emerald); }
.dpdash-card-sub { font-size: 12.5px; color: var(--dp-muted); margin: 0; }
.dpdash-empty {
  display: flex; flex-direction: column; align-items: flex-start; gap: 10px;
  padding: 18px; border: 1px dashed var(--dp-line); border-radius: 11px;
  background: rgba(247,244,238,.55); margin-top: 4px;
}
.dpdash-empty-glyph {
  width: 34px; height: 34px; border-radius: 9px;
  background: rgba(201,163,91,.18); color: var(--dp-emerald);
  display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 15px;
}
.dpdash-empty p { margin: 0; font-size: 12.5px; color: var(--dp-muted); line-height: 1.55; }
.dpdash-btn {
  align-self: flex-start; background: var(--dp-emerald); color: #fff;
  border: 0; border-radius: 9px; font: inherit; font-size: 12.5px; font-weight: 600;
  padding: 8px 16px; cursor: pointer; transition: background .15s ease;
}
.dpdash-btn:hover { background: var(--dp-emerald-2); }
.dpdash-btn.ghost { background: transparent; color: var(--dp-emerald); border: 1px solid var(--dp-line); }
.dpdash-btn.ghost:hover { border-color: var(--dp-emerald); background: rgba(18,60,46,.04); }

@media (max-width: 1024px) {
  .dpdash-stats { grid-template-columns: repeat(2, 1fr); }
  .dpdash-grid { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  .dpdash-side {
    position: static; height: auto; width: 100%; flex-basis: auto;
    flex-direction: row; flex-wrap: wrap; align-items: center; gap: 8px;
    padding: 12px 14px;
  }
  .dpdash { flex-direction: column; }
  .dpdash-navlabel { display: none; }
  .dpdash-nav { flex-direction: row; flex-wrap: wrap; flex: 1 1 100%; gap: 6px; }
  .dpdash-navitem { width: auto; }
  .dpdash-navtext { display: none; }
  .dpdash-signout { width: auto; margin-top: 0; border-top: 0; padding-top: 8px; }
  .dpdash-signout .dpdash-navtext { display: none; }
  .dpdash-topbar { padding: 12px 16px; }
  .dpdash-content { padding: 18px 16px 40px; }
  .dpdash-stats { grid-template-columns: 1fr 1fr; }
}
`;
