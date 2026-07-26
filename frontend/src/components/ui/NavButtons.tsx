import Image from "next/image";
import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  ComponentPropsWithoutRef,
} from "react";

export type IconButtonType = "back" | "cancel" | "map";

const iconSources: Record<IconButtonType, string> = {
  back: "/icons/back-button.svg",
  cancel: "/icons/cancel-button.svg",
  map: "/icons/map-button.svg",
};

const iconLabels: Record<IconButtonType, string> = {
  back: "Go back",
  cancel: "Close",
  map: "Open map",
};

type SharedProps = {
  icon: IconButtonType;
  label?: string;
  className?: string;
};

export function IconButton({
  icon,
  label = iconLabels[icon],
  className = "",
  type = "button",
  ...rest
}: SharedProps & ButtonHTMLAttributes<HTMLButtonElement>) {
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
        width={42}
        height={42}
        aria-hidden="true"
      />
    </button>
  );
}

export function NavButtonLink({
  href,
  icon,
  label = iconLabels[icon],
  className = "",
  ...rest
}: SharedProps & {
  href: string;
} & Omit<
    ComponentPropsWithoutRef<typeof Link>,
    "href" | "className" | "children"
  >) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={`ui-nav-button ${className}`}
      {...rest}
    >
      <Image
        src={iconSources[icon]}
        alt=""
        width={42}
        height={42}
        aria-hidden="true"
      />
    </Link>
  );
}