import { z } from "zod";

const DEFAULT_API_URL = "http://localhost:8000";

const rawApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim() || DEFAULT_API_URL;

const parsed = z
  .object({
    NEXT_PUBLIC_API_URL: z
      .string()
      .url("NEXT_PUBLIC_API_URL must be a valid URL (for example http://localhost:8000)")
      .transform((url) => url.replace(/\/+$/, "")),
  })
  .safeParse({ NEXT_PUBLIC_API_URL: rawApiUrl });

if (!parsed.success) {
  const detail = parsed.error.issues.map((issue) => issue.message).join("; ");
  throw new Error(`Invalid frontend environment configuration: ${detail}`);
}

export const env = parsed.data;
