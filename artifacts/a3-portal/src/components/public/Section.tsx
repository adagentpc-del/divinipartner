import { Link } from "wouter";
import { cn } from "@/lib/utils";

/** Small uppercase kicker shown above section titles. */
export function Eyebrow({
  children,
  className,
  tone = "green",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "green" | "champagne" | "light";
}) {
  return (
    <p
      className={cn(
        "eyebrow",
        tone === "champagne" && "text-divini-champagne",
        tone === "light" && "text-divini-green-foreground/70",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Centered (or left) section heading with optional eyebrow + lede. */
export function SectionHeading({
  eyebrow,
  title,
  lede,
  align = "center",
  tone = "ink",
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  align?: "center" | "left";
  tone?: "ink" | "light";
  className?: string;
}) {
  return (
    <div
      className={cn(
        align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl text-left",
        className,
      )}
    >
      {eyebrow ? (
        <Eyebrow tone={tone === "light" ? "champagne" : "green"}>{eyebrow}</Eyebrow>
      ) : null}
      <h2
        className={cn(
          "font-display mt-3 text-balance text-4xl leading-[1.08] md:text-5xl",
          tone === "light" ? "text-divini-green-foreground" : "text-divini-ink",
        )}
      >
        {title}
      </h2>
      {lede ? (
        <p
          className={cn(
            "mt-4 text-[15px] leading-relaxed md:text-base",
            align === "center" && "mx-auto max-w-xl",
            tone === "light" ? "text-divini-green-foreground/80" : "text-divini-muted",
          )}
        >
          {lede}
        </p>
      ) : null}
    </div>
  );
}

type CTAProps = {
  href: string;
  children: React.ReactNode;
  variant?: "solid" | "cream" | "outline" | "ghost";
  className?: string;
  external?: boolean;
};

/** Pill CTA in the Divini luxury language. */
export function CTA({ href, children, variant = "solid", className, external }: CTAProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-7 py-3 text-sm font-medium tracking-wide transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-divini-champagne focus-visible:ring-offset-2";
  const variants: Record<NonNullable<CTAProps["variant"]>, string> = {
    solid:
      "bg-divini-green text-divini-green-foreground shadow-sm hover:bg-divini-green-deep hover:shadow-md hover:-translate-y-0.5",
    cream:
      "bg-divini-cream text-divini-green shadow-sm hover:bg-white hover:-translate-y-0.5",
    outline:
      "border border-divini-green-foreground/40 text-divini-green-foreground hover:bg-white/10",
    ghost: "text-divini-green hover:text-divini-green-deep",
  };
  const cls = cn(base, variants[variant], className);
  if (external) {
    return (
      <a href={href} className={cls} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}
