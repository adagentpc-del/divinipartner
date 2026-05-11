import { Link } from "wouter";

/* ─── Feature card (white surface, navy label) ────────────────────────── */
export function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="group relative bg-white border border-slate-200 rounded-lg p-7 hover:border-[#E9B947] hover:-translate-y-0.5 transition-all duration-200 shadow-sm hover:shadow-md">
      <div className="w-10 h-1 bg-[#E9B947] mb-5 rounded-full" />
      <h3 className="text-base font-bold uppercase tracking-[0.08em] text-[#0E1B3D] mb-3 leading-tight">
        {title}
      </h3>
      <p className="text-sm text-slate-600 leading-relaxed">{body}</p>
    </div>
  );
}

/* ─── Service card (deep navy with gold accent) ───────────────────────── */
export function ServiceCard({ label, body }: { label: string; body: string }) {
  return (
    <div className="group relative bg-[#0E1B3D] text-white rounded-lg overflow-hidden hover:bg-[#0a1430] transition-colors duration-200">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#E9B947] via-[#E9B947]/80 to-transparent" />
      <div className="p-7">
        <div className="text-2xl sm:text-3xl font-extrabold uppercase tracking-[0.04em] text-white mb-3">
          {label}
        </div>
        <p className="text-sm text-slate-300 leading-relaxed">{body}</p>
      </div>
      <div className="px-7 pb-5 text-[11px] uppercase tracking-[0.18em] text-[#E9B947] opacity-0 group-hover:opacity-100 transition-opacity">
        A3 Capability
      </div>
    </div>
  );
}

/* ─── Audience tile (large rectangular case-study style) ──────────────── */
export function AudienceTile({ title, gradient }: { title: string; gradient: string }) {
  return (
    <div
      className="group relative aspect-[4/3] sm:aspect-[3/2] rounded-lg overflow-hidden cursor-default border border-slate-200 hover:border-[#E9B947] transition-colors"
      style={{ background: gradient }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
      <div className="absolute inset-0 flex items-end p-5 sm:p-6">
        <div>
          <div className="w-8 h-0.5 bg-[#E9B947] mb-3 group-hover:w-14 transition-all duration-300" />
          <div className="text-white text-base sm:text-lg font-bold uppercase tracking-[0.06em] leading-tight">
            {title}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Partner tile (case-study card with logo placeholder, badge, CTA) ─ */
export interface PartnerTileData {
  name: string;
  route: string;
  accessType: "Public" | "Password Protected";
  description: string;
  isPasswordProtected: boolean;
  /** Optional path to a logo. When omitted we render a polished text-mark. */
  logoPath?: string | null;
  /** Tailwind/CSS gradient applied to the visual area behind the logo. */
  bg?: string;
}

function PartnerLogoMark({ name }: { name: string }) {
  // Polished text-based logo card. Splits multi-word names onto two lines for
  // a more "wordmark" feel until real partner logos are uploaded.
  const words = name.split(/\s+/);
  return (
    <div className="flex flex-col items-center text-white">
      <div className="text-[10px] uppercase tracking-[0.3em] text-[#E9B947] mb-2">A3 Partner</div>
      <div className="text-2xl sm:text-3xl font-extrabold uppercase tracking-tight leading-[1.05] text-center">
        {words.map((w, i) => (
          <div key={i}>{w}</div>
        ))}
      </div>
    </div>
  );
}

export function PartnerTile({ partner }: { partner: PartnerTileData }) {
  const isProtected = partner.isPasswordProtected;
  const badgeBg = isProtected ? "#0E1B3D" : "#E9B947";
  const badgeFg = isProtected ? "#fff" : "#0E1B3D";

  return (
    <Link
      href={partner.route}
      className="group block bg-white rounded-lg overflow-hidden border border-slate-200 hover:border-[#E9B947] hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#E9B947]"
      data-testid={`partner-tile-${partner.route.replace(/\W+/g, "-")}`}
    >
      {/* Visual area */}
      <div
        className="relative aspect-[16/10] flex items-center justify-center p-6"
        style={{
          background:
            partner.bg ||
            "linear-gradient(135deg, #0E1B3D 0%, #142454 50%, #0a1430 100%)",
        }}
      >
        <div
          className="absolute top-3 right-3 text-[10px] uppercase tracking-[0.12em] font-bold px-2.5 py-1 rounded"
          style={{ backgroundColor: badgeBg, color: badgeFg }}
        >
          {partner.accessType}
        </div>
        {partner.logoPath ? (
          <img
            src={partner.logoPath}
            alt={partner.name}
            className="max-h-24 max-w-[70%] object-contain"
          />
        ) : (
          <PartnerLogoMark name={partner.name} />
        )}
      </div>

      {/* Body */}
      <div className="p-5 sm:p-6">
        <div className="text-base sm:text-lg font-bold uppercase tracking-[0.04em] text-[#0E1B3D] mb-2 leading-tight">
          {partner.name}
        </div>
        <p className="text-sm text-slate-600 leading-relaxed mb-4 line-clamp-3">
          {partner.description}
        </p>
        <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0E1B3D] group-hover:text-[#C99A2E] transition-colors">
          {isProtected ? "Sign in to portal" : "Open portal"}
          <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
        </div>
      </div>
    </Link>
  );
}
