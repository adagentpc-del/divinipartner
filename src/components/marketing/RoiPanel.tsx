/**
 * RoiPanel - a compact ROI dashboard grid. Each cell is a key metric with a
 * value and an optional delta line (Impressions, Engagement, Leads, Conversions,
 * Revenue Impact style). Brand styled, self-contained, no deps.
 */
export type RoiMetric = { k: string; v: string; d?: string };
export type RoiPanelProps = {
  metrics?: RoiMetric[];
};

const DEFAULT_METRICS: RoiMetric[] = [
  { k: 'Impressions', v: '2.4M', d: '+38% vs last event' },
  { k: 'Engagement', v: '11.2%', d: '+2.6 pts' },
  { k: 'Leads', v: '1,840', d: '+612 new' },
  { k: 'Conversions', v: '7.9%', d: '+1.4 pts' },
  { k: 'Revenue Impact', v: '$486K', d: '+$132K' },
];

export default function RoiPanel({ metrics = DEFAULT_METRICS }: RoiPanelProps) {
  return (
    <div className="mk-roi">
      {metrics.map((m) => (
        <div className="mk-roi-cell" key={m.k}>
          <div className="mk-roi-k">{m.k}</div>
          <div className="mk-roi-v">{m.v}</div>
          {m.d ? <div className="mk-roi-d">{m.d}</div> : null}
        </div>
      ))}
    </div>
  );
}
