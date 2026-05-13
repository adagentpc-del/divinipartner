import { useAuth } from "@clerk/react";
import { Link } from "wouter";

export function SiteFooter() {
  const { isSignedIn } = useAuth();
  return (
    <footer className="relative bg-[#0E1B3D] text-white overflow-hidden">
      {/* Subtle gold accent line at top */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E9B947] to-transparent" />
      {/* Faint diagonal texture */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 1px, transparent 14px)",
        }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
          {/* Brand block */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-3 mb-5">
              <div
                className="w-12 h-12 flex items-center justify-center"
                style={{ background: "#0E1B3D", border: "1.5px solid #E9B947", borderRadius: 2 }}
              >
                <span className="text-white font-extrabold text-xl">A3</span>
              </div>
              <div className="leading-none">
                <div className="font-extrabold tracking-[0.18em] text-xl text-white">VISUAL</div>
                <div className="text-[10px] uppercase tracking-[0.18em] mt-1.5 text-[#E9B947]">
                  Imagine · Create · Activate
                </div>
              </div>
            </div>
            <p className="text-sm text-slate-300 max-w-md leading-relaxed">
              Integrated visual solutions and event resource management. A3 Visual is a single
              source partner for design, large-format print, immersive experiences, fabrication,
              and certified nationwide installation.
            </p>
            <div className="mt-5 text-[11px] uppercase tracking-[0.16em] text-slate-400">
              Miami · Los Angeles · San Francisco
            </div>
          </div>

          {/* Portal links */}
          <div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-[#E9B947] mb-4 font-bold">
              Partnership Portal
            </div>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a href="#become-partner" className="text-slate-300 hover:text-white transition-colors">
                  Request a Partnership Portal
                </a>
              </li>
              <li>
                <a href="#partners" className="text-slate-300 hover:text-white transition-colors">
                  Current Partners
                </a>
              </li>
              <li>
                <a href="#what" className="text-slate-300 hover:text-white transition-colors">
                  How it works
                </a>
              </li>
              <li>
                <Link
                  href={isSignedIn ? "/admin" : "/login"}
                  className="inline-flex items-center gap-1.5 text-[#E9B947] hover:text-white font-semibold transition-colors"
                  data-testid="link-footer-admin-login"
                >
                  {isSignedIn ? "Admin Dashboard" : "Admin Login"} →
                </Link>
              </li>
            </ul>
          </div>

          {/* External A3 links */}
          <div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-[#E9B947] mb-4 font-bold">
              A3 Visual
            </div>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a
                  href="https://www.a3visual.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-300 hover:text-white transition-colors"
                >
                  A3Visual.com ↗
                </a>
              </li>
              <li>
                <a
                  href="https://www.a3visual.com/case-studies"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-300 hover:text-white transition-colors"
                >
                  Case Studies ↗
                </a>
              </li>
              <li>
                <a
                  href="https://www.a3visual.com/contact"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-300 hover:text-white transition-colors"
                >
                  Contact ↗
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            © {new Date().getFullYear()} A3 Visual. All rights reserved.
          </div>
          <div className="text-[11px] text-slate-500 max-w-md sm:text-right leading-relaxed">
            A3 Visual and A3 Graphics are registered trademarks of AAA Flag &amp; Banner Mfg. Co.,
            Inc.
          </div>
        </div>
      </div>
    </footer>
  );
}
