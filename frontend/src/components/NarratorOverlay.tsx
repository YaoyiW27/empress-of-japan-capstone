"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type SubmitEvent,
} from "react";
import type { Narrator, Scene } from "@/lib/scenes";
import {
  getOrCreateTabChatSession,
  sendChatMessage,
  type ChatHistoryTurn,
} from "@/lib/chat";
import {
  isLiveTranscriptionSupported,
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

/**
 * How this browser can capture a question, best first:
 * - native: the built-in Web Speech API (iOS Safari, Android Chrome).
 * - recorder: mic capture streamed to the backend's /voice/transcribe
 *   WebSocket (third-party iOS browsers, which never get SpeechRecognition).
 * - text: typed input (WebViews that block the microphone entirely).
 */
type VoiceInputMode = "native" | "recorder" | "text";

function readVoiceInputMode(): VoiceInputMode {
  if (window.SpeechRecognition ?? window.webkitSpeechRecognition) {
    return "native";
  }
  return isLiveTranscriptionSupported() ? "recorder" : "text";
}

export default function NarratorOverlay({
  narrator,
  scene,
}: {
  narrator: Narrator;
  scene: Scene;
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<ChatHistoryTurn[]>([]);
  const [response, setResponse] = useState(narrator.bio);
  const [notice, setNotice] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [draft, setDraft] = useState("");
  // Downgrade to typed input if recording breaks mid-session (permission
  // denied, socket refused…) so the visitor is never stuck with a dead mic.
  const [recorderFailed, setRecorderFailed] = useState(false);
  // The server snapshot assumes "native" so the first paint matches the SSR
  // mic button; the real mode replaces it right after hydration.
  const detectedVoiceMode = useSyncExternalStore(
    subscribeToNothing,
    readVoiceInputMode,
    () => "native" as const,
  );
  const voiceMode: VoiceInputMode =
    detectedVoiceMode === "recorder" && recorderFailed
      ? "text"
      : detectedVoiceMode;
  const isMountedRef = useRef(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const liveTranscriptionRef = useRef<LiveTranscriptionHandle | null>(null);
  const historyEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);
  
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      audioRef.current?.pause();
      liveTranscriptionRef.current?.cancel();
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

  function speakWithBrowserFallback(text: string) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
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
      // Reuse the element unlocked in unlockAudioOutput — the tap is seconds
      // in the past by now, and iOS blocks play() on any element that was not
      // unlocked inside a user gesture.
      await loadSharedAudio(audioRef, audio_url).play();
    } catch (error) {
      if (!isMountedRef.current) return;
      // Backend/Polly unavailable (not configured, network error, etc.) —
      // fall back to the browser's built-in TTS so the narrator still speaks.
      console.error("Polly synthesis failed, falling back to browser TTS", error);
      speakWithBrowserFallback(text);
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
    const Recognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!Recognition) {
      setNotice("Speech recognition is not supported in this browser.");
      setOpen(true);
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      void submitMessage(event.results[0][0].transcript);
    };

    recognition.onerror = () => {
      setIsListening(false);
      setNotice("Sorry, I could not hear that clearly.");
      setOpen(true);
    };

    recognition.onend = () => setIsListening(false);

    setIsListening(true);
    recognition.start();
  }

  function failRecording() {
    setIsListening(false);
    liveTranscriptionRef.current = null;
    setRecorderFailed(true);
    setNotice("Could not access the microphone — type your question instead.");
    setOpen(true);
  }

  /** Recorder mode: no end-of-speech detection, so the mic button toggles —
      tap to start, tap again (or the 14 s cap) to stop and send. */
  async function startRecording() {
    unlockAudioOutput();
    setIsListening(true);
    try {
      liveTranscriptionRef.current = await startLiveTranscription({
        onDone: (transcript) => {
          if (!isMountedRef.current) return;
          setIsListening(false);
          liveTranscriptionRef.current = null;
          if (transcript) {
            void submitMessage(transcript);
          } else {
            setNotice("Sorry, I could not hear that clearly.");
            setOpen(true);
          }
        },
        onError: (error) => {
          if (!isMountedRef.current) return;
          console.error("live transcription failed", error);
          failRecording();
        },
      });
    } catch (error) {
      if (!isMountedRef.current) return;
      console.error("live transcription failed to start", error);
      failRecording();
    }
  }

  function toggleRecording() {
    if (liveTranscriptionRef.current) {
      liveTranscriptionRef.current.stop();
      return;
    }
    void startRecording();
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4 sm:p-6">
      {open && (
        /* Transcript panel, rising from the capsule below. */
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

      {/* Split capsule: mic (or typed input) on the left, transcript chevron
          on the right. */}
      <div className="pointer-events-auto flex items-stretch overflow-hidden rounded-full border border-brass/40 bg-card/90 shadow-lg backdrop-blur-sm">
        {voiceMode !== "text" ? (
          <button
            type="button"
            onClick={voiceMode === "native" ? startListening : toggleRecording}
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
            className={`flex h-14 w-16 items-center justify-center transition-colors disabled:cursor-not-allowed ${
              isListening
                ? "animate-pulse bg-vermilion text-ivory"
                : "text-navy hover:bg-ivory"
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
                className="h-6 w-6"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <path d="M12 19v4" />
                <path d="M8 23h8" />
              </svg>
            )}
          </button>
        ) : (
          /* No SpeechRecognition (iOS Chrome/Edge/Firefox, in-app browsers,
             Android Firefox…) — let the visitor type instead. */
          <form onSubmit={handleTextSubmit} className="flex items-stretch">
            <input
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask the narrator..."
              disabled={isLoading}
              aria-label="Type a message to the narrator"
              className="h-14 w-44 bg-transparent pl-5 pr-2 text-sm text-navy placeholder:text-navy-soft focus:outline-none disabled:cursor-not-allowed sm:w-64"
            />
            <button
              type="submit"
              disabled={isLoading || draft.trim().length === 0}
              aria-label="Send message"
              className="flex w-12 items-center justify-center text-navy transition-colors hover:bg-ivory disabled:cursor-not-allowed disabled:opacity-50"
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
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Hide transcript" : "Show transcript"}
          className="flex w-11 items-center justify-center border-l border-brass/40 text-navy transition-colors hover:bg-ivory"
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
