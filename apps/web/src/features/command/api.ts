import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { API_BASE_URL, ApiError, type Problem } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

// --- Phase 2 Command Center Types (strictly derived from generated OpenAPI schema) ---

export type Scope = components["schemas"]["AllocationRequest"]["scope"];
export type AllocationRequest = components["schemas"]["AllocationRequest"];
export type AllocationResponse = components["schemas"]["AllocationResponse"];
export type WardAllocation = components["schemas"]["WardAllocation"];
export type ResourceLine = components["schemas"]["ResourceLine"];
export type CityAllocationSummary = components["schemas"]["CityAllocationSummary"];
export type CityResourceTotals = components["schemas"]["CityResourceTotals"];

export type OverflowRequest = components["schemas"]["OverflowRequest"];
export type OverflowResponse = components["schemas"]["OverflowResponse"];
export type WardBedStatus = components["schemas"]["WardBedStatus"];
export type Transfer = components["schemas"]["Transfer"];
export type CityBedSummary = components["schemas"]["CityBedSummary"];

export type EfficacyPreset = components["schemas"]["SimulatorRequest"]["efficacy"];
export type Deployment = components["schemas"]["Deployment"];
export type SimulatorRequest = components["schemas"]["SimulatorRequest"];
export type SimulatorResponse = components["schemas"]["SimulatorResponse"];
export type EfficacyParams = components["schemas"]["EfficacyParams"];
export type WardImpact = components["schemas"]["WardImpact"];
export type HorizonImpact = components["schemas"]["HorizonImpact"];
export type SimulatorTotals = components["schemas"]["SimulatorTotals"];

export type DispatchChannel = NonNullable<
  components["schemas"]["DispatchRequest"]["channels"]
>[number];
export type DispatchRequest = components["schemas"]["DispatchRequest"];
export type DispatchResponse = components["schemas"]["DispatchResponse"];
export type Notice = components["schemas"]["Notice"];
export type NoticeFacts = components["schemas"]["NoticeFacts"];
export type SmsMessage = components["schemas"]["SmsMessage"];
export type SupplyPair = components["schemas"]["SupplyPair"];

export type PlanKind = components["schemas"]["PlanRecord"]["kind"];
export type AllocationPlanCreate = components["schemas"]["AllocationPlanCreate"];
export type OverflowPlanCreate = components["schemas"]["OverflowPlanCreate"];
export type SimulationPlanCreate = components["schemas"]["SimulationPlanCreate"];
export type DispatchPlanCreate = components["schemas"]["DispatchPlanCreate"];
export type PlanCreateRequest =
  | AllocationPlanCreate
  | OverflowPlanCreate
  | SimulationPlanCreate
  | DispatchPlanCreate;
export type PlanRecord = components["schemas"]["PlanRecord"];
export type PlanSummary = components["schemas"]["PlanSummary"];
export type PlanList = components["schemas"]["PlanList"];
export type PlanComparison = components["schemas"]["PlanComparison"];
export type PlanMetricDiff = components["schemas"]["PlanMetricDiff"];
export type PlanHeadline = components["schemas"]["PlanHeadline"];

export type RunMeta = Pick<
  AllocationResponse,
  "model_version" | "git_sha" | "data_as_of" | "offline" | "generated_at"
>;

export const API_BASE = API_BASE_URL;

