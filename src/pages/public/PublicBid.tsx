/**
 * Public shareable bid page (/b/:token).
 *
 * A vendor or sponsor who received a bid link out of band (in person, over text)
 * lands here with no account. We read the bid through the public endpoint (no
 * auth), show what the organizer needs, and give a one-tap path to register and
 * submit. Every step is tracked through the share link so the organizer sees the
 * funnel. Self-contained, brand-consistent styling. Zero em dashes.
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGet, apiSend } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { stashBidShare, trackBidShare } from '../../lib/bidShare';

type PublicBidView = {
  token: string;
  audience: 'vendor' | 'sponsor' | 'any';
  label: string | null;
  bid: {
    id: string;
    category: string | null;
    scope: string | null;
    budget_min: string | null;
    budget_max: string | null;
    deadline: string | null;
    status: string | null;
  };
  event: { id: string | null; name: string | null; date_time: string | null; organizer: string | null };
  charity: { cause: string | null; fundraising_event_id: string } | null;
};

function money(v: string | null): string | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? `$${Math.round(n).toLocaleString('en-US')}` : null;
}

function dateStr(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { dateStyle: 'medium' });
}

export default function PublicBid() {
  const { token = '' } = useParams();
  const nav = useNavigate();
  const { session } = useAuth();

  const [view, setView] = useState<PublicBidView | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // Secondary "express interest now" path: capture a lead with no account yet.
  const [leadName, setLeadName] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadMessage, setLeadMessage] = useState('');
  const [leadAmount, setLeadAmount] = useState('');
  const [leadBusy, setLeadBusy] = useState(false);
  const [leadErr, setLeadErr] = useState('');
  const [leadSent, setLeadSent] = useState(false);

  async function submitInterest(e: React.FormEvent) {
    e.preventDefault();
    if (!view) return;
    if (!leadName.trim() || !leadEmail.trim()) {
      setLeadErr('Please add your name and email.');
      return;
    }
    setLeadBusy(true);
    setLeadErr('');
    try {
      await apiSend('POST', `/public/bids/${encodeURIComponent(view.token)}/interest`, {
        name: leadName.trim(),
        email: leadEmail.trim(),
        message: leadMessage.trim() || null,
        amount: view.audience === 'sponsor' && leadAmount.trim() ? Number(leadAmount) : null,
        party: view.audience,
      });
      setLeadSent(true);
    } catch (e: any) {
      setLeadErr(e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLeadBusy(false);
    }
  }

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await apiGet<{ bid_share: PublicBidView }>(`/public/bids/${encodeURIComponent(token)}`);
        if (live) setView(r.bid_share);
      } catch (e: any) {
        if (live) setErr(e?.message ?? 'This bid link is no longer available.');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [token]);

  function proceed() {
    if (!view) return;
    stashBidShare({
      token: view.token,
      bidId: view.bid.id,
      eventId: view.event.id,
      audience: view.audience,
    });
    void trackBidShare(view.token, 'register_start');
    // Signed in already: send them straight in to submit.
    if (session) {
      const dest =
        view.audience === 'sponsor'
          ? view.event.id
            ? `/sponsorship-packages?event=${encodeURIComponent(view.event.id)}`
            : '/sponsorships'
          : `/bids?bid=${encodeURIComponent(view.bid.id)}`;
      void trackBidShare(view.token, 'registered');
      nav(dest);
      return;
    }
    // New user: create an account, then /get-started reads the stash back.
    nav('/register');
  }

  const isSponsor = view?.audience === 'sponsor';
  const partyWord = isSponsor ? 'sponsor' : view?.audience === 'vendor' ? 'vendor' : 'partner';
  const budget =
    view && (money(view.bid.budget_min) || money(view.bid.budget_max))
      ? `${money(view.bid.budget_min) ?? '?'} - ${money(view.bid.budget_max) ?? '?'}`
      : null;

  return (
    <div className="pb">
      <style>{CSS}</style>
      <div className="pb-wrap">
        <div className="pb-brand">Divini Partners</div>
        <div className="pb-by">by Divini Group</div>

        <div className="pb-card">
          {loading ? (
            <div className="pb-loading">Loading this opportunity...</div>
          ) : err ? (
            <>
              <h1>Link unavailable</h1>
              <p className="pb-sub">{err}</p>
              <button type="button" className="pb-btn ghost" onClick={() => nav('/')}>
                Go to Divini Partners
              </button>
            </>
          ) : view ? (
            <>
              <div className="pb-tag">{isSponsor ? 'Sponsorship opportunity' : 'Open bid'}</div>
              <h1>{view.event.name ?? view.bid.category ?? 'An opportunity for you'}</h1>
              {view.event.organizer && <p className="pb-sub">Hosted by {view.event.organizer}</p>}
              {view.charity?.cause && <p className="pb-cause">Cause: {view.charity.cause}</p>}

              <dl className="pb-facts">
                {view.bid.category && (
                  <div>
                    <dt>Category</dt>
                    <dd>{view.bid.category}</dd>
                  </div>
                )}
                {budget && (
                  <div>
                    <dt>Budget</dt>
                    <dd>{budget}</dd>
                  </div>
                )}
                {dateStr(view.event.date_time) && (
                  <div>
                    <dt>Event date</dt>
                    <dd>{dateStr(view.event.date_time)}</dd>
                  </div>
                )}
                {dateStr(view.bid.deadline) && (
                  <div>
                    <dt>Respond by</dt>
                    <dd>{dateStr(view.bid.deadline)}</dd>
                  </div>
                )}
              </dl>

              {view.bid.scope && <p className="pb-scope">{view.bid.scope}</p>}

              <button type="button" className="pb-btn" onClick={proceed}>
                {session ? 'Continue to submit' : `Register as a ${partyWord} and submit`}
              </button>
              {!session && (
                <p className="pb-fine">
                  Free to create your page. You only build your profile once, then submit here.
                </p>
              )}

              <div className="pb-interest">
                {leadSent ? (
                  <p className="pb-thanks">Thanks - the organizer will follow up with you.</p>
                ) : (
                  <>
                    <div className="pb-or">or express interest now</div>
                    <p className="pb-fine">
                      Not ready to register? Leave your details and the organizer will reach out.
                    </p>
                    <form className="pb-form" onSubmit={submitInterest}>
                      <input
                        className="pb-input"
                        type="text"
                        placeholder="Your name"
                        value={leadName}
                        onChange={(e) => setLeadName(e.target.value)}
                        required
                      />
                      <input
                        className="pb-input"
                        type="email"
                        placeholder="Email"
                        value={leadEmail}
                        onChange={(e) => setLeadEmail(e.target.value)}
                        required
                      />
                      {isSponsor && (
                        <input
                          className="pb-input"
                          type="number"
                          min="0"
                          step="any"
                          placeholder="Amount you have in mind (optional)"
                          value={leadAmount}
                          onChange={(e) => setLeadAmount(e.target.value)}
                        />
                      )}
                      <textarea
                        className="pb-input"
                        rows={3}
                        placeholder="Anything to add? (optional)"
                        value={leadMessage}
                        onChange={(e) => setLeadMessage(e.target.value)}
                      />
                      {leadErr && <p className="pb-err">{leadErr}</p>}
                      <button type="submit" className="pb-btn ghost" disabled={leadBusy}>
                        {leadBusy ? 'Sending...' : 'Express interest'}
                      </button>
                    </form>
                  </>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const CSS = `
.pb { min-height: 100vh; display: grid; place-items: center; padding: 32px 16px;
  background: radial-gradient(120% 120% at 50% 0%, #10131a 0%, #0a0c11 60%); color: #e9edf4; }
.pb-wrap { width: 100%; max-width: 560px; text-align: center; }
.pb-brand { font-size: 22px; font-weight: 700; letter-spacing: .3px; }
.pb-by { font-size: 12px; opacity: .6; margin-bottom: 20px; }
.pb-card { background: #141821; border: 1px solid #232a37; border-radius: 16px; padding: 28px; text-align: left; }
.pb-card h1 { font-size: 24px; margin: 6px 0 4px; }
.pb-sub { opacity: .8; margin: 0 0 8px; }
.pb-cause { color: #9ad0b0; margin: 0 0 8px; font-size: 14px; }
.pb-tag { display: inline-block; font-size: 12px; text-transform: uppercase; letter-spacing: .6px;
  color: #b9c4d6; background: #1b2230; border: 1px solid #2a3342; border-radius: 999px; padding: 4px 10px; margin-bottom: 10px; }
.pb-facts { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; margin: 16px 0; }
.pb-facts dt { font-size: 12px; opacity: .6; }
.pb-facts dd { margin: 2px 0 0; font-size: 15px; font-weight: 600; }
.pb-scope { opacity: .9; line-height: 1.5; margin: 8px 0 18px; white-space: pre-wrap; }
.pb-btn { width: 100%; border: none; border-radius: 10px; padding: 13px 16px; font-size: 15px; font-weight: 600;
  background: #4c8bf5; color: #fff; cursor: pointer; }
.pb-btn:hover { background: #3f7ce0; }
.pb-btn.ghost { background: transparent; border: 1px solid #2a3342; color: #e9edf4; }
.pb-fine { font-size: 12px; opacity: .65; margin: 10px 2px 0; }
.pb-loading { opacity: .8; }
.pb-interest { margin-top: 22px; padding-top: 18px; border-top: 1px solid #232a37; }
.pb-or { text-align: center; font-size: 12px; text-transform: uppercase; letter-spacing: .6px; opacity: .6; margin-bottom: 6px; }
.pb-form { display: grid; gap: 10px; margin-top: 12px; }
.pb-input { width: 100%; box-sizing: border-box; background: #0f131b; border: 1px solid #2a3342; border-radius: 10px;
  padding: 11px 12px; font-size: 14px; color: #e9edf4; font-family: inherit; }
.pb-input:focus { outline: none; border-color: #4c8bf5; }
.pb-input::placeholder { color: #7c8698; }
.pb-err { color: #f2a3a3; font-size: 13px; margin: 0; }
.pb-thanks { color: #9ad0b0; font-size: 15px; margin: 4px 0 0; }
`;
