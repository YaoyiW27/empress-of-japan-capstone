"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Scene from "@/components/three/Scene";
import { narrators, scenes } from "@/lib/scenes";
import {
  ArrowRightIcon,
  Button,
  ButtonLink,
  CircleBackLink,
} from "@/components/ui/Button";

/** How long a touch press must last before the bio pops up. */
const LONG_PRESS_MS = 450;

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
    <main className="flex h-dvh w-full flex-col bg-ivory px-4 py-3 lg:px-8 lg:py-6">
      <header>
        <CircleBackLink href="/" label="Back to home" />
      </header>

      <div className="mt-3 flex min-h-0 flex-1 gap-3 lg:mt-4 lg:gap-5">
        {/* Left: guides as circular portrait options. Hover (mouse) or
            long-press (touch) reveals the bio beside the portrait. */}
        <aside className="flex w-20 shrink-0 flex-col items-center justify-center gap-3 lg:w-32 lg:gap-5">
          {narrators.map((narrator) => {
            const active = narrator.id === narratorId;
            return (
              <div key={narrator.id} className="relative">
                <button
                  type="button"
                  onClick={() => setNarratorId(narrator.id)}
                  onPointerEnter={(e) => {
                    if (e.pointerType === "mouse") setBioId(narrator.id);
                  }}
                  onPointerLeave={() => {
                    cancelPress();
                    setBioId(null);
                  }}
                  onPointerDown={(e) => {
                    if (e.pointerType === "mouse") return;
                    cancelPress();
                    pressTimer.current = window.setTimeout(
                      () => setBioId(narrator.id),
                      LONG_PRESS_MS,
                    );
                  }}
                  onPointerUp={(e) => {
                    cancelPress();
                    if (e.pointerType !== "mouse") setBioId(null);
                  }}
                  onPointerCancel={() => {
                    cancelPress();
                    setBioId(null);
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                  aria-current={active}
                  aria-label={`${narrator.name}, ${narrator.role}`}
                  className={`relative aspect-square w-16 shrink-0 touch-none select-none overflow-hidden rounded-full border-2 transition-all [-webkit-touch-callout:none] lg:w-24 ${
                    active
                      ? "border-brass ring-2 ring-brass/50"
                      : "border-brass/40 opacity-70 hover:scale-105 hover:opacity-100"
                  }`}
                >
                  <Image
                    src={narrator.portraitSrc}
                    alt={narrator.name}
                    fill
                    sizes="(min-width: 1024px) 96px, 64px"
                    draggable={false}
                    className="pointer-events-none select-none object-cover object-top"
                  />
                </button>

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
          <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-brass/40 bg-card p-4 shadow-sm ring-1 ring-brass/10 lg:p-6">
            <p className="shrink-0 text-xs font-semibold uppercase tracking-[0.22em] text-brass lg:text-base">
              Scenes
            </p>
            <ul className="mt-3 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-1 lg:gap-3">
              {scenes.map((scene) => {
                const active = scene.id === sceneId;
                return (
                  <li key={scene.id}>
                    <button
                      type="button"
                      onClick={() => setSceneId(scene.id)}
                      aria-pressed={active}
                      className={`group flex w-full items-center gap-3 rounded-md border p-2 text-left shadow-sm transition-all lg:gap-4 lg:p-2.5 ${
                        active
                          ? "border-brass bg-navy"
                          : "border-brass/40 bg-ivory hover:-translate-y-0.5 hover:border-brass hover:shadow-md"
                      }`}
                    >
                      <span className="relative block h-11 w-20 shrink-0 overflow-hidden rounded-sm border border-brass/30 lg:h-14 lg:w-24">
                        <Image
                          src={scene.photoSrc}
                          alt={scene.title}
                          fill
                          sizes="96px"
                          className="object-cover"
                        />
                      </span>
                      <span
                        className={`font-display text-base font-semibold transition-colors lg:text-xl ${
                          active
                            ? "text-ivory"
                            : "text-navy group-hover:text-brass"
                        }`}
                      >
                        {scene.title}
                      </span>
                    </button>
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
                  <ArrowRightIcon />
                </ButtonLink>
              ) : (
                <Button disabled className="w-full justify-center">
                  Start voyage
                  <ArrowRightIcon />
                </Button>
              )}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
