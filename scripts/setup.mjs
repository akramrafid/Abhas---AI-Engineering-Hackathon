#!/usr/bin/env node
// One-command setup after clone: Python env (uv if present, else venv + pip), web deps (in parallel),
// database migrate + seed, model SHA-256 check. Never trains a model and needs no API keys.
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const api = path.join(root, "apps", "api");
const web = path.join(root, "apps", "web");
const isWin = process.platform === "win32";

// cmd.exe is needed only for PATH shims (npm.cmd, uv, py); absolute exe paths may contain spaces and must bypass the shell.
export const useShell = (cmd, win = isWin) => win && !path.win32.isAbsolute(cmd);

function run(cmd, args, cwd, label) {
  const s = Date.now();
  process.stdout.write(`\n▶ ${label}\n`);
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: useShell(cmd) });
  if (r.status !== 0) {
    console.error(`✖ ${label} failed (exit ${r.status}). See the output above.`);
    process.exit(r.status ?? 1);
  }
  process.stdout.write(`✔ ${label} (${((Date.now() - s) / 1000).toFixed(1)} s)\n`);
}

function runAsync(cmd, args, cwd, label) {
  const s = Date.now();
  process.stdout.write(`\n▶ ${label}\n`);
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: "inherit", shell: useShell(cmd) });
    child.on("error", (err) => reject(new Error(`${label} failed: ${err.message}`)));
    child.on("exit", (code) => {
      if (code !== 0) reject(new Error(`${label} failed (exit ${code ?? 1})`));
      else {
        process.stdout.write(`✔ ${label} (${((Date.now() - s) / 1000).toFixed(1)} s)\n`);
        resolve();
      }
    });
  });
}

function has(cmd, args = ["--version"]) {
  return spawnSync(cmd, args, { stdio: "ignore", shell: useShell(cmd) }).status === 0;
}

async function setupPython() {
  if (has("uv")) {
    await runAsync("uv", ["sync", "--frozen", "--no-dev", "--python", "3.12"], api, "Python env (uv)");
    return;
  }
  const usePyLauncher = isWin && has("py", ["-3.12", "--version"]);
  const sysPy = usePyLauncher ? "py" : isWin ? "python" : "python3";
  const pyArgs = usePyLauncher ? ["-3.12", "-m", "venv", ".venv"] : ["-m", "venv", ".venv"];
  await runAsync(sysPy, pyArgs, api, "Python venv");
  const venvPy = isWin ? path.join(api, ".venv", "Scripts", "python.exe") : path.join(api, ".venv", "bin", "python");
  await runAsync(venvPy, ["-m", "pip", "install", "-q", "-r", "requirements.txt"], api, "Python deps (pip)");
}

async function main() {
  const t0 = Date.now();
  const envFile = path.join(root, ".env");
  if (!existsSync(envFile)) copyFileSync(path.join(root, ".env.example"), envFile);

  try {
    await Promise.all([
      setupPython(),
      runAsync("npm", ["ci", "--no-audit", "--no-fund"], web, "Web deps (npm ci)"),
    ]);
  } catch (err) {
    console.error(`✖ ${err.message}`);
    process.exit(1);
  }

  const py = ["scripts/py.mjs"];
  if (existsSync(path.join(api, "migrations", "env.py"))) run(process.execPath, [...py, "-m", "alembic", "upgrade", "head"], root, "Database migrations");
  if (existsSync(path.join(api, "scripts", "seed.py"))) run(process.execPath, [...py, "-m", "scripts.seed"], root, "Seed from dataset");
  if (existsSync(path.join(api, "ml", "verify_artifact.py"))) run(process.execPath, [...py, "-m", "ml.verify_artifact"], root, "Model artifact SHA-256");

  console.log(`\nSetup done in ${((Date.now() - t0) / 1000).toFixed(0)} s. Next: npm run dev → http://localhost:3000`);
}

const samePath = (a, b) => (isWin ? a.toLowerCase() === b.toLowerCase() : a === b);
const isMain =
  Boolean(process.argv[1]) &&
  existsSync(process.argv[1]) &&
  samePath(realpathSync(path.resolve(process.argv[1])), realpathSync(fileURLToPath(import.meta.url)));
if (isMain) {
  await main();
}
