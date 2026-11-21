"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  fetchHeatmap,
  type ApiError,
  type City,
  type HeatmapResponse,
  type WeatherMode,
} from "@/lib/api/client";

export interface UseHeatmapParams {
  city: City;
  originWeek: string;
  source: WeatherMode;
  enabled?: boolean;
}

export function useHeatmapQuery({
  city,
  originWeek,
  source,
  enabled = true,
}: UseHeatmapParams): UseQueryResult<HeatmapResponse, ApiError> {
  return useQuery<HeatmapResponse, ApiError>({
    queryKey: ["heatmap", city, originWeek, source],
    queryFn: ({ signal }) =>
      fetchHeatmap({ city, origin_week: originWeek, source }, signal),
    enabled: enabled && Boolean(city) && Boolean(originWeek),
    staleTime: 5 * 60 * 1000,
    placeholderData: undefined,
  });
}
