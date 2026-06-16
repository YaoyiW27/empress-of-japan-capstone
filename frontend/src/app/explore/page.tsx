import Link from "next/link";
import type { Metadata } from "next";
import Scene from "@/components/three/Scene";
import SceneSelector from "@/components/SceneSelector";

export const metadata: Metadata = {
  title: "Explore the Ship — Empress of Japan",
  description: "Choose an experience aboard the Empress of Japan.",
};

/**
 * Ship hub: the 3D ship (cube placeholder for now) fills the view, with a
 * scene-selection panel overlaid. The overlay is pointer-events-none so the
 * ship stays draggable; only the controls within it are interactive.
 */
export default function ExplorePage() {
  return (
    <main className="relative h-screen w-full overflow-hidden bg-neutral-950">
      <div className="absolute inset-0">
        <Scene />
      </div>

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-6">
        <div>
          <Link
            href="/"
            className="pointer-events-auto inline-block text-sm text-neutral-200 underline underline-offset-4 hover:text-amber-400"
          >
            ← Home
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-amber-400 drop-shadow">
            Empress of Japan
          </h1>
          <p className="text-sm text-neutral-400">Tap a scene to step aboard</p>
        </div>

        <div className="pointer-events-auto self-end">
          <SceneSelector />
        </div>
      </div>
    </main>
  );
}
