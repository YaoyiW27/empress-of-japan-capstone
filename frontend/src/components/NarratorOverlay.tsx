"use client";

import Image from "next/image";
import type { SceneNarrator } from "@/lib/scenes";

/**
 * 2D narrator overlaid on the scene: avatar + a speech bubble with placeholder
 * dialogue. The "Talk" button is a stub — the UX/Voice track wires up voice
 * interaction later. The container is pointer-events-none so it doesn't steal
 * drag-to-look from the canvas; only the bubble is interactive.
 */
export default function NarratorOverlay({
  narrator,
}: {
  narrator?: SceneNarrator;
}) {
  if (!narrator) return null;

  const initials = narrator.name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-3 p-4 sm:p-6">
      <div className="shrink-0 overflow-hidden rounded-full border-2 border-amber-400/80 bg-neutral-800 shadow-lg">
        {narrator.avatarSrc ? (
          <Image
            src={narrator.avatarSrc}
            alt={narrator.name}
            width={64}
            height={64}
            className="h-16 w-16 object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center text-xl font-semibold text-amber-400">
            {initials}
          </div>
        )}
      </div>

      <div className="pointer-events-auto max-w-md rounded-2xl bg-neutral-900/85 px-4 py-3 shadow-lg backdrop-blur-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">
          {narrator.name}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-neutral-100">
          {narrator.greeting}
        </p>
        <button
          type="button"
          disabled
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-400"
          title="Voice interaction coming soon"
        >
          🎤 Talk (coming soon)
        </button>
      </div>
    </div>
  );
}
