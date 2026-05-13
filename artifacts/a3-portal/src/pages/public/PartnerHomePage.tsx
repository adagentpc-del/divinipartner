import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/home/SiteHeader";
import { SiteFooter } from "@/components/home/SiteFooter";
import { VideoEmbed } from "@/components/home/VideoEmbed";
import {
  FeatureCard,
  ServiceCard,
  AudienceTile,
  PartnerTile,
  type PartnerTileData,
} from "@/components/home/HomeCards";
import { PartnershipRequestForm } from "@/components/home/PartnershipRequestForm";
import isometricImg from "@assets/A3_Visual_Isometric_Capabilities_V2_1778516950842.png";

/**
 * VIDEO SOURCE
 * To swap the Vimeo sizzle reel for a locally uploaded video later, change
 * SIZZLE_VIDEO_SRC below to the public URL of the uploaded file
 * (e.g. "/videos/sizzle-reel.mp4"). The VideoEmbed component auto-detects
 * Vimeo / YouTube / direct video files and renders accordingly.
 */
const SIZZLE_VIDEO_SRC = "https://vimeo.com/1091974311";

const FEATURE_CARDS = [
  {
    title: "Partner-Specific Portals",
    body: "Each partner can receive a custom portal designed around their event, venue, hotel, market, festival, tour, or recurring program.",
  },
  {
    title: "Visual Production Intake",
    body: "Collect project details, event dates, install windows, artwork, specifications, product selections, and customer information in one place.",
  },
  {
    title: "Print & Signage Requests",
    body: "Support requests for banners, decals, step and repeats, wall graphics, wayfinding, branded structures, sponsor signage, and event collateral.",
  },
  {
    title: "Fabrication & Immersive Support",
    body: "Route needs for custom builds, branded environments, projection mapping, interactive LED, experiential elements, and activation concepts.",
  },
  {
    title: "Public or Protected Access",
    body: "Create open public portals or private password-protected partner experiences depending on the event or use case.",
  },
  {
    title: "Faster Quote Readiness",
    body: "Capture better information upfront so the A3 team can review, price, route, and execute more efficiently.",
  },
];

const SERVICE_CARDS = [
  {
    label: "Print",
    body: "Wide-format digital print, branded graphics, banners, decals, signage, wraps, displays, and visual production.",
  },
  {
    label: "Creative",
    body: "Concept development, design support, file preparation, adaptation, brand alignment, and production-ready creative.",
  },
  {
    label: "Immersive",
    body: "Projection mapping, interactive LED, sound design, experiential environments, and audience engagement moments.",
  },
  {
    label: "Project Management",
    body: "Support for single-day events, multi-day festivals, conferences, tours, and complex production schedules.",
  },
  {
    label: "Fabrication",
    body: "Custom display systems, branded structures, POP displays, dimensional signage, and live event experiential builds.",
  },
  {
    label: "Installation",
    body: "Certified, insured, and trained installation crews for local and nationwide on-site support.",
  },
];

// Each audience tile gets a unique branded gradient. Keeps the page lively
// without requiring stock photography uploads.
const AUDIENCE_TILES = [
  { title: "Hotels & Resorts",                gradient: "linear-gradient(135deg, #0E1B3D 0%, #1e3a8a 100%)" },
  { title: "Event Venues",                    gradient: "linear-gradient(135deg, #0a1430 0%, #312e81 100%)" },
  { title: "Toured Events",                   gradient: "linear-gradient(135deg, #0E1B3D 0%, #4338ca 100%)" },
  { title: "Festivals & Markets",             gradient: "linear-gradient(135deg, #C99A2E 0%, #0E1B3D 100%)" },
  { title: "Event Producers",                 gradient: "linear-gradient(135deg, #0a1430 0%, #475569 100%)" },
  { title: "Sports & Entertainment",          gradient: "linear-gradient(135deg, #0E1B3D 0%, #0f766e 100%)" },
  { title: "Corporate Event Teams",           gradient: "linear-gradient(135deg, #1e293b 0%, #0E1B3D 100%)" },
  { title: "Brand Activation Agencies",       gradient: "linear-gradient(135deg, #E9B947 0%, #0a1430 100%)" },
  { title: "Retail & Pop-Up Programs",        gradient: "linear-gradient(135deg, #0E1B3D 0%, #7c3aed 100%)" },
  { title: "Strategic Print & Production",    gradient: "linear-gradient(135deg, #0a1430 0%, #0E1B3D 50%, #1e3a8a 100%)" },
];

