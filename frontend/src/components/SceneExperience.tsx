"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";
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

import {
  getNarrator,
  getNarratorByUiId,
  scenes,
  type ExperienceScene,
  type SceneNarrator,
} from "@/lib/scenes";
import {
  getOrCreateTabChatSession,
  sendChatMessage,
  type ChatHistoryTurn,
} from "@/lib/chat";
import { synthesizeNarratorVoice } from "@/lib/voice";

type SpeechRecognitionConstructor =
  new () => SpeechRecognition;

type SpeechRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult:
    | ((event: SpeechRecognitionEvent) => void)
    | null;
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
    SpeechRecognition?:
      SpeechRecognitionConstructor;
    webkitSpeechRecognition?:
      SpeechRecognitionConstructor;
  }
}

/**
 * iOS 13+ exposes requestPermission on the
 * DeviceOrientationEvent constructor.
 */
type DeviceOrientationEventStatic = {
  requestPermission?: () => Promise<
    "granted" | "denied" | "default"
  >;
};

type NarratorStates = Record<
  NarratorId,
  SceneNarratorState
>;

type SceneExperienceProps = {
  scene: ExperienceScene;
};

const narratorOrder: NarratorId[] = [
  "sinclair",
  "whitmore",
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
      DeviceOrientationEvent?:
        DeviceOrientationEventStatic;
    }
  ).DeviceOrientationEvent;
}

