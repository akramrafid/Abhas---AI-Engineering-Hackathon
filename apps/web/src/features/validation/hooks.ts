"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  fetchTriggerValidation,
  fetchValidation,
  type ApiError,
  type TriggerValidationResponse,
  type ValidationResponse,
} from "@/lib/api/client";

export { useOpsQuery } from "@/lib/api/queries";

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

export function useTriggerValidationQuery(
  enabled = true,
): UseQueryResult<TriggerValidationResponse, ApiError> {
  return useQuery<TriggerValidationResponse, ApiError>({
    queryKey: ["validation-trigger"],
    queryFn: ({ signal }) => fetchTriggerValidation(signal),
    enabled,
    staleTime: 5 * 60 * 1000,
    placeholderData: undefined,
  });
}
