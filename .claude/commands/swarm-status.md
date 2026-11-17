---
description: Summarise the swarm's current state from STATUS.md and Orca
---
Read `.orca-team/STATUS.md` and run `orca orchestration task-list --json` (if it fails, skip it).
Reply in at most 12 lines:
- current phase and time left until the TASK.md deadline
- each task: role · agent/model · state (one line each)
- open credential requests (from `.orca-team/CREDENTIALS.md`)
- open review BLOCKERs / HIGHs
- model switches in the last hour
- the single most important thing the human should do now (or "nothing — swarm is working")
Do not change any files.
