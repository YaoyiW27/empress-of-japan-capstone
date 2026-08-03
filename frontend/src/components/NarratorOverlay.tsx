"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type SubmitEvent,
} from "react";
import type { Narrator, Scene } from "@/lib/scenes";
import {
  getOrCreateTabChatSession,
  sendChatMessage,
  type ChatHistoryTurn,
} from "@/lib/chat";
import {
  configureAudioSession,
  isIOS,
  isLiveTranscriptionSupported,
  isMicPermissionError,
  startLiveTranscription,
  synthesizeNarratorVoice,
  type LiveTranscriptionHandle,
} from "@/lib/voice";

type SpeechRecognitionConstructor = new () => SpeechRecognition;

type SpeechRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
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

/**
 * Smallest valid silent WAV (one 16-bit sample). iOS only allows audio that
 * starts inside a user gesture, and the unlock is per-element — playing this
 * on tap unlocks the shared <audio> for the narration that arrives later.
 */
const SILENT_UNLOCK_WAV =
  "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==";

/**
 * Swap the shared narrator player to a new clip and return it. The same
 * element must be reused across turns: iOS unlocks playback per element, so a
 * fresh Audio() created after the tap gesture has passed would be blocked.
 */
function loadSharedAudio(
  ref: { current: HTMLAudioElement | null },
  src: string,
): HTMLAudioElement {
  const audio = ref.current ?? new Audio();
  ref.current = audio;
  audio.src = src;
  return audio;
}

// Browser support never changes while mounted; subscribers never fire.
function subscribeToNothing() {
  return () => {};
}

// Module scope on purpose: NarratorOverlay remounts on narrator switch
// (key={narrator.id}), and a recognizer left running by the old instance
// keeps the microphone captured — Safari then refuses the next one until the
// page reloads. Whoever starts a recognizer must be able to kill its
// predecessor.
const activeRecognitionRef = { current: null as SpeechRecognition | null };

function setActiveRecognition(recognition: SpeechRecognition) {
  activeRecognitionRef.current = recognition;
}

function clearActiveRecognition(recognition: SpeechRecognition) {
  if (activeRecognitionRef.current === recognition) {
    activeRecognitionRef.current = null;
  }
}

function disposeActiveRecognition() {
  const recognition = activeRecognitionRef.current;
  if (!recognition) return;
  activeRecognitionRef.current = null;
  // Null the handlers first so aborting doesn't fire a stale instance's
  // error/submit callbacks.
  recognition.onresult = null;
  recognition.onerror = null;
  recognition.onend = null;
  try {
    recognition.abort();
  } catch {
    // Already stopped.
  }
}

/**
 * How this browser can capture a question, best first:
 * - native: the built-in Web Speech API (Android Chrome, desktop).
 * - recorder: mic capture streamed to the backend's /voice/transcribe
 *   WebSocket (all iOS browsers, third-party WebViews).
 * - text: typed input (WebViews that block the microphone entirely).
 */
type VoiceInputMode = "native" | "recorder" | "text";

export type NarratorInteractionStatus =
  | "selected"
  | "listening"
  | "thinking"
  | "speaking";

function readVoiceInputMode(): VoiceInputMode {
  // Every iOS browser is WebKit and now exposes webkitSpeechRecognition, but
  // that recognizer only captures on the first turn per page load and leaves
  // playback pinned to the earpiece. Stream to the backend instead so voice
  // survives across turns and narrator switches.
  if (isIOS()) {
    return isLiveTranscriptionSupported() ? "recorder" : "text";
  }
  if (window.SpeechRecognition ?? window.webkitSpeechRecognition) {
    return "native";
  }
  return isLiveTranscriptionSupported() ? "recorder" : "text";
}

// Shared look for every standalone pill/circle control in the dock — each
// button now owns its own border/shadow/radius instead of splitting one
// joined capsule, so no button's focus ring bleeds into its neighbor.
// onMouseDown's preventDefault stops the browser from focusing the button on
// a mouse click/tap at all (keyboard Tab focus is untouched, since that's a
// keydown path) — so outline-none is safe here without losing a11y.
function preventMouseFocus(event: MouseEvent) {
  event.preventDefault();
}

