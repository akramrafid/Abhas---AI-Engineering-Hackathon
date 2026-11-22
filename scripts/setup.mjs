#!/usr/bin/env node
// One-command setup after clone: Python env (uv if present, else venv + pip), web deps (in parallel),
// database migrate + seed, LightGBM runtime & model SHA-256 check, dev port preflight.
// Never trains a model, needs no API keys, and executes every subprocess with shell: false (SEC-1).
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, realpathSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const api = path.join(root, "apps", "api");
const web = path.join(root, "apps", "web");
const isWin = process.platform === "win32";

const LIBOMP_PATHS = [
  "/opt/homebrew/opt/libomp/lib/libomp.dylib",
  "/usr/local/opt/libomp/lib/libomp.dylib",
  "/opt/local/lib/libomp/libomp.dylib",
];

// SEC-1: Never invoke an OS shell for subprocesses; paths may contain spaces or Windows metacharacters (&, |, ^, %).
export const useShell = (_cmd, _win = isWin) => false;

// Run npm via process.execPath + npm_execpath (always set under `npm run setup`), with a fixed-arg ComSpec fallback
// on Windows only when invoked directly via `node scripts/setup.mjs` (Node blocks direct .cmd spawn without a shell).
export function resolveNpmInvocation(
  env = process.env,
  win = isWin,
  execPath = process.execPath,
  npmArgs = ["ci", "--no-audit", "--no-fund", "--ignore-scripts"],
) {
  if (env?.npm_execpath) {
    return { cmd: execPath, args: [env.npm_execpath, ...npmArgs] };
  }
  if (win) {
    const comspec = env?.ComSpec || env?.COMSPEC || "cmd.exe";
    return { cmd: comspec, args: ["/d", "/s", "/c", "npm.cmd", ...npmArgs] };
  }
  return { cmd: "npm", args: [...npmArgs] };
}

export function checkMacLibomp({
  platform = process.platform,
  env = process.env,
  exists = existsSync,
  hasCmd = has,
  runCmd = (cmd, args) => {
    process.stdout.write("\n▶ macOS OpenMP runtime (brew install libomp)\n");
    const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: false });
    if (r.status !== 0) throw new Error(`brew install libomp exited with ${r.status ?? 1}`);
  },
} = {}) {
  if (platform !== "darwin") {
    return { needed: false, installed: true, hint: "" };
  }
  if (LIBOMP_PATHS.some((p) => exists(p))) {
    return { needed: true, installed: true, hint: "" };
  }
  const hint =
    "LightGBM on macOS requires OpenMP (libomp). Run `brew install libomp` (or use `docker compose up --build`).";
  if (!env?.ABHAS_SKIP_BREW && hasCmd("brew")) {
    try {
      runCmd("brew", ["install", "libomp"]);
      return { needed: true, installed: true, hint: "" };
    } catch {
      return { needed: true, installed: false, hint };
    }
  }
  return { needed: true, installed: false, hint };
}

export function formatLightgbmRuntimeHint(stderr = "", platform = process.platform) {
  if (platform === "win32") {
    return (
      "LightGBM failed to load on Windows (missing Microsoft Visual C++ Redistributable / VC++ runtime). " +
      "Install the x64 VC++ Redistributable from https://aka.ms/vs/17/release/vc_redist.x64.exe, " +
      "or run `docker compose up --build`."
    );
  }
  if (platform === "darwin") {
    return (
      "LightGBM failed to load on macOS (missing OpenMP runtime libomp). " +
      "Run `brew install libomp` and re-run `npm run setup`, or run `docker compose up --build`."
    );
  }
  const firstLine = String(stderr || "").trim().split(/\r?\n/)[0];
  return (
    "LightGBM failed to load (missing system OpenMP library such as libgomp1). " +
    "Install libgomp1 or run `docker compose up --build`." +
    (firstLine ? ` (${firstLine})` : "")
  );
}

export function formatPortInUseHint(service, envVar, port) {
  const alt = Number(port) + 1;
  const extra =
    envVar === "API_PORT" ? ` and NEXT_PUBLIC_API_BASE_URL=http://localhost:${alt}` : "";
  return (
    `Port ${port} (${service}) is already in use. Stop the process using port ${port} ` +
    `or override ${envVar}=${alt}${extra} before running \`npm run dev\`.`
  );
}

export function checkPortAvailable(port, host = "127.0.0.1") {
  const numPort = Number(port);
  if (!Number.isInteger(numPort) || numPort <= 0 || numPort > 65535) {
    return Promise.resolve({ available: true, code: null, port: numPort });
  }
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (err) => {
      resolve({ available: false, code: err?.code || "ERR", port: numPort });
    });
    server.listen(numPort, host, () => {
      server.close(() => resolve({ available: true, code: null, port: numPort }));
    });
  });
}

