"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useTexture } from "@react-three/drei";
import PanoramaScene, { type LookMode } from "@/components/three/PanoramaScene";
import NarratorOverlay from "@/components/NarratorOverlay";
import NarratorButton, {
  type NarratorId as NarratorButtonId,
} from "@/components/ui/NarratorButton";
import { Button, CircleBackLink } from "@/components/ui/Button";
import { narrators, scenes } from "@/lib/scenes";

/** sessionStorage flag: the one-time feature hints were already shown. */
const HINTS_SEEN_KEY = "empress.voyage.hints.v1";

/** Maps backend persona ids to the shorter ids used by NarratorButton assets. */
const narratorButtonIds: Record<string, NarratorButtonId> = {
  captain_sinclair: "sinclair",
  eleanor_whitmore: "whitmore",
  ming_chen: "ming",
};

/** The flag never changes behind React's back, so subscribing is a no-op. */
function subscribeToNothing() {
  return () => {};
}

function readHintsSeen() {
  try {
    return Boolean(window.sessionStorage.getItem(HINTS_SEEN_KEY));
  } catch {
    // Storage blocked — treat as unseen and show the hints once per mount.
    return false;
  }
}

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
 * The voyage: one persistent panorama viewer where both halves of the pair —
 * narrator and scene — switch in place (no remount, no navigation). The pair
 * arrives as ?scene= & ?narrator= from the hub; switching updates the address
 * bar via history.replaceState so the link stays shareable. On mobile you can
 * look around by tilting the phone (gyroscope); drag-to-look works everywhere.
 */
