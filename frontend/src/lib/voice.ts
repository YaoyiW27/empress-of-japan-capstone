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
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

  const res = await fetch(`${apiBase}/voice/synthesize`, {
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
