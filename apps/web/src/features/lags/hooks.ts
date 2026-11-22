"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchWardLags, type ApiError, type LagResponse } from "@/lib/api/client";

export function useWardLagsQuery(
  wardId: string,
  weeks = 156,
  enabled = true,
): UseQueryResult<LagResponse, ApiError> {
  return useQuery<LagResponse, ApiError>({
    queryKey: ["ward-lags", wardId, weeks],
    queryFn: ({ signal }) => fetchWardLags(wardId, weeks, signal),
    enabled: enabled && Boolean(wardId),
    staleTime: 5 * 60 * 1000,
    placeholderData: undefined,
  });
}
