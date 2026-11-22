import "server-only";
import fs from "node:fs";
import path from "node:path";

// The project keeps secrets in the repo-root .env (AGENTS.md §8); Next.js only loads apps/web/.env*.
// Server code reads root secrets through here, so nothing secret needs a NEXT_PUBLIC_ name.
let rootEnv: Record<string, string> | null = null;

function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2];
    const quote = value[0];
    if (quote === '"' || quote === "'") {
      const end = value.indexOf(quote, 1);
      value = end > 0 ? value.slice(1, end) : value.slice(1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    out[match[1]] = value;
  }
  return out;
}

/** A server-only setting: process env first (deploys), then the repo-root .env (local dev). */
export function serverEnv(key: string): string | undefined {
  const direct = process.env[key]?.trim();
  if (direct) return direct;
  if (rootEnv === null) {
    try {
      rootEnv = parseDotenv(fs.readFileSync(path.resolve(process.cwd(), "../../.env"), "utf8"));
    } catch {
      rootEnv = {};
    }
  }
  return rootEnv[key]?.trim() || undefined;
}
