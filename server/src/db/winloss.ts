/**
 * Phase 8 - Super Admin Win/Loss + setup-efficacy scorecard.
 *
 * Read-only analytics over the EXISTING marketplace tables (bids, quotes,
 * onboarding_drafts, vendors). Nothing here is fabricated: every number is a SQL
 * aggregate over real rows, and the function degrades gracefully to zeros when
 * the platform is empty. Assumes the route layer ran the same guard the other
 * intelligence endpoints use.
 *
 * Definitions (drawn from the bid/quote status enums in db/schema.sql):
 *   - bids:   won   = awarded
 *             lost  = declined | expired
 *             open  = any other non-draft status (still live / undecided)
 *             win_rate = won / (won + lost)
 *   - quotes: accepted = accepted | converted
 *             declined = declined | expired
 *             pending  = any other status (still in flight)
 *             win_rate = accepted / (accepted + declined)
 *   - trend:  bid win-rate per calendar month for the last ~6 months.
 *   - efficacy: organizations bucketed by their onboarding_drafts.strength
 *               (the platform's 0..100 profile-completeness meter) into
 *               Low / Medium / High, paired with the bid + quote win-rate of
 *               work tied to those orgs. Answers "does a more complete setup
 *               win more?".
 */
import { q, q1 } from "../pool.js";

export interface WinLossReport {
  generated_at: string;
  bids: { won: number; lost: number; open: number; win_rate: number };
  quotes: { accepted: number; declined: number; pending: number; win_rate: number };
  trend: { month: string; won: number; lost: number; win_rate: number }[];
  efficacy: {
    completeness_band: string;
    profiles: number;
    win_rate: number;
  }[];
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Win rate as a 0..100 percentage rounded to one decimal; 0 when no decisions. */
function rate(won: number, lost: number): number {
  const decided = won + lost;
  if (decided <= 0) return 0;
  return Math.round((won / decided) * 1000) / 10;
}

export async function winLossReport(): Promise<WinLossReport> {
  // ---- bids: won / lost / open ----
  const bidRow = await q1<{ won: number; lost: number; open: number }>(
    `select
        count(*) filter (where status = 'awarded')::int as won,
        count(*) filter (where status in ('declined','expired'))::int as lost,
        count(*) filter (where status not in ('draft','awarded','declined','expired'))::int as open
       from bids`,
  );
  const bidWon = num(bidRow?.won);
  const bidLost = num(bidRow?.lost);
  const bidOpen = num(bidRow?.open);

  // ---- quotes: accepted / declined / pending ----
  const quoteRow = await q1<{ accepted: number; declined: number; pending: number }>(
    `select
        count(*) filter (where status in ('accepted','converted'))::int as accepted,
        count(*) filter (where status in ('declined','expired'))::int as declined,
        count(*) filter (where status not in ('accepted','converted','declined','expired'))::int as pending
       from quotes`,
  );
  const qAccepted = num(quoteRow?.accepted);
  const qDeclined = num(quoteRow?.declined);
  const qPending = num(quoteRow?.pending);

  // ---- trend: bid outcomes by month, last ~6 months ----
  const trendRows = await q<{ month: string; won: number; lost: number }>(
    `select
        to_char(date_trunc('month', created_at), 'YYYY-MM') as month,
        count(*) filter (where status = 'awarded')::int as won,
        count(*) filter (where status in ('declined','expired'))::int as lost
       from bids
      where created_at >= date_trunc('month', now()) - interval '5 months'
      group by 1
      order by 1 asc`,
  );
  const trend = trendRows.map((r) => {
    const won = num(r.won);
    const lost = num(r.lost);
    return { month: r.month, won, lost, win_rate: rate(won, lost) };
  });

  // ---- efficacy: completeness band vs win-rate ----
  // Each org carries its profile-completeness strength (0..100) from
  // onboarding_drafts. We bucket orgs into Low/Medium/High and, for each band,
  // aggregate the win/loss of the bids + quotes tied to those orgs:
  //   - bids via the bid's event organization_id
  //   - quotes via the quoting vendor's organization_id
  // A "decision" (won or lost) is counted once per band; win_rate is over all
  // decisions in the band. profiles = number of orgs with a draft in the band.
  const effRows = await q<{
    band: string;
    profiles: number;
    won: number;
    lost: number;
  }>(
    `with org_band as (
        select d.organization_id,
               case
                 when coalesce(d.strength,0) >= 75 then 'High'
                 when coalesce(d.strength,0) >= 45 then 'Medium'
                 else 'Low'
               end as band
          from onboarding_drafts d
     ),
     bid_outcomes as (
        select e.organization_id,
               count(*) filter (where b.status = 'awarded')::int as won,
               count(*) filter (where b.status in ('declined','expired'))::int as lost
          from bids b
          join events e on e.id = b.event_id
         where e.organization_id is not null
         group by e.organization_id
     ),
     quote_outcomes as (
        select v.organization_id,
               count(*) filter (where q.status in ('accepted','converted'))::int as won,
               count(*) filter (where q.status in ('declined','expired'))::int as lost
          from quotes q
          join vendors v on v.id = q.vendor_id
         where v.organization_id is not null
         group by v.organization_id
     ),
     per_org as (
        select ob.organization_id,
               ob.band,
               coalesce(bo.won,0) + coalesce(qo.won,0) as won,
               coalesce(bo.lost,0) + coalesce(qo.lost,0) as lost
          from org_band ob
          left join bid_outcomes bo on bo.organization_id = ob.organization_id
          left join quote_outcomes qo on qo.organization_id = ob.organization_id
     )
     select band,
            count(*)::int as profiles,
            coalesce(sum(won),0)::int as won,
            coalesce(sum(lost),0)::int as lost
       from per_org
      group by band`,
  );

  const bandOrder: Record<string, number> = { Low: 0, Medium: 1, High: 2 };
  const byBand = new Map(effRows.map((r) => [r.band, r]));
  const efficacy = ["Low", "Medium", "High"].map((band) => {
    const r = byBand.get(band);
    const won = num(r?.won);
    const lost = num(r?.lost);
    return {
      completeness_band: band,
      profiles: num(r?.profiles),
      win_rate: rate(won, lost),
    };
  });
  // keep deterministic Low -> High ordering
  efficacy.sort((a, b) => bandOrder[a.completeness_band] - bandOrder[b.completeness_band]);

  return {
    generated_at: new Date().toISOString(),
    bids: { won: bidWon, lost: bidLost, open: bidOpen, win_rate: rate(bidWon, bidLost) },
    quotes: {
      accepted: qAccepted,
      declined: qDeclined,
      pending: qPending,
      win_rate: rate(qAccepted, qDeclined),
    },
    trend,
    efficacy,
  };
}
