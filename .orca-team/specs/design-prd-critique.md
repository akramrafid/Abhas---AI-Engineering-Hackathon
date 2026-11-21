ROLE: DESIGN   LEAD_BRANCH: lead   TASK: design-prd-critique — PRD critique (read-only)
SKILLS: system-design (read only the parts about critiques); production-standards
INPUT ONLY: TASK.md, docs/PRD.md, docs/KICKOFF-PROMPT.md (sections 0, 4, 5, 7, 8). Nothing else.
OUTPUT: .orca-team/reviews/prd-critique.md — first line: "# PRD critique — reviewer: antigravity/Gemini 4 Neon (max)".
Write max 15 bullets, each one of these kinds, tagged at the start:
  [RUBRIC-GAP] a rubric point (R1–R8, bonus) that no MUST covers or covers weakly;
  [UNTESTABLE] an acceptance criterion that cannot be checked by a command or test as written (say why, propose exact wording);
  [TOO-BIG] a MUST too big for the time left (deadline 2026-11-22 14:00 BST, feature freeze 08:00) — propose the cut;
  [RISK] a risky assumption (data, leakage, timing, setup ≤ 180 s, Windows) — propose the mitigation.
Each bullet: one or two sentences, concrete, with the AC/FR id it concerns. No praise, no restating the PRD.
RULE: you did not write this; judge it as an outsider. Edit no other file. Commit only that file on your branch
(message "docs(review): PRD critique"), then send worker_done with the number of bullets per tag.
Time box: 15 minutes.
