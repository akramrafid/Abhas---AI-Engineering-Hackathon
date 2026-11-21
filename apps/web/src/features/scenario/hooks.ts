"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  postScenario,
  type ApiError,
  type ScenarioRequest,
  type ScenarioResponse,
} from "@/lib/api/client";

export interface UseScenarioRunnerResult {
  data: ScenarioResponse | null;
  error: ApiError | null;
  isLoading: boolean;
  run: (request: ScenarioRequest) => Promise<void>;
  reset: () => void;
}

/**
 * Runs POST /api/v1/scenario while cancelling any in-flight request via AbortController
 * so rapid slider changes always resolve to the latest officer input cleanly.
 */
export function useScenarioRunner(): UseScenarioRunnerResult {
  const [data, setData] = useState<ScenarioResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const run = useCallback(async (request: ScenarioRequest) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const response = await postScenario(request, controller.signal);
      if (!controller.signal.aborted) {
        setData(response);
        setError(null);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Clear stale scenario result on error so no outdated tier displays.
      setData(null);
      setError(err as ApiError);
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setData(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return { data, error, isLoading, run, reset };
}
