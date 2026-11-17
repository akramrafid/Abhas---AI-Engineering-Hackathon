"""KB ingestion: parse data/kb markdown, chunk by heading sections, index idempotently into Qdrant.

Idempotency: point id = uuid5(doc_id, chunk_idx); each point stores a content hash. A re-run embeds and
upserts only chunks whose hash changed and deletes points whose chunk/doc no longer exists.
"""

import asyncio
import hashlib
import json
import logging
import re
import time
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from app.adapters.embeddings import Embedder, get_embedder
from app.adapters.vectorstore import VectorStore, get_vector_store, point_id
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.logging import log_event
from app.schemas import DocumentDetail, DocumentSummary, IndexResult

log = logging.getLogger("app.kb")

MAX_CHUNK_CHARS = 900
OVERLAP_CHARS = 160  # a short trailing block is repeated at the start of the next chunk of a split section
DEFAULT_SECTION = "Overview"  # label for content that sits before the first heading
PREAMBLE_MERGE_MAX_CHARS = 200
EMBED_BATCH = 64
DOC_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$")
_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$")
_FENCE_RE = re.compile(r"^\s*(```|~~~)")
_SPLIT_UNIT_RE = re.compile(r"(?<=\n)|(?<=[.!?।])\s+")
_UNTRUSTED_NAME_HINTS = ("community", "forum")
_UNTRUSTED_HEAD_LINES = 5
_index_lock = asyncio.Lock()


