import { useEffect, useRef, useState } from 'react';

/**
 * OpportunityFeedPreview - an animated feed of sample opportunities that cycles,
 * surfacing one fresh item to the top on an interval. Deterministic sample data,
 * no real calls. Pure React + CSS transitions, no deps.
 */
export type OpportunityItem = { label: string; meta?: string; value?: string };
export type OpportunityFeedPreviewProps = {
  items?: OpportunityItem[];
  title?: string;
  visible?: number;
};

const DEFAULT_ITEMS: OpportunityItem[] = [
  { label: 'Autumn gala, 240 guests', meta: 'Grand Ballroom, Oct 18', value: '$48,500' },
  { label: 'Corporate offsite, 3 days', meta: 'Garden Terrace, Nov 4', value: '$112,000' },
  { label: 'Sponsorship, beverage brand', meta: 'Summer concert series', value: '$36,000' },
  { label: 'Wedding reception, 160', meta: 'Atrium, Dec 7', value: '$61,200' },
  { label: 'Vendor match, floral', meta: 'Petal and Stem, premier', value: 'New' },
  { label: 'Charity luncheon, 90', meta: 'Salon A, Sep 22', value: '$18,400' },
];

export default function OpportunityFeedPreview({
  items = DEFAULT_ITEMS,
  title = 'Live opportunities',
  visible = 4,
}: OpportunityFeedPreviewProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => setRunning(entries.some((e) => e.isIntersecting)),
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!running || items.length <= visible) return;
    const t = setInterval(() => setOffset((o) => (o + 1) % items.length), 2600);
    return () => clearInterval(t);
  }, [running, items.length, visible]);

  const shown = Array.from({ length: Math.min(visible, items.length) }, (_, i) => items[(offset + i) % items.length]);

  return (
    <div className="mk-feed" ref={ref}>
      <div className="mk-feed-h">{title}</div>
      {shown.map((it, i) => (
        <div className="mk-feed-item" key={`${it.label}-${offset}-${i}`}>
          <div className="mk-fi-main">
            <div className="mk-fi-label">{it.label}</div>
            {it.meta ? <div className="mk-fi-meta">{it.meta}</div> : null}
          </div>
          {it.value ? <div className="mk-fi-val">{it.value}</div> : null}
        </div>
      ))}
    </div>
  );
}
