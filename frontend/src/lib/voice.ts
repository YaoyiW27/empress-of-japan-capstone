import { API_BASE_URL, WS_BASE_URL } from "@/lib/api";

export type VoiceSynthesizeResult = {
  audio_url: string;
  cached: boolean;
  expires_in: number;
};

/**
 * Ask the backend to render narrator speech through Polly and return a
 * short-lived, playable S3 URL. The voice mapping (narrator -> Polly voice)
 * lives server-side, so we only ever send the narrator id + text here.
 */
export async function synthesizeNarratorVoice({
  narratorId,
  text,
}: {
  narratorId: string;
  text: string;
}): Promise<VoiceSynthesizeResult> {
  const res = await fetch(`${API_BASE_URL}/voice/synthesize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      narrator_id: narratorId,
      text,
    }),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json() as Promise<VoiceSynthesizeResult>;
}

// ---------------------------------------------------------------------------
// Live transcription over the backend's /voice/transcribe WebSocket.
//
// Browsers without SpeechRecognition (every third-party iOS browser, some
// WebViews) can still record with getUserMedia. We downsample the mic to the
// 16 kHz / 16-bit mono PCM the backend expects and stream it to Amazon
// Transcribe, which answers with partial and final transcript messages.
// ---------------------------------------------------------------------------

declare global {
  interface Navigator {
    /** WebKit Audio Session API (iOS 17+). */
    audioSession?: {
      type:
        | "auto"
        | "playback"
        | "transient"
        | "transient-solo"
        | "ambient"
        | "play-and-record";
    };
  }
}

/**
 * Steer iOS audio routing. While a page captures the mic, iOS flips the
 * session to play-and-record, which sends playback to the earpiece at phone-
 * call volume — and it can stay there after capture ends. Set "play-and-
 * record" before capturing and "playback" before speaking to force the
 * loudspeaker. No-op where the API is missing (iOS 16-, other browsers).
 */
export function configureAudioSession(type: "playback" | "play-and-record") {
  if (navigator.audioSession) {
    navigator.audioSession.type = type;
  }
}

const TRANSCRIBE_SAMPLE_RATE_HZ = 16_000;
/** The server cuts recordings at 15 s; stop just under for a clean final. */
const MAX_RECORDING_SECONDS = 14;
/** How long to wait for the final transcript after sending the end event. */
const FINAL_TRANSCRIPT_TIMEOUT_MS = 8_000;

/** Forwards raw mic frames to the main thread for downsampling. */
const PCM_WORKLET_SOURCE = `
class PcmForwarder extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor("pcm-forwarder", PcmForwarder);
`;

export type LiveTranscriptionHandle = {
  /** Stop recording, flush audio, and resolve through onDone. */
  stop: () => void;
  /** Tear everything down without producing a result. */
  cancel: () => void;
};

export function isLiveTranscriptionSupported(): boolean {
  return Boolean(
    typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function" &&
      typeof AudioContext !== "undefined" &&
      "audioWorklet" in AudioContext.prototype,
  );
}

/**
 * Record the microphone and stream it to the transcription WebSocket.
 *
 * Call synchronously from a tap handler: the AudioContext is created before
 * the first await so the user gesture still counts (iOS requirement). Setup
 * failures (permission denied, socket refused) throw; failures after that
 * surface through onError. Exactly one of onDone/onError fires, once.
 */
export async function startLiveTranscription({
  onTranscript,
  onDone,
  onError,
}: {
  /** Progressive updates while speaking (partials included). */
  onTranscript?: (transcript: string, isFinal: boolean) => void;
  /** Recording finished: everything heard, or null for silence. */
  onDone: (transcript: string | null) => void;
  /** Unrecoverable failure after recording started. */
  onError: (error: unknown) => void;
}): Promise<LiveTranscriptionHandle> {
  // Before the first await — see the gesture note in the docstring.
  const context = new AudioContext();
  void context.resume();

  let stream: MediaStream | null = null;
  let workletUrl: string | null = null;
  let socket: WebSocket | null = null;
  let settled = false;
  let stopping = false;
  let finalTimer: number | undefined = undefined;
  let maxTimer: number | undefined = undefined;

  // Transcribe finalizes one segment per pause; keep them all, plus the
  // still-moving partial, so multi-sentence questions survive intact.
  const finalizedParts: string[] = [];
  let currentPartial = "";
  const heardSoFar = () =>
    [...finalizedParts, currentPartial].filter(Boolean).join(" ").trim() ||
    null;

  function teardown() {
    window.clearTimeout(finalTimer);
    window.clearTimeout(maxTimer);
    stream?.getTracks().forEach((track) => track.stop());
    void context.close().catch(() => {});
    if (workletUrl) URL.revokeObjectURL(workletUrl);
    if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
  }

  function finish() {
    if (settled) return;
    settled = true;
    teardown();
    onDone(heardSoFar());
  }

  function fail(error: unknown) {
    if (settled) return;
    settled = true;
    teardown();
    onError(error);
  }

  try {
    configureAudioSession("play-and-record");
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
    workletUrl = URL.createObjectURL(
      new Blob([PCM_WORKLET_SOURCE], { type: "application/javascript" }),
    );
    await context.audioWorklet.addModule(workletUrl);
    socket = await new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(`${WS_BASE_URL}/voice/transcribe`);
      ws.binaryType = "arraybuffer";
      ws.onopen = () => resolve(ws);
      ws.onerror = () => reject(new Error("transcription socket failed to open"));
    });
  } catch (error) {
    teardown();
    throw error;
  }

  const activeSocket = socket;

  activeSocket.onmessage = (event) => {
    if (typeof event.data !== "string") return;
    let message: { type?: string; transcript?: string; is_final?: boolean; detail?: string };
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.type === "transcript" && message.transcript) {
      if (message.is_final) {
        finalizedParts.push(message.transcript);
        currentPartial = "";
      } else {
        currentPartial = message.transcript;
      }
      onTranscript?.(heardSoFar() ?? "", Boolean(message.is_final));
    } else if (message.type === "error") {
      fail(new Error(message.detail ?? "voice transcription failed"));
    }
  };
  // The server closes the socket once Transcribe drains after our end event.
  activeSocket.onclose = () => (stopping ? finish() : fail(new Error("transcription socket closed")));
  activeSocket.onerror = () => fail(new Error("transcription socket error"));

  // 100 ms windows: resample each independently (boundary artifacts are
  // inaudible to STT) so no fractional state crosses chunks.
  const sourceWindowSize = Math.round(context.sampleRate / 10);
  const targetWindowSize = Math.round(TRANSCRIBE_SAMPLE_RATE_HZ / 10);
  let pendingSamples = new Float32Array(0);

  function sendResampled(frame: Float32Array, targetLength: number) {
    if (activeSocket.readyState !== WebSocket.OPEN || targetLength < 2) return;
    const out = new Int16Array(targetLength);
    const scale = (frame.length - 1) / (targetLength - 1);
    for (let i = 0; i < targetLength; i++) {
      const position = i * scale;
      const low = Math.floor(position);
      const high = Math.min(low + 1, frame.length - 1);
      const value = frame[low] + (frame[high] - frame[low]) * (position - low);
      out[i] = Math.max(-32768, Math.min(32767, Math.round(value * 32767)));
    }
    activeSocket.send(out.buffer);
  }

  function flushPending() {
    if (pendingSamples.length === 0) return;
    const targetLength = Math.round(
      (pendingSamples.length * TRANSCRIBE_SAMPLE_RATE_HZ) / context.sampleRate,
    );
    sendResampled(pendingSamples, targetLength);
    pendingSamples = new Float32Array(0);
  }

  const source = context.createMediaStreamSource(stream);
  const forwarder = new AudioWorkletNode(context, "pcm-forwarder");
  forwarder.port.onmessage = (event) => {
    if (settled || stopping) return;
    const chunk = event.data as Float32Array;
    const merged = new Float32Array(pendingSamples.length + chunk.length);
    merged.set(pendingSamples);
    merged.set(chunk, pendingSamples.length);
    pendingSamples = merged;
    while (pendingSamples.length >= sourceWindowSize) {
      sendResampled(pendingSamples.subarray(0, sourceWindowSize), targetWindowSize);
      pendingSamples = pendingSamples.slice(sourceWindowSize);
    }
  };
  source.connect(forwarder);
  // Some WebKit builds only pull data through graphs that reach the
  // destination; a zero-gain sink keeps the mic from echoing to the speakers.
  const muted = context.createGain();
  muted.gain.value = 0;
  forwarder.connect(muted).connect(context.destination);

  function stop() {
    if (settled || stopping) return;
    stopping = true;
    stream?.getTracks().forEach((track) => track.stop());
    flushPending();
    try {
      activeSocket.send(JSON.stringify({ event: "end" }));
    } catch {
      finish();
      return;
    }
    finalTimer = window.setTimeout(finish, FINAL_TRANSCRIPT_TIMEOUT_MS);
  }

  maxTimer = window.setTimeout(stop, MAX_RECORDING_SECONDS * 1000);

  return {
    stop,
    cancel: () => {
      if (settled) return;
      settled = true;
      teardown();
    },
  };
}
