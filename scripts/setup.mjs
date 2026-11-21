#!/usr/bin/env node
// One-command setup after clone: Python env (uv if present, else venv + pip), web deps, database, model check.
// Never trains a model and needs no API keys. Prints the elapsed time so the ≤ 180 s target is visible.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const api = path.join(root, "apps", "api");
const web = path.join(root, "apps", "web");
const t0 = Date.now();
const isWin = process.platform === "win32";

function run(cmd, args, cwd, label) {
  const s = Date.now();
  process.stdout.write(`\n▶ ${label}\n`);
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: isWin });
  if (r.status !== 0) {
    console.error(`✖ ${label} failed (exit ${r.status}). See the output above.`);
    process.exit(r.status ?? 1);
  }
  process.stdout.write(`✔ ${label} (${((Date.now() - s) / 1000).toFixed(1)} s)\n`);
}

function has(cmd) {
  return spawnSync(cmd, ["--version"], { stdio: "ignore", shell: isWin }).status === 0;
}

const envFile = path.join(root, ".env");
if (!existsSync(envFile)) copyFileSync(path.join(root, ".env.example"), envFile);

if (has("uv")) {
  run("uv", ["sync", "--frozen", "--no-dev", "--python", "3.12"], api, "Python env (uv)");
} else {
  const sysPy = isWin ? "py" : "python3";
  const pyArgs = isWin ? ["-3.12", "-m", "venv", ".venv"] : ["-m", "venv", ".venv"];
  run(sysPy, pyArgs, api, "Python venv");
  const venvPy = isWin ? path.join(api, ".venv", "Scripts", "python.exe") : path.join(api, ".venv", "bin", "python");
  run(venvPy, ["-m", "pip", "install", "-q", "--only-binary=:all:", "-r", "requirements.txt"], api, "Python deps (pip)");
}

run("npm", ["ci", "--no-audit", "--no-fund"], web, "Web deps (npm ci)");

const py = ["scripts/py.mjs"];
if (existsSync(path.join(api, "migrations", "env.py"))) run("node", [...py, "-m", "alembic", "upgrade", "head"], root, "Database migrations");
if (existsSync(path.join(api, "scripts", "seed.py"))) run("node", [...py, "-m", "scripts.seed"], root, "Seed from data/raw xlsx");
if (existsSync(path.join(api, "ml", "verify_artifact.py"))) run("node", [...py, "-m", "ml.verify_artifact"], root, "Model artifact SHA-256");

console.log(`\nSetup done in ${((Date.now() - t0) / 1000).toFixed(0)} s. Next: npm run dev → http://localhost:3000`);
