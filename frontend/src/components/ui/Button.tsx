import Link from "next/link";
import Image from "next/image";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

export type ButtonVariant = "primary" | "ghost";

/**
 * Shared button styling for the Art Deco theme.
 * - primary: navy fill, brass border, ivory uppercase label (the main CTA).
 * - ghost: a text link (back-nav) — brass-tinted, vermilion on hover.
 */
const styles: Record<ButtonVariant, string> = {
  primary:
  "box-border inline-flex h-11 w-48 shrink-0 items-center justify-center gap-2 rounded-lg border-2 border-ivory bg-navy px-4 text-ui-interaction text-ivory shadow-sm transition-[filter,background-color] hover:brightness-95 disabled:cursor-not-allowed disabled:bg-navy-faint disabled:text-ivory disabled:opacity-100 disabled:hover:brightness-100",
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
      className={`ui-nav-button ${className}`}
    >
      <Image
        src="/icons/back-button.svg"
        alt=""
        width={44}
        height={44}
        aria-hidden="true"
      />
    </Link>
  );
}