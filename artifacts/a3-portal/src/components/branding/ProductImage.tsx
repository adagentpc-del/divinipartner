import React from "react";

/**
 * Image renderer for product / package / category tiles. When `src` is
 * missing, falls back to the bundled A3 Visual lockup centered on a muted
 * background instead of a generic placeholder icon.
 */
interface ProductImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  fallbackClassName?: string;
}

export function ProductImage({ src, alt = "", className, fallbackClassName }: ProductImageProps) {
  if (src) {
    return <img src={src} alt={alt} className={className} />;
  }
  const a3Src = `${import.meta.env.BASE_URL}brand/a3-lockup-on-light.jpeg`;
  return (
    <div
      className={fallbackClassName ?? className}
      style={{ display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f1f5f9" }}
    >
      <img
        src={a3Src}
        alt={alt || "A3 Visual"}
        style={{ maxWidth: "70%", maxHeight: "60%", objectFit: "contain", opacity: 0.85 }}
      />
    </div>
  );
}
