"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTexture } from "@react-three/drei";
import PanoramaScene, { type LookMode } from "@/components/three/PanoramaScene";
import NarratorOverlay from "@/components/NarratorOverlay";
import SceneRail from "@/components/SceneRail";
import { ButtonLink } from "@/components/ui/Button";
import { NavButtonLink } from "@/components/ui/NavButtons";
import ChatTranscript, {
  type TranscriptMessage,
} from "@/components/ui/ChatTranscript";
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
  const [gyroSupported, setGyroSupported] = useState(false);
  const [lookMode, setLookMode] = useState<LookMode>("drag");
  const transcriptMessages: TranscriptMessage[] = [];

  useEffect(() => {
    const doe = getDeviceOrientationEvent();

    if (!doe) {
      setGyroSupported(false);
      return;
    }

    setGyroSupported(true);

    const needsPermission = typeof doe.requestPermission === "function";
    const isTouch =
      window.matchMedia?.("(pointer: coarse)").matches ?? false;

    if (isTouch && !needsPermission) {
      setLookMode("gyro");
    }
  }, []);

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
      {/* Panorama */}
      <div className="absolute inset-0">
        <PanoramaScene scene={current} mode={lookMode} />
      </div>
  
      {/* UI overlay */}
      <div className="pointer-events-none absolute inset-0 z-10">
        {/* Back button */}
        <div className="pointer-events-auto absolute left-5 top-5">
          <NavButtonLink
            href="/explore"
            icon="back"
            label="Return to ship overview"
          />
        </div>
  
        {/* Current scene title */}
        <h1
          className="text-ig-header absolute left-1/2 top-5 -translate-x-1/2 whitespace-nowrap text-center"
        >
          {current.title}
        </h1>

        {/* View control */}
        {gyroSupported && (
          <button
            type="button"
            onClick={toggleLook}
            aria-pressed={lookMode === "gyro"}
            aria-label={
              lookMode === "gyro"
                ? "Switch to drag view"
                : "Switch to phone view"
            }
            className="ui-view-toggle pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            {lookMode === "gyro" ? "Drag View" : "Phone View"}
          </button>
        )}
        {/* Map button */}
        <div className="pointer-events-auto absolute right-5 top-5">
          <NavButtonLink
            href="/"
            icon="map"
            label="Open ship map"
            onClick={() => {
              // Map behavior goes here.
            }}
          />
        </div>
        {/* Scene navigation */}
        <div className="pointer-events-auto absolute right-5 top-1/2 max-h-[68vh] -translate-y-1/2">
          <SceneRail
            scenes={narrator.scenes}
            currentId={currentId}
            onSelect={setCurrentId}
            variant="panorama"
          />
        </div>
  
        {/* Transcript placeholder */}
        <ChatTranscript messages={transcriptMessages} />
      </div>
    </main>
  );
}
