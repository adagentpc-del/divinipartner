import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

/**
 * Public unclaimed profile page. Reads /api/claim/profile/:slug (no auth).
 *
 * The page must clearly state the profile is unclaimed and generated from
 * publicly available information, and must never imply verified, preferred, or
 * partnered status. CTAs: Claim This Profile, Request Removal, Report Incorrect
 * Information.
 *
 * ZERO em dashes anywhere (hard rule). Self-contained styles, Divini brand.
 */

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

type Audience = 'venue' | 'vendor' | 'planner';

/**
 * Map a profile category to the audience whose copy fits it. Mirrors the
 * server-side audienceFor in claim-emails.ts: venue categories are physical
 * event spaces, planner categories coordinate events, everything else (and
 * anything unrecognized) is a vendor.
 */
function audienceFor(category?: string | null): Audience {
  const c = (category || '').toLowerCase().trim();
  if (!c) return 'vendor';
  if (c.includes('planner') || c.includes('planning')) return 'planner';
  if (c.includes('venue')) return 'venue';
  const venueCats = [
    'ballroom', 'estate', 'mansion', 'rooftop', 'garden', 'hotel', 'resort',
    'waterfront', 'loft', 'warehouse', 'gallery', 'museum', 'barn', 'farm',
  ];
  if (venueCats.some((v) => c.includes(v))) return 'venue';
  return 'vendor';
}

const VALUE_COPY: Record<Audience, { heading: string; lead: string }> = {
  venue: {
    heading: 'Everything for your events, in one place',
    lead:
      'Divini Partners is the all-in-one platform where a venue runs every event from first inquiry to final payment. No more leads scattered across email, DMs, calls, and spreadsheets, and no more chasing vendors and clients across disconnected tools.',
  },
  vendor: {
    heading: 'Everything for your bookings, in one place',
    lead:
      'Divini Partners is the all-in-one platform where you win the right bookings and run them end to end. No more leads scattered across DMs, email, and referrals, and no more chasing deposits and final payments across disconnected tools.',
  },
  planner: {
    heading: 'Everything for your events, in one place',
    lead:
      'Divini Partners is the all-in-one platform where a planner runs every event and coordinates venues plus vendors from first inquiry to final payment. No more leads scattered across email, DMs, calls, and spreadsheets, and no more chasing partners and clients across disconnected tools.',
  },
};

type PublicProfile = {
  slug: string;
  businessName: string | null;
  category: string | null;
  subcategories: string[] | null;
  city: string | null;
  state: string | null;
  region: string | null;
  country: string | null;
  website: string | null;
  socialLinks: Record<string, string> | null;
  description: string | null;
  tags: string[] | null;
  logoUrl: string | null;
  ownerVerified: boolean;
};

type Banner = {
  unclaimed: boolean;
  label: string;
  attribution: string;
  verified: boolean;
  preferred: boolean;
  partnered: boolean;
};

type ApiResponse = { profile: PublicProfile; banner: Banner; noindex: boolean };

