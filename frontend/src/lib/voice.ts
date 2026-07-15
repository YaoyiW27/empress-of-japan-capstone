import { API_BASE_URL } from "@/lib/api";

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
