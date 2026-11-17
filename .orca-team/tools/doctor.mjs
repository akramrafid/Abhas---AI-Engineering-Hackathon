#!/usr/bin/env node
// doctor — checks everything the swarm needs on this machine and in this repo. Prints no secrets.
//   node .orca-team/tools/doctor.mjs
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const isWin = process.platform === "win32";

function run(cmd) {
  try {
    const out = execSync(cmd, { stdio: ["ignore", "pipe", "pipe"], timeout: 20000, encoding: "utf8" });
    return { ok: true, out: out.trim().split(/\r?\n/)[0] ?? "" };
  } catch (e) {
    return { ok: false, out: (e.stderr || e.message || "").toString().trim().split(/\r?\n/)[0] ?? "" };
  }
}

const tools = [
  { name: "git", cmd: "git --version", need: "required", hint: "Install Git for Windows: https://git-scm.com" },
  { name: "node", cmd: "node --version", need: "required", hint: "Install Node.js LTS" },
  { name: "npm", cmd: "npm --version", need: "required", hint: "Comes with Node.js" },
  { name: "uv (Python manager)", cmd: "uv --version", need: "required", hint: isWin
      ? 'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"   then restart Orca'
      : "curl -LsSf https://astral.sh/uv/install.sh | sh" },
  { name: "python (via uv)", cmd: "uv python find 3.12", need: "recommended", hint: "uv python install 3.12" },
  { name: "docker", cmd: "docker --version", need: "recommended", hint: "Install Docker Desktop (WSL2 backend) for local Postgres/Qdrant/Redis — or the swarm uses embedded fallbacks" },
  { name: "docker compose", cmd: "docker compose version", need: "recommended", hint: "Included with Docker Desktop" },
  { name: "docker engine running", cmd: "docker info --format \"{{.ServerVersion}}\"", need: "recommended", hint: "Start Docker Desktop" },
  { name: "claude (Claude Code)", cmd: "claude --version", need: "required", hint: isWin ? "irm https://claude.ai/install.ps1 | iex" : "curl -fsSL https://claude.ai/install.sh | bash" },
  { name: "agy (Antigravity CLI)", cmd: "agy --version", need: "required", hint: isWin ? "irm https://antigravity.google/cli/install.ps1 | iex" : "curl -fsSL https://antigravity.google/cli/install.sh | bash" },
  { name: "opencode", cmd: "opencode --version", need: "required", hint: "npm install -g --allow-scripts=opencode-ai opencode-ai" },
  { name: "orca CLI", cmd: "orca status --json", need: "required", hint: "Run inside an Orca terminal; Orca → Settings → install CLI & Skills" },
  { name: "gitleaks", cmd: "gitleaks version", need: "optional", hint: "Optional: improves the security review" },
];

let requiredMissing = 0;
console.log("Tools");
for (const t of tools) {
  const r = run(t.cmd);
  const tag = r.ok ? "OK  " : t.need === "required" ? "MISS" : "WARN";
  if (!r.ok && t.need === "required") requiredMissing++;
  console.log(`  [${tag}] ${t.name.padEnd(24)} ${r.ok ? r.out : `${t.need} — ${t.hint}`}`);
}

console.log("\nRepository");
const top = run("git rev-parse --show-toplevel");
if (!top.ok) {
  console.log("  [MISS] not inside a git repository — run `git init` and commit the kit");
  process.exit(1);
}
const root = path.resolve(top.out);
process.chdir(root);
const check = (label, ok, hint) => {
  console.log(`  [${ok ? "OK  " : "WARN"}] ${label}${ok ? "" : ` — ${hint}`}`);
  return ok;
};
const skillNames = (dir) => fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, "SKILL.md"))).sort()
  : [];
const agentsSkills = skillNames(path.join(root, ".agents", "skills"));
const claudeSkills = skillNames(path.join(root, ".claude", "skills"));
check(`AGENTS.md present`, fs.existsSync(path.join(root, "AGENTS.md")), "extract the swarm kit into the project root");
check(`CLAUDE.md present`, fs.existsSync(path.join(root, "CLAUDE.md")), "extract the swarm kit into the project root");
check(`TASK.md present`, fs.existsSync(path.join(root, "TASK.md")), "extract the swarm kit into the project root");
check(`${agentsSkills.length} skills in .agents/skills`, agentsSkills.length >= 15, "extract the swarm kit");
check(`.claude/skills mirrors .agents/skills (${claudeSkills.length})`,
  agentsSkills.length > 0 && agentsSkills.join() === claudeSkills.join(), "run: node .orca-team/tools/sync-skills.mjs");
check(".gitignore ignores .env", run("git check-ignore -q .env").ok, "add .env to .gitignore");
check(".env is not tracked by git", run("git ls-files .env").out === "", "run: git rm --cached .env  (then rotate any keys inside)");
const committed = run("git log -1 --oneline");
check("at least one commit", committed.ok, "commit the kit: git add -A && git commit -m \"add swarm kit\"");

console.log(requiredMissing
  ? `\n${requiredMissing} required tool(s) missing. Install them, restart Orca, run doctor again.`
  : "\nAll required tools found.");
process.exit(requiredMissing ? 1 : 0);
