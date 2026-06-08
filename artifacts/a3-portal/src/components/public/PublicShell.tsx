import { useState } from "react";
import { Link } from "wouter";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { logos } from "@/lib/brand";
import { CTA } from "@/components/public/Section";

export type PublicNavLink = { label: string; href: string };

type PublicShellProps = {
  children: React.ReactNode;
  /** Nav links shown in the header (desktop) and mobile sheet. */
  nav?: PublicNavLink[];
  /** Primary header CTA. */
  cta?: { label: string; href: string };
  /** Show the "Admin" quiet link in the header. */
  showAdmin?: boolean;
  className?: string;
};

/**
 * Shared luxury chrome for every public / partner-facing page:
 * sticky translucent header with the Divini lockup + an elegant footer.
 * Pages provide their own page body; the shell unifies brand, nav, footer.
 */
export default function PublicShell({
  children,
  nav = [],
  cta = { label: "Enter Portal", href: "/a3partnerportal" },
  showAdmin = true,
  className,
}: PublicShellProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("min-h-screen bg-divini-cream text-divini-ink", className)}>
      <header className="sticky top-0 z-40 border-b hairline-green bg-divini-cream/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-3">
            <img
              src={logos.greenOnWhite}
              alt="Divini Group"
              className="h-10 w-10 object-contain"
            />
            <span className="leading-tight">
              <span className="font-display block text-lg tracking-wide text-divini-green">
                DIVINI PARTNER
              </span>
              <span className="block text-[10px] uppercase tracking-[0.25em] text-divini-muted">
                by Divini Group
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm text-divini-muted md:flex">
            {nav.map((l) => (
              <NavItem key={l.href} {...l} />
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {showAdmin ? (
              <Link
                href="/admin"
                className="hidden text-sm text-divini-muted transition-colors hover:text-divini-green sm:inline"
              >
                Admin
              </Link>
            ) : null}
            <CTA href={cta.href} className="hidden px-5 py-2 sm:inline-flex">
              {cta.label}
            </CTA>
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setOpen((v) => !v)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-divini-green transition-colors hover:bg-divini-green/10 md:hidden"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {open ? (
          <div className="border-t hairline-green bg-divini-cream md:hidden">
            <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-6 py-4">
              {nav.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm text-divini-ink/80 transition-colors hover:bg-divini-green/5 hover:text-divini-green"
                >
                  {l.label}
                </Link>
              ))}
              <CTA href={cta.href} className="mt-2 w-full">
                {cta.label}
              </CTA>
            </nav>
          </div>
        ) : null}
      </header>

      <main>{children}</main>

      <footer className="bg-divini-radial text-divini-green-foreground">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-16 text-center">
          <img
            src={logos.whiteOnGreen}
            alt="Divini Group"
            className="h-16 w-16 object-contain"
          />
          <div className="accent-rule" aria-hidden />
          <p className="font-display text-2xl">Divini Partner</p>
          <p className="text-[11px] uppercase tracking-[0.25em] text-divini-champagne">
            by Divini Group
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-sm text-divini-green-foreground/75">
            <Link href="/a3partnerportal" className="transition-colors hover:text-white">
              A3 Partner Portal
            </Link>
            <Link href="/admin" className="transition-colors hover:text-white">
              Admin
            </Link>
          </div>
          <p className="text-xs text-divini-green-foreground/50">
            © {new Date().getFullYear()} Divini Group. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

function NavItem({ label, href }: PublicNavLink) {
  const isHash = href.startsWith("#");
  const cls =
    "relative transition-colors hover:text-divini-green after:absolute after:-bottom-1.5 after:left-0 after:h-px after:w-0 after:bg-divini-champagne after:transition-all after:duration-300 hover:after:w-full";
  if (isHash) {
    return (
      <a href={href} className={cls}>
        {label}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {label}
    </Link>
  );
}