const STYLES = `
.cup{--emerald:#1E5D4A;--emerald-deep:#123c2e;--emerald-mid:#174838;--champagne:#D9CCB0;--ink:#2c2a26;--muted:#7d776c;--line:#e7e1d6;--ivory:#f7f4ee;--bg:#f3efe6;background:var(--bg);color:var(--ink);min-height:100vh;font-family:Inter,system-ui,sans-serif}
.cup .wrap{max-width:880px;margin:0 auto;padding:28px 22px 80px}
.cup h1,.cup h2,.cup h3{font-family:'Cormorant Garamond',serif;color:var(--emerald-deep);margin:0}
.cup .brandbar{display:flex;align-items:center;gap:11px;margin-bottom:22px}
.cup .brandbar .mk{width:38px;height:38px;border-radius:9px;background:var(--emerald-deep);color:var(--champagne);display:grid;place-items:center;font-family:'Cormorant Garamond',serif;font-weight:700;font-size:21px}
.cup .brandbar .nm{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:700;color:var(--emerald-deep);line-height:1}
.cup .brandbar .tg{font-size:9.5px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-top:2px}
.cup .banner{display:flex;gap:12px;align-items:flex-start;background:#fbf7ef;border:1px solid var(--champagne);border-left:4px solid var(--emerald);border-radius:12px;padding:14px 16px;margin-bottom:22px}
.cup .banner .ico{flex-shrink:0;width:30px;height:30px;border-radius:8px;background:var(--champagne);color:var(--emerald-deep);display:grid;place-items:center;font-weight:700;font-family:'Cormorant Garamond',serif;font-size:17px}
.cup .banner b{color:var(--emerald-deep)}
.cup .banner p{margin:3px 0 0;font-size:13px;color:var(--muted);line-height:1.5}
.cup .card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:26px;margin-bottom:18px}
.cup .head{display:flex;gap:18px;align-items:flex-start}
.cup .logo{width:72px;height:72px;border-radius:14px;background:var(--ivory);border:1px solid var(--line);display:grid;place-items:center;font-family:'Cormorant Garamond',serif;font-weight:700;font-size:30px;color:var(--emerald-deep);flex-shrink:0;overflow:hidden}
.cup .logo img{width:100%;height:100%;object-fit:cover}
.cup .name{font-size:32px;font-weight:700;line-height:1.05}
.cup .meta{font-size:13.5px;color:var(--muted);margin-top:6px}
.cup .pill{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--emerald-deep);background:var(--champagne);border-radius:20px;padding:4px 11px;margin-top:10px}
.cup .desc{font-size:15px;line-height:1.65;color:var(--ink);margin-top:18px}
.cup .aiflag{font-size:11.5px;color:var(--muted);font-style:italic;margin-top:8px}
.cup .tags{display:flex;flex-wrap:wrap;gap:7px;margin-top:16px}
.cup .tag{font-size:12px;font-weight:600;color:var(--muted);background:var(--ivory);border:1px solid var(--line);border-radius:20px;padding:5px 11px}
.cup .ctas{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px}
.cup .btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--line);background:#fff;color:var(--emerald-deep);font-family:Inter;font-size:14px;font-weight:600;padding:12px 20px;border-radius:11px;cursor:pointer;transition:.15s}
.cup .btn:hover{border-color:var(--emerald);background:var(--ivory)}
.cup .btn.primary{background:var(--emerald);border-color:var(--emerald);color:#fff}
.cup .btn.primary:hover{background:var(--emerald-mid)}
.cup .sect{font-size:11px;letter-spacing:.7px;text-transform:uppercase;color:var(--muted);font-weight:700;margin:0 0 12px}
.cup .form label{display:block;font-size:12px;color:var(--muted);font-weight:600;margin:0 0 6px}
.cup .form input,.cup .form textarea{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:10px;font-family:Inter;font-size:14px;background:#fff;color:var(--ink);box-sizing:border-box}
.cup .form input:focus,.cup .form textarea:focus{outline:none;border-color:var(--emerald)}
.cup .row{margin-bottom:13px}
.cup .msg{padding:11px 14px;border-radius:10px;font-size:13.5px;margin-top:8px}
.cup .msg.ok{background:#eef6f1;border:1px solid #cfe6da;color:var(--emerald-deep)}
.cup .msg.err{background:#fbeeee;border:1px solid #ecd2d2;color:#7a3030}
.cup .center{text-align:center;padding:60px 0;color:var(--muted)}
.cup .value{background:linear-gradient(180deg,#fff 0%,#fbf8f1 100%);border:1px solid var(--champagne)}
.cup .value h2{font-size:27px;line-height:1.1;font-weight:700}
.cup .value .lead{font-size:14.5px;line-height:1.6;color:var(--muted);margin:9px 0 0;max-width:60ch}
.cup .vgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:11px;margin-top:20px}
@media(max-width:560px){.cup .vgrid{grid-template-columns:1fr}}
.cup .vitem{display:flex;gap:10px;align-items:flex-start;background:#fff;border:1px solid var(--line);border-radius:11px;padding:13px 14px}
.cup .vitem .vk{flex-shrink:0;width:26px;height:26px;border-radius:7px;background:var(--emerald-deep);color:var(--champagne);display:grid;place-items:center;font-family:'Cormorant Garamond',serif;font-weight:700;font-size:15px;line-height:1}
.cup .vitem .vt{font-size:13.5px;font-weight:700;color:var(--emerald-deep);line-height:1.2}
.cup .vitem .vd{font-size:12px;color:var(--muted);line-height:1.45;margin-top:3px}
.cup .solve{margin-top:18px;padding:14px 16px;background:var(--ivory);border:1px solid var(--line);border-left:4px solid var(--champagne);border-radius:11px}
.cup .solve b{color:var(--emerald-deep);font-size:13.5px}
.cup .solve p{margin:5px 0 0;font-size:13px;color:var(--muted);line-height:1.55}
.cup .vfree{display:inline-block;margin-top:16px;font-size:12px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--emerald-deep);background:var(--champagne);border-radius:20px;padding:6px 13px}
`;

