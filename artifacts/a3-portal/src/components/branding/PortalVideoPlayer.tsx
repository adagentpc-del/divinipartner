import { useState } from "react";
import { VideoEmbed } from "@/components/home/VideoEmbed";
import { Play } from "lucide-react";
import type { ResolvedBranding } from "./usePartnerBranding";

interface PortalVideoPlayerProps {
  /** Video URL (vimeo/youtube/direct file). When empty an A3 placeholder shows. */
  src?: string | null;
  poster?: string | null;
  title?: string;
  /** Optional brand styling for the poster/overlay. */
  branding?: Pick<ResolvedBranding, "primary" | "button" | "buttonText" | "accent"> | null;
  className?: string;
}

/**
 * Premium video surface: a branded poster card with a play overlay that swaps
 * to the real player (VideoEmbed handles vimeo/youtube/mp4) on click. When no
 * source is configured it renders an A3-branded placeholder instead of an empty
 * frame.
 */
export function PortalVideoPlayer({
  src,
  poster,
  title = "Walkthrough",
  branding,
  className = "",
}: PortalVideoPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const accent = branding?.button || "#E9B947";
  const accentText = branding?.buttonText || "#0E1B3D";

  if (!src) {
    return (
      <div className={`relative w-full aspect-video overflow-hidden rounded-xl ${className}`}>
        <div className="absolute inset-0 bg-gradient-to-br from-[#0E1B3D] via-[#142454] to-[#0a1430]" />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 1px, transparent 14px)",
          }}
        />
        <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center text-white">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#E9B947]">
            A3 Visual
          </div>
          <p className="max-w-md text-sm text-slate-200 sm:text-base">
            A custom walkthrough video for this portal is coming soon. Use the interactive
            walkthrough in the meantime.
          </p>
        </div>
      </div>
    );
  }

  if (playing) {
    return (
      <div className={`relative w-full overflow-hidden rounded-xl ${className}`}>
        <VideoEmbed src={src} title={title} poster={poster} />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`Play ${title}`}
      data-testid="button-play-portal-video"
      className={`group relative block w-full aspect-video overflow-hidden rounded-xl ${className}`}
    >
      {poster ? (
        <img src={poster} alt={title} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <>
          <div className="absolute inset-0 bg-gradient-to-br from-[#0E1B3D] via-[#142454] to-[#0a1430]" />
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 1px, transparent 14px)",
            }}
          />
        </>
      )}
      <div className="absolute inset-0 bg-black/20 transition-colors group-hover:bg-black/10" />
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="flex h-16 w-16 items-center justify-center rounded-full shadow-lg transition-transform group-hover:scale-110"
          style={{ backgroundColor: accent, color: accentText }}
        >
          <Play className="ml-1 h-7 w-7" fill="currentColor" />
        </span>
      </div>
    </button>
  );
}
