import { useAuth } from "@clerk/react";
import { Link } from "wouter";
import { useState } from "react";
import { Menu, X } from "lucide-react";

const NAV_LINKS = [
  { label: "What it is", href: "#what" },
  { label: "Capabilities", href: "#capabilities" },
  { label: "Who it's for", href: "#audience" },
  { label: "Partners", href: "#partners" },
];

function A3Wordmark({ inverted = false }: { inverted?: boolean }) {
  const fg = inverted ? "#fff" : "#0E1B3D";
  return (
    <div className="flex items-center gap-2.5">
      {/* Logo mark — navy square w/ thin gold border + "A3" */}
      <div
        className="relative w-10 h-10 flex items-center justify-center"
        style={{ background: "#0E1B3D", border: "1.5px solid #E9B947", borderRadius: 2 }}
      >
        <span className="text-white font-extrabold text-lg leading-none tracking-tight">A3</span>
      </div>
      <div className="leading-none">
        <div className="font-extrabold tracking-[0.18em] text-base sm:text-lg" style={{ color: fg }}>
          VISUAL
        </div>
        <div className="text-[8px] sm:text-[9px] uppercase tracking-[0.18em] mt-1" style={{ color: "#C99A2E" }}>
          Imagine · Create · Activate
        </div>
      </div>
    </div>
  );
}

export function SiteHeader() {
  const { isSignedIn } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
        <Link href="/" className="flex items-center" data-testid="link-home">
          <A3Wordmark />
        </Link>

        <nav className="hidden lg:flex items-center gap-8">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-semibold text-slate-700 hover:text-[#0E1B3D] transition-colors"
            >
              {l.label}
            </a>
          ))}
          <a
            href="#become-partner"
            className="ml-2 inline-flex items-center px-5 py-2.5 rounded-md bg-[#0E1B3D] text-white text-sm font-bold uppercase tracking-[0.06em] hover:bg-[#0a1430] transition-colors"
            data-testid="button-become-partner"
          >
            Become a Partner
          </a>
          <Link
            href={isSignedIn ? "/admin" : "/login"}
            className="inline-flex items-center px-4 py-2.5 rounded-md border-2 border-[#E9B947] text-[#0E1B3D] text-sm font-bold uppercase tracking-[0.06em] hover:bg-[#E9B947] transition-colors"
            data-testid="button-admin-login"
          >
            {isSignedIn ? "Admin" : "Admin Login"}
          </Link>
        </nav>

        <button
          onClick={() => setOpen(!open)}
          className="lg:hidden p-2 -mr-2 text-[#0E1B3D]"
          aria-label="Toggle menu"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div className="lg:hidden border-t border-slate-200 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col gap-1">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 rounded-md"
              >
                {l.label}
              </a>
            ))}
            <a
              href="#become-partner"
              onClick={() => setOpen(false)}
              className="mt-2 px-3 py-3 rounded-md bg-[#0E1B3D] text-white text-sm font-bold uppercase tracking-[0.06em] text-center"
            >
              Become a Partner
            </a>
            <Link
              href={isSignedIn ? "/admin" : "/login"}
              onClick={() => setOpen(false)}
              className="mt-2 px-3 py-3 rounded-md border-2 border-[#E9B947] text-[#0E1B3D] text-sm font-bold uppercase tracking-[0.06em] text-center"
            >
              {isSignedIn ? "Admin" : "Admin Login"}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

export { A3Wordmark };
