"use client";

import type { Scene } from "@/lib/narrators";

/**
 * Vertical column of separated text buttons down the right edge. Each scene is
 * its own pill (no shared container, no thumbnails) for clear, mobile-friendly
 * tap targets; the active scene is filled navy. Clicking switches in place.
 */
export default function SceneRail({
  scenes,
  currentId,
  onSelect,
}: {
  scenes: Scene[];
  currentId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="pointer-events-auto flex max-h-full flex-col items-end gap-3 overflow-y-auto pr-1 lg:gap-4">
      {scenes.map((scene) => {
        const active = scene.id === currentId;
        return (
          <button
            key={scene.id}
            type="button"
            onClick={() => onSelect(scene.id)}
            aria-current={active}
            className={`w-32 shrink-0 rounded-xl border px-3 py-2.5 text-center text-sm font-semibold shadow-md backdrop-blur-sm transition-all lg:w-44 lg:px-4 lg:py-3 lg:text-base ${
              active
                ? "border-brass bg-navy text-ivory"
                : "border-brass/40 bg-card/90 text-navy hover:border-brass hover:bg-card"
            }`}
          >
            {scene.title}
          </button>
        );
      })}
    </div>
  );
}