const BENEFITS = [
  "Reduce repetitive email back and forth",
  "Give customers, vendors, exhibitors, or sponsors a branded place to submit requests",
  "Collect artwork, deadlines, quantities, install details, and event logistics upfront",
  "Route requests to the right A3 contact or production team",
  "Promote preferred packages, products, and add-ons",
  "Support repeat events, recurring activations, and multi-city programs",
  "Improve quote accuracy and production readiness",
  "Create a cleaner partner and customer experience",
  "Keep partner branding visible while powering fulfillment through A3 Visual",
  "Support public, private, or password-protected portal access",
];

interface ApiPartnerPortal {
  slug: string;
  companyName: string;
  introText: string | null;
  introHeadline: string | null;
  portalMode: string | null;
  launchStatus: string | null;
}

function usePartnerPortals(): { partners: PartnerTileData[]; loading: boolean } {
  const [partners, setPartners] = useState<PartnerTileData[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}api/public/partner-portals`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: { partners?: ApiPartnerPortal[] } = await res.json();
        if (!alive) return;
        const tiles: PartnerTileData[] = (json.partners ?? []).map((p) => ({
          name: p.companyName,
          // Partner portals live at the bare-slug URL; /partner/<slug> also works.
          route: `/${p.slug}`,
          accessType: "Public",
          isPasswordProtected: false,
          description:
            p.introText?.trim() ||
            p.introHeadline?.trim() ||
            `Public partner portal for ${p.companyName} event production and ordering requests.`,
        }));
        setPartners(tiles);
      } catch {
        if (alive) setPartners([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return { partners, loading };
}

const SECTION_EYEBROW = "text-[11px] font-bold uppercase tracking-[0.22em] text-[#C99A2E] mb-3";
const SECTION_TITLE =
  "text-3xl sm:text-4xl lg:text-5xl font-extrabold uppercase tracking-tight text-[#0E1B3D] leading-[1.05]";

export default function PartnerHomePage() {
  const { partners: PARTNERS, loading: partnersLoading } = usePartnerPortals();
  useEffect(() => {
    document.title =
      "A3 Visual Partnership Portal | Integrated Visual Solutions & Event Resource Management";
    const meta =
      (document.querySelector('meta[name="description"]') as HTMLMetaElement | null) ||
      (() => {
        const m = document.createElement("meta");
        m.name = "description";
        document.head.appendChild(m);
        return m;
      })();
    meta.content =
      "A3 Visual partner portal system for venues, hotels, event producers, festivals, toured events, markets, brands, and strategic partners managing print, signage, fabrication, immersive activations, and event production requests.";
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900 font-sans antialiased">
      <SiteHeader />

      <main className="flex-1">
        {/* ─── SECTION 1: HERO ───────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-[#0E1B3D]">
          {/* Background gradient + diagonal texture */}
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-gradient-to-br from-[#0E1B3D] via-[#142454] to-[#0a1430]" />
            <div
              aria-hidden
              className="absolute inset-0 opacity-[0.05]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 1px, transparent 14px)",
              }}
            />
            <div className="absolute -top-40 -right-40 w-[520px] h-[520px] rounded-full bg-[#E9B947]/10 blur-3xl" />
          </div>

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-16 sm:pt-20 sm:pb-24 lg:pt-24 lg:pb-32">
            <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
              {/* Left — copy */}
              <div className="lg:col-span-7 text-white">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#E9B947] mb-5">
                  A3 Visual Partnership Portal
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold uppercase tracking-tight leading-[0.98] mb-6">
                  Integrated Partner Portals for Visual Production, Events &amp; Activations
                </h1>
                <p className="text-base sm:text-lg text-slate-200 mb-5 max-w-2xl leading-relaxed">
                  A streamlined portal system for venues, hotels, event producers, toured events,
                  festivals, markets, brands, and strategic partners who need faster access to A3
                  Visual's print, creative, immersive, fabrication, installation, and project
                  management support.
                </p>
                <p className="text-sm sm:text-base text-slate-300 mb-8 max-w-2xl leading-relaxed">
                  A3 Visual helps partners imagine, create, and activate unforgettable visual
                  experiences. As a single source partner, A3 supports design, event production,
                  large-format printing, immersive experiences, fabrication, and certified
                  nationwide installation.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <a
                    href="#become-partner"
                    className="inline-flex items-center justify-center px-7 py-3.5 bg-[#E9B947] hover:bg-[#d6a728] text-[#0E1B3D] text-sm font-extrabold uppercase tracking-[0.08em] rounded-md transition-colors"
                    data-testid="button-hero-become-partner"
                  >
                    Become a Partner
                  </a>
                  <a
                    href="https://www.a3visual.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center px-7 py-3.5 bg-transparent border border-white/30 hover:border-white text-white text-sm font-bold uppercase tracking-[0.08em] rounded-md transition-colors"
                    data-testid="button-hero-visit-a3"
                  >
                    Visit A3Visual.com ↗
                  </a>
                </div>
              </div>

              {/* Right — isometric capabilities visual */}
              <div className="lg:col-span-5">
                <div className="relative">
                  <div className="absolute -inset-4 bg-gradient-to-tr from-[#E9B947]/20 to-transparent rounded-2xl blur-xl" />
                  <div className="relative bg-white/[0.04] backdrop-blur-sm border border-white/10 rounded-xl p-4 sm:p-6">
                    <img
                      src={isometricImg}
                      alt="A3 Visual capabilities — print, creative, immersive, fabrication, installation, and project management"
                      className="w-full h-auto"
                    />
                  </div>
                  <div className="mt-3 text-[11px] uppercase tracking-[0.16em] text-[#E9B947] text-center">
                    Imagine · Create · Activate
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── SECTION 2: SIZZLE REEL ────────────────────────────────────── */}
        <section className="relative bg-[#0a1430] text-white py-16 sm:py-20 lg:py-24 border-t border-white/5">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E9B947]/40 to-transparent" />
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10 sm:mb-12">
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#E9B947] mb-3">
                Sizzle Reel
              </div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold uppercase tracking-tight leading-tight mb-5">
                See What A3 Visual Can Activate
              </h2>
              <p className="text-base sm:text-lg text-slate-300 max-w-3xl mx-auto leading-relaxed">
                From branded environments and large-format print to immersive installations,
                fabrication, projection mapping, and nationwide event support, A3 Visual brings
                brands, spaces, and experiences to life.
              </p>
            </div>
            <div className="relative">
              <div className="absolute -inset-2 bg-gradient-to-tr from-[#E9B947]/10 to-transparent rounded-xl blur-2xl" />
              <div className="relative rounded-xl overflow-hidden border border-white/10 shadow-2xl">
                <VideoEmbed src={SIZZLE_VIDEO_SRC} title="A3 Visual Sizzle Reel" />
              </div>
            </div>
          </div>
        </section>

        {/* ─── SECTION 3: WHAT THIS PORTAL IS ───────────────────────────── */}
        <section id="what" className="bg-white py-20 sm:py-24 lg:py-28">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mb-14">
              <div className={SECTION_EYEBROW}>What This Portal Is</div>
              <h2 className={SECTION_TITLE}>One Portal. Multiple Partner Experiences.</h2>
              <p className="mt-6 text-base sm:text-lg text-slate-600 leading-relaxed">
                The A3 Visual Partnership Portal gives approved partners a branded, organized, and
                easier way to collect project requests, guide customers through available visual
                production options, route details to the right team, and reduce back and forth
                during event planning.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {FEATURE_CARDS.map((c) => (
                <FeatureCard key={c.title} title={c.title} body={c.body} />
              ))}
            </div>
          </div>
        </section>

        {/* ─── SECTION 4: WHAT A3 VISUAL SUPPORTS ───────────────────────── */}
        <section id="capabilities" className="bg-[#F4F5F7] py-20 sm:py-24 lg:py-28">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mb-14">
              <div className={SECTION_EYEBROW}>What A3 Visual Supports</div>
              <h2 className={SECTION_TITLE}>Built Around A3 Visual's Core Capabilities</h2>
              <p className="mt-6 text-base sm:text-lg text-slate-600 leading-relaxed">
                Six core capabilities power every A3 partner portal — designed and supported by a
                single source partner trusted across more than 50 years of large-scale visual
                production.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {SERVICE_CARDS.map((c) => (
                <ServiceCard key={c.label} label={c.label} body={c.body} />
              ))}
            </div>
          </div>
        </section>

        {/* ─── SECTION 5: WHO THIS IS FOR ───────────────────────────────── */}
        <section id="audience" className="bg-white py-20 sm:py-24 lg:py-28">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mb-14">
              <div className={SECTION_EYEBROW}>Who This Is For</div>
              <h2 className={SECTION_TITLE}>For Partners Managing Repeat Visual Production</h2>
              <p className="mt-6 text-base sm:text-lg text-slate-600 leading-relaxed">
                Built for partners with recurring visual production needs — from single-property
                hotels to multi-city toured events.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-5">
              {AUDIENCE_TILES.map((t) => (
                <AudienceTile key={t.title} title={t.title} gradient={t.gradient} />
              ))}
            </div>
          </div>
        </section>

        {/* ─── SECTION 6: WHY CREATE A PARTNERSHIP PORTAL ───────────────── */}
        <section className="bg-[#F4F5F7] py-20 sm:py-24 lg:py-28">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-start">
              <div className="lg:col-span-5">
                <div className={SECTION_EYEBROW}>Why a Portal</div>
                <h2 className={SECTION_TITLE}>
                  Make Visual Production Easier to Request, Route &amp; Execute
                </h2>
                <p className="mt-6 text-base text-slate-600 leading-relaxed mb-8">
                  A branded partner portal removes friction from every step of visual production —
                  from the first customer request to the final on-site install.
                </p>

                {/* A3-branded callout card */}
                <div className="relative bg-[#0E1B3D] text-white rounded-lg overflow-hidden p-7 sm:p-8">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#E9B947] to-transparent" />
                  <div className="text-2xl sm:text-3xl font-extrabold uppercase tracking-tight mb-2 leading-tight">
                    Imagine.<br />Create.<br />
                    <span className="text-[#E9B947]">Activate.</span>
                  </div>
                  <p className="text-sm text-slate-300 mt-3 leading-relaxed">
                    Partner portals built for faster visual production workflows.
                  </p>
                </div>
              </div>

              <div className="lg:col-span-7">
                <ul className="space-y-3">
                  {BENEFITS.map((b, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-4 bg-white border border-slate-200 rounded-md p-4 sm:p-5 hover:border-[#E9B947] transition-colors"
                    >
                      <div className="flex-shrink-0 w-7 h-7 rounded-md bg-[#0E1B3D] text-[#E9B947] flex items-center justify-center text-xs font-bold">
                        {String(i + 1).padStart(2, "0")}
                      </div>
                      <div className="text-sm sm:text-base text-slate-700 leading-relaxed pt-0.5">
                        {b}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ─── SECTION 7: BECOME A PARTNER FORM ─────────────────────────── */}
        <section id="become-partner" className="bg-white py-20 sm:py-24 lg:py-28 scroll-mt-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10 sm:mb-12">
              <div className={SECTION_EYEBROW}>Become a Partner</div>
              <h2 className={SECTION_TITLE}>Create a Partnership Portal With A3 Visual</h2>
              <p className="mt-6 text-base sm:text-lg text-slate-600 leading-relaxed max-w-3xl mx-auto">
                Interested in giving your customers, vendors, exhibitors, sponsors, tenants, or
                event team a branded portal for print, signage, fabrication, immersive activation,
                or event production requests? Submit your information and the A3 team will review
                the best portal structure for your organization.
              </p>
            </div>
            <PartnershipRequestForm />
          </div>
        </section>

        {/* ─── SECTION 8: CURRENT PARTNER PORTALS ───────────────────────── */}
        <section id="partners" className="bg-[#0E1B3D] text-white py-20 sm:py-24 lg:py-28 relative overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.04] pointer-events-none"
            style={{
              backgroundImage:
                "repeating-linear-gradient(-45deg, #fff 0, #fff 1px, transparent 1px, transparent 14px)",
            }}
          />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12 sm:mb-14">
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#E9B947] mb-3">
                Current Partners
              </div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold uppercase tracking-tight leading-tight mb-5">
                Current Partner Portals
              </h2>
              <p className="text-base sm:text-lg text-slate-300 max-w-3xl mx-auto leading-relaxed">
                Select a partner below to access their dedicated A3 Visual portal. Some portals are
                public, while others require approved login or password access.
              </p>
            </div>

            {partnersLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-7">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="rounded-lg bg-white/5 border border-white/10 aspect-[16/10] animate-pulse"
                  />
                ))}
              </div>
            ) : PARTNERS.length === 0 ? (
              <div className="text-center text-slate-300 max-w-xl mx-auto py-10 border border-white/10 rounded-lg bg-white/5">
                No public partner portals are live yet. Check back soon, or{" "}
                <a href="#become-partner" className="text-[#E9B947] underline font-semibold">
                  request your own
                </a>
                .
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-7">
                {PARTNERS.map((p) => (
                  <PartnerTile key={p.route} partner={p} />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
