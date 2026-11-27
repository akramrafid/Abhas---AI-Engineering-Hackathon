#!/usr/bin/env node
// Generate reproducible Phase 2 operational dispatch exports under /exports (WP4-6, ADR-0014).
//
// Usage:
//   node scripts/export_samples.mjs [--api http://127.0.0.1:PORT] [--out exports]
//
// When --api (and API_BASE_URL) are omitted, starts the API offline (ABHAS_OFFLINE=1) on an
// ephemeral loopback port, generates the eight sample artefacts + README.md, and shuts down cleanly.

import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCENARIO = Object.freeze({
  origin_week: "2024-08-05",
  scope: "Dhaka South",
  brief_ward_id: "DSCC_Ward_04",
  stock_pct: 60,
  total_crews: 10,
});

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const API_DIR = path.join(ROOT, "apps", "api");
const IS_WIN = process.platform === "win32";

function gitOut(args) {
  try {
    return execFileSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function commonRepoRoot() {
  const commonDir = gitOut(["rev-parse", "--git-common-dir"]);
  if (!commonDir) return ROOT;
  const resolved = path.isAbsolute(commonDir) ? commonDir : path.resolve(ROOT, commonDir);
  return path.basename(resolved).toLowerCase() === ".git" ? path.dirname(resolved) : ROOT;
}

function parseArgs(argv) {
  let apiUrl = process.env.API_BASE_URL || "";
  let outDir = path.join(ROOT, "exports");
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--api" && i + 1 < argv.length) apiUrl = argv[++i];
    else if (argv[i].startsWith("--api=")) apiUrl = argv[i].slice("--api=".length);
    else if (argv[i] === "--out" && i + 1 < argv.length) outDir = path.resolve(ROOT, argv[++i]);
    else if (argv[i].startsWith("--out=")) outDir = path.resolve(ROOT, argv[i].slice("--out=".length));
  }
  return { apiUrl: apiUrl.replace(/\/+$/, ""), outDir };
}

function findPythonLaunch() {
  const roots = [ROOT, commonRepoRoot()];
  for (const r of roots) {
    const candidate = IS_WIN
      ? path.join(r, "apps", "api", ".venv", "Scripts", "python.exe")
      : path.join(r, "apps", "api", ".venv", "bin", "python");
    if (fs.existsSync(candidate)) {
      return { cmd: candidate, prefixArgs: [] };
    }
  }
  if (process.env.ABHAS_PYTHON && fs.existsSync(process.env.ABHAS_PYTHON)) {
    return { cmd: process.env.ABHAS_PYTHON, prefixArgs: [] };
  }
  return { cmd: "uv", prefixArgs: ["run", "python"] };
}

function loadPlaywright() {
  const req = createRequire(import.meta.url);
  const roots = [ROOT, commonRepoRoot()];
  const candidates = [];
  if (process.env.PLAYWRIGHT_MODULE_PATH) candidates.push(process.env.PLAYWRIGHT_MODULE_PATH);
  for (const r of roots) {
    candidates.push(
      path.join(r, "apps", "web", "node_modules", "playwright"),
      path.join(r, "apps", "web", "node_modules", "@playwright", "test"),
      path.join(r, "node_modules", "playwright"),
    );
  }
  candidates.push("playwright");

  for (const candidate of candidates) {
    try {
      const mod = req(candidate);
      if (mod?.chromium) return mod;
    } catch {
      // Try next location.
    }
  }
  throw new Error(
    "Playwright could not be loaded. Run `npm --prefix apps/web ci` and ensure Chromium is installed.",
  );
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

async function startOfflineApi(timeoutS = 90) {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const { cmd, prefixArgs } = findPythonLaunch();
  const args = [...prefixArgs, "-m", "app", "--env", "test", "--port", String(port), "--no-reload"];
  const env = {
    ...process.env,
    ABHAS_OFFLINE: "1",
    RATE_LIMIT_PER_MINUTE: "10000",
  };

  const server = spawn(cmd, args, {
    cwd: API_DIR,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: !IS_WIN,
  });

  const logs = [];
  const keep = (buf) => {
    logs.push(...buf.toString().split(/\r?\n/));
    if (logs.length > 200) logs.splice(0, logs.length - 200);
  };
  server.stdout.on("data", keep);
  server.stderr.on("data", keep);

  let exited = false;
  server.on("exit", () => {
    exited = true;
  });
  server.on("error", (err) => {
    exited = true;
    logs.push(`spawn error: ${err.message}`);
  });

  const stop = () => {
    if (exited || !server.pid) return;
    try {
      if (IS_WIN) {
        spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        process.kill(-server.pid, "SIGTERM");
      }
    } catch {
      try {
        server.kill();
      } catch {
        // Already exited.
      }
    }
  };

  const deadline = Date.now() + timeoutS * 1000;
  let healthy = false;
  while (Date.now() < deadline && !exited) {
    try {
      const resp = await fetch(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(2000) });
      if (resp.ok) {
        healthy = true;
        break;
      }
    } catch {
      // Not ready yet.
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  if (!healthy) {
    stop();
    throw new Error(
      `Offline API did not become healthy at ${baseUrl}/healthz within ${timeoutS}s.\n${logs.slice(-40).join("\n")}`,
    );
  }
  return { baseUrl, stop };
}

async function fetchJson(url, payload) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) {
    throw new Error(`POST ${url} failed (${resp.status}): ${await resp.text()}`);
  }
  return resp.json();
}

async function fetchText(url) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!resp.ok) {
    throw new Error(`GET ${url} failed (${resp.status}): ${await resp.text()}`);
  }
  return resp.text();
}

