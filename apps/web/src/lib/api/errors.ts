export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly isTimeout: boolean;
  readonly isNetworkError: boolean;

  constructor(options: {
    status: number;
    code: string;
    message: string;
    requestId?: string;
    isTimeout?: boolean;
    isNetworkError?: boolean;
  }) {
    super(options.message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.isTimeout = Boolean(options.isTimeout);
    this.isNetworkError = Boolean(options.isNetworkError);
  }
}

interface BackendErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    request_id?: string;
  };
  title?: string;
  detail?: unknown;
  request_id?: string;
}

function extractValidationDetail(detail: unknown): string | null {
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { loc?: unknown[]; msg?: string };
    const loc = Array.isArray(first.loc)
      ? first.loc.filter((part) => part !== "body").join(".")
      : "";
    if (first.msg) {
      return loc ? `${loc}: ${first.msg}` : first.msg;
    }
  }
  return null;
}

function fromPayload(
  status: number,
  statusText: string,
  payload: unknown,
  headerReqId?: string,
): ApiError {
  if (typeof payload === "string" && payload.trim()) {
    return new ApiError({
      status,
      code: `http_${status}`,
      message: payload,
      requestId: headerReqId,
    });
  }

  if (payload && typeof payload === "object") {
    const typed = payload as BackendErrorEnvelope;
    if (typed.error && typeof typed.error === "object") {
      return new ApiError({
        status,
        code: typed.error.code ?? `http_${status}`,
        message:
          typed.error.message ||
          statusText ||
          `Request failed with status ${status}`,
        requestId: typed.error.request_id ?? headerReqId,
      });
    }

    const detailMessage = extractValidationDetail(typed.detail);
    return new ApiError({
      status,
      code: `http_${status}`,
      message:
        detailMessage ??
        typed.title ??
        (statusText || `Request failed with status ${status}`),
      requestId: typed.request_id ?? headerReqId,
    });
  }

  return new ApiError({
    status,
    code: `http_${status}`,
    message: statusText || `Request failed with status ${status}`,
    requestId: headerReqId,
  });
}

export async function toApiError(
  res: Response,
  preParsedBody?: unknown,
): Promise<ApiError> {
  const headerReqId = res.headers.get("x-request-id") ?? undefined;
  if (preParsedBody !== undefined) {
    return fromPayload(res.status, res.statusText, preParsedBody, headerReqId);
  }

  if (res.bodyUsed) {
    return fromPayload(res.status, res.statusText, undefined, headerReqId);
  }

  try {
    const payload: unknown = await res.json();
    return fromPayload(res.status, res.statusText, payload, headerReqId);
  } catch {
    return fromPayload(res.status, res.statusText, undefined, headerReqId);
  }
}

export function normalizeThrownError(
  err: unknown,
  context: { apiUrl?: string; timeoutMs?: number } = {},
): ApiError {
  if (err instanceof ApiError) return err;

  if (err instanceof DOMException && err.name === "AbortError") {
    return new ApiError({
      status: 0,
      code: "aborted",
      message: "Request was cancelled.",
    });
  }

  if (err instanceof Error) {
    if (err.name === "TimeoutError") {
      const secs = context.timeoutMs ? Math.round(context.timeoutMs / 1000) : 30;
      return new ApiError({
        status: 408,
        code: "timeout",
        message: `Request timed out after ${secs}s. Please try again.`,
        isTimeout: true,
      });
    }

    if (err.name === "AbortError") {
      return new ApiError({
        status: 0,
        code: "aborted",
        message: "Request was cancelled.",
      });
    }

    const lower = err.message.toLowerCase();
    if (
      err instanceof TypeError ||
      lower.includes("failed to fetch") ||
      lower.includes("networkerror") ||
      lower.includes("load failed") ||
      lower.includes("fetch failed") ||
      lower.includes("econnrefused")
    ) {
      const target = context.apiUrl ?? "the LumaDesk API";
      return new ApiError({
        status: 0,
        code: "network_unreachable",
        message: `Cannot connect to ${target}. Verify the API server is running and retry.`,
        isNetworkError: true,
      });
    }

    return new ApiError({
      status: 0,
      code: "unexpected_error",
      message: err.message || "Unexpected error occurred. Please try again.",
    });
  }

  return new ApiError({
    status: 0,
    code: "unexpected_error",
    message: "Unexpected error occurred. Please try again.",
  });
}

export function isAbortError(err: unknown): boolean {
  if (err instanceof ApiError && err.code === "aborted") return true;
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}

export function createLinkedTimeoutController(
  timeoutMs: number,
  externalSignal?: AbortSignal,
): {
  signal: AbortSignal;
  didTimeout: () => boolean;
  cleanup: () => void;
} {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("Request timed out", "TimeoutError"));
  }, timeoutMs);

  const onExternalAbort = () => {
    controller.abort(externalSignal?.reason);
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    },
  };
}
