import { WS_BASE_URL } from "@/lib/api";

/**
 * Streaming speech-to-text against the backend `WS /voice/transcribe` endpoint
 * (Amazon Transcribe). Captures the microphone, converts it to the raw PCM the
 * backend expects — 16 kHz, 16-bit signed little-endian, mono — streams it over a
 * WebSocket, and surfaces interim + final transcripts.
 *
 * This works in any browser with getUserMedia + AudioWorklet + WebSocket
 * (Chrome, Firefox, Safari), unlike the Web Speech API which is Chrome-only.
 * `NarratorOverlay` uses this as the primary path and falls back to Web Speech
 * when `isTranscribeSupported()` is false.
 */

// Must match backend/app/voice.py (VOICE_SAMPLE_RATE_HZ, VOICE_MAX_RECORDING_SECONDS).
const TARGET_SAMPLE_RATE = 16_000;
const MAX_RECORDING_MS = 15_000;

type AudioContextConstructor = typeof AudioContext;

function getAudioContextCtor(): AudioContextConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextConstructor })
      .webkitAudioContext
  );
}

/** True when the browser can capture raw PCM and open a WebSocket. */
export function isTranscribeSupported(): boolean {
  const Ctx = getAudioContextCtor();
  return (
    typeof window !== "undefined" &&
    typeof WebSocket !== "undefined" &&
    typeof AudioWorkletNode !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    Boolean(Ctx)
  );
}

export type TranscribeHandlers = {
  /** Live transcript (accumulated finals + current partial). May fire many times. */
  onInterim?: (text: string) => void;
  /** The complete transcript, fired exactly once when the session ends. */
  onResult: (text: string) => void;
  /** A user-facing error message; the session is torn down after this fires. */
  onError?: (message: string) => void;
};

export type TranscribeSession = {
  /** Stop recording, flush, and resolve with the final transcript. Idempotent. */
  stop: () => void;
};

// AudioWorklet module (runs off the main thread): forward each mono frame of
// Float32 samples to the main thread, which resamples and ships PCM.
const WORKLET_SOURCE = `
class PCMCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) {
      this.port.postMessage(channel.slice(0));
    }
    return true;
  }
}
registerProcessor('pcm-capture', PCMCaptureProcessor);
`;

function floatToPcm16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
}

/**
 * Linear resampler from the AudioContext's sample rate down to 16 kHz, carrying
 * the phase and boundary sample across chunks so there are no seams. When the
 * context already runs at 16 kHz (most browsers honour the request) this is a
 * straight Float32 → Int16 copy.
 */
function createPcmEncoder(inputSampleRate: number) {
  const ratio = inputSampleRate / TARGET_SAMPLE_RATE;
  let phase = 0;
  let lastSample = 0;

  return function encode(input: Float32Array): ArrayBuffer {
    if (inputSampleRate === TARGET_SAMPLE_RATE) {
      const pcm = new Int16Array(input.length);
      for (let i = 0; i < input.length; i += 1) pcm[i] = floatToPcm16(input[i]);
      return pcm.buffer;
    }

    const out: number[] = [];
    while (phase < input.length) {
      const idx = Math.floor(phase);
      const frac = phase - idx;
      const prev = idx === 0 ? lastSample : input[idx - 1];
      const curr = input[idx];
      out.push(prev + (curr - prev) * frac);
      phase += ratio;
    }
    phase -= input.length;
    lastSample = input[input.length - 1];

    const pcm = new Int16Array(out.length);
    for (let i = 0; i < out.length; i += 1) pcm[i] = floatToPcm16(out[i]);
    return pcm.buffer;
  };
}

/**
 * Begin a streaming transcription session. Returns immediately with a `stop()`
 * handle; audio setup happens asynchronously. Call `stop()` (or wait for the
 * 15s cap) to finish — `onResult` then fires once with the full transcript.
 */
export function startTranscription(handlers: TranscribeHandlers): TranscribeSession {
  const { onInterim, onResult, onError } = handlers;

  let ws: WebSocket | null = null;
  let audioContext: AudioContext | null = null;
  let mediaStream: MediaStream | null = null;
  let workletNode: AudioWorkletNode | null = null;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;

  let finalText = "";
  let partialText = "";
  let stopRequested = false;
  let settled = false;

  function teardownAudio() {
    if (maxTimer) {
      clearTimeout(maxTimer);
      maxTimer = null;
    }
    mediaStream?.getTracks().forEach((track) => track.stop());
    mediaStream = null;
    workletNode?.port.close();
    workletNode?.disconnect();
    workletNode = null;
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close();
    }
    audioContext = null;
  }

  function settle() {
    if (settled) return;
    settled = true;
    teardownAudio();
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
    ws = null;
    onResult(finalText.trim());
  }

  function fail(message: string) {
    if (settled) return;
    settled = true;
    teardownAudio();
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
    ws = null;
    onError?.(message);
  }

  // Send the end sentinel and let the server flush remaining finals + close;
  // a short backstop resolves in case the socket lingers.
  function finish() {
    mediaStream?.getTracks().forEach((track) => track.stop());
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send("end");
      setTimeout(settle, 1_500);
    } else {
      settle();
    }
  }

  (async () => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(`${WS_BASE_URL}/voice/transcribe`);
      socket.binaryType = "arraybuffer";
      ws = socket;
    } catch {
      fail("Could not connect to the voice service.");
      return;
    }

    socket.onmessage = (event) => {
      let payload: { type?: string; transcript?: string; is_final?: boolean; detail?: string };
      try {
        payload = JSON.parse(event.data as string);
      } catch {
        return;
      }
      if (payload.type === "error") {
        fail(payload.detail ?? "Voice transcription failed.");
        return;
      }
      if (payload.type === "transcript") {
        if (payload.is_final) {
          finalText = `${finalText} ${payload.transcript ?? ""}`.trim();
          partialText = "";
        } else {
          partialText = payload.transcript ?? "";
        }
        onInterim?.(`${finalText} ${partialText}`.trim());
      }
    };

    // Server closes the socket after it finishes streaming finals.
    socket.onclose = () => settle();
    socket.onerror = () => fail("The voice connection was interrupted.");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      fail("Microphone access was denied.");
      return;
    }
    if (stopRequested) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    mediaStream = stream;

    const Ctx = getAudioContextCtor();
    if (!Ctx) {
      fail("Audio capture is not supported in this browser.");
      return;
    }

    try {
      const context = new Ctx({ sampleRate: TARGET_SAMPLE_RATE });
      audioContext = context;

      const moduleUrl = URL.createObjectURL(
        new Blob([WORKLET_SOURCE], { type: "application/javascript" }),
      );
      await context.audioWorklet.addModule(moduleUrl);
      URL.revokeObjectURL(moduleUrl);
      if (stopRequested || settled) return;

      const encode = createPcmEncoder(context.sampleRate);
      const source = context.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(context, "pcm-capture");
      workletNode = node;

      node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(encode(event.data));
      };

      // Keep the node in the graph so it pulls audio, but mute the output so the
      // microphone is never echoed back to the speakers.
      const mute = context.createGain();
      mute.gain.value = 0;
      source.connect(node);
      node.connect(mute);
      mute.connect(context.destination);
    } catch {
      fail("Audio capture is not supported in this browser.");
      return;
    }

    maxTimer = setTimeout(finish, MAX_RECORDING_MS);
  })();

  return {
    stop() {
      if (settled) return;
      stopRequested = true;
      finish();
    },
  };
}
