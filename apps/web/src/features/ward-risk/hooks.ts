"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  postForecast,
  type ApiError,
  type ForecastResponse,
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
