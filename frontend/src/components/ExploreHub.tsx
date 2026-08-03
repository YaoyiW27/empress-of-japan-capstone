"use client";

import { useEffect, useRef, useState } from "react";
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
 * Scene-first hub: pick a guide on the left (the name under a portrait opens
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
  const sceneListRef = useRef<HTMLUListElement | null>(null);

  // Scenes can be selected from outside the rail (a ship dot, or the bio
  // page's ?scene=) while the rail is scrolled elsewhere — bring the
  // selected entry into view so the change is visible.
  useEffect(() => {
    if (!sceneId) return;
    const item = sceneListRef.current?.querySelector(
      `[data-scene-id="${CSS.escape(sceneId)}"]`,
    );
    item?.scrollIntoView({
      block: "nearest",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [sceneId]);

  return (
    <main className="explore-hub relative flex h-dvh w-full flex-col overflow-x-hidden overflow-y-auto bg-ivory px-4 py-3 lg:px-8 lg:py-6">
      {/* Same spot as the voyage page's back button, for cross-page consistency. */}
      <CircleBackLink
        href="/"
        label="Back to home"
        className="absolute left-6 top-6 z-10"
      />

      <div className="explore-hub__layout flex min-h-0 flex-1 gap-3 lg:gap-5">
        {/* Left: guides as circular portrait options, centered on the viewport
            height so they sit beside the ship. Tap the portrait to select; the
            name beside it opens the guide's biography page. */}
        {/* px-2 keeps the portraits off the screen edge (the scene rail gets
            the same inset from its own padding); the widths are +1rem to
            compensate so the name links keep their room. */}
        <aside className="explore-hub__guide-rail flex w-44 shrink-0 flex-col items-center justify-center gap-3 px-2 lg:w-52 lg:gap-6">
          <p className="text-center text-ig uppercase tracking-[0.16em] text-navy-soft">
            Narrators
          </p>
          {narrators.map((narrator) => {
            const active = narrator.id === narratorId;
            return (
              <div key={narrator.id} className="flex w-full items-center">
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
                  className="flex min-h-11 min-w-0 flex-1 items-center py-1 pl-2 text-left text-[10px] font-semibold uppercase leading-snug tracking-[0.06em] text-navy-soft transition-colors hover:text-vermilion lg:text-xs lg:tracking-[0.08em]"
                >
                  {/* No-break space keeps the chevron glued to the last word. */}
                  <span>
                    {narrator.name}
                    {" "}
                    <span aria-hidden="true" className="text-brass">
                      ›
                    </span>
                  </span>
                </Link>
              </div>
            );
          })}
        </aside>

        {/* Center: the ship (no background). min-w-0 lets it shrink so the right
            panel never gets pushed off a narrow (phone-landscape) screen. The
            canvas fills the whole column (capped only on ultra-wide screens) so
            the ship reads at the size the Figma gives it — the trade-off is
            that OrbitControls owns wheel/touch gestures over most of the middle
            of the page, which is fine because the hub fits h-dvh and never
            needs to scroll. No overflow-hidden: marker labels near the
            bow/stern spill past the canvas edge instead of being clipped. */}
        <section className="explore-hub__ship relative min-h-0 min-w-0 flex-1">
          <div className="absolute inset-y-0 left-1/2 w-full max-w-5xl -translate-x-1/2">
            <Scene
              scenes={scenes}
              selectedSceneId={sceneId}
              onSelectScene={setSceneId}
            />
          </div>

          {/* The nowrap spans pin the only break point before "tap a glowing
              dot", so on phones the hint splits into two clean phrases. */}
          <p className="pointer-events-none absolute bottom-2 left-1/2 z-10 w-full -translate-x-1/2 px-2 text-center text-ig uppercase tracking-[0.2em] text-navy-soft lg:bottom-3">
            <span className="whitespace-nowrap">
              Drag to rotate · scroll to zoom ·
            </span>{" "}
            <span className="whitespace-nowrap">
              tap a glowing dot to pick a scene
            </span>
          </p>
        </section>

        {/* Right: every scene, scrollable; pick one and start the voyage.
            The rail is sized around SceneButton's 13rem default (the old
            24rem reserved nearly double the content width), and globals.css
            stretches the buttons to the rail so the two can't drift apart. */}
        <aside className="explore-hub__scene-panel flex min-h-0 w-60 shrink-0 flex-col overflow-hidden p-3 lg:w-[17rem] lg:p-4">
          <p className="shrink-0 text-center text-ig uppercase text-navy-soft">
            Scenes
          </p>

          <ul
            ref={sceneListRef}
            className="mt-3 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-1"
          >
            {scenes.map((scene) => {
              const active = scene.id === sceneId;

              return (
                <li
                  key={scene.id}
                  data-scene-id={scene.id}
                  className="flex shrink-0 justify-center"
                >
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
          {/* The hint spans the panel (~240px inner), wrapping to two
              balanced lines — the old w-48 cap squeezed it into three. */}
          <div className="explore-hub__start mt-2 flex w-full shrink-0 flex-col items-center gap-1.5 lg:mt-4 lg:gap-3">
            <p className="text-center text-[10px] uppercase leading-snug tracking-[0.12em] text-navy-soft lg:tracking-[0.16em]">
              Select a narrator and a scene to begin.
            </p>
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
        </aside>
      </div>
    </main>
  );
}