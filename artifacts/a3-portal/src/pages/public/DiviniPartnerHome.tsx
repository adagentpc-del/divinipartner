import { Link } from "wouter";

/**
 * Divini Partner — primary marketing landing (Divini Group brand).
 * Palette + type drawn from the Divini Group identity:
 *   forest green, warm cream, ink, and a champagne accent.
 *   Display: Cormorant Garamond. Body: Inter.
 */

const GREEN = "#1E5340";
const GREEN_DEEP = "#163B2D";
const CREAM = "#FBFAF6";
const CREAM_2 = "#F3F0E7";
const INK = "#14140F";
const GOLD = "#C3A368";

const serif = { fontFamily: '"Cormorant Garamond", Georgia, serif' } as const;

const MONO_GREEN = "/brand/divini-group-green-on-white.png";
const MONO_WHITE = "/brand/divini-group-white-on-green.png";

const PILLARS = [
  {
    no: "01",
    title: "Portals, not templates",
    body:
      "Every partner gets a portal shaped to their world — their colors, logo, voice, and offerings. It looks like them, because it is.",
  },
  {
    no: "02",
    title: "Order to install, in one flow",
    body:
      "Quotes, intake, approvals, and production handoff move through a single elegant pipeline. Nothing waits in an inbox. Nothing slips.",
  },
  {
    no: "03",
    title: "Run by Divini Group",
    body:
      "Backed by Divini Group's production network and A3 Visual's print, fabrication, signage, and immersive teams — concept to install.",
  },
];

const TRUST = ["Venues", "Hotels", "Festivals", "Event producers", "Brands"];

function Eyebrow({ children, color = GOLD }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="inline-block text-[11px] font-medium uppercase"
      style={{ letterSpacing: "0.32em", color }}
    >
      {children}
    </span>
  );
}

