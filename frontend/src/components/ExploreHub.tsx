"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import NarratorButton, {
  type NarratorId as NarratorButtonId,
} from "@/components/ui/NarratorButton";
import SceneButton from "@/components/ui/SceneButton";
import Scene from "@/components/three/Scene";
import { getNarrator, getScene, narrators, scenes } from "@/lib/scenes";
import { Button, ButtonLink, CircleBackLink } from "@/components/ui/Button";

/** Maps backend persona ids to the shorter ids used by NarratorButton assets. */
const narratorButtonIds: Record<string, NarratorButtonId> = {
  captain_sinclair: "sinclair",
  eleanor_whitmore: "whitmore",
  ming_chen: "ming",
};

/**
 * Scene-first hub: pick a guide on the left (the ⓘ badge on a portrait opens
 * their biography page), see the 3D ship in the center, and pick any scene on
 * the right — guides and scenes combine freely. "Start voyage" opens the pair.
 *
 * ?narrator= & ?scene= preselect either half — that's how the biography pages
 * hand their picks back — so this sits under a Suspense boundary (the page
 * stays static despite useSearchParams).
 *
 * Sized compact for phone landscape (short viewport); the roomier `lg:` sizing
 * kicks in on real desktops/tablets (>=1024px).
 */
export default function ExploreHub() {
  const searchParams = useSearchParams();
  // Unknown ids (hand-typed deep links) are ignored rather than kept as
  // un-startable selections.
  const [narratorId, setNarratorId] = useState<string | null>(() => {
    const requested = searchParams.get("narrator");
    return requested && getNarrator(requested) ? requested : null;
  });
  const [sceneId, setSceneId] = useState<string | null>(() => {
    const requested = searchParams.get("scene");
    return requested && getScene(requested) ? requested : null;
  });

  return (
    <main className="explore-hub relative flex h-dvh w-full flex-col overflow-x-hidden overflow-y-auto bg-ivory px-4 py-3 lg:px-8 lg:py-6">
      {/* Same spot as the voyage page's back button, for cross-page consistency. */}
      <CircleBackLink
        href="/"
        label="Back to home"
        className="absolute left-6 top-6 z-10"
      />

      <div className="explore-hub__layout mt-14 flex min-h-0 flex-1 gap-3 lg:mt-16 lg:gap-5">
        {/* Left: guides as circular portrait options. Tap the portrait to
            select; the ⓘ badge opens the guide's biography page. */}
        <aside className="explore-hub__guide-rail flex w-20 shrink-0 flex-col items-center justify-center gap-3 lg:w-32 lg:gap-5">
          <p className="mt-3 text-center text-ig uppercase tracking-[0.16em] text-navy-soft">
              Narrators
          </p>
          {narrators.map((narrator) => {
            const active = narrator.id === narratorId;
            return (
              <div key={narrator.id} className="relative">
                <NarratorButton
                  narrator={narratorButtonIds[narrator.id]}
                  variant="hub"
                  state={active ? "selected" : "default"}
                  onClick={() => setNarratorId(narrator.id)}
                  label={`${narrator.name}, ${narrator.role}${
                    active ? ", selected" : ""
                  }`}
                />

                <Link
                  href={`/explore/${narrator.id}`}
                  aria-label={`About ${narrator.name}`}
                  className="absolute -right-1 -top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-brass bg-card text-navy shadow-md transition-colors hover:bg-brass hover:text-ivory lg:h-7 lg:w-7"
                >
                  <InfoIcon />
                </Link>
              </div>
            );
          })}
        </aside>
        {/*
      <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 text-center sm:top-6">
        <h1 className="whitespace-nowrap text-ig-header !text-brass lg:text-5xl">
          Welcome Aboard
        </h1>
      </div>*/}
        {/* Center: the ship (no background). min-w-0 lets it shrink so the right
            panel never gets pushed off a narrow (phone-landscape) screen. */}

        <section className="explore-hub__ship relative min-h-0 min-w-0 flex-1">
        <div className="absolute inset-y-0 left-1/2 w-[60%] max-w-xl -translate-x-1/2 overflow-hidden">
          <Scene
            scenes={scenes}
            selectedSceneId={sceneId}
            onSelectScene={setSceneId}
          />
        </div>

          <p className="pointer-events-none absolute bottom-2 left-1/2 z-10 w-full -translate-x-1/2 px-2 text-center text-ig text-[0.65rem] uppercase tracking-[0.2em] text-navy-soft lg:bottom-3 lg:text-xs">
            Drag to rotate · scroll to zoom · tap a glowing dot to pick a scene
          </p>
        </section>

        {/* Right: every scene, scrollable; pick one and start the voyage */}
        {/* Right: every scene, scrollable; pick one and start the voyage */}
        <aside className="explore-hub__scene-panel flex min-h-0 w-64 shrink-0 flex-col overflow-hidden lg:w-[24rem]">
          <div className="flex min-h-0 flex-1 flex-col bg-transparent p-4">
            <p className="shrink-0 text-center text-ig uppercase text-navy-soft">
              Scenes
            </p>

            <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto p-1">
              {scenes.map((scene) => {
                const active = scene.id === sceneId;

                return (
                  <li key={scene.id} className="flex justify-center">
                    <SceneButton
                      scene={scene}
                      selected={active}
                      variant="overview"
                      onClick={() => setSceneId(scene.id)}
                    />
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-center text-ig uppercase tracking-[0.16em] text-navy-soft">
              Select a narrator and a scene to begin.
            </p>
            <div className="explore-hub__start mt-4 flex shrink-0 justify-center">
              {sceneId && narratorId ? (
                <ButtonLink
                  href={`/explore/voyage?scene=${sceneId}&narrator=${narratorId}`}
                >
                  Start Voyage
                </ButtonLink>
              ) : (
                <Button disabled>Start Voyage</Button>
              )}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

/** The "i" glyph for the bio badge — stroke style matches ArrowRightIcon. */
function InfoIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className={className}
    >
      <path d="M12 10.5V17" />
      <path d="M12 7h.01" />
    </svg>
  );
}