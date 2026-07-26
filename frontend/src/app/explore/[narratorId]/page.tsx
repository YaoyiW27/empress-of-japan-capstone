import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleBackLink } from "@/components/ui/Button";
import { getNarrator, getScene, narrators, type Scene } from "@/lib/scenes";

type RouteParams = { narratorId: string };

/** Prerender a page for each narrator. */
export function generateStaticParams() {
  return narrators.map((narrator) => ({ narratorId: narrator.id }));
}

// Static export ships only the narrators returned above; any other id is a 404.
// (A static export cannot render unknown params on demand.)
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { narratorId } = await params;
  const narrator = getNarrator(narratorId);
  return {
    title: narrator
      ? `${narrator.name} — Empress of Japan`
      : "Guide not found — Empress of Japan",
    description: narrator?.blurb,
  };
}

/**
 * Narrator biography: blurred signature-scene backdrop, the full-body cut-out
 * (bottom edge cropped by the viewport, per Figma), and the narrator's
 * featured scenes. Picking a scene returns to the hub with both the narrator
 * and that scene preselected; the back button returns keeping the narrator.
 * Fully static — no client state, so no Suspense needed. Landscape is
 * enforced by the /explore layout's OrientationGate.
 */
export default async function NarratorBioPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { narratorId } = await params;
  const narrator = getNarrator(narratorId);
  if (!narrator) notFound();

  const featuredScenes = narrator.sceneIds
    .map((sceneId) => getScene(sceneId))
    .filter((scene): scene is Scene => scene !== undefined);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-navy">
      {/* Blurred signature scene + scrim (darker on the text side). */}
      <Image
        src={narrator.bioBackdropSrc}
        alt=""
        fill
        priority
        sizes="100vw"
        className="scale-110 object-cover blur-lg"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-navy/25 via-navy/35 to-navy/55" />

      {/* Same spot as the hub's back button, for cross-page consistency. */}
      <CircleBackLink
        href={`/explore?narrator=${narrator.id}`}
        label="Back to the ship hub"
        className="absolute left-6 top-6 z-20"
      />

      {/* Oversized so the figure crops to waist-up at the viewport's bottom
          edge (per Figma); overflow-hidden on <main> clips the rest. */}
      <Image
        src={narrator.bioPortraitSrc}
        alt=""
        width={800}
        height={800}
        priority
        className="pointer-events-none absolute left-[21vw] top-[2dvh] h-[190dvh] w-auto max-w-none -translate-x-1/2 select-none [filter:drop-shadow(0_0_28px_rgb(from_var(--color-ai)_r_g_b_/_30%))]"
      />

      <section className="relative z-10 ml-auto flex h-full w-[56%] flex-col justify-center gap-3 pr-[5vw] lg:gap-5">
        <h1 className="font-display text-4xl font-extrabold uppercase tracking-wide text-ivory [text-shadow:0_2px_12px_rgb(from_var(--color-navy)_r_g_b_/_60%)] lg:text-6xl">
          {narrator.name}
        </h1>

        <p className="max-w-2xl text-sm leading-relaxed text-ivory/90 lg:text-lg">
          {narrator.bio}
        </p>

        <ul className="mt-1 grid max-w-2xl grid-cols-2 gap-3 lg:mt-2 lg:gap-4">
          {featuredScenes.map((scene) => (
            <li key={scene.id}>
              <Link
                href={`/explore?narrator=${narrator.id}&scene=${scene.id}`}
                className="flex h-11 items-center justify-center rounded-xl border-2 border-ivory/90 bg-gradient-to-b from-card to-brass-soft px-3 text-center text-sm font-bold tracking-wide text-brass shadow-[0_2px_10px_rgb(from_var(--color-navy)_r_g_b_/_45%)] transition-[transform,filter] duration-200 hover:scale-[1.03] hover:brightness-105 lg:h-14 lg:text-lg"
              >
                {scene.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
