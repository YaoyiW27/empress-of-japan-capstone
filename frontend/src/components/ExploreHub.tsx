"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Scene from "@/components/three/Scene";
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
  const [selectedId, setSelectedId] = useState(narrators[0].id);
  const [confirmed, setConfirmed] = useState(false);
  const selected =
    narrators.find((narrator) => narrator.id === selectedId) ?? narrators[0];

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
        </section>

        {/* Right: bio preview, then scenes — contained in a panel */}
        <aside className="flex w-64 shrink-0 flex-col lg:w-[24rem]">
          <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-brass/40 bg-card p-4 shadow-sm ring-1 ring-brass/10 lg:p-6">
            {!confirmed ? (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brass lg:text-base">
                    {selected.role}
                  </p>
                  <h2 className="mt-1 font-display text-2xl font-bold text-navy lg:mt-2 lg:text-4xl">
                    {selected.name}
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-navy-soft lg:mt-4 lg:text-lg">
                    {selected.bio}
                  </p>
                </div>
                <div className="mt-4 shrink-0 lg:mt-6">
                  <Button
                    onClick={() => setConfirmed(true)}
                    className="w-full justify-center"
                  >
                    Confirm →
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="shrink-0 text-xs font-semibold uppercase tracking-[0.22em] text-brass lg:text-base">
                  {selected.name} · Scenes
                </p>
                <ul className="mt-3 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-1 lg:gap-3">
                  {selected.scenes.map((scene) => (
                    <li key={scene.id}>
                      <Link
                        href={`/explore/${selected.id}?scene=${scene.id}`}
                        className="group flex items-center gap-3 rounded-md border border-brass/40 bg-ivory p-2 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brass hover:shadow-md lg:gap-4 lg:p-2.5"
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
                        <span className="font-display text-base font-semibold text-navy transition-colors group-hover:text-brass lg:text-xl">
                          {scene.title}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 shrink-0">
                  <Button variant="ghost" onClick={() => setConfirmed(false)}>
                    ← Change guide
                  </Button>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
