export type ChatHistoryTurn = {
    role: "user" | "assistant";
    content: string;
  };
  
  export async function sendChatMessage({
    personaId,
    scene,
    message,
    history = [],
  }: {
    personaId: string;
    scene?: string;
    message: string;
    history?: ChatHistoryTurn[];
  }) {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
  
    const res = await fetch(`${apiBase}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        persona_id: personaId,
        scene,
        message,
        history,
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