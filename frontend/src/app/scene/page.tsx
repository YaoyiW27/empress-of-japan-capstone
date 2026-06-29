import Link from "next/link";
import type { Metadata } from "next";
import Scene from "@/components/three/Scene";

export const metadata: Metadata = {
  title: "3D Scene — Empress of Japan",
  description: "Placeholder R3F scene for the 3D track.",
};

/**
 * /scene — the 3D track's "hello world".
 *
 * Server Component shell: it sizes the viewport (the R3F <Canvas> fills its
 * parent) and renders a small overlay. The actual WebGL lives in the client
 * <Scene> component.
 */
export default function ScenePage() {
  return (
    <main className="relative h-dvh w-full bg-neutral-950">
      <Scene />

      <div className="pointer-events-none absolute left-0 top-0 p-6">
        <h1 className="text-xl font-semibold text-amber-400">3D Scene</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Drag to orbit · scroll to zoom
        </p>
        <Link
          href="/"
          className="pointer-events-auto mt-3 inline-block text-sm text-neutral-300 underline underline-offset-4 hover:text-amber-400"
        >
          ← Home
        </Link>
      </div>
    </main>
  );
}