export default function NarratorOverlay({
  narrator,
  scene,
  onStatusChange,
}: {
  narrator: Narrator;
  scene: Scene;
  onStatusChange?: (status: NarratorInteractionStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<ChatHistoryTurn[]>([]);
  const [response, setResponse] = useState(narrator.bio);
  const [notice, setNotice] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [draft, setDraft] = useState("");
  // Downgrade to typed input when the mic turns out to be unusable
  // (permission denied at the browser or OS level, dead audio, socket
  // failure…) so the visitor is never stuck with a mic that can't work.
  const [micBlocked, setMicBlocked] = useState(false);
  // The server snapshot assumes "native" so the first paint matches the SSR
  // mic button; the real mode replaces it right after hydration.
  const detectedVoiceMode = useSyncExternalStore(
    subscribeToNothing,
    readVoiceInputMode,
    () => "native" as const,
  );
  const voiceMode: VoiceInputMode = micBlocked ? "text" : detectedVoiceMode;
  const isMountedRef = useRef(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const liveTranscriptionRef = useRef<LiveTranscriptionHandle | null>(null);
  // Synchronous re-entry guard: liveTranscriptionRef is only assigned after
  // the async setup resolves, so taps during setup must be fenced separately
  // or they spawn concurrent sessions fighting over the microphone.
  const startingRecordingRef = useRef(false);
  const historyEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const interactionStatus: NarratorInteractionStatus = isListening
    ? "listening"
    : isSpeaking
      ? "speaking"
      : isLoading
        ? "thinking"
        : "selected";

  useEffect(() => {
    onStatusChange?.(interactionStatus);
  }, [interactionStatus, onStatusChange]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      audioRef.current?.pause();
      liveTranscriptionRef.current?.cancel();
      // The old instance's recognizer would otherwise hold the mic across a
      // narrator switch and starve the next one.
      disposeActiveRecognition();
    };
  }, []);

  /**
   * Call synchronously inside a tap/click handler. iOS only plays audio
   * started from a user gesture: a silent clip now unlocks the shared <audio>
   * element for the narration that arrives seconds later, and an empty
   * utterance does the same for the speechSynthesis fallback. Also interrupts
   * any narration still playing.
   */
  function unlockAudioOutput() {
    void loadSharedAudio(audioRef, SILENT_UNLOCK_WAV)
      .play()
      .catch(() => {
        // Best effort — real playback has its own fallback path.
      });
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
    }
  }

  function speakWithBrowserFallback(text: string): Promise<void> {
    if (!("speechSynthesis" in window)) return Promise.resolve();
    configureAudioSession("playback");
    window.speechSynthesis.cancel();
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }

  function playAudioToCompletion(audio: HTMLAudioElement): Promise<void> {
    return new Promise((resolve, reject) => {
      function cleanup() {
        audio.removeEventListener("ended", handleEnded);
        audio.removeEventListener("error", handleError);
      }

      function handleEnded() {
        cleanup();
        resolve();
      }

      function handleError() {
        cleanup();
        reject(new Error("Narrator audio playback failed."));
      }

      audio.addEventListener("ended", handleEnded);
      audio.addEventListener("error", handleError);
      void audio.play().catch((error) => {
        cleanup();
        reject(error);
      });
    });
  }

  async function speak(text: string) {
    audioRef.current?.pause();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();

    try {
      const { audio_url } = await synthesizeNarratorVoice({
        narratorId: narrator.id,
        text,
      });
      if (!isMountedRef.current) return;
      // Mic capture flips the iOS session to earpiece routing; put it back on
      // the loudspeaker before the narrator speaks.
      configureAudioSession("playback");
      // Reuse the element unlocked in unlockAudioOutput — the tap is seconds
      // in the past by now, and iOS blocks play() on any element that was not
      // unlocked inside a user gesture.
      setIsSpeaking(true);
      await playAudioToCompletion(loadSharedAudio(audioRef, audio_url));
    } catch (error) {
      if (!isMountedRef.current) return;
      // Backend/Polly unavailable (not configured, network error, etc.) —
      // fall back to the browser's built-in TTS so the narrator still speaks.
      console.error("Polly synthesis failed, falling back to browser TTS", error);
      setIsSpeaking(true);
      await speakWithBrowserFallback(text);
    } finally {
      if (isMountedRef.current) setIsSpeaking(false);
    }
  }

  async function submitMessage(message: string) {
    setIsLoading(true);
    setNotice(null);

    try {
      const { sessionId, isNew } = getOrCreateTabChatSession(narrator.id);
      if (isNew && history.length > 0) {
        setHistory([]);
      }
      const priorHistory = isNew ? [] : history;
      const result = await sendChatMessage({
        personaId: narrator.id,
        scene: scene.backendSceneId,
        message,
        sessionId,
        history: priorHistory,
      });

      setHistory((current) => [
        ...(isNew ? [] : current),
        { role: "user", content: message },
        { role: "assistant", content: result.response },
      ]);

      setResponse(result.response);
      void speak(result.response);
    } catch (error) {
      console.error(error);
      setNotice("Sorry, I could not reach the narrator service.");
      setOpen(true);
    } finally {
      setIsLoading(false);
    }
  }

  function handleTextSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isLoading) return;
    unlockAudioOutput();
    setDraft("");
    // Typed visitors read the reply instead of hearing it mid-scene.
    setOpen(true);
    void submitMessage(message);
  }

  function startListening() {
    unlockAudioOutput();
    disposeActiveRecognition();
    configureAudioSession("play-and-record");
    const Recognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!Recognition) {
      setNotice("Speech recognition is not supported in this browser.");
      setOpen(true);
      return;
    }

    const recognition = new Recognition();
    let heardResult = false;
    let sawError = false;
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      heardResult = true;
      const transcript = event.results[0]?.[0]?.transcript.trim();
      disposeActiveRecognition();
      configureAudioSession("playback");
      setIsListening(false);
      if (transcript) {
        void submitMessage(transcript);
      } else {
        handleNativeSpeechMiss();
      }
    };

    recognition.onerror = (event) => {
      sawError = true;
      setIsListening(false);
      if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed"
      ) {
        // Includes iOS Safari with Siri & Dictation disabled in Settings.
        setMicBlocked(true);
        setNotice(
          "Microphone access is blocked on this phone — check the browser's microphone permission (and Dictation on iPhone) in Settings. You can type your question below instead.",
        );
      } else if (event.error === "audio-capture") {
        handleNativeSpeechMiss();
      } else {
        handleNativeSpeechMiss();
      }
    };

    recognition.onend = () => {
      clearActiveRecognition(recognition);
      setIsListening(false);
      if (!heardResult && !sawError) {
        handleNativeSpeechMiss();
      }
    };

    setActiveRecognition(recognition);
    setIsListening(true);
    recognition.start();
  }

  function handleNativeSpeechMiss() {
    // Mobile Web Speech can get stuck after one successful turn. When that
    // happens, fall back to typing instead of leaving visitors with a mic
    // button that only flashes red.
    configureAudioSession("playback");
    setMicBlocked(true);
    setNotice(
      "Voice recognition is not working reliably on this phone. You can type your question below instead.",
    );
    setOpen(true);
  }

  function failRecording(error: unknown) {
    setIsListening(false);
    liveTranscriptionRef.current = null;
    if (isMicPermissionError(error)) {
      setMicBlocked(true);
      setNotice(
        "Microphone access was denied — allow it for this browser in your phone's Settings. You can type your question below instead.",
      );
    } else {
      // Transient (socket hiccup, setup timeout, device busy): keep the mic
      // so the visitor can simply try again instead of losing voice forever.
      setNotice("The microphone hit a snag — please try again.");
    }
    setOpen(true);
  }

  /** Recorder mode: no end-of-speech detection, so the mic button toggles —
      tap to start, tap again (or the 14 s cap) to stop and send. */
  async function startRecording() {
    if (startingRecordingRef.current || liveTranscriptionRef.current) return;
    startingRecordingRef.current = true;
    unlockAudioOutput();
    setIsListening(true);
    try {
      const handle = await startLiveTranscription({
        onDone: (transcript, { heardAudio }) => {
          if (!isMountedRef.current) return;
          setIsListening(false);
          liveTranscriptionRef.current = null;
          if (transcript) {
            void submitMessage(transcript);
          } else if (!heardAudio) {
            // iOS hands the browser an all-zeros track — with no prompt —
            // when the OS-level mic permission was denied earlier. Point at
            // Settings and switch to typing.
            setMicBlocked(true);
            setNotice(
              "I couldn't hear anything — this phone may be blocking the microphone for this browser. Check the browser's microphone permission in Settings, or type your question below.",
            );
            setOpen(true);
          } else {
            setNotice("Sorry, I didn't catch that — please try again.");
            setOpen(true);
          }
        },
        onError: (error) => {
          if (!isMountedRef.current) return;
          console.error("live transcription failed", error);
          failRecording(error);
        },
      });
      if (!isMountedRef.current) {
        // Unmounted (narrator switch) while setting up — release the mic.
        handle.cancel();
        return;
      }
      liveTranscriptionRef.current = handle;
    } catch (error) {
      if (!isMountedRef.current) return;
      console.error("live transcription failed to start", error);
      failRecording(error);
    } finally {
      startingRecordingRef.current = false;
    }
  }

  function toggleRecording() {
    // Ignore taps while setup is in flight — a second session would fight
    // the first for the microphone.
    if (startingRecordingRef.current) return;
    if (liveTranscriptionRef.current) {
      liveTranscriptionRef.current.stop();
      return;
    }
    void startRecording();
  }

  return (
    <div className="narrator-overlay pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4 sm:p-6">
      {open && (
        /* Transcript panel, rising from the dock below. */
        <div className="pointer-events-auto w-full max-w-md rounded-md border border-brass/40 bg-card/90 px-4 py-3 shadow-lg backdrop-blur-sm">
          <p className="font-display text-sm font-bold uppercase tracking-[0.18em] text-brass">
            {narrator.name}
          </p>

          <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
            {history.length === 0 && (
              <p className="text-sm leading-relaxed text-navy">{response}</p>
            )}

            {history.map((turn, i) => (
              <p
                key={i}
                className={
                  turn.role === "user"
                    ? "text-xs text-navy-soft"
                    : "text-sm leading-relaxed text-navy"
                }
              >
                {turn.role === "user" ? "You: " : ""}
                {turn.content}
              </p>
            ))}

            {isLoading && (
              <p className="text-sm italic leading-relaxed text-navy-soft">
                Thinking...
              </p>
            )}

            {notice && (
              <p className="text-sm italic leading-relaxed text-vermilion">
                {notice}
              </p>
            )}

            <div ref={historyEndRef} />
          </div>
        </div>
      )}

      {/* One unified dock now: mic on the left, a typed-input field that's
          always available (not just a no-speech-recognition fallback) in
          the middle, and the transcript toggle on the right. All three live
          inside one pill, divided by hairline borders, matching the shape
          this control had before it was split into separate buttons. */}
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-1 rounded-md  bg-card p-1 shadow-lg backdrop-blur-sm">
        {voiceMode !== "text" && (
          <button
            type="button"
            onClick={voiceMode === "native" ? startListening : toggleRecording}
            onMouseDown={preventMouseFocus}
            disabled={
              voiceMode === "native" ? isListening || isLoading : isLoading
            }
            aria-label={
              voiceMode === "recorder" && isListening
                ? "Stop and send"
                : isListening
                  ? "Listening"
                  : "Talk to the narrator"
            }
            className={`flex h-11 w-11 shrink-0 items-center justify-center self-center ml-2 rounded-full border-[3px] border-brass transition-colors focus-visible:ring-2 focus-visible:ring-brass disabled:cursor-not-allowed ${
              isListening
                ? "animate-pulse bg-ai text-navy"
                : isSpeaking
                  ? "text-navy hover:bg-ivory"
                  : "bg-navy text-ivory hover:bg-brass"
            }`}
          >
            {voiceMode === "recorder" && isListening ? (
              /* Recorder mode has no end-of-speech detection: while it runs
                 the button is a stop control. */
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-5 w-5"
              >
                <rect x="5" y="5" width="14" height="14" rx="2" />
              </svg>
            ) : (
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
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <path d="M12 19v4" />
                <path d="M8 23h8" />
              </svg>
            )}
          </button>
        )}

        {/* Typed input — always here now, whether or not the browser also
            supports voice. Enter submits; there's no separate send button
            baked into this segment so it reads as one plain field inside
            the shared pill, with the transcript toggle closing it out. */}
        <form
          onSubmit={handleTextSubmit}
          className="flex min-w-0 flex-1 items-center"
        >
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask the narrator..."
            disabled={isLoading}
            aria-label="Type a message to the narrator"
            className="h-12 min-w-0 flex-1 bg-transparent px-4 text-sm text-navy placeholder:text-navy-soft outline-none disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={isLoading || draft.trim().length === 0}
            onMouseDown={preventMouseFocus}
            aria-label="Send message"
            className="flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-full text-navy outline-none transition-colors hover:bg-ivory focus-visible:ring-2 focus-visible:ring-brass disabled:cursor-not-allowed disabled:opacity-50"
          >
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
              <path d="M22 2 11 13" />
              <path d="M22 2 15 22 11 13 2 9 22 2Z" />
            </svg>
          </button>
        </form>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          onMouseDown={preventMouseFocus}
          aria-expanded={open}
          aria-label={open ? "Hide transcript" : "Show transcript"}
          className="flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-full text-navy outline-none transition-colors hover:bg-ivory focus-visible:ring-2 focus-visible:ring-brass"
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
              open ? "rotate-180" : ""
            }`}
          >
            <path d="M6 15l6-6 6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
