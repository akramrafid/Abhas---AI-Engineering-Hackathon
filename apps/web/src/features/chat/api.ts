"use client";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequestPayload {
  message: string;
  history: ChatTurn[];
  language: "en" | "bn" | "auto";
  ward_id?: string | null;
  origin_week?: string | null;
}

export interface ChatMetaEvent {
  language: "en" | "bn";
  source: "gemini" | "grounded_fallback";
  model: string | null;
  grounded_ward: string | null;
  cached: boolean;
}

export interface ChatDoneEvent {
  latency_ms: number;
  suggestions: string[];
  source: "gemini" | "grounded_fallback";
  model: string | null;
  cached: boolean;
}

export interface ChatStreamCallbacks {
  onMeta?: (meta: ChatMetaEvent) => void;
  onDelta?: (text: string) => void;
  onDone?: (done: ChatDoneEvent) => void;
}

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";

function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  return raw ? raw.replace(/\/+$/, "") : DEFAULT_API_BASE_URL;
}

function makeRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `abhas-chat-${crypto.randomUUID()}`;
  }
  return `abhas-chat-${Date.now().toString(36)}`;
}

/**
 * Stream a grounded reply from POST /api/v1/chat/stream (SSE).
 * Falls back transparently to POST /api/v1/chat if streaming isn't supported.
 */
export async function streamAbhasChat(
  payload: ChatRequestPayload,
  callbacks: ChatStreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const baseUrl = getApiBaseUrl();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream, application/json",
    "X-Request-ID": makeRequestId(),
  };

  const body = JSON.stringify({
    message: payload.message,
    history: payload.history.slice(-10),
    language: payload.language,
    ...(payload.ward_id ? { ward_id: payload.ward_id } : {}),
    ...(payload.origin_week ? { origin_week: payload.origin_week } : {}),
  });

  const response = await fetch(`${baseUrl}/api/v1/chat/stream`, {
    method: "POST",
    headers,
    body,
    signal,
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errJson = (await response.json()) as { detail?: string; title?: string };
      detail = errJson.detail || errJson.title || detail;
    } catch {
      // ignore parse failure
    }
    throw new Error(detail);
  }

  if (!response.body) {
    // Non-streaming fallback
    const fallbackRes = await fetch(`${baseUrl}/api/v1/chat`, {
      method: "POST",
      headers: { ...headers, Accept: "application/json" },
      body,
      signal,
    });
    if (!fallbackRes.ok) {
      throw new Error(`HTTP ${fallbackRes.status}`);
    }
    const data = (await fallbackRes.json()) as {
      reply: string;
      language: "en" | "bn";
      source: "gemini" | "grounded_fallback";
      model: string | null;
      cached: boolean;
      latency_ms: number;
      grounded_ward: string | null;
      suggestions: string[];
    };
    callbacks.onMeta?.({
      language: data.language,
      source: data.source,
      model: data.model,
      grounded_ward: data.grounded_ward,
      cached: data.cached,
    });
    callbacks.onDelta?.(data.reply);
    callbacks.onDone?.({
      latency_ms: data.latency_ms,
      suggestions: data.suggestions,
      source: data.source,
      model: data.model,
      cached: data.cached,
    });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "message";

  const dispatchBlock = (block: string) => {
    const lines = block.split(/\r?\n/);
    let eventName = currentEvent;
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }
    if (dataLines.length === 0) return;
    const rawData = dataLines.join("\n");
    try {
      const parsed = JSON.parse(rawData) as Record<string, unknown>;
      if (eventName === "meta") {
        callbacks.onMeta?.(parsed as unknown as ChatMetaEvent);
      } else if (eventName === "delta" && typeof parsed.text === "string") {
        callbacks.onDelta?.(parsed.text);
      } else if (eventName === "done") {
        callbacks.onDone?.(parsed as unknown as ChatDoneEvent);
      }
    } catch {
      // ignore malformed keepalive chunk
    }
    currentEvent = "message";
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        if (part.trim()) dispatchBlock(part);
      }
    }
    if (buffer.trim()) {
      dispatchBlock(buffer);
    }
  } finally {
    reader.releaseLock();
  }
}
