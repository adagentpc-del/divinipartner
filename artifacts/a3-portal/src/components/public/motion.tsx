import { useRef } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type Variants,
} from "framer-motion";

/** Shared luxury easing — slow, confident settle. */
export const easeLux = [0.2, 0.8, 0.2, 1] as const;

/* ---------------------------------------------------------------------------
 * Scroll-reveal: fades + lifts a block into view once, as it enters viewport.
 * ------------------------------------------------------------------------- */
export function Reveal({
  children,
  y = 24,
  delay = 0,
  duration = 0.7,
  className,
}: {
  children: React.ReactNode;
  y?: number;
  delay?: number;
  duration?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration, ease: easeLux, delay }}
    >
      {children}
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * Stagger group + item — children cascade in as the group scrolls into view.
 * ------------------------------------------------------------------------- */
export const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.04 } },
};
export const staggerChild: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easeLux } },
};

export function Stagger({
  children,
  className,
  margin = "-60px",
}: {
  children: React.ReactNode;
  className?: string;
  margin?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={reduce ? undefined : staggerParent}
      initial={reduce ? false : "hidden"}
      whileInView="show"
      viewport={{ once: true, margin }}
    >
      {children}
    </motion.div>
  );
}

export function Item({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} variants={reduce ? undefined : staggerChild}>
      {children}
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * Parallax — translates a layer against scroll for depth.
 * ------------------------------------------------------------------------- */
export function Parallax({
  children,
  amount = 60,
  className,
}: {
  children: React.ReactNode;
  amount?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [amount, -amount]);
  return (
    <motion.div ref={ref} className={className} style={reduce ? undefined : { y }}>
      {children}
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * Hero entrance — cascade on mount (not scroll). Use HeroGroup + HeroItem.
 * ------------------------------------------------------------------------- */
export const heroParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.15 } },
};
export const heroItem: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.85, ease: easeLux } },
};

export function HeroGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={reduce ? undefined : heroParent}
      initial={reduce ? false : "hidden"}
      animate="show"
    >
      {children}
    </motion.div>
  );
}

export function HeroItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} variants={reduce ? undefined : heroItem}>
      {children}
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * Floating element — slow vertical drift (e.g. the hero logo). Respects RM.
 * ------------------------------------------------------------------------- */
export function Float({
  children,
  className,
  distance = 10,
  duration = 6,
}: {
  children: React.ReactNode;
  className?: string;
  distance?: number;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      animate={{ y: [0, -distance, 0] }}
      transition={{ duration, ease: "easeInOut", repeat: Infinity }}
    >
      {children}
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * Magnetic CTA wrapper — subtle spring lift + press on hover/tap.
 * ------------------------------------------------------------------------- */
export function Lift({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      whileHover={reduce ? undefined : { y: -3 }}
      whileTap={reduce ? undefined : { scale: 0.98 }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
    >
      {children}
    </motion.div>
  );
}
