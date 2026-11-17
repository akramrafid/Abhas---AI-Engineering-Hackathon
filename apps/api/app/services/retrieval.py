"""Hybrid retrieval over TRUSTED chunks only: dense (Qdrant) + lexical (BM25), fused with RRF.

Why hybrid: on this KB a small multilingual dense model alone ranks a generic "Cancellation" chunk above
the outage-credit table for "30 hours down", and its scores for off-topic questions ("stock price") exceed
those of valid ones, so no single dense threshold can separate answerable questions. BM25 is exact on
the English terms agents use; dense covers paraphrases and Bangla.

Untrusted documents (e.g. the community forum post) are filtered out in the vector query itself and are never
part of the lexical corpus, so their text cannot reach the LLM or a citation.
"""

import logging
import math
import re
import time
from dataclasses import dataclass

from app.adapters.embeddings import get_embedder
from app.adapters.vectorstore import Hit, VectorStore, get_vector_store
from app.core.logging import log_event
from app.schemas import Citation
from app.services.language import detect_language

log = logging.getLogger("app.retrieval")

TOP_K = 5  # chunks used as answer context
TOP_K_NON_ENGLISH = 8  # cross-lingual dense ranking is weaker (Bangla: the right chunk can sit at rank 6)
DENSE_CANDIDATES = 20
RRF_K = 60
BM25_K1 = 1.2
BM25_B = 0.75
CORPUS_TTL_S = 60.0  # safety net for server-mode Qdrant being re-indexed by another process

# Gate (tuned on data/eval/kb_questions.jsonl, see tests/unit/test_kb_real_embeddings.py).
# Strict (no LLM available, i.e. mock mode): answerable = lexical evidence OR a strong dense match OR
# (non-English and a moderate dense match). Lenient (a real LLM decides): only drop evidence-free questions.
BM25_MIN = 4.5  # off-topic questions score <= 2.8, valid English ones >= 5.4
BM25_WEAK = 2.0
DENSE_STRONG = 0.65
DENSE_NON_ENGLISH_MIN = 0.30  # Bangla has no lexical overlap with the English KB
DENSE_FLOOR = 0.15  # a chunk below this with no lexical hit is noise

SNIPPET_CHARS = 240
_WORD_RE = re.compile(r"[\wঀ-৿]+")
_STOPWORDS = frozenset(
    "a an the is are was were be been am do does did i you we they it its of to in on at for from by with "
    "and "
    "or if my me your our what how when who whom which can could will would should may this that these those "
    "there any not no get got up as than then so about into per has have had but also just very much many "
    "lumanet luma fiber".split()
)
_SUFFIXES = ("ing", "ed", "es", "s")
_CITATION_MARKER_RE = re.compile(r"\[\d{1,2}(?:\s*,\s*\d{1,2})*\]")


def tokenize(text: str) -> list[str]:
    """Lowercased, stop-word-free, lightly stemmed tokens (English/Latin; Bengali words pass through)."""
    out: list[str] = []
    for word in _WORD_RE.findall(text.lower()):
        if word in _STOPWORDS:
            continue
        for suffix in _SUFFIXES:
            if len(word) > len(suffix) + 2 and word.endswith(suffix):
                word = word[: -len(suffix)]
                break
        out.append(word)
    return out


@dataclass(frozen=True)
class Retrieved:
    doc_id: str
    title: str
    section: str
    text: str
    chunk_idx: int
    score: float  # dense cosine similarity clipped to [0, 1]
    lexical: float  # raw BM25


@dataclass(frozen=True)
class RetrievalResult:
    chunks: list[Retrieved]  # empty when the question is not answerable from the KB
    answerable: bool
    best_dense: float
    best_lexical: float
    latency_ms: float


class LexicalIndex:
    """Tiny in-memory BM25 over chunk payloads (the KB is a few dozen chunks)."""

    def __init__(self, payloads: list[dict]) -> None:
        self.payloads = payloads
        self._docs = [
            tokenize(f"{p.get('title', '')} {p.get('section', '')} {p.get('text', '')}") for p in payloads
        ]
        n = len(self._docs)
        self._avg_len = (sum(len(d) for d in self._docs) / n) if n else 0.0
        df: dict[str, int] = {}
        for doc in self._docs:
            for term in set(doc):
                df[term] = df.get(term, 0) + 1
        self._idf = {t: math.log(1 + (n - c + 0.5) / (c + 0.5)) for t, c in df.items()}

    def scores(self, query: str) -> list[float]:
        terms = set(tokenize(query))
        out: list[float] = []
        for doc in self._docs:
            total = 0.0
            for term in terms:
                tf = doc.count(term)
                if tf:
                    norm = tf + BM25_K1 * (1 - BM25_B + BM25_B * len(doc) / (self._avg_len or 1.0))
                    total += self._idf[term] * tf * (BM25_K1 + 1) / norm
            out.append(total)
        return out


_corpus_cache: tuple[str, int, float, LexicalIndex] | None = None  # (store.uid, version, built_at, index)


async def _lexical_index(store: VectorStore) -> LexicalIndex:
    global _corpus_cache
    now = time.monotonic()
    cached = _corpus_cache
    if cached and cached[:2] == (store.uid, store.version) and now - cached[2] < CORPUS_TTL_S:
        return cached[3]
    index = LexicalIndex(await store.trusted_payloads())
    _corpus_cache = (store.uid, store.version, now, index)
    return index


