import { UploadCloud, PackageCheck, MessagesSquare, CalendarClock, LifeBuoy } from "lucide-react";
import type { ResolvedBranding } from "./usePartnerBranding";
import { cardSurface, titleColor } from "./portalSurfaces";

interface PartnerTrustSectionProps {
  branding: ResolvedBranding;
  partnerName: string;
  supportHref?: string | null;
}

const ITEMS = [
  { icon: UploadCloud, title: "Upload artwork & production files", body: "Send print-ready files or links in one place — no scattered email threads." },
  { icon: PackageCheck, title: "Confirm event package details", body: "Lock in packages, add-ons, and quantities tied to your specific event." },
  { icon: MessagesSquare, title: "Reduce back-and-forth", body: "Everything our production team needs is captured the moment you submit." },
  { icon: CalendarClock, title: "Keep deadlines visible", body: "Ship-by dates stay front and center so nothing slips before your event." },
];

/**
 * Premium "why this portal" trust band shown below the order flow. Pure
 * presentation — fully theme-driven, no data fetching, no order logic.
 */
export function PartnerTrustSection({ branding, partnerName, supportHref }: PartnerTrustSectionProps) {
  return (
    <section className="max-w-7xl mx-auto px-4 pb-4">
      <div className="text-center max-w-2xl mx-auto mb-8">
        <div
          className="text-[11px] font-semibold uppercase tracking-[0.22em] mb-3"
          style={{ color: branding.accent }}
        >
          Built with A3 Visual
        </div>
        <h2
          className="text-2xl md:text-3xl font-bold"
          style={{ color: titleColor(branding), fontFamily: branding.headingFont }}
        >
          Built for faster production, cleaner handoff, and fewer missed details.
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {ITEMS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="p-5" style={cardSurface(branding)}>
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center mb-3"
              style={{ backgroundColor: `${branding.accent}1f`, color: branding.accent }}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="font-semibold mb-1" style={{ color: titleColor(branding) }}>{title}</div>
            <p className="text-sm" style={{ color: branding.muted }}>{body}</p>
          </div>
        ))}
      </div>

      <div
        className="mt-6 p-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left"
        style={cardSurface(branding)}
      >
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${branding.accent}1f`, color: branding.accent }}
          >
            <LifeBuoy className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold" style={{ color: titleColor(branding) }}>Need help with your order?</div>
            <p className="text-sm" style={{ color: branding.muted }}>
              Your A3 Visual support team is ready to help with {partnerName} packages, artwork, and deadlines.
            </p>
          </div>
        </div>
        {supportHref && (
          <a
            href={supportHref}
            className="shrink-0 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold transition hover:opacity-90"
            style={{ background: branding.button, color: branding.buttonText, borderRadius: branding.radius }}
          >
            Contact support
          </a>
        )}
      </div>
    </section>
  );
}
