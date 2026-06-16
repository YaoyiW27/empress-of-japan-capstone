import Link from "next/link";
import { scenes } from "@/lib/scenes";

/**
 * Side panel on the ship hub: one button per experience scene, linking into
 * the magic-window route. Driven entirely by the scenes manifest.
 */
export default function SceneSelector() {
  return (
    <nav className="w-full max-w-xs">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Choose a scene
      </h2>
      <ul className="flex flex-col gap-2">
        {scenes.map((scene) => (
          <li key={scene.id}>
            <Link
              href={`/explore/${scene.id}`}
              className="block rounded-xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 transition-colors hover:border-amber-400/60 hover:bg-neutral-800"
            >
              <span className="block font-medium text-amber-400">
                {scene.title}
              </span>
              {scene.blurb && (
                <span className="mt-0.5 block text-sm text-neutral-400">
                  {scene.blurb}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
