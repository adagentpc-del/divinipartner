/**
 * Public event landing page (/event/:eventId).
 *
 * Anyone with the link lands here with no account. We read the public event
 * landing through the unauthenticated endpoint and show the event details,
 * a public agenda, an "Attend event" section (free registration or a tiered
 * ticket, depending on how the coordinator configured the event), and a
 * "Become a vendor" section that routes prospective vendors or sponsors into
 * signup. Self-contained, brand-consistent styling. Zero em dashes.
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGet, apiSend } from '../../lib/api';

type Landing = {
  event: { id: string; name: string | null; date_time: string | null; type: string | null; organizer: string | null };
  place: { venue_name: string | null; venue_city: string | null; floorplan_place: string | null };
  settings: {
    attend_mode: 'off' | 'free' | 'ticketed';
    vendor_cta_enabled: boolean;
    headline: string | null;
    description: string | null;
  };
  tiers: { id: string; name: string; price_cents: number; sold_out: boolean }[];
  agenda: {
    id: string;
    title: string | null;
    start_time: string | null;
    end_time: string | null;
    location: string | null;
    track: string | null;
  }[];
};

type RegisterResult = {
  ok: true;
  registration_id: string;
  order_status: 'confirmed' | 'pending_payment';
  amount_cents: number;
  platform_fee_cents: number;
  total_cents: number;
};

type ExhibitPackage = {
  id: string;
  name: string;
  price_cents: number;
  includes_booth: boolean;
  benefits: string | null;
  sold_out: boolean;
};

type ExhibitBooth = {
  id: string;
  label: string;
  price_cents: number;
};

type ExhibitOffer = {
  packages: ExhibitPackage[];
  booths: ExhibitBooth[];
};

type ApplyResult = {
  ok: true;
  order_id: string;
  status: 'pending_payment' | 'confirmed';
  amount_cents: number;
  platform_fee_cents: number;
};

function fullDate(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function clockTime(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function slotTime(start: string | null, end: string | null): string | null {
  const s = clockTime(start);
  if (!s) return null;
  const e = clockTime(end);
  return e ? `${s} - ${e}` : s;
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function priceOrFree(cents: number): string {
  return cents > 0 ? money(cents) : 'Free';
}

function placeLabel(place: Landing['place']): string | null {
  if (place.venue_name) {
    return place.venue_city ? `${place.venue_name}, ${place.venue_city}` : place.venue_name;
  }
  return place.floorplan_place || null;
}

export default function PublicEventLanding() {
  const { eventId = '' } = useParams();
  const nav = useNavigate();

  const [landing, setLanding] = useState<Landing | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // Attend form state.
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [tierId, setTierId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [attendErr, setAttendErr] = useState('');
  const [result, setResult] = useState<RegisterResult | null>(null);

  // Exhibit / vendor application state.
  const [offer, setOffer] = useState<ExhibitOffer | null>(null);
  const [packageId, setPackageId] = useState('');
  const [boothId, setBoothId] = useState('');
  const [vName, setVName] = useState('');
  const [vEmail, setVEmail] = useState('');
  const [vCompany, setVCompany] = useState('');
  const [vBusy, setVBusy] = useState(false);
  const [vErr, setVErr] = useState('');
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await apiGet<{ landing: Landing }>(`/public/event/${encodeURIComponent(eventId)}`);
        if (!live) return;
        setLanding(r.landing);
        // Preselect the first tier that is not sold out.
        const firstAvailable = r.landing.tiers.find((t) => !t.sold_out);
        if (firstAvailable) setTierId(firstAvailable.id);
        // When the vendor CTA is on, also load the exhibitor offer so we can
        // show packages and booths. A failure here is non-fatal; we simply
        // fall back to the simple two-button vendor behavior.
        if (r.landing.settings.vendor_cta_enabled) {
          try {
            const ex = await apiGet<ExhibitOffer>(`/public/event/${encodeURIComponent(eventId)}/exhibit`);
            if (!live) return;
            setOffer(ex);
          } catch {
            /* exhibit offer unavailable; keep the simple vendor fallback */
          }
        }
      } catch (e: any) {
        if (live) setErr(e?.message ?? 'This event is not available.');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [eventId]);

  async function submitAttend(e: React.FormEvent) {
    e.preventDefault();
    if (!landing) return;
    if (!name.trim() || !email.trim()) {
      setAttendErr('Please add your name and email.');
      return;
    }
    const ticketed = landing.settings.attend_mode === 'ticketed';
    if (ticketed && !tierId) {
      setAttendErr('Please choose a ticket.');
      return;
    }
    setBusy(true);
    setAttendErr('');
    try {
      const body: { name: string; email: string; tier_id?: string; quantity?: number } = {
        name: name.trim(),
        email: email.trim(),
      };
      if (ticketed) {
        body.tier_id = tierId;
        body.quantity = quantity;
      }
      const r = await apiSend<RegisterResult>('POST', `/public/event/${encodeURIComponent(eventId)}/register`, body);
      setResult(r);
    } catch (e: any) {
      setAttendErr(e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function submitApply(e: React.FormEvent) {
    e.preventDefault();
    if (!landing) return;
    if (!vName.trim() || !vEmail.trim()) {
      setVErr('Please add your name and email.');
      return;
    }
    if (!packageId && !boothId) {
      setVErr('Pick a package or a booth.');
      return;
    }
    setVBusy(true);
    setVErr('');
    try {
      const body: {
        contact_name: string;
        email: string;
        company?: string;
        package_id?: string;
        booth_id?: string;
      } = {
        contact_name: vName.trim(),
        email: vEmail.trim(),
      };
      if (vCompany.trim()) body.company = vCompany.trim();
      if (packageId) body.package_id = packageId;
      if (boothId) body.booth_id = boothId;
      const r = await apiSend<ApplyResult>('POST', `/public/event/${encodeURIComponent(eventId)}/apply`, body);
      setApplyResult(r);
    } catch (e: any) {
      setVErr(e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setVBusy(false);
    }
  }

  function goVendor(role: 'vendor' | 'sponsor') {
    if (!landing) return;
    try {
      sessionStorage.setItem('divini.eventpartner', JSON.stringify({ eventId: landing.event.id, role }));
    } catch {
      /* storage may be unavailable; onboarding still works without the stash */
    }
    nav('/register');
  }

  // Group agenda by track. Null track lands under "Schedule".
  function groupedAgenda(items: Landing['agenda']): { track: string; items: Landing['agenda'] }[] {
    const groups: { track: string; items: Landing['agenda'] }[] = [];
    const index = new Map<string, number>();
    for (const item of items) {
      const track = item.track && item.track.trim() ? item.track : 'Schedule';
      let at = index.get(track);
      if (at === undefined) {
        at = groups.length;
        index.set(track, at);
        groups.push({ track, items: [] });
      }
      groups[at].items.push(item);
    }
    return groups;
  }

  return (
    <div className="el">
      <style>{CSS}</style>
      <div className="el-wrap">
        <div className="el-brand">Divini Partners</div>
        <div className="el-by">by Divini Group</div>

        {loading ? (
          <div className="el-card el-loading">Loading this event...</div>
        ) : err ? (
          <div className="el-card">
            <h1>Event unavailable</h1>
            <p className="el-sub">{err}</p>
            <button type="button" className="el-btn ghost" onClick={() => nav('/')}>
              Go to Divini Partners
            </button>
          </div>
        ) : landing ? (
          <>
            <div className="el-card el-header">
              {landing.event.type && <div className="el-tag">{landing.event.type}</div>}
              <h1>{landing.event.name ?? 'You are invited'}</h1>
              {landing.settings.headline && <p className="el-headline">{landing.settings.headline}</p>}

              <dl className="el-facts">
                {fullDate(landing.event.date_time) && (
                  <div>
                    <dt>When</dt>
                    <dd>{fullDate(landing.event.date_time)}</dd>
                  </div>
                )}
                {placeLabel(landing.place) && (
                  <div>
                    <dt>Where</dt>
                    <dd>{placeLabel(landing.place)}</dd>
                  </div>
                )}
                {landing.event.organizer && (
                  <div>
                    <dt>Hosted by</dt>
                    <dd>{landing.event.organizer}</dd>
                  </div>
                )}
              </dl>

              {landing.settings.description && <p className="el-desc">{landing.settings.description}</p>}
            </div>

            {landing.agenda.length > 0 && (
              <div className="el-card">
                <h2>Agenda</h2>
                {groupedAgenda(landing.agenda).map((group) => (
                  <div key={group.track} className="el-track">
                    <div className="el-track-name">{group.track}</div>
                    <ul className="el-slots">
                      {group.items.map((item) => (
                        <li key={item.id} className="el-slot">
                          {slotTime(item.start_time, item.end_time) && (
                            <span className="el-slot-time">{slotTime(item.start_time, item.end_time)}</span>
                          )}
                          <span className="el-slot-body">
                            <span className="el-slot-title">{item.title ?? 'Session'}</span>
                            {item.location && <span className="el-slot-loc">{item.location}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {landing.settings.attend_mode !== 'off' && (
              <div className="el-card">
                <h2>Attend this event</h2>
                {result ? (
                  <div className="el-success">
                    {landing.settings.attend_mode === 'free' ? (
                      <p className="el-thanks">You are registered. See you there.</p>
                    ) : result.order_status === 'confirmed' ? (
                      <p className="el-thanks">You are registered.</p>
                    ) : (
                      <p className="el-thanks">
                        Order created - total {money(result.amount_cents)} including a{' '}
                        {money(result.platform_fee_cents)} platform fee. Payment will be collected next.
                      </p>
                    )}
                  </div>
                ) : (
                  <form className="el-form" onSubmit={submitAttend}>
                    {landing.settings.attend_mode === 'ticketed' && (
                      <>
                        <div className="el-tiers">
                          {landing.tiers.map((tier) => (
                            <label
                              key={tier.id}
                              className={`el-tier${tier.sold_out ? ' sold' : ''}${tierId === tier.id ? ' picked' : ''}`}
                            >
                              <input
                                type="radio"
                                name="tier"
                                value={tier.id}
                                checked={tierId === tier.id}
                                disabled={tier.sold_out}
                                onChange={() => setTierId(tier.id)}
                              />
                              <span className="el-tier-name">{tier.name}</span>
                              <span className="el-tier-price">
                                {tier.sold_out ? 'Sold out' : money(tier.price_cents)}
                              </span>
                            </label>
                          ))}
                        </div>
                        <label className="el-qty">
                          Quantity
                          <select value={quantity} onChange={(e) => setQuantity(Number(e.target.value))}>
                            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}
                    <input
                      className="el-input"
                      type="text"
                      placeholder="Your name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                    <input
                      className="el-input"
                      type="email"
                      placeholder="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                    {attendErr && <p className="el-err">{attendErr}</p>}
                    <button type="submit" className="el-btn" disabled={busy}>
                      {busy
                        ? 'Submitting...'
                        : landing.settings.attend_mode === 'ticketed'
                          ? 'Get tickets'
                          : 'Register'}
                    </button>
                  </form>
                )}
              </div>
            )}

            {landing.settings.vendor_cta_enabled &&
              (offer && (offer.packages.length > 0 || offer.booths.length > 0) ? (
                <div className="el-card el-vendor">
                  <h2>Become a vendor</h2>
                  <p className="el-sub">
                    Reserve your spot at this event. Choose an exhibitor package or a booth, add your contact
                    details, and apply. We will follow up with next steps.
                  </p>

                  {applyResult ? (
                    <div className="el-success">
                      {applyResult.status === 'confirmed' ? (
                        <p className="el-thanks">
                          You are confirmed as a vendor. We will follow up with next steps.
                        </p>
                      ) : (
                        <p className="el-thanks">
                          Application received - total {money(applyResult.amount_cents)} including a{' '}
                          {money(applyResult.platform_fee_cents)} platform fee. Payment will be collected next.
                        </p>
                      )}
                    </div>
                  ) : (
                    <form className="el-form" onSubmit={submitApply}>
                      {offer.packages.length > 0 && (
                        <div className="el-offer-group">
                          <div className="el-offer-label">Packages</div>
                          <div className="el-tiers">
                            {offer.packages.map((pkg) => (
                              <label
                                key={pkg.id}
                                className={`el-tier el-offer${pkg.sold_out ? ' sold' : ''}${
                                  packageId === pkg.id ? ' picked' : ''
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="package"
                                  value={pkg.id}
                                  checked={packageId === pkg.id}
                                  disabled={pkg.sold_out}
                                  onChange={() => setPackageId(pkg.id)}
                                />
                                <span className="el-offer-body">
                                  <span className="el-tier-name">{pkg.name}</span>
                                  {pkg.includes_booth && <span className="el-offer-note">Booth included</span>}
                                  {pkg.benefits && <span className="el-offer-benefits">{pkg.benefits}</span>}
                                </span>
                                <span className="el-tier-price">
                                  {pkg.sold_out ? 'Sold out' : priceOrFree(pkg.price_cents)}
                                </span>
                              </label>
                            ))}
                          </div>
                          {packageId && (
                            <button
                              type="button"
                              className="el-clear"
                              onClick={() => setPackageId('')}
                            >
                              Clear package selection
                            </button>
                          )}
                        </div>
                      )}

                      {offer.booths.length > 0 && (
                        <div className="el-offer-group">
                          <div className="el-offer-label">Available booths</div>
                          <div className="el-tiers">
                            {offer.booths.map((booth) => (
                              <label
                                key={booth.id}
                                className={`el-tier${boothId === booth.id ? ' picked' : ''}`}
                              >
                                <input
                                  type="radio"
                                  name="booth"
                                  value={booth.id}
                                  checked={boothId === booth.id}
                                  onChange={() => setBoothId(booth.id)}
                                />
                                <span className="el-tier-name">{booth.label}</span>
                                <span className="el-tier-price">{priceOrFree(booth.price_cents)}</span>
                              </label>
                            ))}
                          </div>
                          {boothId && (
                            <button type="button" className="el-clear" onClick={() => setBoothId('')}>
                              Clear booth selection
                            </button>
                          )}
                        </div>
                      )}

                      <input
                        className="el-input"
                        type="text"
                        placeholder="Your name"
                        value={vName}
                        onChange={(e) => setVName(e.target.value)}
                        required
                      />
                      <input
                        className="el-input"
                        type="email"
                        placeholder="Email"
                        value={vEmail}
                        onChange={(e) => setVEmail(e.target.value)}
                        required
                      />
                      <input
                        className="el-input"
                        type="text"
                        placeholder="Company (optional)"
                        value={vCompany}
                        onChange={(e) => setVCompany(e.target.value)}
                      />
                      {vErr && <p className="el-err">{vErr}</p>}
                      <button type="submit" className="el-btn" disabled={vBusy}>
                        {vBusy ? 'Submitting...' : 'Apply to exhibit'}
                      </button>
                    </form>
                  )}

                  <div className="el-vendor-alt">
                    <p className="el-sub">Or create your full vendor account:</p>
                    <div className="el-vendor-actions">
                      <button type="button" className="el-btn ghost" onClick={() => goVendor('vendor')}>
                        Become a vendor
                      </button>
                      <button type="button" className="el-btn ghost" onClick={() => goVendor('sponsor')}>
                        Sponsor this event
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="el-card el-vendor">
                  <h2>Become a vendor</h2>
                  <p className="el-sub">
                    Bring your product or service to this event, or put your brand in front of the audience as a
                    sponsor. Create your Divini Partners page and we will connect you with the organizer.
                  </p>
                  <div className="el-vendor-actions">
                    <button type="button" className="el-btn" onClick={() => goVendor('vendor')}>
                      Become a vendor
                    </button>
                    <button type="button" className="el-btn ghost" onClick={() => goVendor('sponsor')}>
                      Sponsor this event
                    </button>
                  </div>
                </div>
              ))}
          </>
        ) : null}
      </div>
    </div>
  );
}

const CSS = `
.el { min-height: 100vh; padding: 32px 16px;
  background: radial-gradient(120% 120% at 50% 0%, #10131a 0%, #0a0c11 60%); color: #e9edf4; }
.el-wrap { width: 100%; max-width: 620px; margin: 0 auto; }
.el-brand { font-size: 22px; font-weight: 700; letter-spacing: .3px; text-align: center; }
.el-by { font-size: 12px; opacity: .6; margin-bottom: 20px; text-align: center; }
.el-card { background: #141821; border: 1px solid #232a37; border-radius: 16px; padding: 24px; margin-bottom: 16px; }
.el-loading { opacity: .8; text-align: center; }
.el-card h1 { font-size: 26px; margin: 6px 0 8px; }
.el-card h2 { font-size: 18px; margin: 0 0 14px; }
.el-sub { opacity: .8; margin: 0 0 12px; line-height: 1.5; }
.el-headline { font-size: 16px; color: #b9c4d6; margin: 0 0 14px; }
.el-desc { opacity: .9; line-height: 1.6; margin: 14px 0 0; white-space: pre-wrap; }
.el-tag { display: inline-block; font-size: 12px; text-transform: uppercase; letter-spacing: .6px;
  color: #b9c4d6; background: #1b2230; border: 1px solid #2a3342; border-radius: 999px; padding: 4px 10px; }
.el-facts { display: grid; gap: 12px; margin: 16px 0 0; }
.el-facts dt { font-size: 12px; opacity: .6; text-transform: uppercase; letter-spacing: .5px; }
.el-facts dd { margin: 2px 0 0; font-size: 15px; font-weight: 600; }
.el-track { margin-bottom: 18px; }
.el-track:last-child { margin-bottom: 0; }
.el-track-name { font-size: 13px; text-transform: uppercase; letter-spacing: .6px; color: #8a94a6; margin-bottom: 8px; }
.el-slots { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.el-slot { display: grid; grid-template-columns: 120px 1fr; gap: 12px; padding: 10px 12px;
  background: #0f131b; border: 1px solid #1e2634; border-radius: 10px; }
.el-slot-time { font-size: 13px; color: #b9c4d6; font-weight: 600; }
.el-slot-body { display: flex; flex-direction: column; gap: 2px; }
.el-slot-title { font-size: 15px; font-weight: 600; }
.el-slot-loc { font-size: 13px; opacity: .65; }
.el-form { display: grid; gap: 12px; }
.el-tiers { display: grid; gap: 10px; }
.el-tier { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px;
  padding: 12px 14px; background: #0f131b; border: 1px solid #2a3342; border-radius: 10px; cursor: pointer; }
.el-tier.picked { border-color: #4c8bf5; }
.el-tier.sold { opacity: .5; cursor: not-allowed; }
.el-tier-name { font-size: 15px; font-weight: 600; }
.el-tier-price { font-size: 15px; font-weight: 600; color: #b9c4d6; }
.el-qty { display: flex; align-items: center; gap: 10px; font-size: 14px; opacity: .85; }
.el-qty select { background: #0f131b; border: 1px solid #2a3342; border-radius: 10px; padding: 9px 12px;
  color: #e9edf4; font-size: 14px; font-family: inherit; }
.el-input { width: 100%; box-sizing: border-box; background: #0f131b; border: 1px solid #2a3342; border-radius: 10px;
  padding: 11px 12px; font-size: 14px; color: #e9edf4; font-family: inherit; }
.el-input:focus, .el-qty select:focus { outline: none; border-color: #4c8bf5; }
.el-input::placeholder { color: #7c8698; }
.el-btn { border: none; border-radius: 10px; padding: 13px 16px; font-size: 15px; font-weight: 600;
  background: #4c8bf5; color: #fff; cursor: pointer; }
.el-btn:hover { background: #3f7ce0; }
.el-btn:disabled { opacity: .6; cursor: default; }
.el-btn.ghost { background: transparent; border: 1px solid #2a3342; color: #e9edf4; }
.el-err { color: #f2a3a3; font-size: 13px; margin: 0; }
.el-thanks { color: #9ad0b0; font-size: 15px; margin: 0; line-height: 1.5; }
.el-vendor-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.el-vendor-actions .el-btn { flex: 1; min-width: 160px; }
.el-offer-group { display: grid; gap: 8px; }
.el-offer-label { font-size: 13px; text-transform: uppercase; letter-spacing: .6px; color: #8a94a6; }
.el-tier.el-offer { align-items: start; }
.el-offer-body { display: flex; flex-direction: column; gap: 4px; }
.el-offer-note { font-size: 12px; color: #9ad0b0; }
.el-offer-benefits { font-size: 13px; opacity: .75; line-height: 1.4; }
.el-clear { justify-self: start; background: none; border: none; padding: 0; color: #8aa8e6;
  font-size: 13px; font-family: inherit; cursor: pointer; }
.el-clear:hover { color: #b9c4d6; }
.el-vendor-alt { margin-top: 20px; padding-top: 16px; border-top: 1px solid #232a37; }
.el-vendor-alt .el-sub { margin-bottom: 10px; }
`;