export default function VoyageExperience() {
  const params = useSearchParams();
  const narratorParam = params.get("narrator");
  const sceneParam = params.get("scene");

  const [narratorId, setNarratorId] = useState(() =>
    narrators.some((narrator) => narrator.id === narratorParam)
      ? narratorParam!
      : narrators[0].id,
  );
  const [sceneId, setSceneId] = useState(() =>
    scenes.some((scene) => scene.id === sceneParam) ? sceneParam! : scenes[0].id,
  );
  const narrator =
    narrators.find((candidate) => candidate.id === narratorId) ?? narrators[0];
  const scene = scenes.find((candidate) => candidate.id === sceneId) ?? scenes[0];

  // Right-edge scene drawer, opened from its persistent handle.
  const [drawerOpen, setDrawerOpen] = useState(false);

  // One-time feature hints. useSyncExternalStore reads the flag with a
  // server snapshot of "seen", so SSR renders no overlay and the client
  // reveals it right after hydration — no mismatch, no effect-set-state.
  const hintsSeen = useSyncExternalStore(
    subscribeToNothing,
    readHintsSeen,
    () => true,
  );
  const [hintsDismissed, setHintsDismissed] = useState(false);
  const hintsOpen = !hintsSeen && !hintsDismissed;

  function dismissHints() {
    setHintsDismissed(true);
    try {
      window.sessionStorage.setItem(HINTS_SEEN_KEY, "seen");
    } catch {
      // Best effort; without storage the hints return next visit.
    }
  }

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

  // Warm the texture cache once so switching scenes is instant (no reload flash).
  useEffect(() => {
    useTexture.preload(scenes.map((candidate) => candidate.photoSrc));
  }, []);

  // Keep the address bar shareable without triggering a navigation.
  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      `?scene=${sceneId}&narrator=${narratorId}`,
    );
  }, [sceneId, narratorId]);

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
        <PanoramaScene scene={scene} mode={lookMode} />
      </div>

      {/* Top-left: circular back button to the hub */}
      <CircleBackLink
        href="/explore"
        label="Back to the hub"
        className="absolute left-3 top-3 sm:left-6 sm:top-6"
      />

      {/* Top-center: current scene title */}
      <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 text-center sm:top-6">
        <h1 className="font-display text-4xl font-bold text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)] lg:text-5xl">
          {scene.title}
        </h1>
      </div>

      {/* Top-right: look-mode toggle (tilt ↔ drag; on iOS the first tap also
          requests motion permission). */}
      {gyroSupported && (
        <button
          type="button"
          onClick={toggleLook}
          aria-pressed={lookMode === "gyro"}
          aria-label={
            lookMode === "gyro" ? "Switch to drag view" : "Switch to phone view"
          }
          title={
            lookMode === "gyro"
              ? "Drag to look around"
              : "Tilt the phone to look around"
          }
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full border border-brass/40 bg-card/90 text-navy shadow-md backdrop-blur-sm transition-colors hover:border-brass sm:right-5 sm:top-5"
        >
          {lookMode === "gyro" ? (
            /* Hand: tap to go back to drag-to-look. */
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M18 11V6a2 2 0 0 0-4 0v5" />
              <path d="M14 10V4a2 2 0 0 0-4 0v2" />
              <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
              <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
            </svg>
          ) : (
            /* Phone with motion arcs: tap to look around by tilting. */
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <rect x="8" y="3" width="8" height="18" rx="2" />
              <path d="M4 9a6 6 0 0 0 0 6" />
              <path d="M20 9a6 6 0 0 1 0 6" />
            </svg>
          )}
        </button>
      )}

      {/* Narrator buttons — always visible in their existing position. Voice
          states will be supplied by NarratorOverlay once its status callback
          is connected; for now the active guide is selected and the rest use
          their default appearance. */}
      <div className="absolute left-3 top-[calc(50%-108px)] z-10 flex flex-row gap-3 sm:left-6 lg:top-[calc(50%-164px)] lg:gap-5">
        {narrators.map((candidate) => {
          const active = candidate.id === narratorId;

          return (
            <NarratorButton
              key={candidate.id}
              narrator={narratorButtonIds[candidate.id]}
              variant="scene"
              state={active ? "selected" : "notSelected"}
              onClick={() => setNarratorId(candidate.id)}
              label={`${candidate.name}, ${candidate.role}${
                active ? ", selected" : ""
              }`}
            />
          );
        })}
      </div>

      {/* Current narrator avatar — always visible at the bottom-left */}
      <div className="absolute bottom-0 left-0 px-4 sm:px-6">
        <Image
          src={narrator.cutoutSrc ?? narrator.portraitSrc}
          alt={narrator.name}
          width={400}
          height={600}
          className={`block h-[46vh] w-auto object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)] ${
            narrator.id === "captain_sinclair" ? "translate-y-[5.6%]" : ""
          }`}
        />
      </div>

      {/* Bottom-center: voice dock (mic + collapsible transcript). Keyed by
          narrator so a guide switch resets the conversation panel. */}
      <NarratorOverlay key={narrator.id} narrator={narrator} scene={scene} />

      {/* Right-edge scene drawer: a persistent vertical "Scenes" handle; the
          thumbnail list slides out beside it. The panorama stays live behind
          it, so picking a scene previews instantly — the drawer stays open
          for flipping through and closes from the same handle. */}
      <div
        className={`pointer-events-none absolute inset-y-0 right-0 z-20 flex items-center transition-transform duration-300 ease-out ${
          drawerOpen ? "translate-x-0" : "translate-x-56 lg:translate-x-64"
        }`}
      >
        <button
          type="button"
          onClick={() => setDrawerOpen((v) => !v)}
          aria-expanded={drawerOpen}
          aria-label={drawerOpen ? "Close scenes" : "Open scenes"}
          className="pointer-events-auto flex flex-col items-center gap-1.5 rounded-l-md border border-r-0 border-brass/40 bg-card/90 px-2.5 py-4 text-navy shadow-md backdrop-blur-sm transition-colors hover:border-brass"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-4 w-4 transition-transform duration-300 ${
              drawerOpen ? "rotate-180" : ""
            }`}
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
          <span className="text-xs font-semibold uppercase leading-none tracking-[0.18em] [writing-mode:vertical-rl]">
            Scenes
          </span>
        </button>
        <div className="pointer-events-auto h-full w-56 overflow-y-auto border-l border-brass/40 bg-card/95 p-3 shadow-xl backdrop-blur-sm lg:w-64">
          <div className="flex flex-col gap-2">
            {scenes.map((candidate) => {
              const active = candidate.id === sceneId;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => setSceneId(candidate.id)}
                  aria-current={active}
                  className={`flex w-full items-center gap-2.5 rounded-md border p-1.5 text-left shadow-sm transition-colors ${
                    active
                      ? "border-brass bg-navy"
                      : "border-brass/40 bg-ivory hover:border-brass"
                  }`}
                >
                  <span className="relative block h-11 w-16 shrink-0 overflow-hidden rounded-sm border border-brass/30">
                    <Image
                      src={candidate.photoSrc}
                      alt={candidate.title}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  </span>
                  <span
                    className={`font-display text-sm font-semibold ${
                      active ? "text-ivory" : "text-navy"
                    }`}
                  >
                    {candidate.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* First-visit hints: dimmed layer with a short callout beside each
          interactive control. Any tap dismisses; sessionStorage keeps it to
          once per visit (fresh for each museum visitor). */}
      {hintsOpen && (
        <div
          role="dialog"
          aria-label="How to explore"
          className="absolute inset-0 z-30 bg-navy/70 backdrop-blur-[2px]"
          onClick={dismissHints}
        >
          {/* Phones are too narrow for the side callouts and this block to
              share the middle band. Below sm: the centerpiece shrinks and
              moves up to 35%, the scene callout drops to 58%, and the nowrap
              callouts become width-capped wrapping strips hugging their
              edges — vertical bands separate center from sides, horizontal
              caps separate the sides from each other. */}
          <div className="absolute left-1/2 top-[35%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 text-center sm:top-1/2 sm:gap-4">
            <p className="font-display text-xl font-bold text-ivory drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)] sm:text-2xl lg:text-3xl">
              Drag to Look Around
            </p>
            <Button onClick={dismissHints} className="scale-90 sm:scale-100">
              Got it
            </Button>
          </div>

          <p className="absolute bottom-[48vh] left-4 max-w-[38vw] rounded-md border border-brass/40 bg-card/95 px-3 py-1.5 text-xs font-semibold text-navy shadow-lg sm:left-6 sm:max-w-none sm:whitespace-nowrap">
            Tap Your Guide to Switch Narrator
          </p>

          {gyroSupported && (
            <p className="absolute right-16 top-4 whitespace-nowrap rounded-md border border-brass/40 bg-card/95 px-3 py-1.5 text-xs font-semibold text-navy shadow-lg sm:right-20 sm:top-6">
              Drag / Tilt View
            </p>
          )}

          <p className="absolute right-12 top-[58%] max-w-[38vw] -translate-y-1/2 rounded-md border border-brass/40 bg-card/95 px-3 py-1.5 text-xs font-semibold text-navy shadow-lg sm:right-14 sm:top-1/2 sm:max-w-none sm:whitespace-nowrap">
            Browse Ship&apos;s Scenes Here
          </p>

          <p className="absolute bottom-24 left-1/2 max-w-[85vw] -translate-x-1/2 rounded-md border border-brass/40 bg-card/95 px-3 py-1.5 text-center text-xs font-semibold text-navy shadow-lg sm:bottom-28 sm:max-w-none sm:whitespace-nowrap">
            Ask with the Mic · Read the Transcript
          </p>
        </div>
      )}
    </main>
  );
}
