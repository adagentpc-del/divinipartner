import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiGet, apiSend } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import VerifiedBadges, { type VerifiedBadgeData } from '../../components/VerifiedBadges';

/**
 * Divini Partners - public co-branded partner profile (blueprint section 9).
 *
 * The Divini shell (header, footer, trust badges, "Verified partner profile
 * inside Divini Partners" framing) stays Divini-branded. The profile BODY uses
 * the partner's brand (logo, cover, colors, button style, template). Reads
 * /api/profile/public/:slug and shows only published, public fields.
 */

type PublicProfile = {
  slug: string;
  kind: string | null;
  organization_id: string | null;
  organization: { name: string | null; tier: string | null; verification_status: string | null };
  template: string | null;
  theme: {
    logo_url?: string | null; cover_url?: string | null;
    primary_color?: string | null; secondary_color?: string | null;
    accent_color?: string | null; button_style?: string | null;
  } | null;
  hero: { title?: string | null; tagline?: string | null; cover_url?: string | null } | null;
  about: string | null;
  sections: {
    about?: string | null;
    services?: { name?: string; description?: string }[];
    packages?: { name?: string; description?: string; priceNote?: string }[];
    gallery?: ({ url?: string; caption?: string } | string)[];
    links?: Record<string, string>;
    location?: { city?: string | null; region?: string | null };
  } | null;
  verified: boolean;
  // U5 verified badges embedded in the PUBLIC payload (company + venue). Present
  // so GUESTS see the trust chips without any auth-gated request.
  badges?: VerifiedBadgeData[];
};

// A public, brandable surface at this venue. Powers the "Brand event here" tiles.
type BrandingOpportunity = {
  id: string;
  venue_id: string | null;
  name: string;
  category: string | null;
  description: string | null;
  photos: unknown;
  surface_type: string | null;
  audience_size: number | null;
  impression_estimate: number | null;
};

// A public pitch deck / marketing collateral item shown on the profile. Decks
// with an uploaded file stream from /api/profile-extras; linked decks open their
// external url directly.
type PublicDeck = {
  id: string;
  title: string;
  kind: string;
  file_name: string | null;
  content_type: string | null;
  storage_key: string | null;
  file_url: string | null;
};

// A custom program / offering published on the profile.
type PublicProgram = {
  id: string;
  title: string;
  summary: string | null;
  details: string | null;
  price_terms: string | null;
  cta_label: string | null;
  cta_url: string | null;
};

const DECK_KIND_LABELS: Record<string, string> = {
  deck: 'Pitch deck',
  brochure: 'Brochure',
  one_pager: 'One pager',
  case_study: 'Case study',
  media_kit: 'Media kit',
  other: 'Document',
};

/** First usable image URL from a branding opportunity's photos jsonb. */
function firstPhoto(photos: unknown): string | null {
  if (Array.isArray(photos)) {
    for (const p of photos) {
      if (typeof p === 'string' && p.trim()) return p;
      if (p && typeof p === 'object' && typeof (p as { url?: unknown }).url === 'string') {
        return (p as { url: string }).url;
      }
    }
  }
  return null;
}

