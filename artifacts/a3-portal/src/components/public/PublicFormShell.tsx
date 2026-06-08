import { Link } from "wouter";
import { logos } from "@/lib/brand";
import { Reveal } from "@/components/public/motion";

/**
 * Shared luxury chrome for Divini-branded public form pages (document access,
 * sales intake, onboarding, pole-banner intake, etc.): cream canvas, soft
 * aura, Divini Group monogram, Cormorant title, and a security footnote.
 * Pages provide their own form/cards as children.
 */
export default function PublicFormShell({
  eyebrow,
  title,
  subtitle,
  children,
  footnote,
  maxWidthClass = "max-w-2xl",
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footnote?: React.ReactNode;
  maxWidthClass?: string;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-divini-cream text-divini-ink">
      <div
        className="aura aura-a"
        style={{
          width: 440,
          height: 440,
          top: -170,
          left: -130,
          background: "radial-gradient(circle, hsl(var(--divini-green) / 0.10), transparent 70%)",
        }}
      />
      <div
        className="aura aura-c"
        style={{
          width: 320,
          height: 320,
          top: -90,
          right: -70,
          background: "radial-gradient(circle, rgba(195,163,104,0.14), transparent 70%)",
        }}
      />

      <div className={`relative mx-auto ${maxWidthClass} px-5 py-12 md:py-16`}>
        <Reveal>
          <div className="text-center">
            <Link href="/" className="inline-flex flex-col items-center gap-2">
              <img
                src={logos.monogramGreen}
                alt="Divini Group"
                className="h-12 w-12 object-contain"
              />
              <span className="text-[10px] uppercase tracking-[0.28em] text-divini-muted">
                by Divini Group
              </span>
            </Link>
            {eyebrow ? <p className="eyebrow mt-6">{eyebrow}</p> : null}
            <h1 className="font-display mt-2 text-4xl leading-[1.08] text-divini-ink md:text-5xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-divini-muted">
                {subtitle}
              </p>
            ) : null}
          </div>
        </Reveal>

        <Reveal delay={0.1} className="mt-10">
          {children}
        </Reveal>

        {footnote ? (
          <p className="mx-auto mt-12 max-w-md text-center text-xs leading-relaxed text-divini-muted/80">
            {footnote}
          </p>
        ) : null}
      </div>
    </div>
  );
}
