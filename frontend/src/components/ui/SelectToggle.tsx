import type {
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

export type ButtonVariant = "overview" | "panorama";

type SelectToggleProps = {
  selected?: boolean;
  variant: ButtonVariant;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function SelectToggle({
  selected = false,
  variant,
  children,
  className = "",
  type = "button",
  ...rest
}: SelectToggleProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={[
        "ui-button",
        "text-ui-interaction",
        `ui-button--${variant}`,
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}