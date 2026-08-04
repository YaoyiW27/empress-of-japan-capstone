import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { CircleBackLink } from "@/components/ui/Button";
import SceneButton from "@/components/ui/SceneButton";
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
 * Narrator biography: blurred signature-scene backdrop, the narrator's
 * profile photo (same imagery as the voyage overlay) in a brass frame, and
 * their featured scenes. Picking a scene returns to the hub with both the
 * narrator and that scene preselected; the back button returns keeping the
 * narrator. Fully static — no client state, so no Suspense needed. Landscape
 * is enforced by the /explore layout's OrientationGate.
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
    <main className="narrator-bio relative flex h-dvh w-full overflow-hidden bg-navy">
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

      {/* Left: the narrator's cut-out standing at the bottom edge — the same
          image and stance as the voyage overlay's avatar. */}
      <div className="relative z-10 flex w-[40%] shrink-0 items-end justify-center">
        <Image
          src={narrator.cutoutSrc ?? narrator.portraitSrc}
          alt={`${narrator.name} portrait`}
          width={800}
          height={800}
          priority
          className="h-[75dvh] w-auto max-w-full object-contain object-bottom drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)] lg:h-[82dvh]"
        />
      </div>

      {/* The column scrolls when the bio outgrows a short phone-landscape
          viewport (issue #193: the bottom used to be unreachable). my-auto on
          the inner block — not justify-center on the scroller — because a
          centered flex child that overflows its scroll container clips its
          top edge out of scroll range; auto margins center only when the
          content fits and collapse to 0 when it doesn't. */}
      <section className="narrator-bio__content relative z-10 flex h-full min-w-0 flex-1 flex-col overflow-y-auto pl-[2vw] pr-[5vw]">
        <div className="narrator-bio__body my-auto flex min-w-0 flex-col gap-3 py-4 lg:gap-5">
          <h1 className="font-display text-4xl font-extrabold uppercase tracking-wide text-ivory [text-shadow:0_2px_12px_rgb(from_var(--color-navy)_r_g_b_/_60%)] lg:text-6xl">
            {narrator.name}
          </h1>

          <p className="max-w-2xl text-sm leading-relaxed text-ivory/90 lg:text-lg">
            {narrator.bio}
          </p>

          <p className="mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-brass lg:mt-2 lg:text-xs">
            Recommended Scenes
          </p>

          {/* Same SceneButton as the hub rail / voyage drawer, in link form —
              picking one lands on the hub with narrator + scene preselected. */}
          <ul className="grid max-w-md grid-cols-2 gap-3 lg:gap-4">
            {featuredScenes.map((scene) => (
              <li key={scene.id}>
                <SceneButton
                  scene={scene}
                  selected={false}
                  variant="overview"
                  href={`/explore?narrator=${narrator.id}&scene=${scene.id}`}
                />
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
