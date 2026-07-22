"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import Scene from "@/components/three/Scene";
import SceneRail from "./SceneRail";
import { narrators } from "@/lib/narrators";
import { ButtonLink, Button } from "@/components/ui/Button";
import { NavButtonLink } from "@/components/ui/NavButtons";


/**
 * Guided hub: pick a narrator on the left, see the 3D ship in the center, and
 * read the selected narrator's bio on the right. Confirm to reveal that
 * narrator's scenes; picking one opens the experience at that panorama.
 *
 * Sized compact for phone landscape (short viewport); the roomier `lg:` sizing
 * kicks in on real desktops/tablets (>=1024px).
 */
export default function ExploreHub() {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [selectedSceneId, setSelectedSceneId] = useState<string | undefined>(undefined);
  const allScenes = Array.from(
    new Map(
      narrators
        .flatMap((n) => n.scenes)
        .map((scene) => [scene.id, scene]),
    ).values(),
  ).sort((a, b) =>
    a.title.localeCompare(b.title),
  );

  return (
    <main className="flex h-dvh w-full flex-col bg-ivory px-4 py-3 lg:px-8 lg:py-6">
      <div className="pointer-events-auto absolute left-3 top-3 sm:left-6 sm:top-6">
      <NavButtonLink
        href="/"
        icon="back"
        label="Return to ship overview"
      />
      </div>

      <div className="mt-3 flex min-h-0 flex-1 gap-3 lg:mt-4 lg:gap-5">
        {/* Left: guides as circular portrait options */}
        <aside className="flex w-20 shrink-0 flex-col items-center justify-center gap-3 lg:w-32 lg:gap-5">
          {narrators.map((narrator) => {
            const active = narrator.id === selectedId;
            return (
              <button
                key={narrator.id}
                type="button"
                onClick={() => {
                  setSelectedId(narrator.id);
                  setConfirmed(false);
                }}
                aria-current={active}
                aria-label={`${narrator.name}, ${narrator.role}`}
                title={`${narrator.name} · ${narrator.role}`}
                className={`relative aspect-square w-16 shrink-0 overflow-hidden rounded-full border-2 transition-all lg:w-24 ${
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
                  className="object-cover object-top"
                />
              </button>
            );
          })}
        </aside>

        {/* Center: the ship (no background). min-w-0 lets it shrink so the right
            panel never gets pushed off a narrow (phone-landscape) screen. */}
        <section className="relative min-h-0 min-w-0 flex-1">
          <Scene />
          <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[0.65rem] uppercase tracking-[0.2em] text-navy-soft lg:bottom-3 lg:text-xs">
            Drag to rotate · scroll to zoom
          </p>
          {selectedId && selectedSceneId && (
            <div className="pointer-events-auto absolute bottom-16 left-1/2 -translate-x-1/2">
              <Button
                className="w-80 justify-center"
                variant="primary"
                onClick={() => {
                  router.push(
                    `/explore/${selectedId}?scene=${selectedSceneId}`,
                  );
                }}
              >
                Start Voyage
              </Button>
            </div>
          )}
        </section>

        {/* Right: bio preview, then scenes — contained in a panel */}
       <aside className="absolute
        right-6
        top-24
        md:top-1/3
        flex
        flex-col">
       <SceneRail
          scenes={allScenes}
          variant="overview"
          currentId={selectedSceneId}
          onSelect={(sceneId) => {
            setSelectedSceneId(sceneId);
          }}
        />
      </aside>
      </div>
    </main>
  );
}
