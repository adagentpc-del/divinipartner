import { Link } from "wouter";
import { motion } from "framer-motion";
import { logos } from "@/lib/brand";
import {
  Reveal,
  Stagger,
  Item,
  Parallax,
  HeroGroup,
  HeroItem,
  Float,
  Lift,
} from "@/components/public/motion";

/**
 * Divini Partner — primary marketing landing (Divini Group brand).
 * Palette + type drawn from the Divini Group identity:
 *   forest green, warm cream, ink, and a champagne accent.
 *   Display: Cormorant Garamond. Body: Inter.
 * Kinetic layer: framer-motion (hero cascade, scroll reveals, parallax,
 * float) + a living "aurora" hero. All motion respects prefers-reduced-motion.
 */

const GREEN = "#1E5340";
const GREEN_DEEP = "#163B2D";
const CREAM = "#FBFAF6";
const CREAM_2 = "#F3F0E7";
const INK = "#14140F";
const GOLD = "#C3A368";

const serif = { fontFamily: '"Cormorant Garamond", Georgia, serif' } as const;

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
            <img
              src={logos.monogramGreen}
              alt="Divini Group"
              className="h-10 w-10 object-contain"
            />
            <span className="leading-tight">
              <span className="block text-[17px] tracking-wide" style={{ ...serif, color: GREEN }}>
                DIVINI PARTNER
              </span>
              <span
                className="block text-[9px] uppercase text-neutral-500"
                style={{ letterSpacing: "0.28em" }}
              >
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
            <Link
              href="/admin"
              className="hidden text-sm text-neutral-500 transition-colors hover:text-neutral-900 sm:block"
            >
              Admin
            </Link>
            <Lift>
              <Link
                href="/a3partnerportal"
                className="inline-block rounded-full px-5 py-2.5 text-sm font-medium text-white"
                style={{ background: GREEN }}
              >
                Enter Portal
              </Link>
            </Lift>
          </div>
        </div>
      </header>

      {/* ───────── Hero ───────── */}
      <section className="relative overflow-hidden" style={{ background: GREEN }}>
        {/* living aurora light blooms */}
        <div
          className="aura aura-a"
          style={{
            width: 480,
            height: 480,
            top: -140,
            left: -90,
            background: "radial-gradient(circle, rgba(205,190,156,0.30), transparent 70%)",
          }}
        />
        <div
          className="aura aura-b"
          style={{
            width: 540,
            height: 540,
            bottom: -180,
            right: -110,
            background: "radial-gradient(circle, rgba(150,196,170,0.22), transparent 70%)",
          }}
        />
        <div
          className="aura aura-c"
          style={{
            width: 360,
            height: 360,
            top: 30,
            right: 140,
            background: "radial-gradient(circle, rgba(205,190,156,0.18), transparent 70%)",
          }}
        />

        {/* parallax concentric ring motif */}
        <Parallax amount={70} className="pointer-events-none absolute -right-40 -top-40">
          <div
            aria-hidden
            className="h-[520px] w-[520px] rounded-full"
            style={{ border: "1px solid rgba(195,163,104,0.18)" }}
          />
        </Parallax>
        <Parallax amount={45} className="pointer-events-none absolute -right-24 -top-24">
          <div
            aria-hidden
            className="h-[360px] w-[360px] rounded-full"
            style={{ border: "1px solid rgba(195,163,104,0.14)" }}
          />
        </Parallax>

        <div className="relative mx-auto max-w-6xl px-6 py-24 text-center md:py-32">
          <HeroGroup>
            <HeroItem>
              <Float className="mx-auto mb-8 w-48 md:w-56">
                <img src={logos.lockupChampagne} alt="Divini Group" className="mx-auto w-full object-contain" />
              </Float>
            </HeroItem>
            <HeroItem>
              <Eyebrow>Partner commerce, by Divini Group</Eyebrow>
            </HeroItem>
            <HeroItem>
              <h1
                className="mx-auto mt-6 max-w-4xl text-5xl leading-[1.02] text-white md:text-7xl"
                style={serif}
              >
                Premium partner portals,
                <br className="hidden md:block" /> beautifully run.
              </h1>
            </HeroItem>
            <HeroItem>
              <p
                className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed"
                style={{ color: "rgba(255,255,255,0.78)" }}
              >
                Branded ordering, intake, and production for the venues, hotels, festivals, and brands
                you work with — designed around their world and run end to end by Divini Group and A3
                Visual.
              </p>
            </HeroItem>
            <HeroItem>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Lift className="w-full sm:w-auto">
                  <Link
                    href="/a3partnerportal"
                    className="block w-full rounded-full px-8 py-4 text-center text-base font-medium sm:w-auto"
                    style={{ background: CREAM, color: GREEN }}
                  >
                    Enter the A3 Partner Portal
                  </Link>
                </Lift>
                <Lift className="w-full sm:w-auto">
                  <a
                    href="#partners"
                    className="block w-full rounded-full px-8 py-4 text-center text-base font-medium text-white sm:w-auto"
                    style={{ border: "1px solid rgba(255,255,255,0.45)" }}
                  >
                    Become a partner
                  </a>
                </Lift>
              </div>
            </HeroItem>
            <HeroItem>
              <p
                className="mt-10 text-[12px] uppercase"
                style={{ letterSpacing: "0.3em", color: "rgba(255,255,255,0.55)" }}
              >
                Print · Fabrication · Signage · Immersive · Install
              </p>
            </HeroItem>
          </HeroGroup>
        </div>
      </section>

      {/* ───────── Trust strip ───────── */}
      <section style={{ background: CREAM_2 }}>
        <Stagger className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-6 py-8 text-center md:flex-row md:justify-between md:text-left">
          <Item>
            <p className="text-sm text-neutral-500">Built for the partners you already work with</p>
          </Item>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
            {TRUST.map((t) => (
              <Item key={t}>
                <span className="text-sm font-medium" style={{ color: GREEN }}>
                  {t}
                </span>
              </Item>
            ))}
          </div>
        </Stagger>
      </section>

      {/* ───────── Platform pillars ───────── */}
      <section id="platform" className="mx-auto max-w-6xl px-6 py-24 md:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Eyebrow color={GREEN}>The platform</Eyebrow>
          <h2 className="mt-4 text-4xl leading-tight md:text-5xl" style={{ ...serif, color: INK }}>
            One platform, every partner
          </h2>
          <p className="mt-4 text-lg text-neutral-600">
            A portal for each relationship, an operating system for all of them.
          </p>
        </Reveal>

        <Stagger
          className="mt-16 grid gap-px overflow-hidden rounded-2xl md:grid-cols-3"
          margin="-40px"
        >
          {PILLARS.map((p) => (
            <Item key={p.no}>
              <motion.div
                className="flex h-full flex-col p-9"
                style={{ background: CREAM }}
                whileHover={{ backgroundColor: "#FFFFFF" }}
                transition={{ duration: 0.3 }}
              >
                <span className="text-3xl" style={{ ...serif, color: GOLD }}>{p.no}</span>
                <h3 className="mt-5 text-2xl" style={{ ...serif, color: GREEN }}>{p.title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-neutral-600">{p.body}</p>
              </motion.div>
            </Item>
          ))}
        </Stagger>
      </section>

      {/* ───────── A3 feature band ───────── */}
      <section className="relative overflow-hidden" style={{ background: GREEN_DEEP }}>
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 md:grid-cols-2 md:py-24">
          <Reveal>
            <Eyebrow>Now live</Eyebrow>
            <h2 className="mt-4 text-4xl leading-tight text-white md:text-5xl" style={serif}>
              The A3 Visual Partner Portal
            </h2>
            <p
              className="mt-5 max-w-xl text-lg leading-relaxed"
              style={{ color: "rgba(255,255,255,0.78)" }}
            >
              Our first portal is live: integrated partner access for visual production, events, and
              activations — print, signage, fabrication, immersive, and install, ordered and managed in
              one place.
            </p>
            <Lift className="mt-8 inline-block">
              <Link
                href="/a3partnerportal"
                className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-base font-medium"
                style={{ background: GOLD, color: GREEN_DEEP }}
              >
                Open the portal
                <span aria-hidden>→</span>
              </Link>
            </Lift>
          </Reveal>

          <Reveal delay={0.1} className="flex justify-center md:justify-end">
            <Parallax amount={28}>
              <div
                className="flex aspect-square w-full max-w-sm items-center justify-center rounded-2xl"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(195,163,104,0.25)",
                }}
              >
                <Float distance={8} duration={7}>
                  <img
                    src={logos.lockupChampagne}
                    alt="Divini Group"
                    className="w-44 object-contain opacity-95"
                  />
                </Float>
              </div>
            </Parallax>
          </Reveal>
        </div>
      </section>

      {/* ───────── Become a partner CTA ───────── */}
      <section id="partners" className="mx-auto max-w-6xl px-6 py-24 text-center md:py-32">
        <Reveal>
          <Eyebrow color={GREEN}>For partners</Eyebrow>
          <h2
            className="mx-auto mt-4 max-w-3xl text-4xl leading-tight md:text-6xl"
            style={{ ...serif, color: INK }}
          >
            A portal worthy of your brand
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-neutral-600">
            Interested in a branded portal for your venue, hotel, festival, or brand? Start with the A3
            Partner Portal to submit a request — we'll take it from there.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Lift className="w-full sm:w-auto">
              <Link
                href="/a3partnerportal"
                className="block w-full rounded-full px-8 py-4 text-center text-base font-medium text-white sm:w-auto"
                style={{ background: GREEN }}
              >
                Request a partnership
              </Link>
            </Lift>
            <Lift className="w-full sm:w-auto">
              <Link
                href="/admin"
                className="block w-full rounded-full px-8 py-4 text-center text-base font-medium sm:w-auto"
                style={{ border: "1px solid rgba(30,83,64,0.3)", color: GREEN }}
              >
                Partner sign in
              </Link>
            </Lift>
          </div>
        </Reveal>
      </section>

      {/* ───────── Footer ───────── */}
      <footer style={{ background: GREEN }} className="text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-16 text-center">
          <img src={logos.lockupChampagne} alt="Divini Group" className="w-40 object-contain" />
          <p className="text-3xl" style={serif}>Divini Partner</p>
          <p className="text-xs uppercase" style={{ letterSpacing: "0.28em", color: GOLD }}>
            by Divini Group
          </p>
          <div
            className="flex flex-wrap justify-center gap-7 text-sm"
            style={{ color: "rgba(255,255,255,0.75)" }}
          >
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
