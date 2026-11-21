"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  fetchOps,
  postAdvisory,
  postForecast,
  type AdvisoryRequest,
  type AdvisoryResponse,
  type ApiError,
  type ForecastResponse,
  type OpsResponse,
  type WeatherMode,
} from "@/lib/api/client";

export interface UseCityForecastParams {
  wardIds: readonly string[];
  originWeek: string;
  horizons: readonly number[];
  source: WeatherMode;
  enabled: boolean;
}

export function useCityForecastQuery({
  wardIds,
  originWeek,
  horizons,
  source,
  enabled,
}: UseCityForecastParams): UseQueryResult<ForecastResponse, ApiError> {
  const sortedWardIds = [...wardIds];
  const sortedHorizons = [...horizons].sort((a, b) => a - b);

  return useQuery<ForecastResponse, ApiError>({
    queryKey: [
      "forecast",
      sortedWardIds.join(","),
      originWeek,
      sortedHorizons.join(","),
      source,
    ],
    queryFn: ({ signal }) =>
      postForecast(
        {
          ward_ids: sortedWardIds,
          origin_week: originWeek,
          horizons: sortedHorizons,
          source,
        },
        signal,
      ),
    enabled: enabled && sortedWardIds.length > 0 && Boolean(originWeek),
    staleTime: 5 * 60 * 1000,
    // Never keep stale forecast data when an error occurs (AC-8).
    placeholderData: undefined,
  });
}

export function useOpsQuery(enabled = true): UseQueryResult<OpsResponse, ApiError> {
  return useQuery<OpsResponse, ApiError>({
    queryKey: ["ops"],
    queryFn: ({ signal }) => fetchOps(signal),
    enabled,
    staleTime: 30 * 1000,
    placeholderData: undefined,
  });
}

export interface UseAdvisoryParams {
  wardId: string;
  originWeek: string;
  horizon: number;
  language: AdvisoryRequest["language"];
  enabled: boolean;
}

export function useAdvisoryQuery({
  wardId,
  originWeek,
  horizon,
  language,
  enabled,
}: UseAdvisoryParams): UseQueryResult<AdvisoryResponse, ApiError> {
  return useQuery<AdvisoryResponse, ApiError>({
    queryKey: ["advisory", wardId, originWeek, horizon, language],
    queryFn: ({ signal }) =>
      postAdvisory(
        {
          ward_id: wardId,
          origin_week: originWeek,
          horizon,
          language,
        },
        signal,
      ),
    enabled: enabled && Boolean(wardId) && Boolean(originWeek) && horizon >= 1 && horizon <= 4,
    staleTime: 10 * 60 * 1000,
    retry: 0,
    placeholderData: undefined,
  });
}
