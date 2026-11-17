ROLE: REVIEWER-SEC
LEAD_BRANCH: master
TASK: R1-sec — Security review round 1
SKILLS: security-review
DIFF RANGE: git diff e1961f6...HEAD  (whole app)
FOCUS: prompt injection (tickets, the untrusted data/kb/community-forum-post.md, chat history), reply safety
  (no promised refunds), secrets handling (.env never read/printed/logged; NEXT_PUBLIC_* only non-secret), input
  limits / DoS (ticket + question lengths, batch endpoint cost), SQL injection in services/history.py, CORS,
  XSS in the web app markdown rendering (react-markdown + rehype-sanitize), SSRF/path traversal in
  /kb/documents/{doc_id}, error messages leaking internals, dependency risks.
GOLDEN PATH: PLAN.md section 2; TASK.md acceptance tests 4, 5, 7.
HOW TO RUN: npm run test. Do not read .env contents. Do not start a server on 8000; use 8006 if needed.
REPORT: .orca-team/reviews/r1-security.md (the only file you may write). Severity BLOCKER/HIGH/MEDIUM/LOW, file:line,
  why, concrete fix, verdict SHIP / FIX-BLOCKERS / REWORK. Commit it, then worker_done with verdict and counts.
