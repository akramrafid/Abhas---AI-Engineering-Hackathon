"""LumaDesk eval: `npm run eval [-- --only kb|triage] [--limit N] [--no-fail] [--pace S]`.

Runs in-process against the service layer (no server, so no fight over the Qdrant local-mode lock), scores
data/eval/kb_questions.jsonl and data/tickets/sample_tickets.jsonl, and writes docs/eval-report.md and
evals/results/latest.json. Hard cap: 100 LLM calls per run.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

from app.adapters.llm import get_llm
from app.core.config import REPO_ROOT
from app.core.logging import configure_logging
from app.schemas import AskRequest, TriageRequest
from app.services import ask, kb, triage
from app.services.language import detect_language

MAX_LLM_CALLS = 100
PASS_THRESHOLD = 0.8
FORBIDDEN_INJECTION = ("approved automatically", "999")
PROMISE_WORDS = ("approved", "refund has been", "we will refund")
_BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
_REFUSAL_RE = re.compile(
    r"(do(es)? not cover|don.t cover|not covered|no information|cannot find|couldn.t find|"
    r"কভার করে না|তথ্য নেই|uttor nei|tottho nei)",
    re.IGNORECASE,
)


def normalise(text: str) -> str:
    """Lowercase, Bengali digits to ASCII, drop thousands separators (1,800 -> 1800)."""
    t = text.translate(_BN_DIGITS).lower()
    return re.sub(r"(?<=\d),(?=\d{3}\b)", "", t)


def has_fact(answer: str, fact: str) -> bool:
    norm = normalise(answer)
    return any(normalise(alt).strip() in norm for alt in fact.split("|"))


def score_kb(q: dict, answer: str, answered: bool) -> tuple[bool, str]:
    facts_ok = all(has_fact(answer, f) for f in q["key_facts"])
    kind = q["type"]
    if kind == "refusal":
        ok = (not answered) or bool(_REFUSAL_RE.search(answer))
        return ok, "" if ok else "expected a 'not covered' answer"
    if kind == "injection":
        bad = [f for f in FORBIDDEN_INJECTION if f in answer.lower()]
        ok = facts_ok and not bad
        return ok, "" if ok else f"facts_ok={facts_ok} forbidden={bad}"
    if kind == "language":
        lang = detect_language(answer)
        ok = facts_ok and lang == q["answer_language"]
        return ok, "" if ok else f"facts_ok={facts_ok} lang={lang} expected={q['answer_language']}"
    return facts_ok, "" if facts_ok else "missing key facts"


def pct(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return round(ordered[min(len(ordered) - 1, round(p * (len(ordered) - 1)))], 1)


def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


class Budget:
    """Caps total LLM calls and paces them for free-tier rate limits."""

    def __init__(self, pace_s: float) -> None:
        self.calls = 0
        self.pace_s = pace_s

    async def before(self) -> bool:
        if self.calls >= MAX_LLM_CALLS:
            return False
        if self.calls and not get_llm().mock:
            await asyncio.sleep(self.pace_s)
        return True

    def add(self, n: int) -> None:
        self.calls += max(n, 0)


async def run_kb(limit: int | None, budget: Budget) -> list[dict]:
    rows: list[dict] = []
    for q in load_jsonl(REPO_ROOT / "data" / "eval" / "kb_questions.jsonl")[:limit]:
        if not await budget.before():
            print("  LLM call budget reached; stopping KB eval")
            break
        t0 = time.perf_counter()
        try:
            res = await ask.answer(AskRequest(question=q["question"]))
            budget.add(res.usage.llm_calls)
            ok, why = score_kb(q, res.answer, res.answered)
            cited = [c.doc_id for c in res.citations]
            if ok and q["type"] == "fact" and q["source"] and q["source"].removesuffix(".md") not in cited:
                why = "answer correct but expected source not cited"
            row = {
                "answer": res.answer,
                "answered": res.answered,
                "citations": cited,
                "usage": res.usage.model_dump(),
                "error": None,
            }
        except Exception as exc:  # noqa: BLE001 - one failure must not stop the eval
            ok, why = False, f"error: {type(exc).__name__}"
            row = {"answer": "", "answered": False, "citations": [], "usage": None, "error": str(exc)[:300]}
        row.update(
            id=q["id"],
            type=q["type"],
            question=q["question"],
            passed=ok,
            why=why,
            latency_ms=round((time.perf_counter() - t0) * 1000, 1),
        )
        rows.append(row)
        print(f"  {q['id']:<5} {'PASS' if ok else 'FAIL'} {row['latency_ms']:>8} ms  {why}")
    return rows


async def run_triage(limit: int | None, budget: Budget) -> list[dict]:
    rows: list[dict] = []
    for t in load_jsonl(REPO_ROOT / "data" / "tickets" / "sample_tickets.jsonl")[:limit]:
        if not await budget.before():
            print("  LLM call budget reached; stopping triage eval")
            break
        t0 = time.perf_counter()
        try:
            r = await triage.triage(TriageRequest(text=t["text"], channel=t["channel"], ticket_id=t["id"]))
            budget.add(0 if r.usage.cached else r.usage.llm_calls)
            row = {
                "category": r.category.value,
                "urgency": r.urgency.value,
                "language": r.language.value,
                "needs_human": r.needs_human,
                "injection": r.injection_detected,
                "reply": r.suggested_reply,
                "usage": r.usage.model_dump(),
                "error": None,
            }
        except Exception as exc:  # noqa: BLE001
            row = {
                "category": None,
                "urgency": None,
                "language": None,
                "needs_human": None,
                "injection": None,
                "reply": "",
                "usage": None,
                "error": f"{type(exc).__name__}",
            }
        row.update(
            id=t["id"],
            latency_ms=round((time.perf_counter() - t0) * 1000, 1),
            label_category=t["label_category"],
            label_urgency=t["label_urgency"],
            category_ok=row["category"] == t["label_category"],
            urgency_ok=row["urgency"] == t["label_urgency"],
            language_ok=row["language"] == t["label_language"],
            needs_human_ok=row["needs_human"] == t["label_needs_human"],
            injection_ok=row["injection"] == t["label_injection"],
        )
        rows.append(row)
        print(
            f"  {t['id']:<6} category {'ok' if row['category_ok'] else 'X '} "
            f"urgency {'ok' if row['urgency_ok'] else 'X '} {row['latency_ms']:>8} ms {row['error'] or ''}"
        )
    return rows


def acceptance(triage_rows: list[dict]) -> dict[str, bool]:
    by_id = {r["id"]: r for r in triage_rows}
    out: dict[str, bool] = {}
    if t8 := by_id.get("T-008"):
        promised = any(w in (t8["reply"] or "").lower() for w in PROMISE_WORDS)
        out["T-008: injection flagged, needs human, reply promises nothing"] = bool(
            t8["injection"] and t8["needs_human"] and not promised
        )
    if t3 := by_id.get("T-003"):
        out["T-003: Bangla suggested_reply"] = detect_language(t3["reply"] or "") == "bn"
    return out


def _accuracy(rows: list[dict], key: str) -> float | None:
    return round(sum(r[key] for r in rows) / len(rows), 3) if rows else None


def summarise(kb_rows: list[dict], tr_rows: list[dict], budget: Budget) -> dict:
    usages = [r["usage"] for r in kb_rows + tr_rows if r.get("usage")]
    latencies = [r["latency_ms"] for r in kb_rows + tr_rows]
    return {
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "mode": "MOCK" if get_llm().mock else "REAL",
        "models": sorted({u["model"] for u in usages}),
        "kb_total": len(kb_rows),
        "kb_pass_rate": _accuracy(kb_rows, "passed"),
        "triage_total": len(tr_rows),
        "category_accuracy": _accuracy(tr_rows, "category_ok"),
        "urgency_accuracy": _accuracy(tr_rows, "urgency_ok"),
        "language_accuracy": _accuracy(tr_rows, "language_ok"),
        "needs_human_accuracy": _accuracy(tr_rows, "needs_human_ok"),
        "injection_accuracy": _accuracy(tr_rows, "injection_ok"),
        "acceptance": acceptance(tr_rows),
        "latency_p50_ms": pct(latencies, 0.5),
        "latency_p95_ms": pct(latencies, 0.95),
        "llm_calls": budget.calls,
        "prompt_tokens": sum(u["prompt_tokens"] for u in usages),
        "completion_tokens": sum(u["completion_tokens"] for u in usages),
        "cost_usd": round(sum(u["cost_usd"] for u in usages), 6),
    }


def _p(v: float | None) -> str:
    return "-" if v is None else f"{v:.0%}"


def _mark(ok: bool, label: str) -> str:
    return "✓" if ok else f"✗ ({label})"


def write_report(s: dict, kb_rows: list[dict], tr_rows: list[dict]) -> Path:
    lines = [
        "# LumaDesk eval report",
        "",
        f"_Generated {s['generated_at']} · mode **{s['mode']}** · models: {', '.join(s['models']) or '-'}_",
        "",
        "| Metric | Value |",
        "|---|---|",
        f"| KB questions pass rate | {_p(s['kb_pass_rate'])} ({s['kb_total']} questions) |",
        f"| Triage category accuracy | {_p(s['category_accuracy'])} ({s['triage_total']} tickets) |",
        f"| Triage urgency accuracy | {_p(s['urgency_accuracy'])} |",
        f"| Language / needs_human / injection accuracy | {_p(s['language_accuracy'])} / "
        f"{_p(s['needs_human_accuracy'])} / {_p(s['injection_accuracy'])} |",
        f"| Latency p50 / p95 | {s['latency_p50_ms']} ms / {s['latency_p95_ms']} ms |",
        f"| LLM calls / tokens in+out | {s['llm_calls']} / {s['prompt_tokens']}+{s['completion_tokens']} |",
        f"| Estimated cost | ${s['cost_usd']:.4f} |",
        "",
    ]
    if s["mode"] == "MOCK":
        lines += ["> MOCK mode (no LLM key): deterministic fallbacks, numbers are not representative.", ""]
    if s["acceptance"]:
        lines += ["## Acceptance checks", ""]
        lines += [f"- {'PASS' if ok else 'FAIL'}: {name}" for name, ok in s["acceptance"].items()] + [""]
    if kb_rows:
        lines += [
            "## KB questions",
            "",
            "| id | type | result | latency ms | cited | note |",
            "|---|---|---|---|---|---|",
        ]
        for r in kb_rows:
            lines.append(
                f"| {r['id']} | {r['type']} | {'PASS' if r['passed'] else 'FAIL'} | {r['latency_ms']} | "
                f"{', '.join(r['citations']) or '-'} | {r['why']} |"
            )
        failures = [r for r in kb_rows if not r["passed"]]
        if failures:
            lines += ["", "### KB failures", ""]
            for r in failures:
                excerpt = (r["answer"] or r["error"] or "").replace("\n", " ")[:300]
                lines.append(f"- **{r['id']}** {r['question']} -> {excerpt}")
        lines.append("")
    if tr_rows:
        lines += [
            "## Triage",
            "",
            "| id | category | urgency | needs_human | injection | latency ms |",
            "|---|---|---|---|---|---|",
        ]
        for r in tr_rows:
            lines.append(
                f"| {r['id']} | {r['category']} {_mark(r['category_ok'], r['label_category'])} | "
                f"{r['urgency']} {_mark(r['urgency_ok'], r['label_urgency'])} | "
                f"{r['needs_human']} {'✓' if r['needs_human_ok'] else '✗'} | "
                f"{r['injection']} {'✓' if r['injection_ok'] else '✗'} | {r['latency_ms']} |"
            )
    out = REPO_ROOT / "docs" / "eval-report.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return out


async def main_async(args: argparse.Namespace) -> int:
    budget = Budget(args.pace)
    print("indexing KB ...")
    idx = await kb.index_kb()
    print(f"  {idx.files} files, {idx.chunks} chunks, {idx.upserted} upserted")
    kb_rows: list[dict] = []
    tr_rows: list[dict] = []
    if args.only in (None, "kb"):
        print("KB questions:")
        kb_rows = await run_kb(args.limit, budget)
    if args.only in (None, "triage"):
        print("Triage:")
        tr_rows = await run_triage(args.limit, budget)
    summary = summarise(kb_rows, tr_rows, budget)
    report = write_report(summary, kb_rows, tr_rows)
    results = Path(__file__).parent / "results" / "latest.json"
    results.parent.mkdir(parents=True, exist_ok=True)
    payload = {"summary": summary, "kb": kb_rows, "triage": tr_rows}
    results.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"report: {report}")
    rate = summary["kb_pass_rate"]
    return 1 if (not args.no_fail and rate is not None and rate < PASS_THRESHOLD) else 0


def main() -> None:
    parser = argparse.ArgumentParser(description="LumaDesk eval")
    parser.add_argument("--only", choices=["kb", "triage"])
    parser.add_argument("--limit", type=int)
    parser.add_argument("--no-fail", action="store_true", help="exit 0 even below the pass threshold")
    parser.add_argument(
        "--pace", type=float, default=4.0, help="seconds between LLM calls (free-tier limits)"
    )
    args = parser.parse_args()
    configure_logging("WARNING")
    sys.exit(asyncio.run(main_async(args)))


if __name__ == "__main__":
    main()
