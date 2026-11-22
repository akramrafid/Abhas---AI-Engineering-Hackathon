#!/usr/bin/env node
// Run the API's virtualenv Python from apps/api on Windows or macOS/Linux, without uv being required.
//   node scripts/py.mjs -m app --port 8000
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
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

const args = process.argv.slice(2);

function parseFlag(list, name, fallback) {
  for (let i = 0; i < list.length; i++) {
    if (list[i] === name && i + 1 < list.length) return list[i + 1];
    if (list[i].startsWith(`${name}=`)) return list[i].slice(name.length + 1);
  }
  return fallback;
}

async function assertPortFree(port, host) {
  const numPort = Number(port);
  if (!Number.isInteger(numPort) || numPort <= 0 || numPort > 65535) return;
  const ok = await new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.once("error", () => resolve(false));
    srv.listen(numPort, host, () => srv.close(() => resolve(true)));
  });
  if (!ok) {
    const alt = numPort + 1;
    console.error(
      `✖ API port ${numPort} is already in use. Stop the process using port ${numPort}, ` +
        `or start Abhas with API_PORT=${alt} NEXT_PUBLIC_API_BASE_URL=http://localhost:${alt}.`,
    );
    process.exit(1);
  }
}

if (args[0] === "-m" && args[1] === "app") {
  const port = parseFlag(args.slice(2), "--port", process.env.API_PORT || "8000");
  const host = parseFlag(args.slice(2), "--host", "127.0.0.1");
  await assertPortFree(port, host);
}

const r = spawnSync(py, args, { cwd: apiDir, stdio: "inherit", env: process.env, shell: false });
if (r.error) {
  console.error(`✖ Failed to run ${py}: ${r.error.message}`);
  process.exit(1);
}
process.exit(r.status ?? 1);
