---
description: Start the hackathon swarm as LEAD on TASK.md
---
ROLE: LEAD.

Load the skills `swarm-lead` and `credentials-gate`, then run the full LEAD protocol from AGENTS.md §5 on
TASK.md, starting at Phase 0. Load the LEAD role skills when you reach their phase: `product-requirements`
(Frame), `solution-architecture` (Design), `tech-lead-integration` (merges and promotion). System design and
critiques go to the DESIGN seat. Route every seat to the model in `swarm-lead/references/model-routing.md`.

- Ask me for every credential you need in ONE message, early, using the credentials-gate format. Don't wait
  for my answer: keep framing, designing and building the skeleton, and dispatch every task that doesn't need
  the missing credentials.
- Every phase ends on its gate (`node .orca-team/tools/gates.mjs <id>`); `list` shows all of them.
- Only stop for irreversible decisions (push to main, public deploy, deleting data, spending money, submitting).
- Keep `.orca-team/STATUS.md` current after every phase.

$ARGUMENTS
