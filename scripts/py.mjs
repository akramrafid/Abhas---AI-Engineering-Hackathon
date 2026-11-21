#!/usr/bin/env node
// Run the API's virtualenv Python from apps/api on Windows or macOS/Linux, without uv being required.
//   node scripts/py.mjs -m app --port 8000
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = path.join(root, "apps", "api");
const candidates = process.platform === "win32"
  ? [path.join(apiDir, ".venv", "Scripts", "python.exe")]
  : [path.join(apiDir, ".venv", "bin", "python")];
const py = candidates.find((p) => existsSync(p));
if (!py) {
  console.error("apps/api/.venv not found — run `npm run setup` first.");
  process.exit(1);
}
const r = spawnSync(py, process.argv.slice(2), { cwd: apiDir, stdio: "inherit", env: process.env });
process.exit(r.status ?? 1);
