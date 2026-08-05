import { API_BASE_URL } from "@/lib/api";

export type ChatHistoryTurn = {
  role: "user" | "assistant";
  content: string;
};

type StoredChatSession = {
  sessionId: string;
  lastActivityAt: number;
};

export type Citation = {
  source_type:
    | "vmm_catalogue"
    | "vmm_digitized_sample"
    | "external_historical";
  title: string;
  source_field: string;
  object_identifier: string | null;
  public_url: string | null;
  author_publisher: string | null;
  source_url: string | null;
  license: string | null;
};

export type ChatResponse = {
  persona_id: string;
  response: string;
  citations: Citation[];
};

type ChatRequestBody = {
  persona_id: string;
  scene?: string;
  message: string;
  session_id?: string;
  history?: ChatHistoryTurn[];
};

const CHAT_SESSION_STORAGE_KEY_PREFIX = "empress.chat.session.v2";
const CHAT_SESSION_IDLE_TTL_MS = 30 * 60 * 1000;
const CHAT_HISTORY_FALLBACK_TURN_LIMIT = 8;

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
  history = [],
}: {
  personaId: string;
  scene?: string;
  message: string;
  sessionId: string;
  history?: ChatHistoryTurn[];
}): Promise<ChatResponse>  {
  const send = (body: ChatRequestBody) =>
    fetch(`${API_BASE_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

  const res = await send({
    persona_id: personaId,
    scene,
    message,
    session_id: sessionId,
    history: history.slice(-CHAT_HISTORY_FALLBACK_TURN_LIMIT),
  });

  if (res.ok) {
    return res.json() as Promise<ChatResponse>;
  }

  const errorText = await res.text();
  const canUseStatelessFallback =
    (res.status === 501 && errorText.includes("session_id memory is not enabled")) ||
    (res.status === 503 && errorText.includes("session memory is unavailable"));

  if (canUseStatelessFallback) {
    // Compatibility path for deployments that have the session-memory schema
    // but have not rolled ENABLE_SESSION_MEMORY into the live ECS task yet, or
    // when the session checkpoint store is temporarily unavailable.
    const fallbackRes = await send({
      persona_id: personaId,
      scene,
      message,
      history: history.slice(-CHAT_HISTORY_FALLBACK_TURN_LIMIT),
    });

    if (fallbackRes.ok) {
      return fallbackRes.json() as Promise<ChatResponse>;
    }

    throw new Error(await fallbackRes.text());
  }

  throw new Error(errorText);
}
