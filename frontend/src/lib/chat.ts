import { API_BASE_URL } from "@/lib/api";

export type ChatHistoryTurn = {
  role: "user" | "assistant";
  content: string;
};

type StoredChatSession = {
  sessionId: string;
  lastActivityAt: number;
};

const CHAT_SESSION_STORAGE_KEY = "empress.chat.session.v1";
const CHAT_SESSION_IDLE_TTL_MS = 30 * 60 * 1000;

// Used only when sessionStorage is unavailable (for example, strict privacy
// settings). A module instance belongs to one browser tab.
let fallbackSession: StoredChatSession | null = null;

export function getOrCreateTabChatSession(now = Date.now()): {
  sessionId: string;
  isNew: boolean;
} {
  let stored = fallbackSession;

  try {
    const raw = window.sessionStorage.getItem(CHAT_SESSION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredChatSession>;
      if (
        typeof parsed.sessionId === "string" &&
        parsed.sessionId.length > 0 &&
        typeof parsed.lastActivityAt === "number"
      ) {
        stored = {
          sessionId: parsed.sessionId,
          lastActivityAt: parsed.lastActivityAt,
        };
      }
    }
  } catch {
    // Fall back to the tab's in-memory module state.
  }

  const activeSession =
    stored !== null &&
    now >= stored.lastActivityAt &&
    now - stored.lastActivityAt < CHAT_SESSION_IDLE_TTL_MS
      ? stored
      : null;
  const next: StoredChatSession = {
    sessionId: activeSession?.sessionId ?? crypto.randomUUID(),
    lastActivityAt: now,
  };
  fallbackSession = next;

  try {
    window.sessionStorage.setItem(CHAT_SESSION_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The in-memory fallback still keeps this tab consistent until reload.
  }

  return { sessionId: next.sessionId, isNew: activeSession === null };
}

export async function sendChatMessage({
  personaId,
  scene,
  message,
  sessionId,
}: {
  personaId: string;
  scene?: string;
  message: string;
  sessionId: string;
}) {
  const res = await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      persona_id: personaId,
      scene,
      message,
      session_id: sessionId,
    }),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json() as Promise<{
    persona_id: string;
    response: string;
  }>;
}
