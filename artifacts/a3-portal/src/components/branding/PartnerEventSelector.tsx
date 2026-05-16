import { useMemo } from "react";
import { MapPin, Calendar, Check, Truck, CalendarX } from "lucide-react";
import type { ResolvedBranding } from "./usePartnerBranding";
import { BORDER_RADIUS_MAP } from "./templateDefaults";

export interface EventSelectorEvent {
  id: number;
  name: string;
  status?: string | null;
  cityId?: number | null;
  venueId?: number | null;
  eventStartDate?: string | null;
  eventEndDate?: string | null;
  shippingDeadline?: string | null;
}

export interface EventSelectorCity {
  id: number;
  name: string;
  state?: string | null;
}

export interface EventSelectorVenue {
  id: number;
  name: string;
}

interface PartnerEventSelectorProps {
  branding: ResolvedBranding;
  events: EventSelectorEvent[];
  cities: EventSelectorCity[];
  venues: EventSelectorVenue[];
  selectedEventId: number | null;
  onSelectEvent: (event: EventSelectorEvent) => void;
  emptyContactHref?: string | null;
}

type DerivedStatus = "open" | "closing_soon" | "closed";

function deriveStatus(e: EventSelectorEvent, now: Date): DerivedStatus {
  const raw = (e.status || "").toLowerCase();
  if (["closed", "archived", "disabled", "unavailable", "cancelled", "canceled"].includes(raw)) return "closed";
  const deadline = e.shippingDeadline ? new Date(e.shippingDeadline) : null;
  if (deadline && !isNaN(deadline.getTime()) && deadline.getTime() < now.getTime()) return "closed";
  if (deadline && !isNaN(deadline.getTime())) {
    const days = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (days <= 14) return "closing_soon";
  }
  return "open";
}

const STATUS_LABEL: Record<DerivedStatus, string> = {
  open: "Open",
  closing_soon: "Closing Soon",
  closed: "Closed",
};

function formatDate(s?: string | null): string {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function PartnerEventSelector({
  branding,
  events,
  cities,
  venues,
  selectedEventId,
  onSelectEvent,
  emptyContactHref,
}: PartnerEventSelectorProps) {
  const now = useMemo(() => new Date(), []);

  const sorted = useMemo(() => {
    return [...events].sort((a, b) => {
      const at = a.eventStartDate ? new Date(a.eventStartDate).getTime() : Number.POSITIVE_INFINITY;
      const bt = b.eventStartDate ? new Date(b.eventStartDate).getTime() : Number.POSITIVE_INFINITY;
      return at - bt;
    });
  }, [events]);

  const radius = BORDER_RADIUS_MAP[branding.borderRadiusStyle] || branding.radius;
  const isDark = branding.isDark;
  const isGlass = branding.cardStyle === "glass";

  const baseBg = isDark
    ? (isGlass ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.03)")
    : (isGlass ? "rgba(255,255,255,0.7)" : "#ffffff");
  const baseBorder = isDark
    ? "1px solid rgba(255,255,255,0.10)"
    : `1px solid ${branding.primary}1a`;
  const baseShadow = isDark
    ? "0 8px 24px -16px rgba(0,0,0,0.6)"
    : "0 4px 16px -8px rgba(15,23,42,0.10)";
  const baseBackdrop = isGlass ? "blur(12px)" : undefined;
  const titleColor = isDark ? "#ffffff" : branding.text;

  if (sorted.length === 0) {
    return (
      <div
        className="text-center px-6 py-10"
        style={{
          backgroundColor: baseBg,
          border: baseBorder,
          borderRadius: radius,
          backdropFilter: baseBackdrop,
          color: branding.muted,
        }}
      >
        <CalendarX className="h-8 w-8 mx-auto mb-3 opacity-50" style={{ color: branding.accent }} />
        <p className="text-sm font-medium" style={{ color: titleColor }}>
          No upcoming events are currently available for this portal.
        </p>
        {emptyContactHref && (
          <a
            href={emptyContactHref}
            className="inline-block mt-3 text-sm font-semibold underline-offset-4 hover:underline"
            style={{ color: branding.accent }}
          >
            Contact A3 Visual for support
          </a>
        )}
      </div>
    );
  }

  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}
      role="radiogroup"
      aria-label="Upcoming events"
    >
      {sorted.map((e) => {
        const v = venues.find((x) => x.id === e.venueId);
        const c = cities.find((x) => x.id === e.cityId);
        const status = deriveStatus(e, now);
        const isSelected = selectedEventId === e.id;
        const isClosed = status === "closed";

        const startStr = formatDate(e.eventStartDate);
        const endStr = e.eventEndDate && e.eventEndDate !== e.eventStartDate ? formatDate(e.eventEndDate) : "";
        const dateStr = endStr ? `${startStr} → ${endStr}` : startStr;

        const accentRing = isSelected
          ? `0 0 0 2px ${branding.accent}, 0 12px 32px -12px ${branding.accent}66`
          : baseShadow;

        return (
          <button
            key={e.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-disabled={isClosed}
            disabled={isClosed}
            onClick={() => !isClosed && onSelectEvent(e)}
            className="group relative text-left p-5 transition-all duration-200 motion-safe:hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2"
            style={{
              backgroundColor: isSelected
                ? (isDark ? `${branding.accent}1f` : `${branding.accent}10`)
                : baseBg,
              border: isSelected
                ? `1px solid ${branding.accent}`
                : baseBorder,
              borderRadius: radius,
              boxShadow: accentRing,
              backdropFilter: baseBackdrop,
              // @ts-expect-error CSS var
              "--tw-ring-color": branding.accent,
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <span
                className="inline-block text-[10px] uppercase tracking-[0.18em] font-bold px-2.5 py-1 rounded-full"
                style={{
                  color: isClosed ? branding.muted : branding.accent,
                  backgroundColor: isClosed
                    ? (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)")
                    : (isDark ? `${branding.accent}1a` : `${branding.accent}14`),
                  border: `1px solid ${isClosed ? "transparent" : branding.accent}33`,
                }}
              >
                {STATUS_LABEL[status]}
              </span>
              {isSelected && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-semibold"
                  style={{ color: branding.accent }}
                >
                  <Check className="h-3.5 w-3.5" />
                  Selected
                </span>
              )}
            </div>

            <div
              className="text-base font-bold leading-snug mb-2"
              style={{ color: titleColor, fontFamily: branding.headingFont }}
            >
              {e.name}
            </div>

            {(c || v) && (
              <div className="flex items-start gap-1.5 text-xs mb-1.5" style={{ color: branding.muted }}>
                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: branding.accent }} />
                <span>
                  {c?.name}
                  {c?.state ? `, ${c.state}` : ""}
                  {v ? ` · ${v.name}` : ""}
                </span>
              </div>
            )}

            {dateStr && (
              <div className="flex items-start gap-1.5 text-xs" style={{ color: branding.muted }}>
                <Calendar className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: branding.accent }} />
                <span>{dateStr}</span>
              </div>
            )}

            {e.shippingDeadline && (
              <div
                className="flex items-start gap-1.5 text-xs mt-2 pt-2"
                style={{
                  color: status === "closing_soon" ? branding.accent : branding.muted,
                  borderTop: `1px dashed ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
                }}
              >
                <Truck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Ship by {formatDate(e.shippingDeadline)}
                  {status === "closing_soon" && " · closing soon"}
                </span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
