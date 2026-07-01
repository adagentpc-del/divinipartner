import AnimatedCounter from './AnimatedCounter';

/**
 * Scorecard - a venue or vendor scorecard card. Headline score (counts up) plus
 * a list of labeled metric rows. Brand styled, self-contained, no deps.
 */
export type ScorecardRow = { label: string; value: string };
export type ScorecardProps = {
  title?: string;
  score?: number;
  scoreSuffix?: string;
  rows?: ScorecardRow[];
};

const DEFAULT_ROWS: ScorecardRow[] = [
  { label: 'Response time', value: 'Under 2 hrs' },
  { label: 'Booking conversion', value: '68%' },
  { label: 'Repeat clients', value: '41%' },
  { label: 'Verified reviews', value: '4.9 / 5' },
];

export default function Scorecard({
  title = 'Venue Scorecard',
  score = 92,
  scoreSuffix = '',
  rows = DEFAULT_ROWS,
}: ScorecardProps) {
  return (
    <div className="mk-scorecard">
      <div className="mk-sc-top">
        <div className="mk-sc-title">{title}</div>
        <div className="mk-sc-score">
          <AnimatedCounter value={score} suffix={scoreSuffix} durationMs={1300} />
        </div>
      </div>
      {rows.map((r) => (
        <div className="mk-sc-row" key={r.label}>
          <span className="mk-sc-k">{r.label}</span>
          <span className="mk-sc-v">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
