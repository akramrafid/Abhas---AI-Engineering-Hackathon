#!/usr/bin/env node
// sync-skills — mirror the canonical skills in .agents/skills (Antigravity, OpenCode)
// into .claude/skills (Claude Code). Run after editing any skill.
//   node .orca-team/tools/sync-skills.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

let root = process.cwd();
try {
  root = path.resolve(execFileSync("git", ["rev-parse", "--show-toplevel"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim());
} catch { /* not a git repo: use the current folder */ }

const src = path.join(root, ".agents", "skills");
const dst = path.join(root, ".claude", "skills");
if (!fs.existsSync(src)) {
  console.error(`No skills found at ${src}`);
  process.exit(1);
}
fs.mkdirSync(dst, { recursive: true });

let copied = 0;
const problems = [];
for (const name of fs.readdirSync(src).sort()) {
  const skillDir = path.join(src, name);
  const skillFile = path.join(skillDir, "SKILL.md");
  if (!fs.statSync(skillDir).isDirectory() || !fs.existsSync(skillFile)) continue;
  const front = fs.readFileSync(skillFile, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const declared = front?.[1].match(/^name:\s*(.+)$/m)?.[1].trim();
  if (declared !== name) problems.push(`${name}: frontmatter name is "${declared}" (must equal the folder name)`);
  fs.rmSync(path.join(dst, name), { recursive: true, force: true });
  fs.cpSync(skillDir, path.join(dst, name), { recursive: true });
  copied++;
}
console.log(`Mirrored ${copied} skill(s): .agents/skills -> .claude/skills`);
if (problems.length) {
  console.log("Problems:\n  " + problems.join("\n  "));
  process.exit(1);
}
