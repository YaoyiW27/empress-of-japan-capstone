import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getNarrator, narrators } from "@/lib/narrators";
import NarratorExperience from "@/components/NarratorExperience";

type RouteParams = { narratorId: string };

/** Prerender a shell for each narrator. */
export function generateStaticParams() {
  return narrators.map((narrator) => ({ narratorId: narrator.id }));
}

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
  };
}

/**
 * A narrator's storyline. Static server shell (generateStaticParams prerenders
 * each narrator); the interactive experience lives in the client
 * NarratorExperience, which reads `?scene=` to open at a specific panorama.
 * Wrapped in Suspense because that client uses useSearchParams (keeps the route
 * static instead of opting into dynamic rendering). Landscape is enforced by the
 * /explore layout's OrientationGate.
 */
export default async function NarratorPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { narratorId } = await params;
  const narrator = getNarrator(narratorId);
  if (!narrator) notFound();

  return (
    <Suspense fallback={null}>
      <NarratorExperience narrator={narrator} />
    </Suspense>
  );
}
