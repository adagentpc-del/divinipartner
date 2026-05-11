import { useState } from "react";

interface VideoEmbedProps {
  /**
   * The video source. Supports:
   *   - Vimeo URL or ID (e.g. "https://vimeo.com/1091974311" or "1091974311")
   *   - YouTube URL or ID
   *   - A local/uploaded video file URL ending in .mp4 / .webm / .mov
   *
   * To swap the Vimeo reel for a locally hosted video later, simply change
   * the `src` passed into this component to the public URL of the uploaded
   * file (e.g. "/videos/sizzle-reel.mp4"). No other changes needed.
   */
  src: string;
  title?: string;
  poster?: string | null;
  className?: string;
}

function parseVimeoId(src: string): string | null {
  if (/^\d{6,12}$/.test(src)) return src;
  const m = src.match(/vimeo\.com\/(?:video\/)?(\d{6,12})/);
  return m ? m[1] : null;
}

function parseYouTubeId(src: string): string | null {
  const m = src.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,15})/);
  return m ? m[1] : null;
}

function isVideoFile(src: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(src);
}

export function VideoEmbed({ src, title = "Video", poster, className = "" }: VideoEmbedProps) {
  const [failed, setFailed] = useState(false);
  const vimeoId = parseVimeoId(src);
  const youtubeId = parseYouTubeId(src);
  const isFile = isVideoFile(src);

  const wrap = `relative w-full aspect-video bg-black overflow-hidden ${className}`;

  if (failed) {
    return (
      <div className={wrap}>
        {poster ? (
          <img src={poster} alt={title} className="absolute inset-0 w-full h-full object-cover opacity-60" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#0E1B3D] to-[#0a1430]" />
        )}
        <div className="relative z-10 flex flex-col items-center justify-center h-full text-white text-center px-6">
          <div className="text-sm uppercase tracking-[0.2em] text-[#E9B947] mb-3">Video</div>
          <p className="text-base mb-4 opacity-80">Click below to watch the sizzle reel.</p>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#E9B947] hover:bg-[#d6a728] text-[#0E1B3D] font-semibold px-5 py-2.5 rounded-md transition-colors"
          >
            Open video ↗
          </a>
        </div>
      </div>
    );
  }

  if (vimeoId) {
    return (
      <div className={wrap}>
        <iframe
          src={`https://player.vimeo.com/video/${vimeoId}?title=0&byline=0&portrait=0&dnt=1`}
          title={title}
          className="absolute inset-0 w-full h-full border-0"
          allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
          allowFullScreen
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  if (youtubeId) {
    return (
      <div className={wrap}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0`}
          title={title}
          className="absolute inset-0 w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  if (isFile) {
    return (
      <div className={wrap}>
        <video
          src={src}
          controls
          playsInline
          poster={poster ?? undefined}
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  // Unknown source — show external-link fallback
  return (
    <div className={wrap}>
      <div className="absolute inset-0 bg-gradient-to-br from-[#0E1B3D] to-[#0a1430]" />
      <div className="relative z-10 flex flex-col items-center justify-center h-full text-white text-center px-6">
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-[#E9B947] hover:bg-[#d6a728] text-[#0E1B3D] font-semibold px-5 py-2.5 rounded-md transition-colors"
        >
          Watch video ↗
        </a>
      </div>
    </div>
  );
}