@dataclass(frozen=True)
class Chunk:
    doc_id: str
    title: str
    section: str
    text: str
    chunk_idx: int
    trusted: bool
    path: str

    @property
    def embed_text(self) -> str:
        """Text that is embedded: section heading + tables flattened to `header: value` rows.

        Measured on the eval set: pipes/numbers in raw markdown tables dilute the embedding, and the
        document title makes every chunk of a doc look alike; the section heading alone retrieves best.
        """
        head = self.title if self.section == DEFAULT_SECTION else self.section
        return f"{head}\n{linearize_tables(self.text)}"

    def content_hash(self, embedding_model: str) -> str:
        blob = json.dumps(
            [embedding_model, self.embed_text, self.title, self.section, self.text, self.trusted, self.path],
            ensure_ascii=False,
        )
        return hashlib.sha256(blob.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class KBDocument:
    doc_id: str
    title: str
    path: str
    trusted: bool
    content: str
    chunks: tuple[Chunk, ...]


def is_untrusted(stem: str, content: str) -> bool:
    """User-generated documents (forum posts etc.) must never be used as answer context."""
    if any(hint in stem.lower() for hint in _UNTRUSTED_NAME_HINTS):
        return True
    head = [ln for ln in content.splitlines() if ln.strip()][:_UNTRUSTED_HEAD_LINES]
    return any("untrusted" in ln.lower() for ln in head)


def linearize_tables(text: str) -> str:
    """Rewrite markdown table rows as `Header: cell; Header: cell` lines (other lines unchanged)."""
    out: list[str] = []
    header: list[str] | None = None
    for line in text.split("\n"):
        if not line.strip().startswith("|"):
            header = None
            out.append(line)
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if all(set(c) <= set("-: ") for c in cells):  # |---|---| separator row
            continue
        if header is None:
            header = cells
            continue
        out.append("; ".join(f"{h}: {c}" for h, c in zip(header, cells, strict=False)))
    return "\n".join(out)


def _normalise(text: str) -> str:
    return unicodedata.normalize("NFC", text.lstrip("﻿").replace("\r\n", "\n").replace("\r", "\n"))


def _split_sections(content: str) -> tuple[str, list[tuple[str, list[str]]]]:
    """Return (title, [(section_path, blocks)]) where blocks are blank-line separated, tables/lists intact."""
    title = ""
    stack: list[tuple[int, str]] = []
    sections: list[tuple[str, list[str]]] = [("", [])]
    lines: list[str] = []
    in_fence = False

    def flush_block() -> None:
        if lines:
            sections[-1][1].append("\n".join(lines).strip())
            lines.clear()

    for line in content.split("\n"):
        if _FENCE_RE.match(line):
            in_fence = not in_fence
        heading = None if in_fence else _HEADING_RE.match(line)
        if heading:
            flush_block()
            level, text = len(heading.group(1)), heading.group(2).strip()
            if level == 1 and not title:
                title = text
                continue
            while stack and stack[-1][0] >= level:
                stack.pop()
            stack.append((level, text))
            sections.append((" › ".join(t for _, t in stack), []))
        elif not line.strip() and not in_fence:
            flush_block()
        else:
            lines.append(line)
    flush_block()

    # A short owner/version line before the first heading is context for the first real section;
    # substantial pre-heading content (e.g. a pricing table) stays its own section.
    preamble = sections[0][1]
    rest = sections[1:]
    if rest and preamble and sum(len(b) for b in preamble) <= PREAMBLE_MERGE_MAX_CHARS:
        rest[0] = (rest[0][0], preamble + rest[0][1])
        sections = rest
    return title, [
        (name or DEFAULT_SECTION, [b for b in blocks if b]) for name, blocks in sections if any(blocks)
    ]


def _split_oversized(block: str, limit: int) -> list[str]:
    """Break a block bigger than `limit` on line, then sentence, then hard boundaries."""
    if len(block) <= limit:
        return [block]
    pieces: list[str] = []
    cur = ""
    for unit in _SPLIT_UNIT_RE.split(block):
        while len(unit) > limit:  # no natural boundary: hard split
            pieces.append(unit[:limit])
            unit = unit[limit:]
        if cur and len(cur) + len(unit) + 1 > limit:
            pieces.append(cur.strip())
            cur = ""
        cur = f"{cur} {unit}" if cur and not cur.endswith("\n") else f"{cur}{unit}"
    if cur.strip():
        pieces.append(cur.strip())
    return pieces


def _pack(blocks: list[str], limit: int = MAX_CHUNK_CHARS, overlap: int = OVERLAP_CHARS) -> list[str]:
    """Greedily pack blocks into chunks <= limit chars; repeat a short trailing block as overlap."""
    chunks: list[str] = []
    cur: list[str] = []
    new_in_cur = 0
    size = 0
    for piece in (p for b in blocks for p in _split_oversized(b, limit)):
        if cur and size + 2 + len(piece) > limit:
            chunks.append("\n\n".join(cur))
            tail = cur[-1] if len(cur[-1]) <= overlap else ""
            cur, new_in_cur = ([tail] if tail else []), 0
            size = len(tail)
        size += len(piece) + (2 if cur else 0)
        cur.append(piece)
        new_in_cur += 1
    if cur and new_in_cur:
        chunks.append("\n\n".join(cur))
    return chunks


def chunk_markdown(content: str, doc_id: str, path: str, trusted: bool) -> tuple[str, list[Chunk]]:
    """Chunk by heading section (<= 900 chars per chunk; a section is never merged with another)."""
    title, sections = _split_sections(_normalise(content))
    title = title or doc_id
    chunks: list[Chunk] = []
    for section, blocks in sections:
        for text in _pack(blocks):
            chunks.append(Chunk(doc_id, title, section, text, len(chunks), trusted, path))
    return title, chunks


def parse_document(file: Path, kb_dir: Path) -> KBDocument:
    content = _normalise(file.read_text(encoding="utf-8"))
    doc_id = file.stem
    trusted = not is_untrusted(doc_id, content)
    path = f"{kb_dir.name}/{file.name}"
    title, chunks = chunk_markdown(content, doc_id, path, trusted)
    return KBDocument(doc_id, title, path, trusted, content, tuple(chunks))


def load_documents(kb_dir: Path) -> list[KBDocument]:
    if not kb_dir.is_dir():
        raise AppError("kb_dir_missing", "The knowledge-base folder was not found on the server.", 500)
    files = sorted(p for p in kb_dir.glob("*.md") if p.is_file() and not p.name.startswith("."))
    return [parse_document(f, kb_dir) for f in files]


async def index_directory(kb_dir: Path, store: VectorStore, embedder: Embedder) -> IndexResult:
    t0 = time.perf_counter()
    docs = await asyncio.to_thread(load_documents, kb_dir)
    desired = {point_id(c.doc_id, c.chunk_idx): c for d in docs for c in d.chunks}
    hashes = {pid: c.content_hash(embedder.model_name) for pid, c in desired.items()}

    await store.ensure_collection()
    stored = {s.point_id: s for s in await store.stored_chunks()}
    changed = [pid for pid in desired if pid not in stored or stored[pid].content_hash != hashes[pid]]
    stale = [pid for pid in stored if pid not in desired]

    for i in range(0, len(changed), EMBED_BATCH):
        batch = changed[i : i + EMBED_BATCH]
        vectors = await embedder.embed([desired[pid].embed_text for pid in batch])
        payloads = [
            {
                "doc_id": desired[pid].doc_id,
                "title": desired[pid].title,
                "section": desired[pid].section,
                "text": desired[pid].text,
                "chunk_idx": desired[pid].chunk_idx,
                "content_hash": hashes[pid],
                "trusted": desired[pid].trusted,
                "path": desired[pid].path,
                "embedding_model": embedder.model_name,
            }
            for pid in batch
        ]
        await store.upsert(batch, vectors, payloads)
    await store.delete(stale)  # after upserts: an interrupted run never leaves the index emptier

    result = IndexResult(
        files=len(docs),
        chunks=len(desired),
        upserted=len(changed),
        unchanged=len(desired) - len(changed),
        deleted=len(stale),
        duration_ms=round((time.perf_counter() - t0) * 1000, 1),
    )
    log_event(log, "kb_indexed", **result.model_dump())
    return result


async def index_kb() -> IndexResult:
    async with _index_lock:
        return await index_directory(get_settings().kb_dir, get_vector_store(), get_embedder())


def _summary(doc: KBDocument) -> DocumentSummary:
    return DocumentSummary(
        doc_id=doc.doc_id, title=doc.title, path=doc.path, trusted=doc.trusted, chunks=len(doc.chunks)
    )


async def list_documents() -> list[DocumentSummary]:
    docs = await asyncio.to_thread(load_documents, get_settings().kb_dir)
    return [_summary(d) for d in docs]


async def get_document(doc_id: str) -> DocumentDetail | None:
    if not DOC_ID_RE.match(doc_id):  # never build a path from raw input; match against listed files only
        return None
    docs = await asyncio.to_thread(load_documents, get_settings().kb_dir)
    doc = next((d for d in docs if d.doc_id == doc_id), None)
    if doc is None:
        return None
    return DocumentDetail(**_summary(doc).model_dump(), content=doc.content)
