"use client";

import type { Scene } from "@/lib/narrators";
import {
  SelectToggle,
  type ButtonVariant,
} from "./SelectToggle";

type SceneRailProps = {
  scenes: Scene[];
  currentId?: string;
  onSelect: (id: string) => void;
  variant: ButtonVariant;
};

export default function SceneRail({
  scenes,
  currentId,
  onSelect,
  variant,
}: SceneRailProps) {
  return (
    <nav
      aria-label="Ship scenes"
      className="flex max-h-full flex-col gap-3 overflow-y-auto"
    >
      {scenes.map((scene) => (
        <SelectToggle
          key={scene.id}
          selected={scene.id === currentId}
          variant={variant}
          onClick={() => onSelect(scene.id)}
        >
          {scene.title}
        </SelectToggle>
      ))}
    </nav>
  );
}