"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTexture } from "@react-three/drei";
import PanoramaScene from "@/components/three/PanoramaScene";
import NarratorOverlay from "@/components/NarratorOverlay";
import SceneRail from "@/components/SceneRail";
import { ButtonLink } from "@/components/ui/Button";
import type { Narrator } from "@/lib/narrators";

/**
 * A narrator's storyline: one persistent panorama viewer whose scene swaps in
 * place (no remount), with the narrator present and a thumbnail rail to move
 * between that narrator's scenes freely.
 */
export default function NarratorExperience({
  narrator,
}: {
  narrator: Narrator;
}) {
  // ?scene= opens at a specific panorama (set from the hub's scene picker).
  const initialSceneId = useSearchParams().get("scene") ?? undefined;
  const [currentId, setCurrentId] = useState(() =>
    narrator.scenes.some((scene) => scene.id === initialSceneId)
      ? initialSceneId!
      : narrator.scenes[0].id,
  );
  const current =
    narrator.scenes.find((scene) => scene.id === currentId) ??
    narrator.scenes[0];

  // Warm the texture cache so switching scenes is instant (no reload flash).
  useEffect(() => {
    useTexture.preload(narrator.scenes.map((scene) => scene.photoSrc));
  }, [narrator]);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-navy">
      <div className="absolute inset-0">
        <PanoramaScene scene={current} />
      </div>

      {/* Top-left: back to guides + current scene title */}
      <div className="pointer-events-none absolute left-4 top-4 sm:left-6 sm:top-6">
        <div className="pointer-events-auto inline-flex flex-col items-start gap-2 rounded-md border border-brass/40 bg-card/85 px-4 py-3 shadow-lg backdrop-blur-sm">
          <ButtonLink href="/explore" variant="ghost">
            ← Guides
          </ButtonLink>
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-brass">
              {narrator.role}
            </p>
            <h1 className="font-display text-xl font-bold text-navy">
              {current.title}
            </h1>
          </div>
        </div>
      </div>

      {/* Right edge: vertical scene switcher */}
      <div className="pointer-events-none absolute right-3 top-1/2 flex max-h-[82vh] -translate-y-1/2 sm:right-5">
        <SceneRail
          scenes={narrator.scenes}
          currentId={currentId}
          onSelect={setCurrentId}
        />
      </div>

      {/* Bottom-left: narrator */}
      <NarratorOverlay narrator={narrator} scene={current} />
    </main>
  );
}
