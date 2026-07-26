"use client";

import { useRef, useState } from "react";
import NarratorButton, {
  type NarratorId as NarratorButtonId,
} from "@/components/ui/NarratorButton";
import SceneButton from "@/components/ui/SceneButton";
import Scene from "@/components/three/Scene";
import { narrators, scenes } from "@/lib/scenes";
import { Button, ButtonLink, CircleBackLink } from "@/components/ui/Button";

/** How long a touch press must last before the bio pops up. */
const LONG_PRESS_MS = 450;

/** Maps backend persona ids to the shorter ids used by NarratorButton assets. */
const narratorButtonIds: Record<string, NarratorButtonId> = {
  captain_sinclair: "sinclair",
  eleanor_whitmore: "whitmore",
  ming_chen: "ming",
};

/**
 * Scene-first hub: pick a guide on the left (hover / long-press a portrait for
 * their bio), see the 3D ship in the center, and pick any scene on the right —
 * guides and scenes combine freely. "Start voyage" opens the pair.
 *
 * Sized compact for phone landscape (short viewport); the roomier `lg:` sizing
 * kicks in on real desktops/tablets (>=1024px).
 */
export default function ExploreHub() {
  const [narratorId, setNarratorId] = useState(narrators[0].id);
  const [sceneId, setSceneId] = useState<string | null>(null);
  // Which guide's bio is showing (mouse hover, or touch long-press).
  const [bioId, setBioId] = useState<string | null>(null);
  const pressTimer = useRef<number | null>(null);

  function cancelPress() {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  return (
    <main className="relative flex h-dvh w-full flex-col bg-ivory px-4 py-3 lg:px-8 lg:py-6">
      {/* Same spot as the voyage page's back button, for cross-page consistency. */}
      <CircleBackLink
        href="/"
        label="Back to home"
        className="absolute left-3 top-3 z-10 sm:left-6 sm:top-6"
      />

      <div className="mt-14 flex min-h-0 flex-1 gap-3 lg:mt-16 lg:gap-5">
        {/* Left: guides as circular portrait options. Hover (mouse) or
            long-press (touch) reveals the bio beside the portrait. */}
        <aside className="flex w-20 shrink-0 flex-col items-center justify-center gap-3 lg:w-32 lg:gap-5">
          {narrators.map((narrator) => {
            const active = narrator.id === narratorId;
            return (
              <div
                key={narrator.id}
                className="relative"
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse") setBioId(narrator.id);
                }}
                onPointerLeave={() => {
                  cancelPress();
                  setBioId(null);
                }}
                onPointerDown={(event) => {
                  if (event.pointerType === "mouse") return;
                  cancelPress();
                  pressTimer.current = window.setTimeout(
                    () => setBioId(narrator.id),
                    LONG_PRESS_MS,
                  );
                }}
                onPointerUp={(event) => {
                  cancelPress();
                  if (event.pointerType !== "mouse") setBioId(null);
                }}
                onPointerCancel={() => {
                  cancelPress();
                  setBioId(null);
                }}
                onContextMenu={(event) => event.preventDefault()}
              >
                <NarratorButton
                  narrator={narratorButtonIds[narrator.id]}
                  variant="hub"
                  state={active ? "selected" : "default"}
                  onClick={() => setNarratorId(narrator.id)}
                  label={`${narrator.name}, ${narrator.role}${
                    active ? ", selected" : ""
                  }`}
                  className="touch-none [-webkit-touch-callout:none]"
                />

                {bioId === narrator.id && (
                  <div className="pointer-events-none absolute left-full top-1/2 z-20 ml-3 w-64 -translate-y-1/2 rounded-lg border border-brass/40 bg-card p-4 shadow-lg ring-1 ring-brass/10 lg:w-80">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-brass lg:text-xs">
                      {narrator.role}
                    </p>
                    <p className="mt-1 font-display text-lg font-bold text-navy lg:text-xl">
                      {narrator.name}
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-navy-soft lg:text-sm">
                      {narrator.bio}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </aside>

        {/* Center: the ship (no background). min-w-0 lets it shrink so the right
            panel never gets pushed off a narrow (phone-landscape) screen. */}
        <section className="relative min-h-0 min-w-0 flex-1">
          <Scene
            scenes={scenes}
            selectedSceneId={sceneId}
            onSelectScene={setSceneId}
          />
          <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[0.65rem] uppercase tracking-[0.2em] text-navy-soft lg:bottom-3 lg:text-xs">
            Drag to rotate · scroll to zoom · tap a glowing dot to pick a scene
          </p>
        </section>

        {/* Right: every scene, scrollable; pick one and start the voyage */}
        <aside className="flex w-64 shrink-0 flex-col lg:w-[24rem]">
        <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-brass/40 bg-transparent p-4 shadow-sm ring-1 ring-brass/10 lg:p-6">
            <p className="shrink-0 text-xs font-semibold uppercase tracking-[0.22em] text-brass lg:text-base">
              Scenes
            </p>
            <ul className="mt-3 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-1 lg:gap-3">
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
            <div className="mt-4 shrink-0">
              {sceneId ? (
                <ButtonLink
                  href={`/explore/voyage?scene=${sceneId}&narrator=${narratorId}`}
                  className="w-full justify-center"
                >
                  Start voyage
                </ButtonLink>
              ) : (
                <Button disabled className="w-full justify-center">
                  Start voyage
                </Button>
              )}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}