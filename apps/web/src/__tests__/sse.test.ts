import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { consumeSSEStream, parseSSEBlock, streamAsk } from "@/lib/api/sse";
import type { AskResponse, Citation } from "@/lib/api/types";

function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe("parseSSEBlock", () => {
  it("parses standard event and data lines", () => {
    const parsed = parseSSEBlock('event: token\ndata: {"text":"hello"}');
    expect(parsed).toEqual({
      event: "token",
      data: '{"text":"hello"}',
    });
  });

  it("handles data without space and multi-line data blocks", () => {
    const parsed = parseSSEBlock(
      'event: message\n: keepalive\ndata:{"line":1}\ndata: {"line":2}',
    );
    expect(parsed).toEqual({
      event: "message",
      data: '{"line":1}\n{"line":2}',
    });
  });

  it("returns null for comment-only or empty blocks", () => {
    expect(parseSSEBlock(": ping\n: keepalive")).toBeNull();
    expect(parseSSEBlock("")).toBeNull();
  });
});

describe("consumeSSEStream", () => {
  it("parses CRLF sse-starlette delimiters split across chunks and UTF-8 Bangla", async () => {
    const events: Array<{ event: string; data: unknown }> = [];
    const stream = makeStream([
      'event: meta\r\ndata: {"request_id":"req-1","language":"bn"}\r',
      '\n\r\nevent: token\r\ndata: {"text":"৫ দিনের "}\r\n\r\n',
      'event: token\r\ndata: {"text":"ক্রেডিট"}\r\n\r\n',
    ]);

    await consumeSSEStream(stream, (event, data) => {
      events.push({ event, data });
    });

    expect(events).toEqual([
      { event: "meta", data: { request_id: "req-1", language: "bn" } },
      { event: "token", data: { text: "৫ দিনের " } },
      { event: "token", data: { text: "ক্রেডিট" } },
    ]);
  });

  it("flushes a trailing block without double newline at stream EOF", async () => {
    const events: Array<{ event: string; data: unknown }> = [];
    const stream = makeStream(['event: token\ndata: {"text":"final"}']);

    await consumeSSEStream(stream, (event, data) => {
      events.push({ event, data });
    });

    expect(events).toEqual([{ event: "token", data: { text: "final" } }]);
  });

  it("throws ApiError when SSE data is malformed JSON", async () => {
    const stream = makeStream(["event: token\ndata: {not-json}\n\n"]);

    await expect(
      consumeSSEStream(stream, () => undefined),
    ).rejects.toMatchObject({
      code: "invalid_sse_json",
    });
  });
});

describe("streamAsk", () => {
  it("dispatches meta, citations, tokens, and done in order", async () => {
    const citation: Citation = {
      id: 1,
      doc_id: "outage-sla",
      title: "Outage Credits and SLA",
      section: "Outage credit table",
      snippet: "More than 24 and up to 48 hours | 5 days of credit",
      score: 0.92,
    };
    const finalResponse: AskResponse = {
      answer: "You receive 5 days of credit [1].",
      answered: true,
      language: "en",
      citations: [citation],
      usage: {
        model: "mock",
        llm_calls: 1,
        prompt_tokens: 100,
        completion_tokens: 20,
        cost_usd: 0.0001,
        latency_ms: 42,
        cached: false,
      },
    };

    const payload = [
      'event: meta\r\ndata: {"request_id":"rid-123","language":"en"}\r\n\r\n',
      `event: citations\r\ndata: ${JSON.stringify([citation])}\r\n\r\n`,
      'event: token\r\ndata: {"text":"You receive "}\r\n\r\n',
      'event: token\r\ndata: {"text":"5 days of credit [1]."}\r\n\r\n',
      `event: done\r\ndata: ${JSON.stringify(finalResponse)}\r\n\r\n`,
    ];

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(makeStream(payload), {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "x-request-id": "rid-123",
        },
      }),
    );

    const tokens: string[] = [];
    const onMeta = vi.fn();
    const onCitations = vi.fn();
    const onDone = vi.fn();

    await streamAsk(
      { question: "How much credit for 30 hours?" },
      {
        onMeta,
        onCitations,
        onToken: (t) => tokens.push(t),
        onDone,
      },
      { baseUrl: "http://localhost:8003" },
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:8003/ask/stream",
      expect.objectContaining({ method: "POST" }),
    );
    expect(onMeta).toHaveBeenCalledWith({ request_id: "rid-123", language: "en" });
    expect(onCitations).toHaveBeenCalledWith([citation]);
    expect(tokens.join("")).toBe("You receive 5 days of credit [1].");
    expect(onDone).toHaveBeenCalledWith(finalResponse);

    fetchSpy.mockRestore();
  });

  it("raises ApiError with backend request_id on non-2xx responses", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: "upstream_unavailable",
            message: "The AI provider is unavailable.",
            request_id: "rid-err-9",
          },
        }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(
      streamAsk(
        { question: "Hello?" },
        {},
        { baseUrl: "http://localhost:8003" },
      ),
    ).rejects.toMatchObject({
      status: 503,
      code: "upstream_unavailable",
      message: "The AI provider is unavailable.",
      requestId: "rid-err-9",
    });

    fetchSpy.mockRestore();
  });

  it("raises ApiError when stream emits an error event", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        makeStream([
          'event: meta\ndata: {"request_id":"rid-stream","language":"en"}\n\n',
          'event: error\ndata: {"code":"rate_limited","message":"Provider rate limited"}\n\n',
        ]),
        { status: 200 },
      ),
    );

    const onError = vi.fn();

    await expect(
      streamAsk(
        { question: "Hello?" },
        { onError },
        { baseUrl: "http://localhost:8003" },
      ),
    ).rejects.toBeInstanceOf(ApiError);

    expect(onError).toHaveBeenCalledWith({
      code: "rate_limited",
      message: "Provider rate limited",
      request_id: "rid-stream",
    });

    fetchSpy.mockRestore();
  });

  it("normalizes connection failure to network_unreachable", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(
      streamAsk(
        { question: "Hello?" },
        {},
        { baseUrl: "http://localhost:8003" },
      ),
    ).rejects.toMatchObject({
      code: "network_unreachable",
      isNetworkError: true,
    });

    fetchSpy.mockRestore();
  });
});
