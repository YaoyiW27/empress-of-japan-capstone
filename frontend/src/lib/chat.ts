import { API_BASE_URL } from "@/lib/api";

export type ChatHistoryTurn = {
  role: "user" | "assistant";
  content: string;
};

type StoredChatSession = {
  sessionId: string;
  lastActivityAt: number;
};

const CHAT_SESSION_STORAGE_KEY_PREFIX = "empress.chat.session.v2";
const CHAT_SESSION_IDLE_TTL_MS = 30 * 60 * 1000;

// Used only when sessionStorage is unavailable (for example, strict privacy
// settings). A module instance belongs to one browser tab.
const fallbackSessions = new Map<string, StoredChatSession>();

export function getOrCreateTabChatSession(
  narratorId: string,
  now = Date.now(),
): {
  sessionId: string;
  isNew: boolean;
} {
  const storageKey = `${CHAT_SESSION_STORAGE_KEY_PREFIX}:${encodeURIComponent(narratorId)}`;
  let stored = fallbackSessions.get(narratorId) ?? null;

  try {
    const raw = window.sessionStorage.getItem(storageKey);
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
  fallbackSessions.set(narratorId, next);

  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(next));
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