export default function SceneExperience({
  scene,
}: SceneExperienceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  /**
   * Convert this scene's persona IDs into complete
   * narrator objects.
   */
  const sceneNarrators = scene.narratorIds
    .map((id) => getNarrator(id))
    .filter(
      (
        narrator,
      ): narrator is SceneNarrator =>
        narrator !== undefined,
    );

  /**
   * The hub sends a backend persona ID, for example:
   *
   * ?narrator=eleanor_whitmore
   */
  const initialPersonaId =
    searchParams.get("narrator");

  const initialNarrator =
    sceneNarrators.find(
      (narrator) =>
        narrator.id === initialPersonaId,
    ) ?? sceneNarrators[0];

  const [
    activeNarratorId,
    setActiveNarratorId,
  ] = useState<NarratorId>(
    initialNarrator?.uiId ?? "whitmore",
  );

  const activeNarrator =
    sceneNarrators.find(
      (narrator) =>
        narrator.uiId === activeNarratorId,
    ) ?? sceneNarrators[0];

  const [gyroSupported, setGyroSupported] =
    useState(false);

  const [lookMode, setLookMode] =
    useState<LookMode>("drag");

  const [
    narratorStates,
    setNarratorStates,
  ] = useState<NarratorStates>(() => {
    const initialStates = {
      ...initialNarratorStates,
    };

    if (initialNarrator) {
      initialStates[initialNarrator.uiId] =
        "selected";
    }

    return initialStates;
  });

  /**
   * This remains one shared history for now.
   * Per-narrator histories can be added later.
   */
  const [history, setHistory] =
    useState<ChatHistoryTurn[]>([]);

  const isMountedRef = useRef(true);

  const audioRef =
    useRef<HTMLAudioElement | null>(null);

  const recognitionRef =
    useRef<SpeechRecognition | null>(null);

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

  const transcriptMessages:
    TranscriptMessage[] = history.map(
    (turn, index) => ({
      id: `${index}`,
      speaker:
        turn.role === "user"
          ? "You"
          : activeNarrator?.name ??
            "Narrator",
      text: turn.content,
      narratorId:
        turn.role === "assistant"
          ? activeNarrator?.uiId
          : undefined,
    }),
  );

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

      window.speechSynthesis.speak(
        utterance,
      );
    });
  }

  async function speak(
    text: string,
    narrator: SceneNarrator,
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

            if (
              audioRef.current === audio
            ) {
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
    narratorUiId: NarratorId,
  ): Promise<void> {
    /**
     * Resolve the narrator from the ID of the button
     * that started this interaction.
     *
     * This avoids using stale React state if the user
     * switches narrators quickly.
     */
    const narrator =
      getNarratorByUiId(narratorUiId);

    if (!narrator) {
      console.error(
        `No narrator found for UI ID "${narratorUiId}".`,
      );
      return;
    }

    const narratorIsAvailable =
      scene.narratorIds.includes(
        narrator.id,
      );

    if (!narratorIsAvailable) {
      console.error(
        `${narrator.name} is not available in ${scene.title}.`,
      );
      return;
    }

    setNarratorStates((previous) => ({
      ...previous,
      [narratorUiId]: "thinking",
    }));

    try {
      const { sessionId, isNew } =
        getOrCreateTabChatSession(
          narrator.id,
        );

      if (isNew && history.length > 0) {
        setHistory([]);
      }

      const result =
        await sendChatMessage({
          personaId: narrator.id,
          scene: scene.backendSceneId,
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
        [narratorUiId]: "speaking",
      }));

      await speak(
        result.response,
        narrator,
      );
    } catch (error) {
      console.error(error);
    } finally {
      if (!isMountedRef.current) {
        return;
      }

      setNarratorStates((previous) => ({
        ...previous,
        [narratorUiId]: "selected",
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
      window.matchMedia?.(
        "(pointer: coarse)",
      ).matches ?? false;

    if (isTouch && !needsPermission) {
      setLookMode("gyro");
    }
  }, []);

  /**
   * Preload every panorama so moving between scene
   * routes is faster.
   */
  useEffect(() => {
    useTexture.preload(
      scenes.map(
        (availableScene) =>
          availableScene.photoSrc,
      ),
    );
  }, []);

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
    const narrator =
      getNarratorByUiId(narratorId);

    if (
      !narrator ||
      !scene.narratorIds.includes(
        narrator.id,
      )
    ) {
      return;
    }

    setActiveNarratorId(narratorId);

    setNarratorStates((previous) => ({
      whitmore:
        narratorId === "whitmore"
          ? "selected"
          : previous.whitmore ===
              "disabled"
            ? "disabled"
            : "default",

      sinclair:
        narratorId === "sinclair"
          ? "selected"
          : previous.sinclair ===
              "disabled"
            ? "disabled"
            : "default",

      ming:
        narratorId === "ming"
          ? "selected"
          : previous.ming ===
              "disabled"
            ? "disabled"
            : "default",
    }));
  }

  function startNarratorInteraction(
    narratorId: NarratorId,
  ) {
    const narrator =
      getNarratorByUiId(narratorId);

    if (
      !narrator ||
      !scene.narratorIds.includes(
        narrator.id,
      )
    ) {
      return;
    }

    setActiveNarratorId(narratorId);

    setNarratorStates((previous) => ({
      whitmore:
        narratorId === "whitmore"
          ? "listening"
          : previous.whitmore ===
              "disabled"
            ? "disabled"
            : "default",

      sinclair:
        narratorId === "sinclair"
          ? "listening"
          : previous.sinclair ===
              "disabled"
            ? "disabled"
            : "default",

      ming:
        narratorId === "ming"
          ? "listening"
          : previous.ming ===
              "disabled"
            ? "disabled"
            : "default",
    }));

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

    const recognition =
      new Recognition();

    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript =
        event.results[0]?.[0]?.transcript?.trim();

      if (transcript) {
        void submitMessage(
          transcript,
          narratorId,
        );
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

    recognitionRef.current =
      recognition;

    recognition.start();
  }

  function endNarratorInteraction(
    narratorId: NarratorId,
  ) {
    const narrator =
      getNarratorByUiId(narratorId);

    if (
      !narrator ||
      !scene.narratorIds.includes(
        narrator.id,
      )
    ) {
      return;
    }

    /**
     * Releasing the button stops recognition.
     * The final transcript arrives through onresult,
     * which calls submitMessage.
     */
    recognitionRef.current?.stop();
  }

  const availableNarratorUiIds =
    new Set<NarratorId>(
      sceneNarrators.map(
        (narrator) => narrator.uiId,
      ),
    );

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-navy">
      {/* Panorama */}
      <div className="absolute inset-0">
        <PanoramaScene
          scene={scene}
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
          {scene.title}
        </h1>

        {/* Narrator controls */}
        <div
            className="
            pointer-events-auto
            absolute
        
            left-21
            top-18
            flex
            w-20
            flex-col
            items-center
            -space-y-7
        
            md:top-2/7
            md:-translate-y-1/3
            md:space-y-4
            md:gap-0
            "
          >
          {narratorOrder.map(
            (narratorId) => {
              const isAvailable =
                availableNarratorUiIds.has(
                  narratorId,
                );

              return (
                <NarratorButton
                  key={narratorId}
                  variant="scene"
                  narrator={narratorId}
                  state={
                    isAvailable
                      ? narratorStates[
                          narratorId
                        ]
                      : "disabled"
                  }
                  onClick={
                    isAvailable
                      ? () =>
                          selectNarrator(
                            narratorId,
                          )
                      : undefined
                  }
                  onHoldStart={
                    isAvailable
                      ? () =>
                          startNarratorInteraction(
                            narratorId,
                          )
                      : undefined
                  }
                  onHoldEnd={
                    isAvailable
                      ? () =>
                          endNarratorInteraction(
                            narratorId,
                          )
                      : undefined
                  }
                />
              );
            },
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
          />
        </div>

        {/* Scene navigation */}
        <div className="pointer-events-auto absolute right-6 top-24 max-h-[68vh] -translate-y-1/2 md:top-1/3">
          <SceneRail
            scenes={scenes}
            currentId={scene.id}
            onSelect={(
              nextSceneId,
            ) => {
              const narratorQuery =
                activeNarrator
                  ? `?narrator=${activeNarrator.id}`
                  : "";

              router.push(
                `/explore/${nextSceneId}${narratorQuery}`,
              );
            }}
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