export default function PublicProfile() {
  const { slug } = useParams<{ slug: string }>();
  const nav = useNavigate();
  const { session } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Public decks + active programs published on this profile.
  const [decks, setDecks] = useState<PublicDeck[]>([]);
  const [programs, setPrograms] = useState<PublicProgram[]>([]);

  // "Brand event here" state.
  const [opportunities, setOpportunities] = useState<BrandingOpportunity[]>([]);
  const [brandFor, setBrandFor] = useState<BrandingOpportunity | null>(null);
  const [brandNote, setBrandNote] = useState('');
  const [brandBusy, setBrandBusy] = useState(false);
  const [brandError, setBrandError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setNotFound(false);
    setOpportunities([]);
    setDecks([]);
    setPrograms([]);
    // Public decks + active programs for this profile (guests see these too).
    apiGet<{ decks: PublicDeck[]; programs: PublicProgram[] }>(`/profile-extras/public/${slug}`)
      .then((r) => {
        if (!mounted) return;
        setDecks(Array.isArray(r.decks) ? r.decks : []);
        setPrograms(Array.isArray(r.programs) ? r.programs : []);
      })
      .catch(() => { if (mounted) { setDecks([]); setPrograms([]); } });
    apiGet<{ profile: PublicProfile }>(`/profile/public/${slug}`)
      .then((r) => { if (mounted) { setProfile(r.profile); setLoading(false); } })
      .catch(() => { if (mounted) { setNotFound(true); setLoading(false); } });
    // Public, unauthenticated read of this venue's brandable surfaces.
    apiGet<{ opportunities: BrandingOpportunity[] }>(`/branding-opportunities/public/${slug}`)
      .then((r) => { if (mounted) setOpportunities(Array.isArray(r.opportunities) ? r.opportunities : []); })
      .catch(() => { if (mounted) setOpportunities([]); });
    return () => { mounted = false; };
  }, [slug]);

  // Clicking a tile's CTA: signed-in users open the start form; guests go to
  // /login first (returning to this profile afterward, where they continue).
  function startBranding(opp: BrandingOpportunity) {
    if (!session) {
      try { sessionStorage.setItem('postLoginRedirect', `/${'venues'}/${slug}`); } catch { /* ignore */ }
      nav('/login');
      return;
    }
    setBrandError(null);
    setBrandNote('');
    setBrandFor(opp);
  }

  // Create an event scoped to this venue + branding opportunity, then route to
  // the event workspace where eligible vendors (by the opportunity's service
  // category) can be invited to bid. The "what you want to do" note is saved
  // onto the event's event_goals field.
  async function submitBranding() {
    if (!brandFor) return;
    setBrandBusy(true);
    setBrandError(null);
    try {
      const venueName = profile?.organization.name || profile?.hero?.title || 'this venue';
      const goalsPieces = [
        `Brand activation at ${venueName} - "${brandFor.name}"${brandFor.category ? ` (${brandFor.category})` : ''}.`,
        `Branding opportunity id: ${brandFor.id}.`,
        brandNote.trim() ? `Brief: ${brandNote.trim()}` : '',
      ].filter(Boolean);
      const body: {
        name: string;
        venue_id?: string | null;
        event_goals?: string | null;
        required_services?: string[] | null;
        branding_opportunity_id?: string | null;
      } = {
        name: `Brand event: ${brandFor.name}`,
        venue_id: brandFor.venue_id ?? null,
        event_goals: goalsPieces.join(' '),
        required_services: brandFor.category ? [brandFor.category] : null,
        branding_opportunity_id: brandFor.id ?? null,
      };
      const res = await apiSend<{ event: { id: string } }>('POST', '/events', body);
      setBrandFor(null);
      nav(`/events/${res.event.id}`);
    } catch (e) {
      setBrandError((e as Error).message);
    } finally {
      setBrandBusy(false);
    }
  }

  // Public link for a deck: an uploaded file streams from the public download
  // route; a linked deck opens its external url directly.
  function deckHref(deck: PublicDeck): string {
    if (deck.file_url) return deck.file_url;
    const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    return `${BASE}/api/profile-extras/public/${slug}/decks/${deck.id}/download`;
  }

  const theme = profile?.theme ?? {};
  const primary = theme.primary_color || '#123c2e';
  const secondary = theme.secondary_color || '#1E5D4A';
  const accent = theme.accent_color || '#C9A35B';
  const btnRadius = theme.button_style === 'pill' ? '999px' : theme.button_style === 'square' ? '0' : '10px';
  const cover = profile?.hero?.cover_url || theme.cover_url || '';

  const styleVars = {
    ['--pp-primary' as any]: primary,
    ['--pp-secondary' as any]: secondary,
    ['--pp-accent' as any]: accent,
    ['--pp-btn-radius' as any]: btnRadius,
  } as React.CSSProperties;

  return (
    <div className="pp" style={styleVars}>
      <style>{CSS}</style>

      {/* ---- Divini shell header (stays Divini-branded) ---- */}
      <header className="pp-shellhead">
        <Link to="/" className="pp-shellbrand">
          <span className="pp-shelllogo">D</span>
          <span className="pp-shellname">Divini Partners<small>by Divini Group</small></span>
        </Link>
        <nav className="pp-shellnav">
          <Link to="/marketplace">Marketplace</Link>
          <Link to="/how-it-works">How it works</Link>
          <Link to="/login" className="pp-shellcta">Sign in</Link>
        </nav>
      </header>

      {loading && <div className="pp-state">Loading profile…</div>}
      {notFound && (
        <div className="pp-state">
          <h2>Profile not available</h2>
          <p>This partner profile is not published yet, or the link is incorrect.</p>
          <Link to="/marketplace" className="pp-statebtn">Browse the marketplace</Link>
        </div>
      )}

      {profile && !loading && (
        <>
          {/* Trust framing inside the Divini shell */}
          <div className="pp-trust">
            <span className="pp-trust-dot" aria-hidden="true">D</span>
            <span>Verified partner profile inside Divini Partners</span>
            {/* U5 verified badges, embedded in the public profile payload so
                GUESTS (logged-out visitors) see them with no auth-gated request.
                The component filters to verified === true and renders nothing
                when there are no verified badges. */}
            <VerifiedBadges badges={profile.badges} only={['company', 'venue']} />
            {profile.verified && <span className="pp-trust-badge">{profile.organization.verification_status === 'verified' ? 'Verified' : (profile.organization.tier || 'Partner')}</span>}
          </div>

          {/* ---- Partner-branded body ---- */}
          <main className="pp-body">
            <section className="pp-hero" style={cover ? { backgroundImage: `linear-gradient(120deg, rgba(0,0,0,.35), rgba(0,0,0,.15)), url(${cover})` } : undefined}>
              {theme.logo_url && <img className="pp-herologo" src={theme.logo_url} alt="Business logo" />}
              <h1 className="pp-herotitle">{profile.hero?.title || profile.organization.name || 'Partner profile'}</h1>
              {profile.hero?.tagline && <p className="pp-herotag">{profile.hero.tagline}</p>}
              {(profile.sections?.location?.city || profile.sections?.location?.region) && (
                <p className="pp-heroloc">{[profile.sections?.location?.city, profile.sections?.location?.region].filter(Boolean).join(', ')}</p>
              )}
              <a href="#contact" className="pp-btn">Enquire through Divini Partners</a>
            </section>

            {(profile.about || profile.sections?.about) && (
              <section className="pp-section">
                <h2 className="pp-h2">About</h2>
                <p className="pp-about">{profile.about || profile.sections?.about}</p>
              </section>
            )}

            {Array.isArray(profile.sections?.services) && profile.sections!.services!.length > 0 && (
              <section className="pp-section">
                <h2 className="pp-h2">Services</h2>
                <div className="pp-cards">
                  {profile.sections!.services!.map((s, i) => (
                    <div className="pp-card" key={i}>
                      <h3>{s.name || 'Service'}</h3>
                      {s.description && <p>{s.description}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {Array.isArray(profile.sections?.packages) && profile.sections!.packages!.length > 0 && (
              <section className="pp-section">
                <h2 className="pp-h2">Packages</h2>
                <div className="pp-cards">
                  {profile.sections!.packages!.map((p, i) => (
                    <div className="pp-card pp-pkg" key={i}>
                      <h3>{p.name || 'Package'}</h3>
                      {p.description && <p>{p.description}</p>}
                      {p.priceNote && <span className="pp-pricenote">{p.priceNote}</span>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {programs.length > 0 && (
              <section className="pp-section">
                <h2 className="pp-h2">Programs and offerings</h2>
                <div className="pp-cards">
                  {programs.map((pr) => (
                    <div className="pp-card pp-program" key={pr.id}>
                      <h3>{pr.title}</h3>
                      {pr.summary && <p>{pr.summary}</p>}
                      {pr.details && <p className="pp-programdetails">{pr.details}</p>}
                      {pr.price_terms && <span className="pp-pricenote">{pr.price_terms}</span>}
                      {pr.cta_url && (
                        <a className="pp-programcta" href={pr.cta_url} target="_blank" rel="noreferrer">
                          {pr.cta_label || 'Learn more'}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {decks.length > 0 && (
              <section className="pp-section">
                <h2 className="pp-h2">Decks and collateral</h2>
                <div className="pp-decks">
                  {decks.map((deck) => (
                    <a
                      className="pp-deck"
                      key={deck.id}
                      href={deckHref(deck)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="pp-deckglyph" aria-hidden="true">D</span>
                      <span className="pp-deckmeta">
                        <span className="pp-decktitle">{deck.title}</span>
                        <span className="pp-deckkind">{DECK_KIND_LABELS[deck.kind] || 'Document'}</span>
                      </span>
                      <span className="pp-deckopen" aria-hidden="true">Open</span>
                    </a>
                  ))}
                </div>
              </section>
            )}

            {opportunities.length > 0 && (
              <section className="pp-section pp-brand">
                <h2 className="pp-h2">Brand your event here</h2>
                <p className="pp-brandsub">
                  Brandable surfaces and sponsorship spaces at this venue. Pick a space to start an
                  event and invite eligible vendors to bid.
                </p>
                <div className="pp-tiles">
                  {opportunities.map((opp) => {
                    const photo = firstPhoto(opp.photos);
                    return (
                      <article className="pp-tile" key={opp.id}>
                        <div
                          className="pp-tileimg"
                          style={photo ? { backgroundImage: `url(${photo})` } : undefined}
                        >
                          {opp.category && <span className="pp-tiletag">{opp.category}</span>}
                        </div>
                        <div className="pp-tilebody">
                          <h3>{opp.name}</h3>
                          {opp.description && <p>{opp.description}</p>}
                          {(opp.audience_size || opp.impression_estimate) && (
                            <div className="pp-tilemeta">
                              {opp.audience_size ? `${opp.audience_size.toLocaleString()} audience` : ''}
                              {opp.audience_size && opp.impression_estimate ? ' . ' : ''}
                              {opp.impression_estimate ? `${opp.impression_estimate.toLocaleString()} impressions` : ''}
                            </div>
                          )}
                          <button type="button" className="pp-btn pp-tilecta" onClick={() => startBranding(opp)}>
                            Brand event here
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            {Array.isArray(profile.sections?.gallery) && profile.sections!.gallery!.length > 0 && (
              <section className="pp-section">
                <h2 className="pp-h2">Gallery</h2>
                <div className="pp-gallery">
                  {profile.sections!.gallery!.map((g, i) => {
                    const url = typeof g === 'string' ? g : g.url;
                    const caption = typeof g === 'string' ? '' : g.caption;
                    if (!url) return null;
                    return (
                      <figure className="pp-gitem" key={i}>
                        <img src={url} alt={caption || ''} loading="lazy" />
                        {caption && <figcaption>{caption}</figcaption>}
                      </figure>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="pp-section">
              <h2 className="pp-h2">Reviews</h2>
              <div className="pp-reviews-empty">Reviews from completed events will appear here once this partner has worked through Divini Partners.</div>
            </section>

            <section className="pp-cta" id="contact">
              <h2 className="pp-h2">Work with {profile.organization.name || 'this partner'}</h2>
              <p>Enquiries, quotes, and payments run through Divini Partners for a protected, end-to-end experience.</p>
              <Link to="/login" className="pp-btn">Start an enquiry</Link>
            </section>
          </main>
        </>
      )}

      {/* "Brand event here" start dialog */}
      {brandFor && (
        <div className="pp-modal" role="dialog" aria-modal="true">
          <div className="pp-modal-card">
            <h2 className="pp-h2">Brand event here</h2>
            <p className="pp-modalsub">
              {brandFor.name}{brandFor.category ? ` . ${brandFor.category}` : ''}
            </p>
            <label className="pp-modallabel">
              Describe what you want to do with this space
              <textarea
                value={brandNote}
                placeholder="Tell us your activation idea, dates, and goals. Eligible vendors will use this to prepare bids."
                onChange={(e) => setBrandNote(e.target.value)}
              />
            </label>
            {brandError && <div className="pp-modalerror">{brandError}</div>}
            <div className="pp-modalactions">
              <button type="button" className="pp-modalghost" onClick={() => setBrandFor(null)}>Cancel</button>
              <button type="button" className="pp-btn" disabled={brandBusy} onClick={submitBranding}>
                {brandBusy ? 'Starting.' : 'Start event and invite vendors'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Divini shell footer (stays Divini-branded) ---- */}
      <footer className="pp-shellfoot">
        <div className="pp-foot-badges">
          <span className="pp-foot-badge">Vetted partners</span>
          <span className="pp-foot-badge">Protected payments</span>
          <span className="pp-foot-badge">Non-circumvention</span>
        </div>
        <p>Profile hosted on Divini Partners by Divini Group. <Link to="/privacy">Privacy</Link></p>
      </footer>
    </div>
  );
}

const CSS = `
.pp{--e:#123c2e;--gold:#C9A35B;--ivory:#F7F4EE;--ink:#2c2a26;--muted:#7d776c;--line:#e7e1d6;
  min-height:100vh;background:var(--ivory);color:var(--ink);font-family:Inter,system-ui,sans-serif;display:flex;flex-direction:column;}
.pp *{box-sizing:border-box;}
.pp-shellhead{display:flex;align-items:center;justify-content:space-between;padding:14px 28px;background:var(--e);color:var(--ivory);}
.pp-shellbrand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--ivory);}
.pp-shelllogo{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,var(--gold),#b58e44);color:var(--e);display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-weight:700;font-size:18px;}
.pp-shellname{font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:600;display:flex;flex-direction:column;line-height:1;}
.pp-shellname small{font-size:9.5px;letter-spacing:.4px;text-transform:uppercase;color:rgba(247,244,238,.65);font-family:Inter,sans-serif;}
.pp-shellnav{display:flex;align-items:center;gap:18px;}
.pp-shellnav a{color:rgba(247,244,238,.85);text-decoration:none;font-size:13.5px;}
.pp-shellnav a:hover{color:var(--gold);}
.pp-shellcta{border:1px solid rgba(201,163,91,.5);border-radius:999px;padding:6px 16px;color:var(--gold)!important;}
.pp-trust{display:flex;align-items:center;gap:10px;background:#fff;border-bottom:1px solid var(--line);padding:10px 28px;font-size:12.5px;color:var(--muted);}
.pp-trust-dot{width:22px;height:22px;border-radius:6px;background:var(--e);color:var(--gold);display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-weight:700;font-size:13px;}
.pp-trust-badge{margin-left:auto;font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;font-weight:600;color:var(--e);background:rgba(201,163,91,.2);border:1px solid rgba(201,163,91,.5);border-radius:999px;padding:3px 11px;}
.pp-state{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:80px 20px;text-align:center;color:var(--muted);}
.pp-state h2{font-family:'Cormorant Garamond',serif;color:var(--e);font-size:26px;margin:0;}
.pp-statebtn{margin-top:8px;background:var(--e);color:#fff;text-decoration:none;border-radius:10px;padding:10px 18px;font-size:13.5px;font-weight:600;}

/* Partner-branded body */
.pp-body{flex:1;}
.pp-hero{background:var(--pp-primary);color:#fff;padding:64px 28px;text-align:center;background-size:cover;background-position:center;}
.pp-herologo{height:64px;width:auto;margin:0 auto 18px;display:block;border-radius:10px;background:#fff;padding:6px;}
.pp-herotitle{font-family:'Cormorant Garamond',serif;font-size:46px;margin:0;line-height:1.05;}
.pp-herotag{font-size:17px;color:rgba(255,255,255,.9);margin:10px auto 0;max-width:640px;}
.pp-heroloc{font-size:13px;letter-spacing:.5px;text-transform:uppercase;color:var(--pp-accent);margin:14px 0 22px;}
.pp-btn{display:inline-block;background:var(--pp-accent);color:var(--pp-primary);font-weight:700;font-size:14px;text-decoration:none;padding:12px 26px;border-radius:var(--pp-btn-radius);}
.pp-btn:hover{filter:brightness(1.05);}
.pp-section{max-width:980px;margin:0 auto;padding:42px 28px;}
.pp-h2{font-family:'Cormorant Garamond',serif;font-size:30px;color:var(--pp-primary);margin:0 0 18px;}
.pp-about{font-size:16px;line-height:1.7;color:var(--ink);white-space:pre-wrap;}
.pp-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px;}
.pp-card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:20px;border-top:3px solid var(--pp-secondary);}
.pp-card h3{font-family:'Cormorant Garamond',serif;font-size:21px;color:var(--pp-primary);margin:0 0 6px;}
.pp-card p{font-size:13.5px;color:var(--muted);line-height:1.6;margin:0;}
.pp-pkg .pp-pricenote{display:inline-block;margin-top:10px;font-size:12px;font-weight:600;color:var(--pp-primary);background:rgba(201,163,91,.18);border-radius:999px;padding:4px 12px;}
.pp-program .pp-pricenote{display:inline-block;margin-top:10px;font-size:12px;font-weight:600;color:var(--pp-primary);background:rgba(201,163,91,.18);border-radius:999px;padding:4px 12px;}
.pp-programdetails{white-space:pre-wrap;}
.pp-programcta{display:inline-block;margin-top:12px;font-size:12.5px;font-weight:700;color:var(--pp-accent);text-decoration:none;}
.pp-programcta:hover{text-decoration:underline;}
.pp-decks{display:flex;flex-direction:column;gap:10px;}
.pp-deck{display:flex;align-items:center;gap:14px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px;text-decoration:none;color:var(--ink);transition:.16s;}
.pp-deck:hover{border-color:var(--pp-accent);transform:translateX(2px);box-shadow:0 16px 30px -24px rgba(18,60,46,.45);}
.pp-deckglyph{width:38px;height:38px;flex:0 0 38px;border-radius:10px;background:rgba(201,163,91,.18);color:var(--pp-primary);display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-weight:700;font-size:17px;}
.pp-deckmeta{display:flex;flex-direction:column;gap:2px;flex:1 1 auto;min-width:0;}
.pp-decktitle{font-weight:600;font-size:14.5px;color:var(--pp-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.pp-deckkind{font-size:11.5px;color:var(--muted);}
.pp-deckopen{flex:0 0 auto;font-size:11.5px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--pp-accent);}
.pp-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;}
.pp-gitem{margin:0;}
.pp-gitem img{width:100%;height:200px;object-fit:cover;border-radius:12px;display:block;border:1px solid var(--line);}
.pp-gitem figcaption{font-size:12px;color:var(--muted);margin-top:6px;}
.pp-reviews-empty{background:#fff;border:1px dashed var(--line);border-radius:12px;padding:22px;font-size:13.5px;color:var(--muted);text-align:center;}
.pp-cta{max-width:980px;margin:0 auto 20px;padding:42px 28px;text-align:center;}
.pp-cta p{font-size:15px;color:var(--muted);max-width:560px;margin:0 auto 18px;}
.pp-shellfoot{background:var(--e);color:rgba(247,244,238,.8);padding:26px 28px;text-align:center;font-size:12.5px;margin-top:auto;}
.pp-foot-badges{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:12px;}
.pp-foot-badge{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--gold);border:1px solid rgba(201,163,91,.4);border-radius:999px;padding:4px 12px;}
.pp-shellfoot a{color:var(--gold);text-decoration:none;}
@media(max-width:620px){.pp-shellnav{gap:12px;}.pp-herotitle{font-size:34px;}.pp-hero{padding:48px 20px;}}

/* Brand event here tiles */
.pp-brandsub{font-size:14px;color:var(--muted);margin:-8px 0 20px;line-height:1.6;max-width:640px;}
.pp-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:18px;}
.pp-tile{background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden;display:flex;flex-direction:column;transition:.18s;}
.pp-tile:hover{transform:translateY(-4px);box-shadow:0 26px 50px -30px rgba(18,60,46,.45);border-color:var(--pp-accent);}
.pp-tileimg{height:150px;background:linear-gradient(150deg,var(--pp-secondary),var(--pp-primary));background-size:cover;background-position:center;position:relative;}
.pp-tiletag{position:absolute;top:11px;left:11px;background:rgba(255,255,255,.92);color:var(--pp-primary);font-size:10.5px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;padding:4px 11px;border-radius:20px;}
.pp-tilebody{padding:16px 18px;display:flex;flex-direction:column;gap:8px;flex:1;}
.pp-tilebody h3{font-family:'Cormorant Garamond',serif;font-size:20px;color:var(--pp-primary);margin:0;}
.pp-tilebody p{font-size:13px;color:var(--muted);line-height:1.55;margin:0;}
.pp-tilemeta{font-size:12px;color:var(--pp-secondary);font-weight:600;}
.pp-tilecta{margin-top:auto;text-align:center;border:0;cursor:pointer;font-family:inherit;}
.pp-modal{position:fixed;inset:0;background:rgba(18,60,46,.45);display:grid;place-items:center;padding:20px;z-index:60;}
.pp-modal-card{background:#fff;border-radius:16px;padding:24px;width:100%;max-width:520px;}
.pp-modalsub{font-size:13px;color:var(--muted);margin:4px 0 16px;}
.pp-modallabel{display:flex;flex-direction:column;gap:6px;font-size:12.5px;font-weight:600;color:var(--ink);}
.pp-modallabel textarea{font:inherit;font-size:13.5px;color:var(--ink);padding:10px 12px;border:1px solid var(--line);border-radius:10px;min-height:110px;resize:vertical;}
.pp-modalerror{background:#fff3f1;border:1px solid #e7b7ab;color:#9a3a28;padding:9px 12px;border-radius:9px;font-size:12.5px;margin-top:12px;}
.pp-modalactions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px;}
.pp-modalghost{background:transparent;border:1px solid var(--line);color:var(--ink);border-radius:10px;padding:10px 18px;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;}
.pp-btn[disabled]{opacity:.6;cursor:default;}
`;
