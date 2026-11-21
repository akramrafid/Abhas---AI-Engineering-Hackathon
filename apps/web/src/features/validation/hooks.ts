"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  fetchOps,
  fetchValidation,
  type ApiError,
  type OpsResponse,
  type ValidationResponse,
} from "@/lib/api/client";

export function useValidationQuery(
  enabled = true,
): UseQueryResult<ValidationResponse, ApiError> {
  return useQuery<ValidationResponse, ApiError>({
    queryKey: ["validation"],
    queryFn: ({ signal }) => fetchValidation(signal),
    enabled,
    staleTime: 5 * 60 * 1000,
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
