/**
 * BeforeAfter - a two-column comparison. The left column lists the old, painful
 * way; the right column lists the Divini way. Brand styled, self-contained, no
 * deps. Reinforces the platform line: build once, scale forever.
 */
export type BeforeAfterRow = { label: string; sub?: string };
export type BeforeAfterProps = {
  before?: BeforeAfterRow[];
  after?: BeforeAfterRow[];
  beforeTitle?: string;
  afterTitle?: string;
};

const DEFAULT_BEFORE: BeforeAfterRow[] = [
  { label: 'Spreadsheets and email chains', sub: 'Every event rebuilt from scratch' },
  { label: 'Quotes take days', sub: 'Manual pricing, version confusion' },
  { label: 'Vendors scattered everywhere', sub: 'No shared standard or record' },
  { label: 'Revenue left on the table', sub: 'No view of sponsorship or upsell' },
];

const DEFAULT_AFTER: BeforeAfterRow[] = [
  { label: 'One intelligent workspace', sub: 'Build once, scale forever' },
  { label: 'Quotes that generate themselves', sub: 'Accurate the moment a request lands' },
  { label: 'Your preferred network, in one place', sub: 'Every partner held to your standard' },
  { label: 'Revenue infrastructure', sub: 'Sponsorship and upsell captured by default' },
];

function Column({ title, rows, kind }: { title: string; rows: BeforeAfterRow[]; kind: 'before' | 'after' }) {
  return (
    <div className={`mk-ba-col ${kind}`}>
      <h4>{title}</h4>
      {rows.map((r) => (
        <div className="mk-ba-row" key={r.label}>
          <span className="mk-ba-ic">{kind === 'before' ? '✕' : '✓'}</span>
          <span>
            <span className="mk-ba-t" style={{ display: 'block' }}>{r.label}</span>
            {r.sub ? <span className="mk-ba-s" style={{ display: 'block' }}>{r.sub}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function BeforeAfter({
  before = DEFAULT_BEFORE,
  after = DEFAULT_AFTER,
  beforeTitle = 'Before Divini',
  afterTitle = 'With Divini',
}: BeforeAfterProps) {
  return (
    <div className="mk-ba">
      <Column title={beforeTitle} rows={before} kind="before" />
      <Column title={afterTitle} rows={after} kind="after" />
    </div>
  );
}
