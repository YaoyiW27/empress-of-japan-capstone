"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import Scene from "@/components/three/Scene";
import SceneRail from "@/components/SceneRail";
import NarratorButton, {
  type NarratorId,
} from "@/components/ui/NarratorButton";
import { Button } from "@/components/ui/Button";
import { NavButtonLink } from "@/components/ui/NavButtons";

import {
  narrators,
  scenes,
  type PersonaId,
} from "@/lib/scenes";

/**
 * Explore hub flow:
 *
 * 1. Select a narrator on the left.
 * 2. Select a scene on the right.
 * 3. Start the voyage after both choices are made.
 *
 * The scene owns the destination route.
 * The narrator query parameter determines which narrator is initially selected
 * when the visitor enters that scene.
 */
export default function ExploreHub() {
  const router = useRouter();

  const [
    selectedNarratorId,
    setSelectedNarratorId,
  ] = useState<PersonaId | null>(null);

  const [
    selectedSceneId,
    setSelectedSceneId,
  ] = useState<string | undefined>(
    undefined,
  );

  const allScenes = [...scenes].sort((a, b) =>
    a.title.localeCompare(b.title),
  );

  function selectNarrator(
    narratorId: PersonaId,
  ) {
    setSelectedNarratorId(narratorId);
  }

  function selectScene(sceneId: string) {
    setSelectedSceneId(sceneId);
  }

  function startVoyage() {
    if (
      !selectedNarratorId ||
      !selectedSceneId
    ) {
      return;
    }

    router.push(
      `/explore/${selectedSceneId}?narrator=${selectedNarratorId}`,
    );
  }

  return (
    <main className="flex h-dvh w-full flex-col bg-ivory px-4 py-3 lg:px-8 lg:py-6">
      {/* Back button */}
      <div className="pointer-events-auto absolute left-3 top-3 sm:left-6 sm:top-6">
        <NavButtonLink
          href="/"
          icon="back"
          label="Return to ship overview"
        />
      </div>

      <div className="mt-3 flex min-h-0 flex-1 gap-3 lg:mt-4 lg:gap-5">
        {/* Narrator selection */}
        <aside className="flex w-20 shrink-0 flex-col items-center justify-center gap-3 lg:w-32 lg:gap-5">
          {narrators.map((narrator) => {
            const selected =
              narrator.id ===
              selectedNarratorId;

            return (
              <NarratorButton
                key={narrator.id}
                variant="hub"
                narrator={
                  narrator.uiId as NarratorId
                }
                state={
                  selected
                    ? "selected"
                    : "default"
                }
                label={`${narrator.name}, ${narrator.role}`}
                onClick={() =>
                  selectNarrator(
                    narrator.id,
                  )
                }
              />
            );
          })}
        </aside>

        {/* 3D ship */}
        <section className="relative min-h-0 min-w-0 flex-1">
          <Scene />

          <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[0.65rem] uppercase tracking-[0.2em] text-navy-soft lg:bottom-3 lg:text-xs">
            Drag to rotate · scroll to zoom
          </p>

          {/* Start only after both choices are made */}
          {selectedNarratorId &&
            selectedSceneId && (
              <div className="pointer-events-auto absolute bottom-16 left-1/2 -translate-x-1/2">
                <Button
                  className="w-80 justify-center"
                  variant="primary"
                  onClick={startVoyage}
                >
                  Start Voyage
                </Button>
              </div>
            )}
        </section>

        {/* Scene selection */}
        <aside
          className="
            absolute
            right-6
            top-24
            flex
            flex-col
            md:top-1/3
          "
        >
          <SceneRail
            scenes={allScenes}
            variant="overview"
            currentId={selectedSceneId}
            onSelect={selectScene}
          />
        </aside>
      </div>
    </main>
  );
}