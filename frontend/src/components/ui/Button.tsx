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