function run(cmd, args, cwd, label) {
  const s = Date.now();
  process.stdout.write(`\n▶ ${label}\n`);
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: false });
  if (r.error || r.status !== 0) {
    const reason = r.error ? r.error.message : `exit ${r.status}`;
    console.error(`✖ ${label} failed (${reason}). See the output above.`);
    process.exit(r.status ?? 1);
  }
  process.stdout.write(`✔ ${label} (${((Date.now() - s) / 1000).toFixed(1)} s)\n`);
}

function runAsync(cmd, args, cwd, label) {
  const s = Date.now();
  process.stdout.write(`\n▶ ${label}\n`);
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: "inherit", shell: false });
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
  const r = spawnSync(cmd, args, { stdio: "ignore", shell: false });
  return !r.error && r.status === 0;
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
  const venvPy = isWin
    ? path.join(api, ".venv", "Scripts", "python.exe")
    : path.join(api, ".venv", "bin", "python");
  const reqPath = path.join(api, "requirements.txt");
  const hasHashes = existsSync(reqPath) && readFileSync(reqPath, "utf8").includes("--hash=");
  const pipArgs = [
    "-m",
    "pip",
    "install",
    "-q",
    ...(hasHashes ? ["--require-hashes", "--only-binary=:all:"] : []),
    "-r",
    "requirements.txt",
  ];
  await runAsync(venvPy, pipArgs, api, "Python deps (pip)");
}

async function main() {
  const t0 = Date.now();
  const envFile = path.join(root, ".env");
  if (!existsSync(envFile)) copyFileSync(path.join(root, ".env.example"), envFile);

  const omp = checkMacLibomp();
  if (omp.needed && !omp.installed) {
    console.warn(`\n⚠ ${omp.hint}`);
  }

  const npmInv = resolveNpmInvocation();
  try {
    await Promise.all([
      setupPython(),
      runAsync(npmInv.cmd, npmInv.args, web, "Web deps (npm ci --ignore-scripts)"),
    ]);
  } catch (err) {
    console.error(`✖ ${err.message}`);
    process.exit(1);
  }

  const venvPy = isWin
    ? path.join(api, ".venv", "Scripts", "python.exe")
    : path.join(api, ".venv", "bin", "python");
  if (existsSync(venvPy)) {
    const lgb = spawnSync(venvPy, ["-c", "import lightgbm"], {
      cwd: api,
      encoding: "utf8",
      shell: false,
    });
    if (lgb.error || lgb.status !== 0) {
      console.error(`\n✖ ${formatLightgbmRuntimeHint(lgb.stderr || lgb.stdout || lgb.error?.message || "")}`);
      if (lgb.stderr) console.error(lgb.stderr.trim());
      process.exit(lgb.status ?? 1);
    }
  }

  const py = ["scripts/py.mjs"];
  if (existsSync(path.join(api, "migrations", "env.py"))) {
    run(process.execPath, [...py, "-m", "alembic", "upgrade", "head"], root, "Database migrations");
  }
  if (existsSync(path.join(api, "scripts", "seed.py"))) {
    run(process.execPath, [...py, "-m", "scripts.seed"], root, "Seed from dataset");
  }
  if (existsSync(path.join(api, "ml", "verify_artifact.py"))) {
    run(process.execPath, [...py, "-m", "ml.verify_artifact"], root, "Model artifact SHA-256");
  }

  const apiPort = Number(process.env.API_PORT || "8000");
  const webPort = Number(process.env.WEB_PORT || "3000");
  const [apiCheck, webCheck] = await Promise.all([
    checkPortAvailable(apiPort),
    checkPortAvailable(webPort),
  ]);
  if (!apiCheck.available) console.warn(`\n⚠ ${formatPortInUseHint("API", "API_PORT", apiPort)}`);
  if (!webCheck.available) console.warn(`\n⚠ ${formatPortInUseHint("Web", "WEB_PORT", webPort)}`);

  console.log(`\nSetup done in ${((Date.now() - t0) / 1000).toFixed(0)} s. Next: npm run dev → http://localhost:${webPort}`);
}

const samePath = (a, b) => (isWin ? a.toLowerCase() === b.toLowerCase() : a === b);
const isMain =
  Boolean(process.argv[1]) &&
  existsSync(process.argv[1]) &&
  samePath(realpathSync(path.resolve(process.argv[1])), realpathSync(fileURLToPath(import.meta.url)));
if (isMain) {
  await main();
}
