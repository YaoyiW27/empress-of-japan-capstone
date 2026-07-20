"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Narrator, Scene } from "@/lib/narrators";
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
export default function NarratorOverlay({
  narrator,
  scene,
}: {
  narrator: Narrator;
  scene: Scene;
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<ChatHistoryTurn[]>([]);
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState(narrator.bio);
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const isMountedRef = useRef(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const historyEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);
  
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      audioRef.current?.pause();
    };
  }, []);

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
      const audio = new Audio(audio_url);
      audioRef.current = audio;
      await audio.play();
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
    setTranscript(message);

    try {
      const { sessionId, isNew } = getOrCreateTabChatSession(narrator.id);
      if (isNew && history.length > 0) {
        setHistory([]);
      }
      const result = await sendChatMessage({
        personaId: narrator.id,
        scene: scene.backendSceneId,
        message,
        sessionId,
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
      setResponse("Sorry, I could not reach the narrator service.");
    } finally {
      setIsLoading(false);
    }
  }
  
  function startListening() {
    audioRef.current?.pause();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    const Recognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!Recognition) {
      setResponse("Speech recognition is not supported in this browser.");
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
      setResponse("Sorry, I could not hear that clearly.");
    };

    recognition.onend = () => setIsListening(false);

    setIsListening(true);
    recognition.start();
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-3 p-4 sm:p-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto shrink-0"
      >
        <Image
          src={narrator.cutoutSrc ?? narrator.portraitSrc}
          alt={narrator.name}
          width={400}
          height={600}
          className="h-[46vh] w-auto object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
        />
      </button>

      {open && (
        <div className="pointer-events-auto mb-2 max-w-md rounded-md border border-brass/40 bg-card/90 px-4 py-3 shadow-lg backdrop-blur-sm">
          <p className="font-display text-sm font-bold uppercase tracking-[0.18em] text-brass">
            {narrator.name}
          </p>

          <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
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

              <div ref={historyEndRef} />
            </div>

          <button
            type="button"
            onClick={startListening}
            disabled={isListening || isLoading}
            className="mt-3 inline-flex items-center gap-1.5 rounded-sm border border-brass/40 bg-ivory px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-navy-soft"
          >
            🎤 {isListening ? "Listening..." : "Talk"}
          </button>
        </div>
      )}
    </div>
  );
}
