/**
 * Public tour landing (/tour/:tourId). No auth. Lists every stop on the tour,
 * each linking to that stop's public event page (/event/:eventId) where a visitor
 * can attend or become a vendor. Self-contained styling under .pt-. Zero em dashes.
 */
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiGet } from '../../lib/api';

type Tour = { id: string; name: string; description: string | null; organizer: string | null };
type Stop = { event_id: string; name: string | null; date_time: string | null; stop_city: string | null };

function dateStr(v: string | null): string {
  if (!v) return 'Date TBD';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? 'Date TBD' : d.toLocaleDateString('en-US', { dateStyle: 'medium' });
}

export default function PublicTour() {
  const { tourId = '' } = useParams();
  const [tour, setTour] = useState<Tour | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await apiGet<{ tour: Tour; stops: Stop[] }>(`/public/tour/${encodeURIComponent(tourId)}`);
        if (live) { setTour(r.tour); setStops(r.stops ?? []); }
      } catch (e: any) {
        if (live) setErr(e?.message ?? 'This tour is not available.');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [tourId]);

  return (
    <div className="pt">
      <style>{CSS}</style>
      <div className="pt-wrap">
        <div className="pt-brand">Divini Partners</div>
        {loading ? (
          <div className="pt-loading">Loading the tour...</div>
        ) : err ? (
          <div className="pt-card"><h1>Tour unavailable</h1><p className="pt-sub">{err}</p></div>
        ) : tour ? (
          <>
            <h1 className="pt-title">{tour.name}</h1>
            {tour.organizer && <p className="pt-org">Presented by {tour.organizer}</p>}
            {tour.description && <p className="pt-desc">{tour.description}</p>}
            <div className="pt-count">{stops.length} stop{stops.length === 1 ? '' : 's'}</div>
            {stops.length === 0 ? (
              <div className="pt-card"><p className="pt-sub">Stops are being announced. Check back soon.</p></div>
            ) : (
              <div className="pt-list">
                {stops.map((s, i) => (
                  <Link key={s.event_id} to={`/event/${s.event_id}`} className="pt-stop">
                    <div className="pt-num">{i + 1}</div>
                    <div className="pt-body">
                      <div className="pt-name">{s.name}{s.stop_city ? <span className="pt-city">{s.stop_city}</span> : null}</div>
                      <div className="pt-date">{dateStr(s.date_time)}</div>
                    </div>
                    <div className="pt-cta">Attend or exhibit</div>
                  </Link>
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

const CSS = `
.pt { min-height: 100vh; background: #faf8f3; padding: 40px 16px; }
.pt-wrap { max-width: 720px; margin: 0 auto; }
.pt-brand { font-family: Georgia, serif; font-size: 18px; color: #123c2e; font-weight: 700; margin-bottom: 18px; }
.pt-title { font-family: Georgia, serif; font-size: 32px; color: #123c2e; margin: 0 0 4px; }
.pt-org { color: #7d776c; margin: 0 0 8px; }
.pt-desc { color: #4a463f; margin: 0 0 14px; line-height: 1.6; }
.pt-count { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; color: #1E5D4A; margin-bottom: 14px; }
.pt-card { background: #fff; border: 1px solid #e7e1d6; border-radius: 12px; padding: 22px; }
.pt-sub { color: #7d776c; margin: 0; }
.pt-loading { color: #7d776c; }
.pt-list { display: flex; flex-direction: column; gap: 10px; }
.pt-stop { display: flex; align-items: center; gap: 14px; background: #fff; border: 1px solid #ece5d8; border-radius: 12px; padding: 14px 16px; text-decoration: none; color: inherit; }
.pt-stop:hover { border-color: #123c2e; }
.pt-num { flex: 0 0 auto; width: 30px; height: 30px; border-radius: 50%; background: #123c2e; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; }
.pt-body { flex: 1; }
.pt-name { font-size: 16px; font-weight: 600; color: #2c2a26; display: flex; align-items: center; gap: 8px; }
.pt-city { font-size: 11px; font-weight: 700; letter-spacing: .4px; color: #1E5D4A; background: rgba(30,93,74,.12); border-radius: 4px; padding: 1px 6px; }
.pt-date { font-size: 13px; color: #a99f8c; margin-top: 2px; }
.pt-cta { font-size: 13px; font-weight: 600; color: #2563eb; }
@media (max-width: 520px) { .pt-cta { display: none; } }
`;
