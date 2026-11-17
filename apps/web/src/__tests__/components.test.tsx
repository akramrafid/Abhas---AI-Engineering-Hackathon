import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AskWorkspace } from "@/components/ask/ask-workspace";
import { BatchWorkspace } from "@/components/batch/batch-workspace";
import { UsageBadge } from "@/components/common/usage-badge";
import type { AskResponse, Citation } from "@/lib/api/types";

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

function makeControlledSSEStream() {
  const encoder = new TextEncoder();
  let controllerRef!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
    },
  });
  return {
    stream,
    push(event: string, data: unknown) {
      controllerRef.enqueue(
        encoder.encode(`event: ${event}\r\ndata: ${JSON.stringify(data)}\r\n\r\n`),
      );
    },
    close() {
      controllerRef.close();
    },
  };
}

describe("UsageBadge", () => {
  it("shows cached tag only when usage.cached is true", () => {
    const { rerender } = render(
      <UsageBadge
        usage={{
          model: "gemini-3.1-flash-lite",
          llm_calls: 1,
          prompt_tokens: 10,
          completion_tokens: 5,
          cost_usd: 0.0001,
          latency_ms: 42,
          cached: false,
        }}
      />,
    );
    expect(screen.queryByTestId("usage-cached-badge")).not.toBeInTheDocument();

    rerender(
      <UsageBadge
        usage={{
          model: "gemini-3.1-flash-lite",
          llm_calls: 0,
          prompt_tokens: 10,
          completion_tokens: 5,
          cost_usd: 0,
          latency_ms: 12,
          cached: true,
        }}
      />,
    );
    expect(screen.getByTestId("usage-cached-badge")).toHaveTextContent("cached");
  });
});

describe("AskWorkspace citation gating (CR-12)", () => {
  it("hides Sources and chips while streaming and on refusals, showing chips only after done with answered=true", async () => {
    const citation: Citation = {
      id: 1,
      doc_id: "outage-sla",
      title: "Outage Credits and SLA",
      section: "Credit table",
      snippet: "5 days of credit",
      score: 0.9,
    };

    const refusalSSE = makeControlledSSEStream();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(refusalSSE.stream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      );

    renderWithQuery(<AskWorkspace />);

    fireEvent.click(screen.getByTestId("example-stock-price"));

    await waitFor(() => {
      expect(screen.getByTestId("answer")).toBeInTheDocument();
    });

    // Server sends candidate citations before tokens; UI must NOT flash Sources while streaming
    refusalSSE.push("meta", { request_id: "req-1", language: "en" });
    refusalSSE.push("citations", [citation]);
    refusalSSE.push("token", { text: "The documents do not cover [1] " });

    await waitFor(() => {
      expect(screen.getByTestId("answer")).toHaveTextContent(
        "The documents do not cover",
      );
    });
    expect(screen.queryByTestId("sources-row")).not.toBeInTheDocument();
    expect(screen.queryByTestId("citation-1")).not.toBeInTheDocument();

    const refusalDone: AskResponse = {
      answer: "The documents do not cover this.",
      answered: false,
      language: "en",
      citations: [citation],
      usage: {
        model: "gemini-3.1-flash-lite",
        llm_calls: 1,
        prompt_tokens: 50,
        completion_tokens: 10,
        cost_usd: 0.0001,
        latency_ms: 120,
        cached: false,
      },
    };
    refusalSSE.push("done", refusalDone);
    refusalSSE.close();

    await waitFor(() => {
      expect(screen.getByTestId("not-in-kb-badge")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("sources-row")).not.toBeInTheDocument();
    expect(screen.queryByTestId("citation-1")).not.toBeInTheDocument();

    // Now test answered=true: chips and Sources appear once done arrives
    const answeredSSE = makeControlledSSEStream();
    fetchSpy.mockResolvedValueOnce(
      new Response(answeredSSE.stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    fireEvent.click(screen.getByText("30-hour outage credit"));
    answeredSSE.push("meta", { request_id: "req-2", language: "en" });
    answeredSSE.push("citations", [citation]);
    answeredSSE.push("token", { text: "You get 5 days [1]." });

    await waitFor(() => {
      expect(screen.getAllByTestId("answer")).toHaveLength(2);
    });
    expect(screen.queryByTestId("sources-row")).not.toBeInTheDocument();

    answeredSSE.push("done", {
      answer: "You get 5 days [1].",
      answered: true,
      language: "en",
      citations: [citation],
      usage: {
        model: "gemini-3.1-flash-lite",
        llm_calls: 1,
        prompt_tokens: 50,
        completion_tokens: 10,
        cost_usd: 0.0001,
        latency_ms: 140,
        cached: true,
      },
    } satisfies AskResponse);
    answeredSSE.close();

    await waitFor(() => {
      expect(screen.getByTestId("sources-row")).toBeInTheDocument();
    });
    expect(screen.getAllByTestId("citation-1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("usage-cached-badge")).toHaveTextContent("cached");

    fetchSpy.mockRestore();
  });
});

describe("BatchWorkspace 429 batch_in_progress", () => {
  it("renders a friendly warning card with retry when batch returns 429 batch_in_progress", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: "batch_in_progress",
            message: "A batch triage run is already in progress. Please wait.",
            request_id: "req-429-batch",
          },
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    renderWithQuery(<BatchWorkspace />);
    fireEvent.click(screen.getByTestId("run-batch-button"));

    await waitFor(() => {
      expect(screen.getByTestId("batch-in-progress-alert")).toBeInTheDocument();
    });

    const alert = screen.getByTestId("batch-in-progress-alert");
    expect(alert).toHaveTextContent("Batch run already in progress");
    expect(alert).toHaveTextContent("req-429-batch");
    expect(screen.getByTestId("retry-button")).toBeInTheDocument();

    fetchSpy.mockRestore();
  });
});
