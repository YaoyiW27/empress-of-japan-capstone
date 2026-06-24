"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Scene from "@/components/three/Scene";
import { narrators } from "@/lib/narrators";
import { ButtonLink, Button } from "@/components/ui/Button";

/**
 * Guided hub: pick a narrator on the left, see the 3D ship in the center, and
 * read the selected narrator's bio on the right. Confirm to reveal that
 * narrator's scenes; picking one opens the experience at that panorama.
 */
export default function ExploreHub() {
  const [selectedId, setSelectedId] = useState(narrators[0].id);
  const [confirmed, setConfirmed] = useState(false);
  const selected =
    narrators.find((narrator) => narrator.id === selectedId) ?? narrators[0];

  return (
    <main className="flex h-dvh w-full flex-col bg-ivory px-5 py-4 sm:px-8 sm:py-6">
      <header>
        <ButtonLink href="/" variant="ghost">
          ← Home
        </ButtonLink>
      </header>

      <div className="mt-4 flex min-h-0 flex-1 gap-5">
        {/* Left: guides as circular portrait options */}
        <aside className="flex w-24 shrink-0 flex-col items-center justify-center gap-5 sm:w-32">
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
                className={`relative aspect-square w-20 shrink-0 overflow-hidden rounded-full border-2 transition-all sm:w-28 ${
                  active
                    ? "border-brass ring-2 ring-brass/50"
                    : "border-brass/40 opacity-70 hover:opacity-100 hover:scale-105"
                }`}
              >
                <Image
                  src={narrator.portraitSrc}
                  alt={narrator.name}
                  fill
                  sizes="(min-width: 640px) 112px, 80px"
                  className="object-cover object-top"
                />
              </button>
            );
          })}
        </aside>

        {/* Center: the ship (no background) */}
        <section className="relative min-h-0 flex-1">
          <Scene />
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs uppercase tracking-[0.2em] text-navy-soft">
            Drag to rotate · 3D model coming soon
          </p>
        </section>

        {/* Right: bio preview, then scenes — contained in a panel */}
        <aside className="flex w-80 shrink-0 flex-col sm:w-[26rem]">
          <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-brass/40 bg-card p-6 shadow-sm ring-1 ring-brass/10 sm:p-7">
            {!confirmed ? (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-brass sm:text-base">
                    {selected.role}
                  </p>
                  <h2 className="mt-2 font-display text-3xl font-bold text-navy sm:text-4xl">
                    {selected.name}
                  </h2>
                  <p className="mt-4 text-lg leading-relaxed text-navy-soft">
                    {selected.bio}
                  </p>
                </div>
                <div className="mt-6 shrink-0">
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
                <p className="shrink-0 text-sm font-semibold uppercase tracking-[0.22em] text-brass sm:text-base">
                  {selected.name} · Scenes
                </p>
                <ul className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
                  {selected.scenes.map((scene) => (
                    <li key={scene.id}>
                      <Link
                        href={`/explore/${selected.id}?scene=${scene.id}`}
                        className="group flex items-center gap-4 rounded-md border border-brass/40 bg-ivory p-2.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brass hover:shadow-md"
                      >
                        <span className="relative block h-14 w-24 shrink-0 overflow-hidden rounded-sm border border-brass/30">
                          <Image
                            src={scene.photoSrc}
                            alt={scene.title}
                            fill
                            sizes="96px"
                            className="object-cover"
                          />
                        </span>
                        <span className="font-display text-lg font-semibold text-navy transition-colors group-hover:text-brass sm:text-xl">
                          {scene.title}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="mt-5 shrink-0">
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
