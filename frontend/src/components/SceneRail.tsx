"use client";

import Image from "next/image";
import type { Scene } from "@/lib/narrators";

/**
 * Horizontal thumbnail strip of a narrator's scenes. The active scene is
 * highlighted with a brass ring; clicking one switches the panorama in place.
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
    <div className="pointer-events-auto flex max-w-[58vw] gap-2 overflow-x-auto rounded-md border border-brass/40 bg-card/85 p-2 shadow-lg backdrop-blur-sm">
      {scenes.map((scene) => {
        const active = scene.id === currentId;
        return (
          <button
            key={scene.id}
            type="button"
            onClick={() => onSelect(scene.id)}
            title={scene.title}
            aria-current={active}
            className={`relative h-14 w-24 shrink-0 overflow-hidden rounded-sm border transition-all ${
              active
                ? "border-brass ring-2 ring-brass"
                : "border-brass/30 opacity-75 hover:opacity-100"
            }`}
          >
            <Image
              src={scene.photoSrc}
              alt={scene.title}
              fill
              sizes="96px"
              className="object-cover"
            />
            <span className="absolute inset-x-0 bottom-0 truncate bg-navy/70 px-1 py-0.5 text-[0.6rem] font-medium text-ivory">
              {scene.title}
            </span>
          </button>
        );
      })}
    </div>
  );
}