def _rrf(rankings: list[list[tuple[str, int]]]) -> dict[tuple[str, int], float]:
    fused: dict[tuple[str, int], float] = {}
    for ranking in rankings:
        for rank, key in enumerate(ranking):
            fused[key] = fused.get(key, 0.0) + 1.0 / (RRF_K + rank + 1)
    return fused


def _key(payload: dict) -> tuple[str, int]:
    return str(payload.get("doc_id")), int(payload.get("chunk_idx", 0))


def _is_answerable(language: str, best_dense: float, best_lexical: float, lenient: bool) -> bool:
    if lenient:  # an LLM makes the final call; only drop questions with no evidence at all
        return best_lexical >= BM25_WEAK or best_dense >= DENSE_NON_ENGLISH_MIN
    if best_lexical >= BM25_MIN or best_dense >= DENSE_STRONG:
        return True
    return language != "en" and best_dense >= DENSE_NON_ENGLISH_MIN


def _fuse(hits: list[Hit], lexical: LexicalIndex, lex_scores: list[float], k: int) -> list[Retrieved]:
    dense_by_key = {_key(h.payload): h for h in hits}
    payload_by_key = {_key(p): p for p in lexical.payloads}
    for key, hit in dense_by_key.items():
        payload_by_key.setdefault(key, hit.payload)
    lex_by_key = {_key(p): s for p, s in zip(lexical.payloads, lex_scores, strict=True)}

    dense_rank = [_key(h.payload) for h in sorted(hits, key=lambda h: -h.score)]
    lex_rank = [key for key in sorted(lex_by_key, key=lambda x: -lex_by_key[x]) if lex_by_key[key] > 0]
    fused = _rrf([dense_rank, lex_rank])

    out: list[Retrieved] = []
    for key in sorted(payload_by_key, key=lambda key: -fused.get(key, 0.0)):
        hit = dense_by_key.get(key)
        dense = min(max(hit.score, 0.0), 1.0) if hit else 0.0
        lex = lex_by_key.get(key, 0.0)
        if dense < DENSE_FLOOR and lex <= 0:
            continue
        p = payload_by_key[key]
        out.append(
            Retrieved(
                doc_id=str(p.get("doc_id", "")),
                title=str(p.get("title", "")),
                section=str(p.get("section", "")),
                text=str(p.get("text", "")),
                chunk_idx=int(p.get("chunk_idx", 0)),
                score=round(dense, 4),
                lexical=round(lex, 3),
            )
        )
        if len(out) == k:
            break
    return out


async def retrieve(
    query: str, k: int | None = None, store: VectorStore | None = None, lenient: bool = False
) -> RetrievalResult:
    """Top-k trusted chunks for `query`, or an empty not-answerable result when the KB has no evidence."""
    t0 = time.perf_counter()
    store = store or get_vector_store()
    language = detect_language(query)
    if k is None:
        k = TOP_K if language == "en" else TOP_K_NON_ENGLISH
    [vector] = await get_embedder().embed([query])
    hits = await store.search(vector, DENSE_CANDIDATES, trusted_only=True)
    lexical = await _lexical_index(store)
    lex_scores = lexical.scores(query)

    best_dense = max((min(max(h.score, 0.0), 1.0) for h in hits), default=0.0)
    best_lexical = max(lex_scores, default=0.0)
    answerable = bool(hits or lexical.payloads) and _is_answerable(
        language, best_dense, best_lexical, lenient
    )
    chunks = _fuse(hits, lexical, lex_scores, k) if answerable else []

    result = RetrievalResult(
        chunks=chunks,
        answerable=bool(chunks),
        best_dense=round(best_dense, 4),
        best_lexical=round(best_lexical, 3),
        latency_ms=round((time.perf_counter() - t0) * 1000, 1),
    )
    log_event(
        log,
        "retrieval",
        answerable=result.answerable,
        language=language,
        best_dense=result.best_dense,
        best_lexical=result.best_lexical,
        latency_ms=result.latency_ms,
        top=[(c.doc_id, c.chunk_idx, c.score, c.lexical) for c in chunks],
    )
    return result


def excerpt(text: str, query: str, max_chars: int = SNIPPET_CHARS) -> str:
    """The line of `text` that best matches `query` (table rows flattened), trimmed for display."""
    lines = [ln.strip() for ln in text.split("\n") if ln.strip() and not set(ln.strip()) <= set("|-: ")]
    terms = set(tokenize(_CITATION_MARKER_RE.sub(" ", query)))  # "[1]" would otherwise match a "1" cell
    best = max(lines, key=lambda ln: len(terms & set(tokenize(ln))), default=text.strip())
    if best.startswith("|"):
        best = " — ".join(c.strip() for c in best.strip("|").split("|"))
    best = best.lstrip("-* ").strip()
    return best if len(best) <= max_chars else best[: max_chars - 1].rstrip() + "…"


def to_citation(cid: int, chunk: Retrieved, query: str) -> Citation:
    return Citation(
        id=cid,
        doc_id=chunk.doc_id,
        title=chunk.title,
        section=chunk.section,
        snippet=excerpt(chunk.text, query),
        score=chunk.score,
    )


async def search(query: str, k: int = 3) -> list[Citation]:
    """Trusted-chunk citations (ids 1..k) for `query`; empty when the KB does not cover it."""
    result = await retrieve(query, k=k)
    return [to_citation(i, c, query) for i, c in enumerate(result.chunks, start=1)]
