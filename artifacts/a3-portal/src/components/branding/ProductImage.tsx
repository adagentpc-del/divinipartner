import React, { useState, useEffect } from "react";

/**
 * The bundled A3 Visual lockup used as the universal placeholder whenever a
 * product / package / add-on image is missing, null, or fails to load.
 */
export const A3_FALLBACK_SRC = `${import.meta.env.BASE_URL}brand/a3-lockup-on-light.jpeg`;

/**
 * Image renderer for product / package / category / cart tiles. Falls back to
 * the A3 Visual lockup (centered on a muted background) when `src` is missing
 * OR when the provided image URL fails to load — never a broken-image icon,
 * empty box, or question mark.
 */
interface ProductImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  fallbackClassName?: string;
  style?: React.CSSProperties;
}

export function ProductImage({ src, alt = "", className, fallbackClassName, style }: ProductImageProps) {
  const [errored, setErrored] = useState(false);
  // Reset the error flag whenever the source changes so a new (valid) URL
  // gets a fresh chance to load.
  useEffect(() => {
    setErrored(false);
  }, [src]);

  if (!src || errored) {
    return (
      <div
        className={fallbackClassName ?? className}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f1f5f9", ...style }}
      >
        <img
          src={A3_FALLBACK_SRC}
          alt={alt || "A3 Visual"}
          style={{ maxWidth: "70%", maxHeight: "60%", objectFit: "contain", opacity: 0.85 }}
        />
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} style={style} onError={() => setErrored(true)} />;
}