const DEFAULT_TIMEOUT_MS = 15_000;

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `abhas-cmd-${crypto.randomUUID()}`;
  }
  return `abhas-cmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : null;
}

async function commandRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const requestId = createRequestId();
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("Request timed out"));
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const onExternalAbort = () => {
    controller.abort(options.signal?.reason);
  };
  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort(options.signal.reason);
    } else {
      options.signal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  const headers: Record<string, string> = {
    Accept: "application/json, application/problem+json",
    "X-Request-ID": requestId,
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    const responseRequestId = response.headers.get("X-Request-ID") ?? requestId;
    if (!response.ok) {
      const retryAfterSeconds = parseRetryAfter(response.headers.get("Retry-After"));
      let parsedProblem: Partial<Problem> | null = null;
      try {
        parsedProblem = (await response.json()) as Partial<Problem>;
      } catch {
        parsedProblem = null;
      }

      throw new ApiError({
        status: parsedProblem?.status ?? response.status,
        type: parsedProblem?.type ?? "about:blank",
        title: parsedProblem?.title ?? (response.statusText || `HTTP ${response.status}`),
        detail: parsedProblem?.detail ?? null,
        requestId: parsedProblem?.request_id ?? responseRequestId,
        errors: parsedProblem?.errors ?? null,
        retryAfterSeconds,
      });
    }

    return (await response.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (timedOut) {
      throw new ApiError({
        status: 504,
        type: "https://abhas.dev/problems/timeout",
        title: "Request timed out",
        detail: "The Command Center API did not respond in time. Retry the request.",
        requestId,
      });
    }
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    if (options.signal?.aborted) throw err;
    throw new ApiError({
      status: 0,
      type: "https://abhas.dev/problems/network-error",
      title: "Cannot reach Abhas API",
      detail: `Failed to connect to ${API_BASE}. Confirm the local API server is running.`,
      requestId,
    });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onExternalAbort);
  }
}

// --- Typed Fetchers ---

export function postAllocationPlan(
  body: AllocationRequest,
  signal?: AbortSignal,
): Promise<AllocationResponse> {
  return commandRequest<AllocationResponse>("/api/v1/allocation/plan", {
    method: "POST",
    body,
    signal,
  });
}

export function postOverflowRoute(
  body: OverflowRequest,
  signal?: AbortSignal,
): Promise<OverflowResponse> {
  return commandRequest<OverflowResponse>("/api/v1/overflow/route", {
    method: "POST",
    body,
    signal,
  });
}

export function postSimulatorRun(
  body: SimulatorRequest,
  signal?: AbortSignal,
): Promise<SimulatorResponse> {
  return commandRequest<SimulatorResponse>("/api/v1/simulator/run", {
    method: "POST",
    body,
    signal,
  });
}

export function postDispatchNotices(
  body: DispatchRequest,
  signal?: AbortSignal,
): Promise<DispatchResponse> {
  return commandRequest<DispatchResponse>("/api/v1/dispatch/notices", {
    method: "POST",
    body,
    signal,
  });
}

export function createPlan(
  body: PlanCreateRequest,
  signal?: AbortSignal,
): Promise<PlanRecord> {
  return commandRequest<PlanRecord>("/api/v1/plans", {
    method: "POST",
    body,
    signal,
  });
}

export function listPlans(
  params?: { kind?: PlanKind; limit?: number },
  signal?: AbortSignal,
): Promise<PlanList> {
  const qs = new URLSearchParams();
  if (params?.kind) qs.set("kind", params.kind);
  if (params?.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return commandRequest<PlanList>(`/api/v1/plans${suffix}`, { signal });
}

export function comparePlans(
  a: string,
  b: string,
  signal?: AbortSignal,
): Promise<PlanComparison> {
  const qs = new URLSearchParams({ a, b });
  return commandRequest<PlanComparison>(`/api/v1/plans/compare?${qs.toString()}`, {
    signal,
  });
}

export function buildBriefHref(params: {
  wardId: string;
  originWeek: string;
  lang: "en" | "bn";
  stockPct: number;
  totalCrews: number;
  planId?: string | null;
  briefUrl?: string | null;
}): string {
  if (params.briefUrl) {
    if (params.briefUrl.startsWith("http://") || params.briefUrl.startsWith("https://")) {
      return params.briefUrl;
    }
    if (params.briefUrl.startsWith("/")) {
      return `${API_BASE}${params.briefUrl}`;
    }
  }
  const qs = new URLSearchParams({
    origin_week: params.originWeek,
    lang: params.lang,
    stock_pct: String(params.stockPct),
    total_crews: String(params.totalCrews),
  });
  if (params.planId) qs.set("plan_id", params.planId);
  return `${API_BASE}/api/v1/dispatch/brief/${encodeURIComponent(params.wardId)}.html?${qs.toString()}`;
}

// --- React Query Hooks ---

export function useAllocationPlanQuery(
  req: AllocationRequest,
  enabled = true,
): UseQueryResult<AllocationResponse, ApiError> {
  return useQuery<AllocationResponse, ApiError>({
    queryKey: [
      "command-allocation",
      req.scope,
      req.origin_week,
      req.h_start,
      req.h_end,
      req.stock_pct,
      req.total_crews,
      req.service_level ?? null,
      req.equity_floor_pct,
    ],
    queryFn: ({ signal }) => postAllocationPlan(req, signal),
    enabled: enabled && Boolean(req.origin_week),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

export function useOverflowRouteQuery(
  req: OverflowRequest,
  enabled = true,
): UseQueryResult<OverflowResponse, ApiError> {
  const overridesKey = JSON.stringify(
    Object.entries(req.capacity_overrides ?? {}).sort(([a], [b]) => a.localeCompare(b)),
  );
  return useQuery<OverflowResponse, ApiError>({
    queryKey: [
      "command-overflow",
      req.scope,
      req.origin_week,
      req.horizon,
      req.service_level,
      overridesKey,
    ],
    queryFn: ({ signal }) => postOverflowRoute(req, signal),
    enabled: enabled && Boolean(req.origin_week),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

export function useSimulatorRunQuery(
  req: SimulatorRequest | null,
  enabled = true,
): UseQueryResult<SimulatorResponse, ApiError> {
  const deploymentsKey = req?.deployments
    ? JSON.stringify(
        [...req.deployments].sort((a, b) => a.ward_id.localeCompare(b.ward_id)),
      )
    : null;
  return useQuery<SimulatorResponse, ApiError>({
    queryKey: [
      "command-simulator",
      req?.origin_week ?? "",
      req?.efficacy ?? "base",
      req?.auto_crews ?? null,
      deploymentsKey,
    ],
    queryFn: ({ signal }) => postSimulatorRun(req!, signal),
    enabled: enabled && Boolean(req && req.origin_week),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

export function useDispatchNoticesQuery(
  req: DispatchRequest | null,
  enabled = true,
): UseQueryResult<DispatchResponse, ApiError> {
  const wardsKey = req?.ward_ids ? [...req.ward_ids].sort().join(",") : "";
  const channelsKey = req?.channels ? [...req.channels].sort().join(",") : "";
  return useQuery<DispatchResponse, ApiError>({
    queryKey: [
      "command-dispatch",
      req?.origin_week ?? "",
      req?.scope ?? "",
      wardsKey,
      channelsKey,
      req?.lang ?? "en",
      req?.plan_id ?? "",
      req?.stock_pct ?? 100,
      req?.total_crews ?? 0,
    ],
    queryFn: ({ signal }) => postDispatchNotices(req!, signal),
    enabled: enabled && Boolean(req && req.origin_week && (req.channels?.length ?? 0) > 0),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

export function usePlansListQuery(
  kind?: PlanKind,
  enabled = true,
): UseQueryResult<PlanList, ApiError> {
  return useQuery<PlanList, ApiError>({
    queryKey: ["command-plans", kind ?? "all"],
    queryFn: ({ signal }) => listPlans({ kind, limit: 50 }, signal),
    enabled,
    staleTime: 10 * 1000,
  });
}

export function usePlanCompareQuery(
  aId: string | null,
  bId: string | null,
  enabled = true,
): UseQueryResult<PlanComparison, ApiError> {
  return useQuery<PlanComparison, ApiError>({
    queryKey: ["command-plans-compare", aId ?? "", bId ?? ""],
    queryFn: ({ signal }) => comparePlans(aId!, bId!, signal),
    enabled: enabled && Boolean(aId && bId),
    staleTime: 30 * 1000,
  });
}

export function useCreatePlanMutation(): UseMutationResult<
  PlanRecord,
  ApiError,
  PlanCreateRequest
> {
  const queryClient = useQueryClient();
  return useMutation<PlanRecord, ApiError, PlanCreateRequest>({
    mutationFn: (payload) => createPlan(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["command-plans"] });
    },
  });
}