export default function UnclaimedProfile() {
  const { slug = '' } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [panel, setPanel] = useState<'none' | 'removal' | 'report'>('none');
  const [email, setEmail] = useState('');
  const [detail, setDetail] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`${BASE}/api/claim/profile/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: ApiResponse) => {
        if (!active) return;
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setNotFound(true);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  const initials = useMemo(() => {
    const n = data?.profile.businessName ?? '';
    return n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'D';
  }, [data]);

  async function submitRemoval() {
    setMsg(null);
    try {
      const res = await fetch(`${BASE}/api/claim/removal-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, email: email || undefined, reason: detail || undefined }),
      });
      if (!res.ok) throw new Error('failed');
      setMsg({ kind: 'ok', text: 'Your removal request has been received. The listing will be taken down.' });
      setPanel('none');
    } catch {
      setMsg({ kind: 'err', text: 'We could not submit your request. Please try again.' });
    }
  }

  async function submitReport() {
    setMsg(null);
    if (!detail.trim()) {
      setMsg({ kind: 'err', text: 'Please describe what is incorrect.' });
      return;
    }
    try {
      // Reported corrections are routed through the removal endpoint with a
      // correction note so an operator can review and edit the listing.
      const res = await fetch(`${BASE}/api/claim/removal-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, email: email || undefined, reason: `correction: ${detail}` }),
      });
      if (!res.ok) throw new Error('failed');
      setMsg({ kind: 'ok', text: 'Thank you. Our team will review the reported information.' });
      setPanel('none');
    } catch {
      setMsg({ kind: 'err', text: 'We could not submit your report. Please try again.' });
    }
  }

  if (loading) {
    return (
      <div className="cup">
        <style>{STYLES}</style>
        <div className="wrap"><div className="center">Loading profile...</div></div>
      </div>
    );
  }
  if (notFound || !data) {
    return (
      <div className="cup">
        <style>{STYLES}</style>
        <div className="wrap">
          <div className="center">
            <h1>Profile not available</h1>
            <p>This listing may have been claimed or removed.</p>
          </div>
        </div>
      </div>
    );
  }

  const p = data.profile;
  const place = [p.city, p.state || p.region].filter(Boolean).join(', ');
  const audience = audienceFor(p.category);
  const value = VALUE_COPY[audience];
  // The vendor-network grid item reads differently for a vendor (who joins a
  // network) versus a venue or planner (who coordinates one).
  const networkItem =
    audience === 'vendor'
      ? { vt: 'Venue and vendor network', vd: 'Connect with the venues and vendors on each event without endless back and forth.' }
      : { vt: 'Vendor network', vd: 'Coordinate your preferred vendors without endless back and forth.' };
  const solveLead =
    audience === 'vendor'
      ? 'Stop losing bookings to missed follow-ups and stop stitching together DMs, email, and referrals. Divini Partners brings leads, quotes, invoices, payments, payouts, timelines, and clients together so every booking runs from one place.'
      : 'Stop losing bookings to missed follow-ups and stop stitching together email, DMs, calls, and spreadsheets. Divini Partners brings inquiries, quotes, invoices, payments, vendors, timelines, and clients together so every event runs from one place.';

  return (
    <div className="cup">
      <style>{STYLES}</style>
      <div className="wrap">
        <div className="brandbar">
          <div className="mk">D</div>
          <div>
            <div className="nm">Divini Partners</div>
            <div className="tg">by Divini Group</div>
          </div>
        </div>

        <div className="banner" role="note">
          <div className="ico" aria-hidden="true">i</div>
          <div>
            <b>This is an unclaimed profile.</b>
            <p>
              {data.banner.attribution}. It has not been reviewed or confirmed by the business and
              does not indicate any verified, preferred, or partnered status with Divini Partners.
            </p>
          </div>
        </div>

        <div className="card">
          <div className="head">
            <div className="logo">{p.logoUrl ? <img src={p.logoUrl} alt="" /> : initials}</div>
            <div>
              <div className="name">{p.businessName ?? 'Unnamed business'}</div>
              <div className="meta">
                {[p.category, place].filter(Boolean).join(' · ') || 'Event partner'}
              </div>
              <span className="pill">Unclaimed listing</span>
            </div>
          </div>

          {p.description && <p className="desc">{p.description}</p>}
          <p className="aiflag">
            Description and tags are ai_suggested and pending owner verification.
          </p>

          {!!(p.tags && p.tags.length) && (
            <div className="tags">
              {p.tags!.map((t) => (
                <span className="tag" key={t}>{t}</span>
              ))}
            </div>
          )}
        </div>

        <div className="card value">
          <h2>{value.heading}</h2>
          <p className="lead">{value.lead}</p>

          <div className="vgrid">
            <div className="vitem">
              <div className="vk" aria-hidden="true">1</div>
              <div>
                <div className="vt">Inquiries and leads</div>
                <div className="vd">Capture every inbound request in one inbox so nothing slips.</div>
              </div>
            </div>
            <div className="vitem">
              <div className="vk" aria-hidden="true">2</div>
              <div>
                <div className="vt">Quotes and invoices</div>
                <div className="vd">Send standardized quotes and invoices in a few clicks.</div>
              </div>
            </div>
            <div className="vitem">
              <div className="vk" aria-hidden="true">3</div>
              <div>
                <div className="vt">Payments and payouts</div>
                <div className="vd">Get paid securely and on platform, never late or off to the side.</div>
              </div>
            </div>
            <div className="vitem">
              <div className="vk" aria-hidden="true">4</div>
              <div>
                <div className="vt">{networkItem.vt}</div>
                <div className="vd">{networkItem.vd}</div>
              </div>
            </div>
            <div className="vitem">
              <div className="vk" aria-hidden="true">5</div>
              <div>
                <div className="vt">Timelines and guests</div>
                <div className="vd">Keep event itineraries and guest details on one shared timeline.</div>
              </div>
            </div>
            <div className="vitem">
              <div className="vk" aria-hidden="true">6</div>
              <div>
                <div className="vt">Client relationships</div>
                <div className="vd">Track every client and the full history of every booking.</div>
              </div>
            </div>
          </div>

          <div className="solve">
            <b>One source of truth for every event.</b>
            <p>{solveLead}</p>
          </div>

          <span className="vfree">Free to claim. Free to start as a partner.</span>
        </div>

        <div className="card">
          <div className="sect">Is this your business?</div>
          <div className="ctas">
            <button className="btn primary" onClick={() => nav(`/claim/${slug}/verify`)}>
              Claim This Profile
            </button>
            <button className="btn" onClick={() => { setPanel('removal'); setMsg(null); }}>
              Request Removal
            </button>
            <button className="btn" onClick={() => { setPanel('report'); setMsg(null); }}>
              Report Incorrect Information
            </button>
          </div>
          {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
        </div>

        {panel === 'removal' && (
          <div className="card form">
            <div className="sect">Request removal of this listing</div>
            <div className="row">
              <label>Your email (optional)</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" />
            </div>
            <div className="row">
              <label>Reason (optional)</label>
              <textarea rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} />
            </div>
            <div className="ctas">
              <button className="btn primary" onClick={submitRemoval}>Submit removal request</button>
              <button className="btn" onClick={() => setPanel('none')}>Cancel</button>
            </div>
          </div>
        )}

        {panel === 'report' && (
          <div className="card form">
            <div className="sect">Report incorrect information</div>
            <div className="row">
              <label>Your email (optional)</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" />
            </div>
            <div className="row">
              <label>What is incorrect?</label>
              <textarea rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Describe what should be corrected." />
            </div>
            <div className="ctas">
              <button className="btn primary" onClick={submitReport}>Submit report</button>
              <button className="btn" onClick={() => setPanel('none')}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
