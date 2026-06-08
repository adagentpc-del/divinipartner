import { Link } from "wouter";

/**
 * Divini Partner — primary marketing landing (Divini Group brand).
 * Palette extracted from the Divini Group logos:
 *   forest green #1E5340 · cream #E4E2DD · champagne #CDBE9C · ink #14140F
 * Display type: Cormorant Garamond (loaded in index.html); body: Inter.
 * The A3 Visual partner portal marketing page now lives at /a3partnerportal.
 */

const GREEN = "#1E5340";
const CREAM = "#E4E2DD";
const CHAMPAGNE = "#CDBE9C";

const serif = { fontFamily: '"Cormorant Garamond", Georgia, serif' } as const;

function Pillars() {
  const items = [
    {
      k: "Branded portals",
      d: "Give every partner a portal designed around their brand, event, venue, or program — colors, logo, voice, and offerings, all their own.",
    },
    {
      k: "Ordering & intake",
      d: "Capture requests, quotes, and orders through one elegant flow — with pricing, approvals, and production handoff built in.",
    },
    {
      k: "Run by Divini",
      d: "Backed by Divini Group's production network and A3 Visual's print, fabrication, and immersive capabilities — start to finish.",
    },
  ];
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <p
        className="text-center text-sm tracking-[0.3em] uppercase"
        style={{ color: GREEN }}
      >
        The platform
      </p>
      <h2
        className="mt-3 text-center text-4xl md:text-5xl"
        style={{ ...serif, color: "#14140F" }}
      >
        One platform, every partner
      </h2>
      <div className="mt-14 grid gap-8 md:grid-cols-3">
        {items.map((it) => (
          <div
            key={it.k}
            className="rounded-2xl border p-8"
            style={{ borderColor: "rgba(30,83,64,0.18)", background: "#FBFAF6" }}
          >
            <div
              className="mb-5 h-10 w-10 rounded-full"
              style={{ background: GREEN }}
            />
            <h3 className="text-2xl" style={{ ...serif, color: GREEN }}>
              {it.k}
            </h3>
            <p className="mt-3 text-[15px] leading-relaxed text-neutral-600">
              {it.d}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function DiviniPartnerHome() {
  return (
    <div className="min-h-screen" style={{ background: "#FBFAF6", color: "#14140F" }}>
      {/* Nav */}
      <header
        className="sticky top-0 z-40 backdrop-blur"
        style={{ background: "rgba(251,250,246,0.85)", borderBottom: "1px solid rgba(30,83,64,0.12)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-3">
            <img
              src="/brand/divini-group-green-on-white.png"
              alt="Divini Group"
              className="h-11 w-11 object-contain"
            />
            <span className="leading-tight">
              <span className="block text-lg tracking-wide" style={{ ...serif, color: GREEN }}>
                DIVINI PARTNER
              </span>
              <span className="block text-[10px] tracking-[0.25em] uppercase text-neutral-500">
                by Divini Group
              </span>
            </span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-neutral-600 md:flex">
            <a href="#platform" className="hover:text-[#1E5340]">Platform</a>
            <a href="#partners" className="hover:text-[#1E5340]">For Partners</a>
            <Link href="/a3partnerportal" className="hover:text-[#1E5340]">A3 Partner Portal</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="hidden text-sm text-neutral-500 hover:text-[#1E5340] sm:inline"
            >
              Admin
            </Link>
            <Link
              href="/a3partnerportal"
              className="rounded-full px-5 py-2 text-sm font-medium text-white transition hover:opacity-90"
              style={{ background: GREEN }}
            >
              Enter Portal
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section style={{ background: GREEN }} className="relative overflow-hidden">
        <div className="mx-auto max-w-5xl px-6 py-24 text-center md:py-32">
          <img
            src="/brand/divini-group-white-on-green.png"
            alt="Divini Group"
            className="mx-auto h-40 w-40 object-contain md:h-52 md:w-52"
          />
          <h1
            className="mx-auto mt-6 max-w-3xl text-5xl leading-[1.05] text-white md:text-7xl"
            style={serif}
          >
            Premium partner portals, beautifully run.
          </h1>
          <p
            className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed"
            style={{ color: "rgba(255,255,255,0.82)" }}
          >
            Divini Partner gives venues, hotels, event producers, and brands their
            own branded portal for ordering, intake, and production — powered by
            Divini Group.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/a3partnerportal"
              className="rounded-full px-8 py-3.5 text-base font-medium transition hover:opacity-90"
              style={{ background: CREAM, color: GREEN }}
            >
              Enter the A3 Partner Portal
            </Link>
            <a
              href="#partners"
              className="rounded-full border px-8 py-3.5 text-base font-medium text-white transition hover:bg-white/10"
              style={{ borderColor: "rgba(255,255,255,0.4)" }}
            >
              Become a Partner
            </a>
          </div>
        </div>
        <div
          className="pointer-events-none absolute -bottom-24 left-1/2 h-64 w-[120%] -translate-x-1/2 rounded-[50%]"
          style={{ background: "rgba(205,190,156,0.10)" }}
        />
      </section>

      {/* Platform */}
      <div id="platform">
        <Pillars />
      </div>

      {/* Portal entry band */}
      <section style={{ background: CREAM }}>
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-6 py-20 md:flex-row md:justify-between">
          <div className="max-w-xl">
            <p className="text-sm tracking-[0.3em] uppercase" style={{ color: GREEN }}>
              Now live
            </p>
            <h2 className="mt-3 text-4xl md:text-5xl" style={{ ...serif, color: "#14140F" }}>
              The A3 Visual Partner Portal
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-neutral-600">
              Our first portal: integrated partner portals for visual production,
              events, and activations — print, signage, fabrication, immersive, and
              install, ordered and managed in one place.
            </p>
          </div>
          <Link
            href="/a3partnerportal"
            className="shrink-0 rounded-full px-8 py-3.5 text-base font-medium text-white transition hover:opacity-90"
            style={{ background: GREEN }}
          >
            Open the portal →
          </Link>
        </div>
      </section>

      {/* For partners */}
      <section id="partners" className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h2 className="text-4xl md:text-5xl" style={{ ...serif, color: "#14140F" }}>
          Become a Divini Partner
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-neutral-600">
          Interested in a branded portal for your venue, hotel, festival, or brand?
          Start with the A3 Partner Portal to submit a partnership request — we'll
          take it from there.
        </p>
        <Link
          href="/a3partnerportal"
          className="mt-8 inline-block rounded-full px-8 py-3.5 text-base font-medium text-white transition hover:opacity-90"
          style={{ background: GREEN }}
        >
          Request a partnership
        </Link>
      </section>

      {/* Footer */}
      <footer style={{ background: GREEN }} className="text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-14 text-center">
          <img
            src="/brand/divini-group-white-on-green.png"
            alt="Divini Group"
            className="h-20 w-20 object-contain"
          />
          <p className="text-2xl" style={serif}>
            Divini Partner
          </p>
          <p className="text-xs tracking-[0.25em] uppercase" style={{ color: CHAMPAGNE }}>
            by Divini Group
          </p>
          <div className="flex gap-6 text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>
            <Link href="/a3partnerportal" className="hover:text-white">A3 Partner Portal</Link>
            <Link href="/admin" className="hover:text-white">Admin</Link>
          </div>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
            © {new Date().getFullYear()} Divini Group. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
