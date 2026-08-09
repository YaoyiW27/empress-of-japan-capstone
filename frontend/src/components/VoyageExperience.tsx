"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useTexture } from "@react-three/drei";

import PanoramaScene, {
  type LookMode,
} from "@/components/three/PanoramaScene";

import NarratorOverlay, {
  type NarratorInteractionStatus,
} from "@/components/NarratorOverlay";

import NarratorButton, {
  type NarratorId as NarratorButtonId,
} from "@/components/ui/NarratorButton";

import SceneButton from "@/components/ui/SceneButton";
import ShipMapOverlay from "@/components/ShipMapOverlay";
import OriginalPhotoOverlay from "@/components/OriginalPhotoOverlay";

import { Button } from "@/components/ui/Button";

import {
  BackButton,
  MapButton,
  PhotoButton,
} from "@/components/ui/NavButtons";

import { narrators, scenes } from "@/lib/scenes";

/**
 * sessionStorage flag: the one-time feature hints were already shown. Bump the
 * version whenever a hint is added, so a visitor who dismissed the old tour
 * still gets introduced to the new control.
 */
const HINTS_SEEN_KEY = "empress.voyage.hints.v2";

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

function getDeviceOrientationEvent():
  | DeviceOrientationEventStatic
  | undefined {
  return (
    window as unknown as {
      DeviceOrientationEvent?: DeviceOrientationEventStatic;
    }
  ).DeviceOrientationEvent;
}

function readGyroSupported() {
  try {
    return Boolean(getDeviceOrientationEvent());
  } catch {
    return false;
  }
}

function readDefaultLookMode(): LookMode {
  try {
    const deviceOrientationEvent = getDeviceOrientationEvent();

    if (!deviceOrientationEvent) {
      return "drag";
    }

    const needsPermission =
      typeof deviceOrientationEvent.requestPermission === "function";

    const isTouch =
      window.matchMedia?.("(pointer: coarse)").matches ?? false;

    return isTouch && !needsPermission ? "gyro" : "drag";
  } catch {
    return "drag";
  }
}

