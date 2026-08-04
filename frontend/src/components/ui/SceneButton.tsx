"use client";

import Image from "next/image";
import Link from "next/link";
import type { Scene } from "@/lib/scenes";

type SceneButtonProps = {
  scene: Scene;
  selected: boolean;
  variant: "overview" | "panorama";
} & (
  | {
      /** Toggle-style selection (hub rail, voyage drawer). */
      onClick: () => void;
      href?: never;
    }
  | {
      /** Navigation (e.g. a bio page's featured scenes). */
      href: string;
      onClick?: never;
    }
);

export default function SceneButton({
  scene,
  selected,
  variant,
  onClick,
  href,
}: SceneButtonProps) {
  const stateClasses =
    variant === "overview"
      ? selected
        ? "border-ivory bg-brass text-ivory"
        : "border-brass bg-ivory text-navy"
      : selected
        ? "border-ai bg-ai-soft/50 text-ai-bg"
        : "border-neutral bg-ai-bg/50 text-ai/75";

  // max-w-full lets the fixed w-52 give way inside narrower rails/grids
  // instead of clipping against them.
  const className = `group flex h-16 w-52 max-w-full shrink-0 items-center gap-3 rounded-lg border-2 p-1.5 text-left shadow-[0_0_8px_rgb(from_var(--color-navy)_r_g_b_/_50%)] transition-[transform,background-color,border-color,color,box-shadow] duration-200 hover:scale-[1.02] ${stateClasses}`;

  const content = (
    <>
      <span className="relative block h-9 w-9 shrink-0 overflow-hidden rounded-full border-current/30">
        <Image
          src={scene.photoSrc}
          alt={scene.title}
          fill
          sizes="64px"
          className="object-cover"
        />
      </span>

      <span className="min-w-0 flex-1 whitespace-normal break-words text-ui-scene leading-tight text-current">
        {scene.title}
      </span>
    </>
  );

  if (href !== undefined) {
    return (
      <Link href={href} data-variant={variant} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      data-variant={variant}
      className={className}
    >
      {content}
    </button>
  );
}
