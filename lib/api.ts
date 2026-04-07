import { Message, Source } from "./types";

type ChatApiResponse = {
  answer: string;
  sources: Source[];
  traceId?: string;
};

export async function saveSceneIntent(traceId: string) {
  const response = await fetch("/api/chat/scene-intents", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ traceId }),
  });

  if (!response.ok) {
    throw new Error("scene_intent_save_failed");
  }

  return response.json();
}

export async function sendChatMessage(input: string): Promise<Message> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: input }),
  });

  if (!response.ok) {
    throw new Error("chat_request_failed");
  }

  const payload = (await response.json()) as ChatApiResponse;

  return {
    id: `assistant-${Date.now()}`,
    role: "assistant",
    content: payload.answer,
    sources: payload.sources,
    traceId: payload.traceId,
  };
}
