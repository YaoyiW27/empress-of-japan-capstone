"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTexture } from "@react-three/drei";
import PanoramaScene, { type LookMode } from "@/components/three/PanoramaScene";
import NarratorOverlay from "@/components/NarratorOverlay";
import SceneRail from "@/components/SceneRail";
import { ButtonLink } from "@/components/ui/Button";
import type { Narrator } from "@/lib/narrators";

/** iOS 13+ exposes requestPermission on the DeviceOrientationEvent constructor. */
type DeviceOrientationEventStatic = {
  requestPermission?: () => Promise<"granted" | "denied" | "default">;
};

function getDeviceOrientationEvent(): DeviceOrientationEventStatic | undefined {
  return (
    window as unknown as { DeviceOrientationEvent?: DeviceOrientationEventStatic }
  ).DeviceOrientationEvent;
}

/**
 * A narrator's storyline: one persistent panorama viewer whose scene swaps in
 * place (no remount), with the narrator present and a rail to move between that
 * narrator's scenes freely. On mobile you can look around by tilting the phone
 * (gyroscope); drag-to-look works everywhere as a fallback.
 */
export default function NarratorExperience({
  narrator,
}: {
  narrator: Narrator;
}) {
  // ?scene= opens at a specific panorama (set from the hub's scene picker).
  const initialSceneId = useSearchParams().get("scene") ?? undefined;
  const [currentId, setCurrentId] = useState(() =>
    narrator.scenes.some((scene) => scene.id === initialSceneId)
      ? initialSceneId!
      : narrator.scenes[0].id,
  );
  const current =
    narrator.scenes.find((scene) => scene.id === currentId) ??
    narrator.scenes[0];

  // Device-orientation support + default look mode, computed once. Reading
  // window here is safe: the route wraps this component in <Suspense> (for
  // useSearchParams), so it renders on the client.
  const [gyroSupported] = useState(
    () => typeof window !== "undefined" && Boolean(getDeviceOrientationEvent()),
  );
  const [lookMode, setLookMode] = useState<LookMode>(() => {
    if (typeof window === "undefined") return "drag";
    const doe = getDeviceOrientationEvent();
    if (!doe) return "drag";
    // iOS needs a permission tap (handled in toggleLook) → start in drag.
    // Touch devices without that requirement (Android) default to gyro.
    const needsPermission = typeof doe.requestPermission === "function";
    const isTouch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    return isTouch && !needsPermission ? "gyro" : "drag";
  });

  // Warm the texture cache so switching scenes is instant (no reload flash).
  useEffect(() => {
    useTexture.preload(narrator.scenes.map((scene) => scene.photoSrc));
  }, [narrator]);

  async function toggleLook() {
    if (lookMode === "gyro") {
      setLookMode("drag");
      return;
    }
    const doe = getDeviceOrientationEvent();
    // iOS: requestPermission MUST run synchronously inside this click gesture.
    if (doe && typeof doe.requestPermission === "function") {
      try {
        const res = await doe.requestPermission();
        setLookMode(res === "granted" ? "gyro" : "drag");
      } catch {
        setLookMode("drag");
      }
    } else {
      setLookMode("gyro");
    }
  }

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-navy">
      <div className="absolute inset-0">
        <PanoramaScene scene={current} mode={lookMode} />
      </div>

      {/* Top-left: back to guides + current scene title */}
      <div className="pointer-events-none absolute left-3 top-3 sm:left-6 sm:top-6">
        <div className="pointer-events-auto inline-flex flex-col items-start gap-1.5 rounded-md border border-brass/40 bg-card/85 px-3 py-2 shadow-lg backdrop-blur-sm lg:gap-2 lg:px-4 lg:py-3">
          <ButtonLink href="/explore" variant="ghost">
            ← Guides
          </ButtonLink>
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-brass">
              {narrator.role}
            </p>
            <h1 className="font-display text-lg font-bold text-navy lg:text-xl">
              {current.title}
            </h1>
          </div>
        </div>
      </div>

      {/* Right edge: look-mode toggle on top (tilt ↔ drag; on iOS the first tap
          also requests motion permission), scene switcher below. Stacking them
          means a long scene list never covers the toggle — the rail scrolls
          within its own space instead. */}
      <div className="pointer-events-none absolute bottom-3 right-3 top-3 flex flex-col items-end gap-3 sm:bottom-5 sm:right-5 sm:top-5">
        {gyroSupported && (
          <button
            type="button"
            onClick={toggleLook}
            aria-pressed={lookMode === "gyro"}
            className="pointer-events-auto shrink-0 rounded-full border border-brass/40 bg-card/90 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-navy shadow-md backdrop-blur-sm transition-colors hover:border-brass"
          >
            {lookMode === "gyro" ? "🖐 Drag view" : "🧭 Phone view"}
          </button>
        )}
        <div className="flex min-h-0 flex-1 items-start">
          <SceneRail
            scenes={narrator.scenes}
            currentId={currentId}
            onSelect={setCurrentId}
          />
        </div>
      </div>

      {/* Bottom-left: narrator */}
      <NarratorOverlay narrator={narrator} scene={current} />
    </main>
  );
}
