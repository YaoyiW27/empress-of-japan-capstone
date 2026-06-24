"use client";

import { useState } from "react";
import Image from "next/image";
import type { Narrator } from "@/lib/narrators";

/**
 * The in-scene narrator: a standing cut-out figure (or a framed portrait while
 * the cut-out is pending) plus a collapsible speech bubble. Collapsed by default
 * to a tappable figure + name chip; tap the figure or ✕ to toggle.
 *
 * The container is pointer-events-none so it never steals drag-to-look from the
 * canvas; only the figure and bubble re-enable pointer events.
 */
export default function NarratorOverlay({
  narrator,
}: {
  narrator: Narrator;
}) {
  const [open, setOpen] = useState(false);
  const hasCutout = Boolean(narrator.cutoutSrc);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-3 p-4 sm:p-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? `Collapse ${narrator.name}` : `Talk to ${narrator.name}`}
        className="pointer-events-auto shrink-0"
      >
        {hasCutout ? (
          <Image
            src={narrator.cutoutSrc!}
            alt={narrator.name}
            width={400}
            height={600}
            priority
            className="h-[46vh] w-auto object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-transform hover:scale-[1.02]"
          />
        ) : (
          <span className="block h-28 w-20 overflow-hidden rounded-md border-2 border-brass bg-card shadow-lg transition-transform hover:scale-105">
            <Image
              src={narrator.portraitSrc}
              alt={narrator.name}
              width={160}
              height={240}
              className="h-full w-full object-cover"
            />
          </span>
        )}
      </button>

      {open ? (
        <div className="pointer-events-auto mb-2 max-w-md rounded-md border border-brass/40 bg-card/90 px-4 py-3 shadow-lg backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-display text-sm font-bold uppercase tracking-[0.18em] text-brass">
                {narrator.name}
              </p>
              <p className="text-[0.65rem] uppercase tracking-wide text-navy-soft">
                {narrator.role}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Collapse"
              className="-mr-1 -mt-0.5 px-1 text-navy-soft transition-colors hover:text-vermilion"
            >
              ✕
            </button>
          </div>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-navy">
            {narrator.bio}
          </p>
          <button
            type="button"
            disabled
            className="mt-3 inline-flex items-center gap-1.5 rounded-sm border border-brass/40 bg-ivory px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-navy-soft disabled:cursor-not-allowed"
            title="Voice interaction coming soon"
          >
            🎤 Talk (coming soon)
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="pointer-events-auto mb-2 inline-flex items-center gap-1.5 rounded-full border border-brass/40 bg-card/90 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-navy shadow backdrop-blur-sm transition-colors hover:text-brass"
        >
          {narrator.name}
          <span aria-hidden>▸</span>
        </button>
      )}
    </div>
  );
}