function formatSmsExport(dispatchPayload) {
  const blocks = dispatchPayload.notices.map((notice) => {
    const sms = notice.sms;
    if (!sms) throw new Error(`Missing SMS channel for ward ${notice.facts.ward_id}`);
    const header = `# ${notice.facts.ward_id} | ${sms.encoding} | ${sms.characters} chars | ${sms.segments} seg`;
    return `${header}\n${sms.text}`;
  });
  return `${blocks.join("\n\n")}\n`;
}

function formatWhatsappExport(dispatchPayload) {
  const blocks = dispatchPayload.notices.map((notice) => {
    if (!notice.whatsapp) throw new Error(`Missing WhatsApp channel for ward ${notice.facts.ward_id}`);
    return notice.whatsapp;
  });
  return `${blocks.join("\n\n---\n\n")}\n`;
}

async function renderPdfsOffline(items) {
  const playwright = loadPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ offline: true });
    try {
      const page = await context.newPage();
      await page.route("**/*", (route) => route.abort());
      for (const { html, pdfPath } of items) {
        await page.setContent(html, { waitUntil: "load" });
        await page.emulateMedia({ media: "print" });
        await page.pdf({
          path: pdfPath,
          format: "A4",
          printBackground: true,
          preferCSSPageSize: true,
        });
      }
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

function buildReadme({ gitFullSha, gitShortSha, apiMeta, enPayload, bnPayload, fileSizes }) {
  const enSmsMaxSeg = Math.max(...enPayload.notices.map((n) => n.sms?.segments ?? 0));
  const bnSmsMaxSeg = Math.max(...bnPayload.notices.map((n) => n.sms?.segments ?? 0));
  const briefWard = SCENARIO.brief_ward_id;

  const rows = [
    ["sms_en.txt", `${enPayload.notices.length} English GSM-7 SMS notices (max ${enSmsMaxSeg} segment)`, fileSizes["sms_en.txt"]],
    ["sms_bn.txt", `${bnPayload.notices.length} Bangla UCS-2 SMS notices (max ${bnSmsMaxSeg} segments)`, fileSizes["sms_bn.txt"]],
    ["whatsapp_en.txt", `${enPayload.notices.length} English structured WhatsApp operational alerts`, fileSizes["whatsapp_en.txt"]],
    ["whatsapp_bn.txt", `${bnPayload.notices.length} Bangla structured WhatsApp operational alerts`, fileSizes["whatsapp_bn.txt"]],
    [`brief_${briefWard}_en.html`, `Self-contained A4 portrait English commissioner brief for ${briefWard}`, fileSizes[`brief_${briefWard}_en.html`]],
    [`brief_${briefWard}_bn.html`, `Self-contained A4 portrait Bangla commissioner brief for ${briefWard}`, fileSizes[`brief_${briefWard}_bn.html`]],
    [`brief_${briefWard}_en.pdf`, `Playwright A4 PDF rendered offline from brief_${briefWard}_en.html`, fileSizes[`brief_${briefWard}_en.pdf`]],
    [`brief_${briefWard}_bn.pdf`, `Playwright A4 PDF rendered offline from brief_${briefWard}_bn.html`, fileSizes[`brief_${briefWard}_bn.pdf`]],
  ];

  const tableLines = [
    "| File | Description | Size (bytes) |",
    "|---|---|---:|",
    ...rows.map(([name, desc, bytes]) => `| \`${name}\` | ${desc} | ${bytes} |`),
  ];

  return [
    "# Abhas Phase 2 — Operational Dispatch Exports",
    "",
    "Generated deterministically and offline (`ABHAS_OFFLINE=1`) from the running Abhas API.",
    "",
    "## Provenance",
    "",
    `- **Git commit:** \`${gitFullSha || "unknown"}\` (\`${gitShortSha || apiMeta.git_sha}\`)`,
    `- **API reported \`git_sha\`:** \`${apiMeta.git_sha}\``,
    `- **Model version:** \`${apiMeta.model_version}\``,
    `- **Data as of:** \`${apiMeta.data_as_of}\``,
    `- **Offline mode:** \`${apiMeta.offline}\``,
    `- **Generated at (UTC):** \`${apiMeta.generated_at}\``,
    "- **Command:** `npm run exports` (`node scripts/export_samples.mjs`)",
    "",
    "## Pinned Scenario Inputs",
    "",
    `- \`origin_week\`: \`${SCENARIO.origin_week}\``,
    `- \`scope\`: \`${SCENARIO.scope}\``,
    `- \`brief_ward_id\`: \`${SCENARIO.brief_ward_id}\``,
    `- \`stock_pct\`: \`${SCENARIO.stock_pct}\``,
    `- \`total_crews\`: \`${SCENARIO.total_crews}\``,
    `- \`channels\`: \`["sms", "whatsapp", "brief"]\``,
    "",
    "## Files",
    "",
    ...tableLines,
    "",
  ].join("\n");
}

async function main() {
  const { apiUrl, outDir } = parseArgs(process.argv.slice(2));
  let started = null;
  const baseUrl = apiUrl || (started = await startOfflineApi()).baseUrl;

  try {
    const commonReq = {
      origin_week: SCENARIO.origin_week,
      scope: SCENARIO.scope,
      channels: ["sms", "whatsapp", "brief"],
      stock_pct: SCENARIO.stock_pct,
      total_crews: SCENARIO.total_crews,
    };

    const [enPayload, bnPayload] = await Promise.all([
      fetchJson(`${baseUrl}/api/v1/dispatch/notices`, { ...commonReq, lang: "en" }),
      fetchJson(`${baseUrl}/api/v1/dispatch/notices`, { ...commonReq, lang: "bn" }),
    ]);

    const briefParams = (lang) =>
      `origin_week=${encodeURIComponent(SCENARIO.origin_week)}` +
      `&lang=${lang}&stock_pct=${SCENARIO.stock_pct}&total_crews=${SCENARIO.total_crews}`;

    const [briefEnHtml, briefBnHtml] = await Promise.all([
      fetchText(`${baseUrl}/api/v1/dispatch/brief/${SCENARIO.brief_ward_id}.html?${briefParams("en")}`),
      fetchText(`${baseUrl}/api/v1/dispatch/brief/${SCENARIO.brief_ward_id}.html?${briefParams("bn")}`),
    ]);

    fs.mkdirSync(outDir, { recursive: true });

    const briefWard = SCENARIO.brief_ward_id;
    const textFiles = {
      "sms_en.txt": formatSmsExport(enPayload),
      "sms_bn.txt": formatSmsExport(bnPayload),
      "whatsapp_en.txt": formatWhatsappExport(enPayload),
      "whatsapp_bn.txt": formatWhatsappExport(bnPayload),
      [`brief_${briefWard}_en.html`]: briefEnHtml,
      [`brief_${briefWard}_bn.html`]: briefBnHtml,
    };

    for (const [name, content] of Object.entries(textFiles)) {
      fs.writeFileSync(path.join(outDir, name), content, "utf8");
    }

    const pdfEnPath = path.join(outDir, `brief_${briefWard}_en.pdf`);
    const pdfBnPath = path.join(outDir, `brief_${briefWard}_bn.pdf`);
    await renderPdfsOffline([
      { html: briefEnHtml, pdfPath: pdfEnPath },
      { html: briefBnHtml, pdfPath: pdfBnPath },
    ]);

    const allNames = [...Object.keys(textFiles), `brief_${briefWard}_en.pdf`, `brief_${briefWard}_bn.pdf`];
    const fileSizes = Object.fromEntries(
      allNames.map((name) => [name, fs.statSync(path.join(outDir, name)).size]),
    );

    const gitFullSha = gitOut(["rev-parse", "HEAD"]);
    const gitShortSha = gitOut(["rev-parse", "--short", "HEAD"]);
    const readme = buildReadme({
      gitFullSha,
      gitShortSha,
      apiMeta: enPayload,
      enPayload,
      bnPayload,
      fileSizes,
    });
    fs.writeFileSync(path.join(outDir, "README.md"), readme, "utf8");

    console.log(
      `export_samples: wrote ${allNames.length} artefacts + README.md to ${outDir} (commit ${gitShortSha || enPayload.git_sha})`,
    );
  } finally {
    if (started) started.stop();
  }
}

main().catch((err) => {
  console.error(`export_samples failed: ${err?.stack || err}`);
  process.exit(1);
});
