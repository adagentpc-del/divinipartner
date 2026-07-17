import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * PublicChrome - shared public marketing chrome for Divini Partners. Exports
 * SiteHeader, SiteFooter, and a PublicLayout convenience wrapper. Visual style
 * matches the existing public pages (emerald brand mark, blurred sticky header,
 * emerald footer band). All styling lives in theme.css under the
 * "public marketing" block. Reuse across every public page so the 7 page agents
 * get identical, upgraded chrome with zero config.
 */

export const PUBLIC_NAV: { label: string; to: string }[] = [
  { label: 'For Venues', to: '/for-venues' },
  { label: 'For Vendors', to: '/for-vendors' },
  { label: 'For Planners', to: '/for-planners' },
  { label: 'For Sponsors', to: '/for-sponsors' },
  { label: 'For Clients', to: '/for-clients' },
  { label: 'Marketplace', to: '/marketplace' },
  { label: 'How It Works', to: '/how-it-works' },
  { label: 'Pricing', to: '/pricing' },
];

export function SiteHeader({ active }: { active?: string }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const go = (to: string) => {
    setOpen(false);
    nav(to);
  };

  return (
    <header className="pub-header">
      <div className="wrap pub-bar">
        <div className="pub-logo" onClick={() => go('/')}>
          <div className="mk">D</div>
          <div>
            <div className="nm">Divini Partners</div>
            <div className="tg">by Divini Group</div>
          </div>
        </div>
        <nav className="pub-nav">
          {PUBLIC_NAV.map((n) => (
            <a
              key={n.to}
              className={'pub-navlink' + (active === n.to ? ' cur' : '')}
              onClick={() => go(n.to)}
            >
              {n.label}
            </a>
          ))}
          <a className="pub-login" onClick={() => go('/login')}>
            Login
          </a>
          <button className="btn primary pub-navlink" onClick={() => go('/register')}>
            Get Started
          </button>
          <button
            className="pub-burger"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? '✕' : '☰'}
          </button>
        </nav>
      </div>
      <div className={'pub-mobilemenu' + (open ? ' open' : '')}>
        {PUBLIC_NAV.map((n) => (
          <a key={n.to} className={active === n.to ? 'cur' : ''} onClick={() => go(n.to)}>
            {n.label}
          </a>
        ))}
        <a onClick={() => go('/login')}>Login</a>
        <div className="pub-mobile-cta">
          <button className="btn primary block" onClick={() => go('/register')}>
            Get Started
          </button>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const nav = useNavigate();

  return (
    <footer className="pub-footer">
      <div className="pub-footer-cta">
        <div className="wrap">
          <h2>
            Your next event shouldn't start with spreadsheets and email chains. It should start with
            intelligence.
          </h2>
          <div className="ctas">
            <button className="btn gold lg" onClick={() => nav('/register')}>
              Get Started
            </button>
            <button className="btn ghost lg" onClick={() => nav('/register?role=venue&founding=1')}>
              Become a Founding Member
            </button>
            <button className="btn ghost lg" onClick={() => nav('/marketplace')}>
              Explore Opportunities
            </button>
          </div>
        </div>
      </div>

      <div className="wrap">
        <div className="pub-footer-cols">
          <div>
            <div className="nm">Divini Partners</div>
            <p>
              The Venue Intelligence and Revenue Infrastructure Platform. Stop rebuilding every event
              from scratch. Build once. Scale forever.
            </p>
          </div>
          <div>
            <div className="fh">Platform</div>
            {PUBLIC_NAV.map((n) => (
              <a key={n.to} onClick={() => nav(n.to)}>
                {n.label}
              </a>
            ))}
          </div>
          <div>
            <div className="fh">Company</div>
            <a onClick={() => nav('/register')}>Get Started</a>
            <a onClick={() => nav('/login')}>Login</a>
            <a onClick={() => nav('/privacy')}>Privacy</a>
            <a onClick={() => nav('/terms')}>Terms</a>
          </div>
        </div>
      </div>

      <div className="pub-footer-base">
        Divini Partners by Divini Group. The premium event partnership marketplace.
      </div>
    </footer>
  );
}

export function PublicLayout({ children, active }: { children: React.ReactNode; active?: string }) {
  return (
    <div className="pub">
      <SiteHeader active={active} />
      {children}
      <SiteFooter />
    </div>
  );
}

export default PublicLayout;
