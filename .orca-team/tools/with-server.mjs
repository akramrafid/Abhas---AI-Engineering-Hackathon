#!/usr/bin/env node
// with-server — start the API (test mode by default) on a free port, wait for /healthz, run a command,
// then stop the API (whole process tree, Windows included). Used by npm scripts: test:contract, load, smoke:local.
//
//   node .orca-team/tools/with-server.mjs [--mode test|dev] [--env KEY=VALUE]... [--timeout 90] -- <command...>
//
// "{API}" anywhere in the command is replaced by the server URL (e.g. http://127.0.0.1:53817); the command
// also gets API_BASE_URL in its environment. The command runs from the repo root. Exit code = the command's.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
if (sep < 0 || sep === argv.length - 1) {
  console.error("usage: with-server.mjs [--mode test|dev] [--env K=V]... [--timeout s] -- <command...>");
  process.exit(2);
}
const opts = argv.slice(0, sep);
const cmd = argv.slice(sep + 1);
let mode = "test", timeoutS = 90;
const extraEnv = {};
for (let i = 0; i < opts.length; i++) {
  if (opts[i] === "--mode") mode = opts[++i];
  else if (opts[i] === "--timeout") timeoutS = Number(opts[++i]);
  else if (opts[i] === "--env") { const [k, ...v] = String(opts[++i]).split("="); extraEnv[k] = v.join("="); }
}

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.unref();
  s.on("error", reject);
  s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

const port = await freePort();
const api = `http://127.0.0.1:${port}`;
const env = { ...process.env, ...extraEnv };
const isWin = process.platform === "win32";
const server = spawn("uv", ["run", "python", "-m", "app", "--env", mode, "--port", String(port), "--no-reload"], {
  cwd: path.join(root, "apps", "api"), env, stdio: ["ignore", "pipe", "pipe"], detached: !isWin,
});
const logs = [];
const keep = (b) => { logs.push(...b.toString().split(/\r?\n/)); if (logs.length > 200) logs.splice(0, logs.length - 200); };
server.stdout.on("data", keep);
server.stderr.on("data", keep);
let exited = false;
server.on("exit", () => { exited = true; });
server.on("error", (e) => { exited = true; logs.push(`spawn error: ${e.message} (is uv installed and on PATH?)`); });

let activeChild = null;
function stop() {
  if (activeChild && !activeChild.killed && activeChild.pid) {
    try {
      if (isWin) spawnSync("taskkill", ["/pid", String(activeChild.pid), "/T", "/F"], { stdio: "ignore" });
      else activeChild.kill("SIGTERM");
    } catch { /* already gone */ }
  }
  if (exited || !server.pid) return;
  try {
    if (isWin) spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-server.pid, "SIGTERM");
  } catch { try { server.kill(); } catch { /* already gone */ } }
}
process.on("SIGINT", () => { stop(); process.exit(130); });

const deadline = Date.now() + timeoutS * 1000;
let up = false;
while (Date.now() < deadline && !exited) {
  try {
    const r = await fetch(`${api}/healthz`, { signal: AbortSignal.timeout(2000) });
    if (r.ok) { up = true; break; }
  } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 500));
}
if (!up) {
  console.error(`with-server: API did not become healthy at ${api}/healthz within ${timeoutS}s. Last server output:`);
  console.error(logs.slice(-40).join("\n"));
  stop();
  process.exit(1);
}
console.log(`with-server: API (${mode} mode) up at ${api}`);

// Run asynchronously so Node's event loop keeps draining server stdout/stderr pipes (prevents Windows 4 KB pipe deadlock).
function runAsync(file, args, opts) {
  return new Promise((resolve) => {
    const child = spawn(file, args, opts);
    activeChild = child;
    let settled = false;
    child.on("error", (error) => {
      if (!settled) { settled = true; activeChild = null; resolve({ status: null, error }); }
    });
    child.on("close", (code, signal) => {
      if (!settled) { settled = true; activeChild = null; resolve({ status: code ?? (signal ? 1 : 0), error: null }); }
    });
  });
}

const finalArgs = cmd.map((a) => a.replaceAll("{API}", api));
const runOpts = { cwd: root, env: { ...env, API_BASE_URL: api }, stdio: "inherit", shell: false };
let r = await runAsync(finalArgs[0], finalArgs.slice(1), runOpts);
if (r.error?.code === "ENOENT" && isWin) {
  // On Windows, fall back to ComSpec (/d /s /c) for .cmd/.bat shims (npm, npx) without shell:true.
  const comspec = process.env.ComSpec || "cmd.exe";
  r = await runAsync(comspec, ["/d", "/s", "/c", ...finalArgs], runOpts);
}
if (r.error) console.error(`with-server: could not run ${finalArgs[0]}: ${r.error.message}`);
stop();
if (r.status !== 0) {
  console.error("with-server: command failed. Last API output:");
  console.error(logs.slice(-30).join("\n"));
}
process.exit(r.status ?? 1);