/**
 * The voyage experience keeps one panorama viewer mounted while the selected
 * narrator and scene change in place.
 *
 * The ship map and the scene's original archival photograph open as modal
 * overlays. While either is open, the Voyage interface beneath it becomes
 * inert and cannot receive pointer, keyboard, microphone, narrator,
 * scene-drawer, or panorama interactions.
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
    scenes.some((scene) => scene.id === sceneParam)
      ? sceneParam!
      : scenes[0].id,
  );

  const narrator =
    narrators.find((candidate) => candidate.id === narratorId) ??
    narrators[0];

  const scene =
    scenes.find((candidate) => candidate.id === sceneId) ??
    scenes[0];

  // Right-edge scene drawer.
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Full-screen ship map.
  const [mapOpen, setMapOpen] = useState(false);

  // Full-screen archival photograph for the current scene.
  const [photoOpen, setPhotoOpen] = useState(false);

  // Either full-screen overlay makes the Voyage interface beneath it inert.
  const overlayOpen = mapOpen || photoOpen;

  // Contains everything beneath the full-screen overlays.
  const voyageContentRef = useRef<HTMLDivElement>(null);

  const [narratorStatus, setNarratorStatus] =
    useState<NarratorInteractionStatus>("selected");

  // One-time feature hints.
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

  // Device-orientation support and default look mode.
  const gyroSupported = useSyncExternalStore(
    subscribeToNothing,
    readGyroSupported,
    () => false,
  );

  const defaultLookMode = useSyncExternalStore<LookMode>(
    subscribeToNothing,
    readDefaultLookMode,
    () => "drag",
  );

  const [lookModeOverride, setLookModeOverride] =
    useState<LookMode | null>(null);

  const lookMode = lookModeOverride ?? defaultLookMode;

  // Warm the texture cache once so switching scenes is instant.
  useEffect(() => {
    useTexture.preload(
      scenes.map((candidate) => candidate.photoSrc),
    );
  }, []);

  // Keep the current scene and narrator in the URL.
  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      `?scene=${sceneId}&narrator=${narratorId}`,
    );
  }, [sceneId, narratorId]);

  /*
   * Fully disable the Voyage interface underneath a full-screen overlay.
   *
   * inert prevents:
   * - clicking and tapping
   * - keyboard focus
   * - scene switching
   * - narrator switching
   * - microphone interaction
   * - panorama interaction
   */
  useEffect(() => {
    const voyageContent = voyageContentRef.current;

    if (!voyageContent) return;

    if (overlayOpen) {
      voyageContent.setAttribute("inert", "");
    } else {
      voyageContent.removeAttribute("inert");
    }

    return () => {
      voyageContent.removeAttribute("inert");
    };
  }, [overlayOpen]);

  async function toggleLook() {
    if (lookMode === "gyro") {
      setLookModeOverride("drag");
      return;
    }

    const deviceOrientationEvent = getDeviceOrientationEvent();

    // iOS requires requestPermission inside the click gesture.
    if (
      deviceOrientationEvent &&
      typeof deviceOrientationEvent.requestPermission === "function"
    ) {
      try {
        const result =
          await deviceOrientationEvent.requestPermission();

        setLookModeOverride(
          result === "granted" ? "gyro" : "drag",
        );
      } catch {
        setLookModeOverride("drag");
      }
    } else {
      setLookModeOverride("gyro");
    }
  }

  return (
    <main className="voyage-experience relative h-dvh w-full overflow-hidden bg-navy">
      {/*
       * Everything inside this wrapper becomes inert while a full-screen
       * overlay is open. ShipMapOverlay and OriginalPhotoOverlay must remain
       * outside this wrapper.
       */}
      <div
        ref={voyageContentRef}
        className="contents"
        aria-hidden={overlayOpen}
      >
        {/* Panorama */}
        <div className="absolute inset-0">
          <PanoramaScene scene={scene} mode={lookMode} />
        </div>

        {/* Top-left: back to the Explore hub */}
        <BackButton
          href="/explore"
          label="Back to the hub"
          className="voyage-experience__back absolute left-3 top-3 z-20 sm:left-6 sm:top-6"
        />

        {/* Top-center: current scene title */}
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 text-center sm:top-6">
          <h1 className="whitespace-nowrap text-ig-header text-light drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)] lg:text-5xl">
            {scene.title}
          </h1>
        </div>

        {/* Top-right: map button and look-mode control */}
        <div className="voyage-experience__top-controls absolute right-3 top-3 z-20 flex items-center gap-3 sm:right-6 sm:top-6">
          <MapButton
            label="Open ship map"
            onClick={() => setMapOpen(true)}
          />

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
              title={
                lookMode === "gyro"
                  ? "Drag to look around"
                  : "Tilt the phone to look around"
              }
              className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral text-navy-soft shadow-[0_0_8px_rgb(from_var(--color-navy)_r_g_b/50%)] backdrop-blur-sm transition-colors"
            >
              {lookMode === "gyro" ? (
                /* Hand icon: switch back to drag-to-look. */
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
                /* Phone icon: switch to device-orientation view. */
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
                  <rect
                    x="8"
                    y="3"
                    width="8"
                    height="18"
                    rx="2"
                  />

                  <path d="M4 9a6 6 0 0 0 0 6" />
                  <path d="M20 9a6 6 0 0 1 0 6" />
                </svg>
              )}
            </button>
          )}
        </div>

        {/* Narrator buttons */}
        <div className="voyage-experience__narrator-rail absolute left-3 top-[calc(50%-108px)] z-10 flex flex-row gap-4 sm:left-6 lg:top-[calc(50%-164px)] lg:gap-5">
          {narrators.map((candidate) => {
            const active = candidate.id === narratorId;

            return (
              <NarratorButton
                key={candidate.id}
                narrator={narratorButtonIds[candidate.id]}
                variant="scene"
                state={
                  active
                    ? narratorStatus
                    : "notSelected"
                }
                onClick={() => {
                  if (active) return;

                  setNarratorStatus("selected");
                  setNarratorId(candidate.id);
                }}
                label={`${candidate.name}, ${candidate.role}${
                  active ? ", selected" : ""
                }`}
              />
            );
          })}
        </div>

        {/* Current narrator avatar. dvh, not vh — do not revert: iOS vh is
            the toolbar-collapsed (largest) viewport, so a vh-sized cutout
            overflows upward while Safari's bars are showing and runs into
            the voice dock (the exact overlap from issue #193). */}
        <div className="voyage-experience__cutout absolute bottom-0 left-0 px-4 sm:px-6">
          <Image
            src={
              narrator.cutoutSrc ??
              narrator.portraitSrc
            }
            alt={narrator.name}
            width={400}
            height={600}
            priority
            className={`block h-[46dvh] w-auto object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]`}
          />
        </div>

        {/* Voice and transcript interface */}
        <NarratorOverlay
          key={narrator.id}
          narrator={narrator}
          scene={scene}
          onStatusChange={setNarratorStatus}
        />

        {/* Bottom-right: the scene's original archival photograph. The open
            scene drawer covers this corner, so the button steps aside for it
            instead of sitting under an opaque panel. */}
        {scene.originalPhotoSrc && (
          <PhotoButton
            label={`See the original photograph of the ${scene.title}`}
            title="See the original photograph"
            onClick={() => setPhotoOpen(true)}
            aria-hidden={drawerOpen}
            tabIndex={drawerOpen ? -1 : undefined}
            className={`voyage-experience__photo absolute bottom-3 right-3 z-20 transition-opacity duration-300 sm:bottom-6 sm:right-6 ${
              drawerOpen
                ? "pointer-events-none opacity-0"
                : "opacity-100"
            }`}
          />
        )}

        {/* Right-edge scene drawer. The closed-state slide distance is the
            single --scene-drawer-offset var (its lg value is a media-query
            redefinition in globals.css). Do not reintroduce a `-lg` variant:
            referencing an undefined var makes the whole translate invalid,
            so the drawer can never close on desktop. */}
        <div
          className={`voyage-experience__scene-drawer pointer-events-none absolute inset-y-0 right-0 z-20 flex items-center transition-transform duration-300 ease-out ${
            drawerOpen
              ? "translate-x-0"
              : "translate-x-[var(--scene-drawer-offset)]"
          }`}
        >
          <button
            type="button"
            onClick={() => {
              setDrawerOpen((current) => !current);
            }}
            aria-expanded={drawerOpen}
            aria-label={
              drawerOpen
                ? "Close scenes"
                : "Open scenes"
            }
            className="pointer-events-auto flex flex-col items-center gap-1.5 rounded-l-md bg-neutral px-2.5 py-4 text-navy shadow-md backdrop-blur-sm transition-colors hover:border-brass"
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

            <span className="text-ui-interaction flex flex-col items-center leading-none tracking-[0.18em] [writing-mode:vertical-rl]">
              SCENES
            </span>
          </button>

          <div className="voyage-experience__scene-list pointer-events-auto h-full w-56 overflow-y-auto bg-neutral/50 p-3 shadow-xl backdrop-blur-sm lg:w-64">
            <div className="flex flex-col items-center gap-2">
              {scenes.map((candidate) => {
                const active =
                  candidate.id === sceneId;

                return (
                  <SceneButton
                    key={candidate.id}
                    scene={candidate}
                    selected={active}
                    variant="panorama"
                    onClick={() => {
                      setSceneId(candidate.id);
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* First-visit interaction hints */}
        {hintsOpen && (
          <div
            role="dialog"
            aria-label="How to explore"
            className="absolute inset-0 z-30 bg-navy/70 backdrop-blur-[2px]"
            onClick={dismissHints}
          >
            <div className="voyage-hints__center absolute left-1/2 top-[35%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 text-center sm:top-1/2 sm:gap-4">
              <p className="font-display text-xl font-bold text-ivory drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)] sm:text-2xl lg:text-3xl">
                Drag to Look Around
              </p>

              <Button
                onClick={dismissHints}
                className="scale-90 sm:scale-100"
              >
                Got it
              </Button>
            </div>

            {/* 48dvh pairs with the cutout's 46dvh reference frame above. */}
            <p className="voyage-hints__guide absolute bottom-[48dvh] left-4 max-w-[38vw] rounded-md border border-brass/40 bg-card/95 px-3 py-1.5 text-xs font-semibold text-navy shadow-lg sm:left-6 sm:max-w-none sm:whitespace-nowrap">
              Tap Your Guide to Switch Narrator
            </p>

            {/* One label per top-right control, stacked under the cluster in
                the same order as the buttons themselves. */}
            <p className="voyage-hints__map absolute right-3 top-16 whitespace-nowrap rounded-md border border-brass/40 bg-card/95 px-3 py-1.5 text-xs font-semibold text-navy shadow-lg sm:right-6 sm:top-20">
              Open the Ship Map
            </p>

            {gyroSupported && (
              <p className="voyage-hints__look absolute right-3 top-[6.5rem] whitespace-nowrap rounded-md border border-brass/40 bg-card/95 px-3 py-1.5 text-xs font-semibold text-navy shadow-lg sm:right-6 sm:top-[7.5rem]">
                Drag / Tilt View
              </p>
            )}

            <p className="voyage-hints__scenes absolute right-12 top-[58%] max-w-[38vw] -translate-y-1/2 rounded-md border border-brass/40 bg-card/95 px-3 py-1.5 text-xs font-semibold text-navy shadow-lg sm:right-14 sm:top-1/2 sm:max-w-none sm:whitespace-nowrap">
              Browse Ship&apos;s Scenes Here
            </p>

            <p className="voyage-hints__mic absolute bottom-24 left-1/2 max-w-[85vw] -translate-x-1/2 rounded-md border border-brass/40 bg-card/95 px-3 py-1.5 text-center text-xs font-semibold text-navy shadow-lg sm:bottom-28 sm:max-w-none sm:whitespace-nowrap">
              Ask with the Mic · Read the Transcript
            </p>

            {/* Sits above the button rather than beside it: the mic hint owns
                the centre of this edge. */}
            {scene.originalPhotoSrc && (
              <p className="voyage-hints__photo absolute bottom-16 right-3 max-w-[52vw] rounded-md border border-brass/40 bg-card/95 px-3 py-1.5 text-xs font-semibold text-navy shadow-lg sm:bottom-20 sm:right-6 sm:max-w-none sm:whitespace-nowrap">
                See the Original Photo
              </p>
            )}
          </div>
        )}
      </div>

      {/*
       * These must remain outside voyageContentRef so that they do not become
       * inert along with the interface they sit above.
       */}
      <ShipMapOverlay
        scene={scene}
        open={mapOpen}
        onClose={() => setMapOpen(false)}
      />

      <OriginalPhotoOverlay
        scene={scene}
        open={photoOpen}
        onClose={() => setPhotoOpen(false)}
      />
    </main>
  );
}