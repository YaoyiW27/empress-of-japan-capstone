"use client";

import type { Scene } from "@/lib/narrators";
import {
  SelectToggle,
  type ButtonVariant,
} from "./ui/SelectToggle";

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
      className="pointer-events-auto
      flex
      h-70
      w-max
      flex-col
      gap-3
      overflow-x-hidden
      overflow-y-auto
      p-2"
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