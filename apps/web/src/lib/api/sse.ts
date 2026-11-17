import { env } from "@/lib/env";
import {
  ApiError,
  createLinkedTimeoutController,
  normalizeThrownError,
  toApiError,
} from "./errors";
import type { AskRequest, AskResponse, Citation } from "./types";

export interface SSEEvent {
  event: string;
  data: string;
}

export interface AskMetaPayload {
  request_id: string;
  language: string;
}

export interface AskTokenPayload {
  text: string;
}

export interface AskErrorPayload {
  code: string;
  message: string;
  request_id?: string;
}

export type AskStreamHandlers = {
  onMeta?: (meta: AskMetaPayload) => void;
  onCitations?: (citations: Citation[]) => void;
  onToken?: (text: string) => void;
  onDone?: (response: AskResponse) => void;
  onError?: (error: AskErrorPayload) => void;
};

/**
 * Parses a single raw SSE event block (lines separated by \n) into event name + raw data string.
 * Returns null for comment-only / keepalive blocks.
 */
export function parseSSEBlock(block: string): SSEEvent | null {
  let eventName = "message";
  const dataLines: string[] = [];

  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) {
      continue;
    }
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim() || "message";
    } else if (line.startsWith("data:")) {
      // SSE spec: strip at most one optional leading space after `data:`
      const rawValue = line.slice(5);
      dataLines.push(rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue);
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return {
    event: eventName,
    data: dataLines.join("\n"),
  };
}

/**
 * Consumes a ReadableStream of UTF-8 SSE bytes, supporting both `\n\n` (Unix)
 * and `\r\n\r\n` (sse-starlette / Windows) delimiters as well as arbitrary chunk splits.
 */
export async function consumeSSEStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: string, data: unknown) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  const emitBlock = (rawBlock: string) => {
    const parsed = parseSSEBlock(rawBlock);
    if (!parsed) return;
    let decoded: unknown;
    try {
      decoded = JSON.parse(parsed.data);
    } catch {
      throw new ApiError({
        status: 502,
        code: "invalid_sse_json",
        message: "Received malformed event payload from the streaming endpoint.",
      });
    }
    onEvent(parsed.event, decoded);
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      const textChunk = done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });

      if (textChunk) {
        // Normalize CRLF -> LF and stray CR -> LF, preserving a trailing CR across chunks
        // in case a `\r\n` pair was split across read() boundaries.
        const combined = buffer + textChunk;
        const hasTrailingCR = !done && combined.endsWith("\r");
        const safeSlice = hasTrailingCR ? combined.slice(0, -1) : combined;
        buffer =
          safeSlice.replace(/\r\n/g, "\n").replace(/\r/g, "\n") +
          (hasTrailingCR ? "\r" : "");

        let boundaryIdx: number;
        while ((boundaryIdx = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, boundaryIdx);
          buffer = buffer.slice(boundaryIdx + 2);
          emitBlock(block);
        }
      }

      if (done) {
        const trailing = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
        if (trailing.length > 0) {
          emitBlock(trailing);
        }
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

const STREAM_TIMEOUT_MS = 90_000;

export async function streamAsk(
  request: AskRequest,
  handlers: AskStreamHandlers,
  options?: { signal?: AbortSignal; timeoutMs?: number; baseUrl?: string },
): Promise<void> {
  const baseUrl = (options?.baseUrl ?? env.NEXT_PUBLIC_API_URL).replace(/\/+$/, "");
  const timeoutMs = options?.timeoutMs ?? STREAM_TIMEOUT_MS;
  const linked = createLinkedTimeoutController(timeoutMs, options?.signal);

  let latestRequestId: string | undefined;

  try {
    const response = await fetch(`${baseUrl}/ask/stream`, {
      method: "POST",
      signal: linked.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(request),
    });

    latestRequestId = response.headers.get("x-request-id") ?? undefined;

    if (!response.ok || !response.body) {
      throw await toApiError(response);
    }

    await consumeSSEStream(response.body, (eventName, payload) => {
      switch (eventName) {
        case "meta": {
          const meta = payload as AskMetaPayload;
          if (meta.request_id) latestRequestId = meta.request_id;
          handlers.onMeta?.(meta);
          break;
        }
        case "citations": {
          handlers.onCitations?.(Array.isArray(payload) ? (payload as Citation[]) : []);
          break;
        }
        case "token": {
          const token = payload as AskTokenPayload;
          if (typeof token?.text === "string") {
            handlers.onToken?.(token.text);
          }
          break;
        }
        case "done": {
          handlers.onDone?.(payload as AskResponse);
          break;
        }
        case "error": {
          const errPayload = payload as AskErrorPayload;
          const enriched: AskErrorPayload = {
            code: errPayload?.code ?? "stream_error",
            message: errPayload?.message ?? "Streaming failed. Please retry.",
            request_id: errPayload?.request_id ?? latestRequestId,
          };
          handlers.onError?.(enriched);
          throw new ApiError({
            status: 502,
            code: enriched.code,
            message: enriched.message,
            requestId: enriched.request_id,
          });
        }
        default:
          break;
      }
    });
  } catch (err) {
    if (linked.didTimeout()) {
      throw new ApiError({
        status: 408,
        code: "stream_timeout",
        message: `Streaming timed out after ${Math.round(timeoutMs / 1000)}s. Please try again.`,
        requestId: latestRequestId,
        isTimeout: true,
      });
    }
    const normalized = normalizeThrownError(err, { apiUrl: baseUrl, timeoutMs });
    if (latestRequestId && !normalized.requestId) {
      throw new ApiError({
        status: normalized.status,
        code: normalized.code,
        message: normalized.message,
        requestId: latestRequestId,
        isTimeout: normalized.isTimeout,
        isNetworkError: normalized.isNetworkError,
      });
    }
    throw normalized;
  } finally {
    linked.cleanup();
  }
}
