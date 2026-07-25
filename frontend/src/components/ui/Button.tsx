import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

export type ButtonVariant = "primary" | "ghost";

/**
 * Shared button styling for the Art Deco theme.
 * - primary: navy fill, brass border, ivory uppercase label (the main CTA).
 * - ghost: a text link (back-nav) — brass-tinted, vermilion on hover.
 */
const styles: Record<ButtonVariant, string> = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-sm border border-brass bg-navy px-7 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-ivory shadow-sm transition-colors hover:bg-brass hover:text-navy disabled:cursor-not-allowed disabled:opacity-50",
  ghost:
    "inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-navy/80 transition-colors hover:text-vermilion disabled:cursor-not-allowed disabled:opacity-50",
};

export function ButtonLink({
  href,
  variant = "primary",
  className = "",
  children,
  ...rest
}: {
  href: string;
  variant?: ButtonVariant;
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<typeof Link>, "href" | "className" | "children">) {
  return (
    <Link href={href} className={`${styles[variant]} ${className}`} {...rest}>
      {children}
    </Link>
  );
}

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: {
  variant?: ButtonVariant;
} & ComponentPropsWithoutRef<"button">) {
  return (
    <button className={`${styles[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/** Right arrow for CTA labels ("Start voyage", "Step aboard") — matches the
 * stroke style of CircleBackLink so text arrows aren't mixed with SVG ones. */
export function ArrowRightIcon({
  className = "h-4 w-4",
}: {
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M5 12h14" />
      <path d="M12 5l7 7-7 7" />
    </svg>
  );
}

/**
 * Icon-only circular back button: a left arrow, no text. `label` is the
 * screen-reader name for the destination (e.g. "Back to guides").
 */
export function CircleBackLink({
  href,
  label,
  className = "",
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={`flex h-11 w-11 items-center justify-center rounded-full border border-brass/40 bg-card/90 text-navy shadow-md backdrop-blur-sm transition-colors hover:border-brass ${className}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <path d="M19 12H5" />
        <path d="M12 19l-7-7 7-7" />
      </svg>
    </Link>
  );
}
