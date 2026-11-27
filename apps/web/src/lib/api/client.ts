import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { components } from "./schema";

// --- Domain Types (strictly derived from generated OpenAPI schema) ---
export type City = components["schemas"]["Ward"]["city"];
export type RiskTier = components["schemas"]["HorizonForecast"]["tier"];
export type WeatherMode = components["schemas"]["ForecastRequest"]["source"];
export type WeatherSourceUsed = components["schemas"]["ForecastResponse"]["weather_source"];
export type Ward = components["schemas"]["Ward"];
export type WardList = components["schemas"]["WardList"];
export type WeekObservation = components["schemas"]["WeekObservation"];
export type WardHistory = components["schemas"]["WardHistory"];
export type LagCorrelation = components["schemas"]["LagCorrelation"];
export type LagPoint = components["schemas"]["LagPoint"];
export type LagResponse = components["schemas"]["LagResponse"];
export type Driver = components["schemas"]["Driver"];
export type HorizonForecast = components["schemas"]["HorizonForecast"];
export type WardForecast = components["schemas"]["WardForecast"];
export type ForecastRequest = components["schemas"]["ForecastRequest"];
export type ForecastResponse = components["schemas"]["ForecastResponse"];
export type WeatherOverride = components["schemas"]["WeatherOverride"];
export type ScenarioRequest = components["schemas"]["ScenarioRequest"];
export type ScenarioResponse = components["schemas"]["ScenarioResponse"];
export type HeatmapCell = components["schemas"]["HeatmapCell"];
export type HeatmapResponse = components["schemas"]["HeatmapResponse"];
export type MetricRow = components["schemas"]["MetricRow"];
export type CoverageRow = components["schemas"]["CoverageRow"];
export type ConfusionMatrix = components["schemas"]["ConfusionMatrix"];
export type ValidationResponse = components["schemas"]["ValidationResponse"];
export type TriggerValidationResponse =
  components["schemas"]["TriggerValidationResponse"];
export type StructuralPlannerResponse =
  components["schemas"]["StructuralPlannerResponse"];
export type CallStats = components["schemas"]["CallStats"];
export type PredictionStats = components["schemas"]["PredictionStats"];
export type LLMStats = components["schemas"]["LLMStats"];
export type AdvisoryAction = components["schemas"]["AdvisoryAction"];
export type AdvisoryRequest = components["schemas"]["AdvisoryRequest"];
export type AdvisoryResponse = components["schemas"]["AdvisoryResponse"];
export type OpsResponse = components["schemas"]["OpsResponse"];
export type CityWeatherStatus = components["schemas"]["CityWeatherStatus"];
export type WeatherStatus = components["schemas"]["WeatherStatus"];
export type Problem = components["schemas"]["Problem"];
export type FieldError = components["schemas"]["FieldError"];

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";
const DEFAULT_TIMEOUT_MS = 15_000;

function resolveApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!raw) return DEFAULT_API_BASE_URL;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return DEFAULT_API_BASE_URL;
    }
    return parsed.origin + parsed.pathname.replace(/\/+$/, "");
  } catch {
    return DEFAULT_API_BASE_URL;
  }
}

export const API_BASE_URL = resolveApiBaseUrl();

export class ApiError extends Error {
  readonly status: number;
  readonly type: string;
  readonly title: string;
  readonly detail: string | null;
  readonly requestId: string | null;
  readonly errors: FieldError[] | null;
  readonly retryAfterSeconds: number | null;

  constructor(params: {
    status: number;
    type?: string;
    title: string;
    detail?: string | null;
    requestId?: string | null;
    errors?: FieldError[] | null;
    retryAfterSeconds?: number | null;
  }) {
    super(params.detail ? `${params.title}: ${params.detail}` : params.title);
    this.name = "ApiError";
    this.status = params.status;
    this.type = params.type ?? "about:blank";
    this.title = params.title;
    this.detail = params.detail ?? null;
    this.requestId = params.requestId ?? null;
    this.errors = params.errors ?? null;
    this.retryAfterSeconds = params.retryAfterSeconds ?? null;
  }
}

