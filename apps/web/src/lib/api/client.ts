import createClient from "openapi-fetch";
import { env } from "@/lib/env";
import {
  ApiError,
  createLinkedTimeoutController,
  normalizeThrownError,
  toApiError,
} from "./errors";
import type { paths } from "./schema";
import type {
  BatchTriageResult,
  DocumentDetail,
  DocumentSummary,
  IndexResult,
  TriageHistoryItem,
  TriageRequest,
  TriageResult,
} from "./types";

const DEFAULT_TIMEOUT_MS = 15_000;
const TRIAGE_TIMEOUT_MS = 45_000;
const INDEX_TIMEOUT_MS = 60_000;
const BATCH_TIMEOUT_MS = 120_000;

function createApiClient(timeoutMs: number) {
  return createClient<paths>({
    baseUrl: env.NEXT_PUBLIC_API_URL,
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const existingSignal =
        input instanceof Request ? input.signal : (init?.signal ?? undefined);
      const linked = createLinkedTimeoutController(timeoutMs, existingSignal);
      try {
        const res = await fetch(input, { ...init, signal: linked.signal });
        return res;
      } catch (err) {
        if (linked.didTimeout()) {
          throw new ApiError({
            status: 408,
            code: "timeout",
            message: `Request timed out after ${Math.round(timeoutMs / 1000)}s. Please try again.`,
            isTimeout: true,
          });
        }
        throw normalizeThrownError(err, {
          apiUrl: env.NEXT_PUBLIC_API_URL,
          timeoutMs,
        });
      } finally {
        linked.cleanup();
      }
    },
  });
}

const defaultApi = createApiClient(DEFAULT_TIMEOUT_MS);
const healthApi = createApiClient(5_000);
const triageApi = createApiClient(TRIAGE_TIMEOUT_MS);
const indexApi = createApiClient(INDEX_TIMEOUT_MS);
const batchApi = createApiClient(BATCH_TIMEOUT_MS);

function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): Promise<T> | T {
  if (result.data !== undefined) {
    return result.data;
  }
  return toApiError(result.response, result.error).then((apiErr) => {
    throw apiErr;
  });
}

export async function getHealth(): Promise<{ status?: string }> {
  const res = await healthApi.GET("/healthz");
  if (!res.response.ok || res.data === undefined) {
    throw await toApiError(res.response, res.error);
  }
  return res.data as { status?: string };
}

export async function listKbDocuments(): Promise<DocumentSummary[]> {
  const res = await defaultApi.GET("/kb/documents");
  return unwrap(res);
}

export async function getKbDocument(docId: string): Promise<DocumentDetail> {
  const res = await defaultApi.GET("/kb/documents/{doc_id}", {
    params: { path: { doc_id: docId } },
  });
  return unwrap(res);
}

export async function reindexKb(): Promise<IndexResult> {
  const res = await indexApi.POST("/kb/index");
  return unwrap(res);
}

export async function triageTicket(body: TriageRequest): Promise<TriageResult> {
  const res = await triageApi.POST("/triage", { body });
  return unwrap(res);
}

export async function runBatchTriage(): Promise<BatchTriageResult> {
  const res = await batchApi.POST("/triage/batch");
  return unwrap(res);
}

export async function getTriageHistory(limit = 50): Promise<TriageHistoryItem[]> {
  const res = await defaultApi.GET("/triage/history", {
    params: { query: { limit } },
  });
  return unwrap(res);
}
