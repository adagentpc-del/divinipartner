import { useEffect, useState } from "react";
import { X, ArrowLeft, ArrowRight, Check } from "lucide-react";
import type { WalkthroughScript, WalkthroughSlide } from "@/lib/walkthrough";
import type { ResolvedBranding } from "./usePartnerBranding";
import { VideoEmbed } from "@/components/home/VideoEmbed";

interface PartnerWalkthroughProps {
  open: boolean;
  onClose: () => void;
  script: WalkthroughScript;
  branding?: ResolvedBranding | null;
  /** When a custom video is ready it takes priority over the interactive slides. */
  videoUrl?: string | null;
  videoPosterUrl?: string | null;
  /** "video_ready" means play the custom video; anything else → interactive. */
  videoStatus?: string | null;
}

/**
 * Full-screen branded walkthrough overlay. Avoids adding a new public route
 * (keeps wouter slug routing intact). When a custom walkthrough video is
 * marked ready, it plays that; otherwise it runs the deterministic interactive
 * slide experience generated from live portal data.
 */
export function PartnerWalkthrough({
  open,
  onClose,
  script,
  branding,
  videoUrl,
  videoPosterUrl,
  videoStatus,
}: PartnerWalkthroughProps) {
  const [index, setIndex] = useState(0);
  const slides = script.slides;
  const total = slides.length;

  const primary = branding?.primary || "#0E1B3D";
  const accent = branding?.button || "#E9B947";
  const accentText = branding?.buttonText || "#0E1B3D";

  const useVideo = videoStatus === "video_ready" && !!videoUrl;

  // Reset to first slide each time the modal opens.
  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  // Lock body scroll while open and support keyboard navigation.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (useVideo) return;
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, total - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, total, onClose, useVideo]);

  if (!open) return null;

  const slide: WalkthroughSlide | undefined = slides[index];
  const isFirst = index === 0;
  const isLast = index === total - 1;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${script.partnerName} walkthrough`}
      data-testid="walkthrough-overlay"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(8,12,28,0.82)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />

      <div
        className="relative z-10 w-full max-w-3xl overflow-hidden rounded-2xl shadow-2xl"
        style={{
          background: `linear-gradient(135deg, ${primary} 0%, #0a1430 100%)`,
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        {/* Top accent line */}
        <div className="h-1 w-full" style={{ background: `linear-gradient(to right, ${accent}, transparent)` }} />

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close walkthrough"
          data-testid="button-close-walkthrough"
          className="absolute right-3 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>

        {useVideo ? (
          <div className="p-5 sm:p-7">
            <div className="mb-4 text-center">
              <div className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>
                {script.partnerName} Walkthrough
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-white/10 shadow-xl">
              <VideoEmbed src={videoUrl!} title={`${script.partnerName} walkthrough`} poster={videoPosterUrl} />
            </div>
          </div>
        ) : (
          <div className="flex min-h-[420px] flex-col px-6 py-8 sm:px-10 sm:py-10">
            {/* Progress dots */}
            <div className="mb-7 flex items-center justify-center gap-1.5">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  aria-label={`Go to slide ${i + 1}`}
                  onClick={() => setIndex(i)}
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: i === index ? 28 : 8,
                    backgroundColor: i === index ? accent : "rgba(255,255,255,0.25)",
                  }}
                />
              ))}
            </div>

            {/* Slide content */}
            {slide && (
              <div key={slide.id} className="flex flex-1 flex-col items-center text-center text-white animate-in fade-in duration-300">
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>
                  {slide.eyebrow}
                </div>
                <h2 className="mb-4 text-2xl font-extrabold leading-tight sm:text-3xl">{slide.title}</h2>
                <p className="mx-auto mb-6 max-w-xl text-sm leading-relaxed text-slate-200 sm:text-base">
                  {slide.body}
                </p>

                {slide.bullets && slide.bullets.length > 0 && (
                  <ul className="mx-auto grid w-full max-w-md gap-2 text-left sm:grid-cols-2">
                    {slide.bullets.map((b, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5"
                      >
                        <span
                          className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full"
                          style={{ backgroundColor: accent, color: accentText }}
                        >
                          <Check className="h-2.5 w-2.5" strokeWidth={3} />
                        </span>
                        <span className="text-xs leading-snug text-slate-100 sm:text-sm">{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Footer navigation */}
            <div className="mt-8 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIndex((i) => Math.max(i - 1, 0))}
                disabled={isFirst}
                data-testid="button-walkthrough-prev"
                className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-30"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>

              <div className="text-xs font-medium text-slate-400">
                {index + 1} / {total}
              </div>

              {isLast ? (
                <button
                  type="button"
                  onClick={onClose}
                  data-testid="button-walkthrough-finish"
                  className="inline-flex items-center gap-1.5 rounded-md px-5 py-2.5 text-sm font-extrabold uppercase tracking-[0.06em] transition-transform hover:scale-[1.03]"
                  style={{ backgroundColor: accent, color: accentText }}
                >
                  Get started <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIndex((i) => Math.min(i + 1, total - 1))}
                  data-testid="button-walkthrough-next"
                  className="inline-flex items-center gap-1.5 rounded-md px-5 py-2.5 text-sm font-extrabold uppercase tracking-[0.06em] transition-transform hover:scale-[1.03]"
                  style={{ backgroundColor: accent, color: accentText }}
                >
                  Next <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