export function isUnknownWardError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return (
    error.status === 404 &&
    (error.type.endsWith("/unknown-ward") || /unknown ward/i.test(error.title))
  );
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `abhas-${crypto.randomUUID()}`;
  }
  return `abhas-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds);
  }
  return null;
}

function composeTimeoutSignal(
  externalSignal?: AbortSignal,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): { signal: AbortSignal; cleanup: () => void; didTimeout: () => boolean } {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("Request timed out"));
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

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Call a same-origin Next.js route (e.g. /api/ops) instead of the FastAPI base URL. */
  sameOrigin?: boolean;
}

async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const clientRequestId = createRequestId();
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const { signal, cleanup, didTimeout } = composeTimeoutSignal(
    options.signal,
    options.timeoutMs,
  );

  const headers: Record<string, string> = {
    Accept: "application/json, application/problem+json",
    "X-Request-ID": clientRequestId,
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const response = await fetch(options.sameOrigin ? path : `${API_BASE_URL}${path}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal,
    });

    const responseRequestId = response.headers.get("X-Request-ID") ?? clientRequestId;
    const durationMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt,
    );

    if (!response.ok) {
      const retryAfterSeconds = parseRetryAfter(response.headers.get("Retry-After"));
      let parsedProblem: Partial<Problem> | null = null;
      try {
        parsedProblem = (await response.json()) as Partial<Problem>;
      } catch {
        parsedProblem = null;
      }

      const apiErr = new ApiError({
        status: parsedProblem?.status ?? response.status,
        type: parsedProblem?.type ?? "about:blank",
        title: parsedProblem?.title ?? (response.statusText || `HTTP ${response.status}`),
        detail: parsedProblem?.detail ?? null,
        requestId: parsedProblem?.request_id ?? responseRequestId,
        errors: parsedProblem?.errors ?? null,
        retryAfterSeconds,
      });

      if (path !== "/api/v1/ops" || apiErr.status !== 401) {
        console.error(
          JSON.stringify({
            level: "error",
            msg: "api_request_failed",
            route: path,
            method,
            status: apiErr.status,
            duration_ms: durationMs,
            request_id: apiErr.requestId,
          }),
        );
      }
      throw apiErr;
    }

    return (await response.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    if (didTimeout()) {
      throw new ApiError({
        status: 504,
        type: "https://abhas.dev/problems/timeout",
        title: "Request timed out",
        detail: "The local API did not respond in time. Check the server and try again.",
        requestId: clientRequestId,
      });
    }
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    if (options.signal?.aborted) {
      throw err;
    }
    throw new ApiError({
      status: 0,
      type: "https://abhas.dev/problems/network-error",
      title: "Cannot reach Abhas API",
      detail: `Failed to connect to ${API_BASE_URL}. Confirm the API server is running and retry.`,
      requestId: clientRequestId,
    });
  } finally {
    cleanup();
  }
}

// --- Typed Endpoint Functions ---

export function fetchWards(city?: City, signal?: AbortSignal): Promise<WardList> {
  const qs = city ? `?city=${encodeURIComponent(city)}` : "";
  return apiRequest<WardList>(`/api/v1/wards${qs}`, { signal });
}

export function fetchWardHistory(
  wardId: string,
  params?: { start?: string; end?: string },
  signal?: AbortSignal,
): Promise<WardHistory> {
  const search = new URLSearchParams();
  if (params?.start) search.set("start", params.start);
  if (params?.end) search.set("end", params.end);
  const qs = search.toString() ? `?${search.toString()}` : "";
  return apiRequest<WardHistory>(`/api/v1/wards/${encodeURIComponent(wardId)}/history${qs}`, {
    signal,
  });
}

export function fetchWardLags(
  wardId: string,
  weeks = 156,
  signal?: AbortSignal,
): Promise<LagResponse> {
  return apiRequest<LagResponse>(
    `/api/v1/wards/${encodeURIComponent(wardId)}/lags?weeks=${encodeURIComponent(String(weeks))}`,
    { signal },
  );
}

