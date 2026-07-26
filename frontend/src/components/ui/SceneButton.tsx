"use client";

import Image from "next/image";
import type { Scene } from "@/lib/scenes";

type SceneButtonProps = {
  scene: Scene;
  selected: boolean;
  variant: "overview" | "panorama";
  onClick: () => void;
};

export default function SceneButton({
  scene,
  selected,
  variant,
  onClick,
}: SceneButtonProps) {
  const stateClasses =
    variant === "overview"
      ? selected
        ? "border-brass bg-brass text-ivory"
        : "border-ivory bg-ivory text-brass"
      : selected
        ? "border-ai bg-ai-soft/50 text-ai-bg"
        : "border-neutral bg-ai-bg/50 text-ai/75";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      data-variant={variant}
      className={`group flex h-16 w-50 shrink-0 items-center gap-3 rounded-lg border-2 p-1.5 text-left shadow-[0_0_8px_rgb(from_var(--color-navy)_r_g_b_/_50%)] transition-[transform,background-color,border-color,color,box-shadow] duration-200 hover:scale-[1.02] ${stateClasses}`}
    >
      <span className="relative block h-12 w-16 shrink-0 overflow-hidden rounded-md border border-current/30">
        <Image
          src={scene.photoSrc}
          alt={scene.title}
          fill
          sizes="64px"
          className="object-cover"
        />
      </span>

      <span className="min-w-0 flex-1 whitespace-normal break-words font-sans text-xs font-extrabold leading-tight text-current">
        {scene.title}
      </span>
    </button>
  );
}