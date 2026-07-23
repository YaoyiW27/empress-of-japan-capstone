"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTexture } from "@react-three/drei";

import PanoramaScene, {
  type LookMode,
} from "@/components/three/PanoramaScene";
import SceneRail from "@/components/SceneRail";
import { NavButtonLink } from "@/components/ui/NavButtons";
import ChatTranscript, {
  type TranscriptMessage,
} from "@/components/ui/ChatTranscript";
import NarratorButton, {
  type NarratorId,
  type SceneNarratorState,
} from "@/components/ui/NarratorButton";
import type { Narrator } from "@/lib/narrators";
import {
  getOrCreateTabChatSession,
  sendChatMessage,
  type ChatHistoryTurn,
} from "@/lib/chat";
import { synthesizeNarratorVoice } from "@/lib/voice";

type SpeechRecognitionConstructor = new () => SpeechRecognition;

type SpeechRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEvent = {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

/** UI-only narrator id (button/asset naming) -> real backend persona id. */
const uiIdToPersonaId: Record<NarratorId, string> = {
  sinclair: "captain_sinclair",
  whitmore: "eleanor_whitmore",
  ming: "ming_chen",
};

/** iOS 13+ exposes requestPermission on the DeviceOrientationEvent constructor. */
type DeviceOrientationEventStatic = {
  requestPermission?: () => Promise<
    "granted" | "denied" | "default"
  >;
};

type NarratorStates = Record<
  NarratorId,
  SceneNarratorState
>;

const narratorOrder: NarratorId[] = [
  "whitmore",
  "sinclair",
  "ming",
];

const initialNarratorStates: NarratorStates = {
  whitmore: "default",
  sinclair: "default",
  ming: "default",
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

/**
 * A narrator's storyline: one persistent panorama viewer whose scene swaps in
 * place (no remount), with a rail to move between that narrator's scenes freely.
 * On mobile you can look around by tilting the phone; drag-to-look works
 * everywhere as a fallback.
 */
export default function NarratorExperience({
  narrator,
}: {
  narrator: Narrator;
}) {
  // ?scene= opens at a specific panorama from the hub.
  const initialSceneId =
    useSearchParams().get("scene") ?? undefined;

  const [currentId, setCurrentId] = useState(() =>
    narrator.scenes.some(
      (scene) => scene.id === initialSceneId,
    )
      ? initialSceneId!
      : narrator.scenes[0].id,
  );

  const current =
    narrator.scenes.find(
      (scene) => scene.id === currentId,
    ) ?? narrator.scenes[0];

  const [gyroSupported, setGyroSupported] =
    useState(false);

  const [lookMode, setLookMode] =
    useState<LookMode>("drag");

  const [narratorStates, setNarratorStates] =
    useState<NarratorStates>(
      initialNarratorStates,
    );

  // Real conversation state for the current page's narrator only — the
  // other two narrator buttons don't have their own Narrator data (bio,
  // backend scene id) passed into this component yet, so they stay on the
  // placeholder simulation below until that's wired up.
  const [history, setHistory] =
    useState<ChatHistoryTurn[]>([]);

  const isMountedRef = useRef(true);
  const audioRef =
    useRef<HTMLAudioElement | null>(null);
  const recognitionRef =
    useRef<SpeechRecognition | null>(null);

  const currentNarratorUiId = (
    Object.keys(uiIdToPersonaId) as NarratorId[]
  ).find(
    (uiId) =>
      uiIdToPersonaId[uiId] === narrator.id,
  );

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      recognitionRef.current?.stop();
      recognitionRef.current = null;

      audioRef.current?.pause();
      audioRef.current = null;

      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const transcriptMessages: TranscriptMessage[] =
    history.map((turn, index) => ({
      id: `${index}`,
      speaker:
        turn.role === "user"
          ? "You"
          : narrator.name,
      text: turn.content,
      narratorId:
        turn.role === "assistant"
          ? currentNarratorUiId
          : undefined,
    }));

  function speakWithBrowserFallback(
    text: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!("speechSynthesis" in window)) {
        resolve();
        return;
      }

      window.speechSynthesis.cancel();

      const utterance =
        new SpeechSynthesisUtterance(text);

      utterance.onend = () => {
        resolve();
      };

      utterance.onerror = () => {
        reject(
          new Error(
            "Browser speech synthesis failed.",
          ),
        );
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  async function speak(
    text: string,
  ): Promise<void> {
    audioRef.current?.pause();
    audioRef.current = null;

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    try {
      const { audio_url } =
        await synthesizeNarratorVoice({
          narratorId: narrator.id,
          text,
        });

      if (!isMountedRef.current) {
        return;
      }

      const audio = new Audio(audio_url);
      audioRef.current = audio;

      await new Promise<void>(
        (resolve, reject) => {
          const cleanup = () => {
            audio.onended = null;
            audio.onerror = null;

            if (audioRef.current === audio) {
              audioRef.current = null;
            }
          };

          audio.onended = () => {
            cleanup();
            resolve();
          };

          audio.onerror = () => {
            cleanup();

            reject(
              new Error(
                "Narrator audio playback failed.",
              ),
            );
          };

          audio.play().catch((error) => {
            cleanup();
            reject(error);
          });
        },
      );
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }

      console.error(
        "Polly synthesis failed, falling back to browser TTS",
        error,
      );

      await speakWithBrowserFallback(text);
    }
  }

  async function submitMessage(
    message: string,
  ): Promise<void> {
    if (!currentNarratorUiId) {
      console.error(
        `No UI narrator ID found for persona "${narrator.id}".`,
      );
      return;
    }

    const activeNarratorId =
      currentNarratorUiId;

    setNarratorStates((previous) => ({
      ...previous,
      [activeNarratorId]: "thinking",
    }));

    try {
      const { sessionId, isNew } =
        getOrCreateTabChatSession(narrator.id);

      if (isNew && history.length > 0) {
        setHistory([]);
      }

      const result = await sendChatMessage({
        personaId: narrator.id,
        scene: current.backendSceneId,
        message,
        sessionId,
      });

      if (!isMountedRef.current) {
        return;
      }

      setHistory((previous) => [
        ...(isNew ? [] : previous),
        {
          role: "user",
          content: message,
        },
        {
          role: "assistant",
          content: result.response,
        },
      ]);

      setNarratorStates((previous) => ({
        ...previous,
        [activeNarratorId]: "speaking",
      }));

      // This resolves only after Polly audio or browser TTS finishes.
      await speak(result.response);
    } catch (error) {
      console.error(error);
    } finally {
      if (!isMountedRef.current) {
        return;
      }

      setNarratorStates((previous) => ({
        ...previous,
        [activeNarratorId]: "selected",
      }));
    }
  }

  useEffect(() => {
    const deviceOrientationEvent =
      getDeviceOrientationEvent();

    if (!deviceOrientationEvent) {
      setGyroSupported(false);
      return;
    }

    setGyroSupported(true);

    const needsPermission =
      typeof deviceOrientationEvent
        .requestPermission === "function";

    const isTouch =
      window.matchMedia?.("(pointer: coarse)")
        .matches ?? false;

    if (isTouch && !needsPermission) {
      setLookMode("gyro");
    }
  }, []);

  // Warm the texture cache so switching scenes is instant.
  useEffect(() => {
    useTexture.preload(
      narrator.scenes.map(
        (scene) => scene.photoSrc,
      ),
    );
  }, [narrator]);

  async function toggleLook() {
    if (lookMode === "gyro") {
      setLookMode("drag");
      return;
    }

    const deviceOrientationEvent =
      getDeviceOrientationEvent();

    if (
      deviceOrientationEvent &&
      typeof deviceOrientationEvent
        .requestPermission === "function"
    ) {
      try {
        const permission =
          await deviceOrientationEvent.requestPermission();

        setLookMode(
          permission === "granted"
            ? "gyro"
            : "drag",
        );
      } catch {
        setLookMode("drag");
      }
    } else {
      setLookMode("gyro");
    }
  }

  function selectNarrator(
    narratorId: NarratorId,
  ) {
    setNarratorStates((previous) => ({
      whitmore:
        narratorId === "whitmore"
          ? "selected"
          : previous.whitmore === "disabled"
            ? "disabled"
            : "default",

      sinclair:
        narratorId === "sinclair"
          ? "selected"
          : previous.sinclair === "disabled"
            ? "disabled"
            : "default",

      ming:
        narratorId === "ming"
          ? "selected"
          : previous.ming === "disabled"
            ? "disabled"
            : "default",
    }));
  }

  function startNarratorInteraction(
    narratorId: NarratorId,
  ) {
    setNarratorStates((previous) => ({
      whitmore:
        narratorId === "whitmore"
          ? "listening"
          : previous.whitmore === "disabled"
            ? "disabled"
            : "default",

      sinclair:
        narratorId === "sinclair"
          ? "listening"
          : previous.sinclair === "disabled"
            ? "disabled"
            : "default",

      ming:
        narratorId === "ming"
          ? "listening"
          : previous.ming === "disabled"
            ? "disabled"
            : "default",
    }));

    // Real mic capture only exists for the narrator this page was loaded
    // for — the other two don't have their own Narrator data here yet, so
    // holding their buttons just shows the "listening" visual state.
    if (narratorId !== currentNarratorUiId) {
      return;
    }

    audioRef.current?.pause();
    audioRef.current = null;

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    const Recognition =
      window.SpeechRecognition ??
      window.webkitSpeechRecognition;

    if (!Recognition) {
      setNarratorStates((previous) => ({
        ...previous,
        [narratorId]: "selected",
      }));
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript =
        event.results[0]?.[0]?.transcript?.trim();

      if (transcript) {
        void submitMessage(transcript);
      } else {
        setNarratorStates((previous) => ({
          ...previous,
          [narratorId]: "selected",
        }));
      }
    };

    recognition.onerror = () => {
      recognitionRef.current = null;

      setNarratorStates((previous) => ({
        ...previous,
        [narratorId]: "selected",
      }));
    };

    recognition.onend = () => {
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  function endNarratorInteraction(
    narratorId: NarratorId,
  ) {
    if (narratorId !== currentNarratorUiId) {
      // Placeholder simulation for the two narrators not yet wired up.
      setNarratorStates((previous) => ({
        ...previous,
        [narratorId]: "thinking",
      }));

      window.setTimeout(() => {
        if (!isMountedRef.current) {
          return;
        }

        setNarratorStates((previous) => ({
          ...previous,
          [narratorId]: "speaking",
        }));

        window.setTimeout(() => {
          if (!isMountedRef.current) {
            return;
          }

          setNarratorStates((previous) => ({
            ...previous,
            [narratorId]: "selected",
          }));
        }, 2000);
      }, 1200);

      return;
    }

    // Releasing the button stops recognition. The final transcript arrives
    // through recognition.onresult, which calls submitMessage and drives the
    // state through thinking -> speaking -> selected.
    recognitionRef.current?.stop();
  }

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-navy">
      {/* Panorama */}
      <div className="absolute inset-0">
        <PanoramaScene
          scene={current}
          mode={lookMode}
        />
      </div>

      {/* UI overlay */}
      <div className="pointer-events-none absolute inset-0 z-10">
        {/* Back button */}
        <div className="pointer-events-auto absolute left-6 top-6">
          <NavButtonLink
            href="/explore"
            icon="back"
            label="Return to ship overview"
          />
        </div>

        {/* Current scene title */}
        <h1 className="text-ig-header absolute left-1/2 top-5 -translate-x-1/2 whitespace-nowrap text-center">
          {current.title}
        </h1>

        {/* Narrator controls */}
        <div className="pointer-events-auto absolute left-6 top-1/2 flex -translate-y-1/2 flex-col items-center gap-4">
          {narratorOrder.map(
            (narratorId) => (
              <NarratorButton
                key={narratorId}
                variant="scene"
                narrator={narratorId}
                state={
                  narratorStates[narratorId]
                }
                onClick={() =>
                  selectNarrator(narratorId)
                }
                onHoldStart={() =>
                  startNarratorInteraction(
                    narratorId,
                  )
                }
                onHoldEnd={() =>
                  endNarratorInteraction(
                    narratorId,
                  )
                }
              />
            ),
          )}
        </div>

        {/* View control */}
        {gyroSupported && (
          <button
            type="button"
            onClick={toggleLook}
            aria-pressed={
              lookMode === "gyro"
            }
            aria-label={
              lookMode === "gyro"
                ? "Switch to drag view"
                : "Switch to phone view"
            }
            className="ui-view-toggle pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            {lookMode === "gyro"
              ? "Drag View"
              : "Phone View"}
          </button>
        )}

        {/* Map button */}
        <div className="pointer-events-auto absolute right-6 top-6">
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
        <div className="pointer-events-auto absolute right-6 top-24 max-h-[68vh] -translate-y-1/2 md:top-1/3">
          <SceneRail
            scenes={narrator.scenes}
            currentId={currentId}
            onSelect={setCurrentId}
            variant="panorama"
          />
        </div>

        {/* Transcript */}
        <ChatTranscript
          messages={transcriptMessages}
        />
      </div>
    </main>
  );
}