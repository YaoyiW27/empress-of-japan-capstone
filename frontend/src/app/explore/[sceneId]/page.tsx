import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getScene, scenes } from "@/lib/scenes";
import PanoramaScene from "@/components/three/PanoramaScene";
import NarratorOverlay from "@/components/NarratorOverlay";

type Params = { params: Promise<{ sceneId: string }> };

/** Prerender every scene in the manifest. */
export function generateStaticParams() {
  return scenes.map((scene) => ({ sceneId: scene.id }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { sceneId } = await params;
  const scene = getScene(sceneId);
  return {
    title: scene
      ? `${scene.title} — Empress of Japan`
      : "Scene not found — Empress of Japan",
  };
}

/**
 * A single experience scene: the magic-window panorama fills the view, with the
 * 2D narrator overlaid and a link back to the ship hub. Landscape is enforced by
 * the /explore layout's OrientationGate.
 */
export default async function ExperienceScenePage({ params }: Params) {
  const { sceneId } = await params;
  const scene = getScene(sceneId);
  if (!scene) notFound();

  return (
    <main className="relative h-screen w-full overflow-hidden bg-neutral-950">
      <div className="absolute inset-0">
        <PanoramaScene scene={scene} />
      </div>

      <div className="pointer-events-none absolute left-0 top-0 p-4 sm:p-6">
        <Link
          href="/explore"
          className="pointer-events-auto inline-block text-sm text-neutral-200 underline underline-offset-4 hover:text-amber-400"
        >
          ← Back to ship
        </Link>
        <h1 className="mt-2 text-lg font-semibold text-amber-400 drop-shadow">
          {scene.title}
        </h1>
      </div>

      <NarratorOverlay narrator={scene.narrator} />
    </main>
  );
}
