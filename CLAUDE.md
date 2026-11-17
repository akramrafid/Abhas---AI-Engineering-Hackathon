@AGENTS.md
@TASK.md

# Claude Code specifics

- Everything in AGENTS.md applies. Find your role per AGENTS.md §1, then load your role's skills from
  `.claude/skills/` (Skill tool, or type `/<skill-name>`).
- The human starts the LEAD with `/kickoff` (see `.claude/commands/kickoff.md`). `/swarm-status` prints a status
  summary from STATUS.md.
- Your model and effort are set by whoever launched you (`--model`, `--effort`). As LEAD in an interactive
  session use `/model opus` and `/effort high`.
- Cross-agent work goes through `orca orchestration` only. Don't substitute Claude subagents or agent teams for
  Orca workers. A subagent is fine for read-only exploration inside your own role.
- LEAD may use plan mode during intake only; exit it before writing the skeleton.
- Hit a usage limit → print `LIMIT HIT: claude/<model>` and stop.
