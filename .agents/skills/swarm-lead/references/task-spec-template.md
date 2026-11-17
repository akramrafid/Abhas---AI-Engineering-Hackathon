# Task spec templates (paste into `--spec`, fill every field)

## Builder task
```
ROLE: BUILDER-<CORE|UI|DATA|QA>
LEAD_BRANCH: <branch>
TASK: <id> — <title>          WAVE: <1|2|3>
SKILLS: production-standards, <skill>, <skill>
GOAL: <one or two sentences: the user-visible outcome>
OWNED PATHS (only these may be edited):
  - <path/glob>
READ-ONLY CONTEXT: TASK.md, .orca-team/PLAN.md §<n>, contracts/openapi.json, <files>
CONTRACT: <endpoints / types / functions this task implements or consumes>
ACCEPTANCE CRITERIA:
  1. Given <state>, when <action>, then <observable result>.
  2. Error path: given <bad input / dependency down>, then <specific error shape/status>.
TEST COMMAND: <e.g. npm run test:api -- tests/unit/test_ingest.py>
ENV VARS NEEDED: <VAR1, VAR2 | none> (if missing: build against <mock/local path> and say so in report)
DEV PORT: <port>
OUT OF SCOPE: <what not to touch or build>
DONE WHEN: acceptance criteria pass + production-standards definition of done + worker_done report sent.
```

## Reviewer task
```
ROLE: REVIEWER-<CODE|SEC>
LEAD_BRANCH: <branch>
TASK: <id> — Review round <N>
SKILLS: <code-review | security-review>, production-standards
DIFF RANGE: git diff <base-commit>...HEAD   (base = <commit or branch>)
FOCUS: <areas changed this round; files from these workers: ...>
GOLDEN PATH: <steps from PLAN.md §2 to run end-to-end>
HOW TO RUN: npm run infra:up (already running) · npm run dev:api · npm run dev:web · npm run test
REPORT: .orca-team/reviews/r<N>-<code|security>.md (only file you may write); commit it; then worker_done
        with verdict and counts per severity.
```

## RACE task (same spec to 2–3 agents)
Use the builder template and add:
```
RACE: yes — competing implementations exist. Optimise for passing tests, correctness, simplicity, latency.
Branch name must be race-<slug>-<agent>. Do not look at other race branches.
```

## Fix task (from review findings)
```
ROLE: <owner role>   LEAD_BRANCH: <branch>   TASK: <id> — Fix review r<N> findings
SKILLS: production-standards, <relevant skill>
FINDINGS TO FIX: <ids + file:line from .orca-team/reviews/r<N>-*.md>
DONE WHEN: each finding fixed with a test proving it (where testable); report lists finding → commit.
```
