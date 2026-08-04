import Image from "next/image";
import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  ComponentPropsWithoutRef,
} from "react";

type NavIcon = "back" | "cancel" | "map";

const iconSources: Record<NavIcon, string> = {
  back: "/icons/back-button.svg",
  cancel: "/icons/cancel-button.svg",
  map: "/icons/map-button.svg",
};

type ActionButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  label?: string;
  className?: string;
};

type BackButtonProps = Omit<
  ComponentPropsWithoutRef<typeof Link>,
  "href" | "className" | "children"
> & {
  href: string;
  label?: string;
  className?: string;
};

/**
 * Shared internal renderer for icon-only action buttons.
 *
 * These buttons perform an action on the current page rather than navigating
 * to another route.
 */
function ActionIconButton({
  icon,
  label,
  className = "",
  type = "button",
  ...rest
}: ActionButtonProps & {
  icon: "map" | "cancel";
  label: string;
}) {
  return (
    <button
      type={type}
      aria-label={label}
      className={`ui-nav-button ${className}`}
      {...rest}
    >
      <Image
        src={iconSources[icon]}
        alt=""
        width={44}
        height={44}
        aria-hidden="true"
      />
    </button>
  );
}

/**
 * Back navigation link.
 *
 * Use this when returning to another route, such as navigating from the
 * Voyage page back to the Explore hub.
 */
export function BackButton({
  href,
  label = "Go back",
  className = "",
  ...rest
}: BackButtonProps) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={`ui-nav-button ${className}`}
      {...rest}
    >
      <Image
        src={iconSources.back}
        alt=""
        width={44}
        height={44}
        aria-hidden="true"
      />
    </Link>
  );
}

/**
 * Opens the ship map without navigating away from the current scene.
 */
export function MapButton({
  label = "Open map",
  className = "",
  ...rest
}: ActionButtonProps) {
  return (
    <ActionIconButton
      icon="map"
      label={label}
      className={className}
      {...rest}
    />
  );
}

/**
 * Closes the ship map and returns to the current Voyage scene.
 */
export function CancelButton({
  label = "Close map",
  className = "",
  ...rest
}: ActionButtonProps) {
  return (
    <ActionIconButton
      icon="cancel"
      label={label}
      className={className}
      {...rest}
    />
  );
}