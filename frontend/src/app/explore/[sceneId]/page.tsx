import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import SceneExperience from "@/components/SceneExperience";
import {
  getScene,
  scenes,
} from "@/lib/scenes";

type RouteParams = {
  sceneId: string;
};

export function generateStaticParams() {
  return scenes.map((scene) => ({
    sceneId: scene.id,
  }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { sceneId } = await params;
  const scene = getScene(sceneId);

  return {
    title: scene
      ? `${scene.title} — Empress of Japan`
      : "Scene not found — Empress of Japan",
  };
}

export default async function ScenePage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { sceneId } = await params;
  const scene = getScene(sceneId);

  if (!scene) {
    notFound();
  }

  return (
    <Suspense fallback={null}>
      <SceneExperience scene={scene} />
    </Suspense>
  );
}