import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { API_BASE_URL, ApiError, type City, type Problem, type RiskTier } from "@/lib/api/client";

export type BedDataSource = "demo" | "board";
export type AmbulanceSeverity = "Moderate" | "High" | "Critical";

export interface HospitalRecord {
  id: string;
  name: string;
  city: City;
  lat: number;
  lon: number;
  address: string | null;
  phone: string | null;
  tel_href: string | null;
  total_beds: number;
  free_beds: number;
  data_source: BedDataSource;
  updated_at: string;
  age_hours: number;
  is_stale: boolean;
  forecast_tier: RiskTier;
}

export interface HospitalsResponse {
  model_version: string;
  git_sha: string;
  data_as_of: string;
  offline: boolean;
  generated_at: string;
  snapshot_date: string;
  attribution: string;
  bed_data_disclaimer: string;
  stale_after_hours: number;
  emergency_number: "999";
  city_filter: City | null;
  city_forecast_tiers: Record<string, RiskTier>;
  hospitals: HospitalRecord[];
}

export interface BedUpdatePayload {
  hospitalId: string;
  free_beds: number;
  total_beds: number;
  note?: string | null;
  managerRole: boolean;
  managerToken?: string;
}

export interface BedUpdateResponse {
  hospital: HospitalRecord;
  update_id: number;
}

export interface AmbulanceRequestPayload {
  hospital_id: string;
  city: City;
  severity: AmbulanceSeverity;
  beds_requested: number;
  dispatcher_note?: string | null;
}

export interface AmbulanceRequestRecord {
  id: string;
  hospital_id: string;
  hospital_name: string;
  city: City;
  severity: AmbulanceSeverity;
  beds_requested: number;
  dispatcher_note: string | null;
  status: "logged";
  created_at: string;
}

export interface AmbulanceRequestList {
  requests: AmbulanceRequestRecord[];
}

async function facilitiesRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json, application/problem+json",
    ...(options.headers ?? {}),
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const resp = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (!resp.ok) {
    let parsed: Partial<Problem> | null = null;
    try {
      parsed = (await resp.json()) as Partial<Problem>;
    } catch {
      parsed = null;
    }
    throw new ApiError({
      status: parsed?.status ?? resp.status,
      type: parsed?.type ?? "about:blank",
      title: parsed?.title ?? (resp.statusText || `HTTP ${resp.status}`),
      detail: parsed?.detail ?? null,
      requestId: parsed?.request_id ?? null,
      errors: parsed?.errors ?? null,
    });
  }
  return (await resp.json()) as T;
}

export function useHospitalsQuery(
  city?: City | null,
  enabled = true,
): UseQueryResult<HospitalsResponse, ApiError> {
  const qs = city ? `?city=${encodeURIComponent(city)}` : "";
  return useQuery<HospitalsResponse, ApiError>({
    queryKey: ["facilities-hospitals", city ?? "all"],
    queryFn: ({ signal }) =>
      facilitiesRequest<HospitalsResponse>(`/api/v1/facilities/hospitals${qs}`, {
        signal,
      }),
    enabled,
    staleTime: 30_000,
  });
}

export function useAmbulanceRequestsQuery(
  enabled = true,
): UseQueryResult<AmbulanceRequestList, ApiError> {
  return useQuery<AmbulanceRequestList, ApiError>({
    queryKey: ["facilities-ambulance-requests"],
    queryFn: ({ signal }) =>
      facilitiesRequest<AmbulanceRequestList>(
        "/api/v1/facilities/ambulance-requests?limit=25",
        { signal },
      ),
    enabled,
    staleTime: 10_000,
  });
}

export function useUpdateBedsMutation(): UseMutationResult<
  BedUpdateResponse,
  ApiError,
  BedUpdatePayload
> {
  const queryClient = useQueryClient();
  return useMutation<BedUpdateResponse, ApiError, BedUpdatePayload>({
    mutationFn: ({ hospitalId, free_beds, total_beds, note, managerRole, managerToken }) => {
      const headers: Record<string, string> = {};
      if (managerRole) {
        headers["X-Facility-Role"] = "manager";
      }
      if (managerToken) {
        headers["X-Facility-Token"] = managerToken;
      }
      return facilitiesRequest<BedUpdateResponse>(
        `/api/v1/facilities/beds/${encodeURIComponent(hospitalId)}`,
        {
          method: "POST",
          headers,
          body: { free_beds, total_beds, note: note ?? null },
        },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["facilities-hospitals"] });
    },
  });
}

export function useCreateAmbulanceRequestMutation(): UseMutationResult<
  AmbulanceRequestRecord,
  ApiError,
  AmbulanceRequestPayload
> {
  const queryClient = useQueryClient();
  return useMutation<AmbulanceRequestRecord, ApiError, AmbulanceRequestPayload>({
    mutationFn: (payload) =>
      facilitiesRequest<AmbulanceRequestRecord>(
        "/api/v1/facilities/ambulance-requests",
        {
          method: "POST",
          body: payload,
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["facilities-ambulance-requests"],
      });
    },
  });
}
