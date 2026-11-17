import { describe, expect, it } from "vitest";
import { toApiError } from "@/lib/api/errors";
import { splitWithHighlight } from "@/lib/utils";

describe("splitWithHighlight", () => {
  it("highlights exact urgency evidence case-insensitively", () => {
    const segments = splitWithHighlight(
      "My internet is down. Someone logged into my account and I think my account is hacked. Help!",
      "i think my account is hacked.",
    );

    expect(segments).toEqual([
      {
        text: "My internet is down. Someone logged into my account and ",
        highlighted: false,
      },
      { text: "I think my account is hacked.", highlighted: true },
      { text: " Help!", highlighted: false },
    ]);
  });

  it("handles whitespace-normalized evidence and missing evidence gracefully", () => {
    const flexSegments = splitWithHighlight(
      "This is   an emergency.",
      "this is an emergency.",
    );
    expect(flexSegments).toEqual([
      { text: "This is   an emergency.", highlighted: true },
    ]);

    expect(splitWithHighlight("Plain ticket", "")).toEqual([
      { text: "Plain ticket", highlighted: false },
    ]);
  });
});

describe("toApiError", () => {
  it("extracts ErrorResponse envelope fields and header fallback", async () => {
    const res = new Response(
      JSON.stringify({
        error: {
          code: "validation_error",
          message: "text: String should have at least 1 character",
          request_id: "req-422",
        },
      }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    );

    const apiErr = await toApiError(res);
    expect(apiErr.status).toBe(422);
    expect(apiErr.code).toBe("validation_error");
    expect(apiErr.message).toBe("text: String should have at least 1 character");
    expect(apiErr.requestId).toBe("req-422");
  });

  it("supports pre-parsed body from openapi-fetch without re-reading stream", async () => {
    const res = new Response(null, {
      status: 404,
      headers: { "x-request-id": "hdr-404" },
    });

    const apiErr = await toApiError(res, {
      error: { code: "not_found", message: "Document not found" },
    });

    expect(apiErr.status).toBe(404);
    expect(apiErr.code).toBe("not_found");
    expect(apiErr.message).toBe("Document not found");
    expect(apiErr.requestId).toBe("hdr-404");
  });
});