export function postForecast(
  body: ForecastRequest,
  signal?: AbortSignal,
): Promise<ForecastResponse> {
  return apiRequest<ForecastResponse>("/api/v1/forecast", {
    method: "POST",
    body,
    signal,
  });
}

export function postScenario(
  body: ScenarioRequest,
  signal?: AbortSignal,
): Promise<ScenarioResponse> {
  return apiRequest<ScenarioResponse>("/api/v1/scenario", {
    method: "POST",
    body,
    signal,
  });
}

export function fetchHeatmap(
  params: { city: City; origin_week: string; source?: WeatherMode },
  signal?: AbortSignal,
): Promise<HeatmapResponse> {
  const search = new URLSearchParams({
    city: params.city,
    origin_week: params.origin_week,
    source: params.source ?? "dataset",
  });
  return apiRequest<HeatmapResponse>(`/api/v1/heatmap?${search.toString()}`, { signal });
}

export function fetchValidation(signal?: AbortSignal): Promise<ValidationResponse> {
  return apiRequest<ValidationResponse>("/api/v1/validation", { signal });
}

export function fetchTriggerValidation(
  signal?: AbortSignal,
): Promise<TriggerValidationResponse> {
  return apiRequest<TriggerValidationResponse>("/api/v1/validation/trigger", { signal });
}

export function fetchStructuralPlanner(
  city?: City | null,
  signal?: AbortSignal,
): Promise<StructuralPlannerResponse> {
  const qs = city ? `?city=${encodeURIComponent(city)}` : "";
  return apiRequest<StructuralPlannerResponse>(`/api/v1/planning/structural${qs}`, {
    signal,
  });
}

export function fetchWeatherStatus(signal?: AbortSignal): Promise<WeatherStatus> {
  return apiRequest<WeatherStatus>("/api/v1/weather/status", { signal });
}

export interface ReadyzStatus {
  status: string;
  offline: boolean;
  git_sha?: string;
  model_version?: string;
  data_as_of?: string;
}

export function fetchReadyz(signal?: AbortSignal): Promise<ReadyzStatus> {
  return apiRequest<ReadyzStatus>("/readyz", { signal, timeoutMs: 5_000 });
}

/**
 * Ops telemetry goes through the server-only route app/api/ops/route.ts, which adds the
 * X-Ops-Token from OPS_TOKEN on the server. The token is never sent to the browser.
 */
export function fetchOps(signal?: AbortSignal): Promise<OpsResponse> {
  return apiRequest<OpsResponse>("/api/ops", { signal, sameOrigin: true });
}

export function postAdvisory(
  body: AdvisoryRequest,
  signal?: AbortSignal,
): Promise<AdvisoryResponse> {
  return apiRequest<AdvisoryResponse>("/api/v1/advisory", {
    method: "POST",
    body,
    signal,
    timeoutMs: 25_000,
  });
}

// --- Shared TanStack Query Hooks ---

export function useWardsQuery(): UseQueryResult<WardList, ApiError> {
  return useQuery<WardList, ApiError>({
    queryKey: ["wards"],
    queryFn: ({ signal }) => fetchWards(undefined, signal),
    staleTime: 5 * 60 * 1000,
  });
}

export function useWeatherStatusQuery(): UseQueryResult<WeatherStatus, ApiError> {
  return useQuery<WeatherStatus, ApiError>({
    queryKey: ["weather-status"],
    queryFn: ({ signal }) => fetchWeatherStatus(signal),
    staleTime: 30 * 1000,
  });
}

export function useReadyzQuery(): UseQueryResult<ReadyzStatus, ApiError> {
  return useQuery<ReadyzStatus, ApiError>({
    queryKey: ["readyz"],
    queryFn: ({ signal }) => fetchReadyz(signal),
    staleTime: 30 * 1000,
    retry: false,
  });
}
