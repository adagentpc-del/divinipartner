import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet, apiSend } from '../lib/api';

/**
 * Public shareable event / RSVP page. Reached at /e/:eventId by anyone with the
 * link (no account required). Shows attendee-safe event basics and lets a guest
 * submit their own RSVP, which lands in the host's Guest List. Zero em dashes.
 */

type PublicEvent = {
  id: string;
  name: string;
  date_time: string | null;
  type: string | null;
  venue_name: string | null;
  venue_city: string | null;
  host: string | null;
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function PublicEventRsvp() {
  const { eventId } = useParams();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [attending, setAttending] = useState<'yes' | 'no'>('yes');
  const [party, setParty] = useState(1);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<'confirmed' | 'declined' | null>(null);

  useEffect(() => {
    let alive = true;
    if (!eventId) return;
    apiGet<{ event: PublicEvent | null }>(`/guest-hub/public/info/${eventId}`)
      .then((r) => {
        if (!alive) return;
        if (!r.event) setNotFound(true);
        else setEvent(r.event);
      })
      .catch(() => {
        if (alive) setNotFound(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [eventId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!name.trim()) return setErr('Please enter your name.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()))
      return setErr('Please enter a valid email.');
    setBusy(true);
    try {
      const res = await apiSend<{ ok: boolean; status: 'confirmed' | 'declined' }>(
        'POST',
        `/guest-hub/public/rsvp/${eventId}`,
        {
          name: name.trim(),
          email: email.trim(),
          status: attending === 'yes' ? 'confirmed' : 'declined',
          party_size: attending === 'yes' ? party : 1,
          note: note.trim() || null,
        },
      );
      setDone(res.status);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not submit your RSVP. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const when = formatDate(event?.date_time ?? null);
  const venue =
    event?.venue_name && event?.venue_city
      ? `${event.venue_name}, ${event.venue_city}`
      : event?.venue_name || event?.venue_city || null;

  return (
    <div className="pev">
      <style>{`
        .pev{min-height:100vh;background:#f3efe6;color:#2c2a26;font-family:Inter,system-ui,sans-serif;padding:40px 20px}
        .pev .wrap{max-width:560px;margin:0 auto}
        .pev .brand{font-family:'Cormorant Garamond',serif;font-size:22px;color:#123c2e;font-weight:700;text-align:center}
        .pev .tg{text-align:center;color:#7d776c;font-size:12px;letter-spacing:.5px;text-transform:uppercase;margin-bottom:24px}
        .pev .card{background:#fff;border:1px solid #e7e1d6;border-radius:16px;padding:28px;box-shadow:0 30px 60px -40px rgba(18,60,46,.4)}
        .pev .kicker{font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#C9A35B;margin-bottom:8px}
        .pev h1{font-family:'Cormorant Garamond',serif;font-size:32px;color:#123c2e;margin:0 0 12px;line-height:1.1}
        .pev .meta{color:#4b463e;font-size:15px;line-height:1.6;margin-bottom:6px}
        .pev .meta b{color:#123c2e}
        .pev .host{color:#7d776c;font-size:13px;margin-top:10px}
        .pev hr{border:none;border-top:1px solid #eee5d8;margin:22px 0}
        .pev .lbl{font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#7d776c;margin:16px 0 8px}
        .pev input,.pev textarea{width:100%;padding:12px;border:1px solid #e7e1d6;border-radius:10px;font-size:15px;font-family:Inter;box-sizing:border-box}
        .pev textarea{min-height:70px;resize:vertical}
        .pev input:focus,.pev textarea:focus{outline:none;border-color:#1E5D4A}
        .pev .seg{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .pev .seg button{padding:12px;border:1px solid #e7e1d6;background:#fff;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;color:#4b463e}
        .pev .seg button.on-yes{border-color:#1E5D4A;background:#f0f6f2;color:#123c2e;box-shadow:0 0 0 1px #1E5D4A inset}
        .pev .seg button.on-no{border-color:#a3382f;background:#fbe9e7;color:#a3382f;box-shadow:0 0 0 1px #a3382f inset}
        .pev .btn{width:100%;padding:14px;border:none;border-radius:12px;background:#1E5D4A;color:#fff;font-weight:700;font-size:15px;cursor:pointer;margin-top:20px}
        .pev .btn:disabled{opacity:.5;cursor:default}
        .pev .err{background:#fbe9e7;color:#a3382f;border-radius:10px;padding:10px 12px;font-size:13px;margin-top:14px}
        .pev .ok{text-align:center;padding:8px 0}
        .pev .ok .big{font-family:'Cormorant Garamond',serif;font-size:30px;color:#123c2e;margin-bottom:8px}
        .pev .ok p{color:#4b463e;font-size:15px;line-height:1.6}
        .pev .muted{color:#9a9488;font-size:12px;text-align:center;margin-top:18px}
      `}</style>
      <div className="wrap">
        <div className="brand">Divini Partners</div>
        <div className="tg">You are invited</div>
        <div className="card">
          {loading ? (
            <p className="meta">Loading event...</p>
          ) : notFound || !event ? (
            <>
              <h1>Event not found</h1>
              <p className="meta">This invite link is invalid or the event is no longer available.</p>
            </>
          ) : done ? (
            <div className="ok">
              <div className="big">
                {done === 'confirmed' ? 'You are on the list' : 'Thanks for letting us know'}
              </div>
              <p>
                {done === 'confirmed'
                  ? `Your RSVP for ${event.name} is confirmed. We look forward to seeing you.`
                  : `We have recorded that you cannot attend ${event.name}. Thank you for responding.`}
              </p>
            </div>
          ) : (
            <>
              <div className="kicker">{event.type ? event.type : 'Event'}</div>
              <h1>{event.name}</h1>
              {when ? (
                <div className="meta">
                  <b>When</b> &nbsp;{when}
                </div>
              ) : null}
              {venue ? (
                <div className="meta">
                  <b>Where</b> &nbsp;{venue}
                </div>
              ) : null}
              {event.host ? <div className="host">Hosted by {event.host}</div> : null}

              <hr />

              <form onSubmit={submit}>
                <div className="lbl">Your name</div>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" autoComplete="name" />

                <div className="lbl">Email</div>
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" inputMode="email" />

                <div className="lbl">Will you attend?</div>
                <div className="seg">
                  <button type="button" className={attending === 'yes' ? 'on-yes' : ''} onClick={() => setAttending('yes')}>
                    Yes, I will be there
                  </button>
                  <button type="button" className={attending === 'no' ? 'on-no' : ''} onClick={() => setAttending('no')}>
                    No, I cannot make it
                  </button>
                </div>

                {attending === 'yes' ? (
                  <>
                    <div className="lbl">Party size (including you)</div>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={party}
                      onChange={(e) => setParty(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                    />
                  </>
                ) : null}

                <div className="lbl">Note for the host (optional)</div>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Dietary needs, accessibility, or a message" />

                {err ? <div className="err">{err}</div> : null}
                <button className="btn" disabled={busy}>
                  {busy ? 'Sending...' : 'Send RSVP'}
                </button>
              </form>
            </>
          )}
        </div>
        <div className="muted">Powered by Divini Partners</div>
      </div>
    </div>
  );
}