export default function DiviniPartnerHome() {
  return (
    <div className="min-h-screen" style={{ background: CREAM, color: INK }}>
      {/* ───────── Header ───────── */}
      <header
        className="sticky top-0 z-50 backdrop-blur"
        style={{
          background: "rgba(251,250,246,0.86)",
          borderBottom: "1px solid rgba(30,83,64,0.12)",
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <Link href="/" className="flex items-center gap-3">
            <img src={MONO_GREEN} alt="Divini Group" className="h-10 w-10 object-contain" />
            <span className="leading-tight">
              <span className="block text-[17px] tracking-wide" style={{ ...serif, color: GREEN }}>
                DIVINI PARTNER
              </span>
              <span className="block text-[9px] uppercase text-neutral-500" style={{ letterSpacing: "0.28em" }}>
                by Divini Group
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-9 text-sm text-neutral-600 lg:flex">
            <a href="#platform" className="transition-colors hover:text-neutral-900">Platform</a>
            <a href="#partners" className="transition-colors hover:text-neutral-900">For partners</a>
            <Link href="/a3partnerportal" className="transition-colors hover:text-neutral-900">A3 Partner Portal</Link>
          </nav>

          <div className="flex items-center gap-5">
            <Link href="/admin" className="hidden text-sm text-neutral-500 transition-colors hover:text-neutral-900 sm:block">
              Admin
            </Link>
            <Link
              href="/a3partnerportal"
              className="rounded-full px-5 py-2.5 text-sm font-medium text-white transition-transform hover:-translate-y-0.5"
              style={{ background: GREEN }}
            >
              Enter Portal
            </Link>
          </div>
        </div>
      </header>

      {/* ───────── Hero ───────── */}
      <section className="relative overflow-hidden" style={{ background: GREEN }}>
        {/* faint concentric ring motif */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full"
          style={{ border: "1px solid rgba(195,163,104,0.18)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-[360px] w-[360px] rounded-full"
          style={{ border: "1px solid rgba(195,163,104,0.14)" }}
        />

        <div className="relative mx-auto max-w-6xl px-6 py-24 text-center md:py-32">
          <img
            src={MONO_WHITE}
            alt="Divini Group"
            className="mx-auto mb-8 h-24 w-24 object-contain md:h-28 md:w-28"
          />
          <Eyebrow>Partner commerce, by Divini Group</Eyebrow>

          <h1
            className="mx-auto mt-6 max-w-4xl text-5xl leading-[1.02] text-white md:text-7xl"
            style={serif}
          >
            Premium partner portals,
            <br className="hidden md:block" /> beautifully run.
          </h1>

          <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed" style={{ color: "rgba(255,255,255,0.78)" }}>
            Branded ordering, intake, and production for the venues, hotels, festivals, and brands you
            work with — designed around their world and run end to end by Divini Group and A3 Visual.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/a3partnerportal"
              className="w-full rounded-full px-8 py-4 text-base font-medium transition-transform hover:-translate-y-0.5 sm:w-auto"
              style={{ background: CREAM, color: GREEN }}
            >
              Enter the A3 Partner Portal
            </Link>
            <a
              href="#partners"
              className="w-full rounded-full px-8 py-4 text-base font-medium text-white transition-colors sm:w-auto"
              style={{ border: "1px solid rgba(255,255,255,0.45)" }}
            >
              Become a partner
            </a>
          </div>

          <p className="mt-10 text-[12px] uppercase" style={{ letterSpacing: "0.3em", color: "rgba(255,255,255,0.55)" }}>
            Print · Fabrication · Signage · Immersive · Install
          </p>
        </div>
      </section>

      {/* ───────── Trust strip ───────── */}
      <section style={{ background: CREAM_2 }}>
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-6 py-8 text-center md:flex-row md:justify-between md:text-left">
          <p className="text-sm text-neutral-500">Built for the partners you already work with</p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
            {TRUST.map((t) => (
              <span key={t} className="text-sm font-medium" style={{ color: GREEN }}>
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Platform pillars ───────── */}
      <section id="platform" className="mx-auto max-w-6xl px-6 py-24 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow color={GREEN}>The platform</Eyebrow>
          <h2 className="mt-4 text-4xl leading-tight md:text-5xl" style={{ ...serif, color: INK }}>
            One platform, every partner
          </h2>
          <p className="mt-4 text-lg text-neutral-600">
            A portal for each relationship, an operating system for all of them.
          </p>
        </div>

        <div className="mt-16 grid gap-px overflow-hidden rounded-2xl md:grid-cols-3" style={{ background: "rgba(30,83,64,0.12)" }}>
          {PILLARS.map((p) => (
            <div key={p.no} className="flex flex-col p-9" style={{ background: CREAM }}>
              <span className="text-3xl" style={{ ...serif, color: GOLD }}>{p.no}</span>
              <h3 className="mt-5 text-2xl" style={{ ...serif, color: GREEN }}>{p.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-neutral-600">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ───────── A3 feature band ───────── */}
      <section className="relative overflow-hidden" style={{ background: GREEN_DEEP }}>
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 md:grid-cols-2 md:py-24">
          <div>
            <Eyebrow>Now live</Eyebrow>
            <h2 className="mt-4 text-4xl leading-tight text-white md:text-5xl" style={serif}>
              The A3 Visual Partner Portal
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-relaxed" style={{ color: "rgba(255,255,255,0.78)" }}>
              Our first portal is live: integrated partner access for visual production, events, and
              activations — print, signage, fabrication, immersive, and install, ordered and managed in
              one place.
            </p>
            <Link
              href="/a3partnerportal"
              className="mt-8 inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-base font-medium transition-transform hover:-translate-y-0.5"
              style={{ background: GOLD, color: GREEN_DEEP }}
            >
              Open the portal
              <span aria-hidden>→</span>
            </Link>
          </div>

          <div className="flex justify-center md:justify-end">
            <div
              className="flex aspect-square w-full max-w-sm items-center justify-center rounded-2xl"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(195,163,104,0.25)" }}
            >
              <img src={MONO_WHITE} alt="Divini Group" className="h-32 w-32 object-contain opacity-90" />
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Become a partner CTA ───────── */}
      <section id="partners" className="mx-auto max-w-6xl px-6 py-24 text-center md:py-32">
        <Eyebrow color={GREEN}>For partners</Eyebrow>
        <h2 className="mx-auto mt-4 max-w-3xl text-4xl leading-tight md:text-6xl" style={{ ...serif, color: INK }}>
          A portal worthy of your brand
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-neutral-600">
          Interested in a branded portal for your venue, hotel, festival, or brand? Start with the A3
          Partner Portal to submit a request — we'll take it from there.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/a3partnerportal"
            className="w-full rounded-full px-8 py-4 text-base font-medium text-white transition-transform hover:-translate-y-0.5 sm:w-auto"
            style={{ background: GREEN }}
          >
            Request a partnership
          </Link>
          <Link
            href="/admin"
            className="w-full rounded-full px-8 py-4 text-base font-medium transition-colors hover:bg-black/5 sm:w-auto"
            style={{ border: `1px solid rgba(30,83,64,0.3)`, color: GREEN }}
          >
            Partner sign in
          </Link>
        </div>
      </section>

      {/* ───────── Footer ───────── */}
      <footer style={{ background: GREEN }} className="text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-16 text-center">
          <img src={MONO_WHITE} alt="Divini Group" className="h-16 w-16 object-contain" />
          <p className="text-3xl" style={serif}>Divini Partner</p>
          <p className="text-xs uppercase" style={{ letterSpacing: "0.28em", color: GOLD }}>
            by Divini Group
          </p>
          <div className="flex flex-wrap justify-center gap-7 text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>
            <Link href="/a3partnerportal" className="transition-colors hover:text-white">A3 Partner Portal</Link>
            <a href="#platform" className="transition-colors hover:text-white">Platform</a>
            <a href="#partners" className="transition-colors hover:text-white">For partners</a>
            <Link href="/admin" className="transition-colors hover:text-white">Admin</Link>
          </div>
          <p className="mt-4 text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
            © {new Date().getFullYear()} Divini Group. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
