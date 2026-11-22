"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  fetchValidation,
  type ApiError,
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
