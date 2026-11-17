from app.core.config import get_settings
from app.services.kb import (
    DEFAULT_SECTION,
    MAX_CHUNK_CHARS,
    chunk_markdown,
    is_untrusted,
    linearize_tables,
    load_documents,
)

DOC = """# Outage Credits

_Owner: Network Ops · Version 3.2_

## Credit table
Credits depend on outage length.

| Continuous outage | Credit |
|---|---|
| 4 to 12 hours | 1 day of credit |
| More than 24 and up to 48 hours | 5 days of credit |

## How to claim
- Report within **7 days**.
- Agent files an SLA credit request.
"""


def test_title_sections_and_doc_id():
    title, chunks = chunk_markdown(DOC, "outage-sla", "kb/outage-sla.md", trusted=True)

    assert title == "Outage Credits"
    assert [c.section for c in chunks] == ["Credit table", "How to claim"]
    assert [c.chunk_idx for c in chunks] == [0, 1]
    assert all(c.doc_id == "outage-sla" and c.trusted and c.path == "kb/outage-sla.md" for c in chunks)


def test_short_preamble_is_merged_into_first_section():
    _, chunks = chunk_markdown(DOC, "d", "kb/d.md", trusted=True)

    assert "Owner: Network Ops" in chunks[0].text


def test_large_preamble_stays_its_own_section():
    big = "# Plans\n\n| Plan | Price |\n|---|---|\n" + "\n".join(
        f"| P{i} | {i * 100} BDT |" for i in range(12)
    )
    big += "\n\n## Changing plans\nUpgrades are instant.\n"

    _, chunks = chunk_markdown(big, "plans", "kb/plans.md", trusted=True)

    assert [c.section for c in chunks] == [DEFAULT_SECTION, "Changing plans"]
    assert "P11" in chunks[0].text
    assert "Upgrades" not in chunks[0].text


def test_table_is_never_split_across_chunks():
    _, chunks = chunk_markdown(DOC, "d", "kb/d.md", trusted=True)

    table_chunks = [c for c in chunks if "| 4 to 12 hours" in c.text]
    assert len(table_chunks) == 1
    assert "5 days of credit" in table_chunks[0].text


def test_long_section_is_split_within_limit_with_overlap_and_no_loss():
    # Two 400-char paragraphs plus a short closing line fill chunk 1; the short line then opens chunk 2.
    paragraphs = ["A" * 400, "B" * 400, "Short bridge line.", "C" * 400, "D" * 400]
    doc = "# Big\n\n## Long section\n" + "\n\n".join(paragraphs) + "\n"

    _, chunks = chunk_markdown(doc, "big", "kb/big.md", trusted=True)

    assert len(chunks) == 2
    assert all(len(c.text) <= MAX_CHUNK_CHARS for c in chunks)
    assert {c.section for c in chunks} == {"Long section"}
    joined = "\n".join(c.text for c in chunks)
    assert all(p in joined for p in paragraphs)
    assert chunks[0].text.endswith("Short bridge line.")
    assert chunks[1].text.startswith("Short bridge line.")  # overlap carries context across the split


def test_single_oversized_paragraph_is_hard_split():
    doc = "# T\n\n## S\n" + ("x" * 2500)

    _, chunks = chunk_markdown(doc, "t", "kb/t.md", trusted=True)

    assert len(chunks) >= 3
    assert all(len(c.text) <= MAX_CHUNK_CHARS for c in chunks)


def test_title_falls_back_to_doc_id_without_h1():
    title, chunks = chunk_markdown("## Only a section\ntext", "no-title", "kb/no-title.md", trusted=True)

    assert title == "no-title"
    assert chunks[0].title == "no-title"


def test_headings_inside_code_fences_are_not_sections():
    doc = "# T\n\n## Real\n```\n## not a heading\n```\nafter\n"

    _, chunks = chunk_markdown(doc, "t", "kb/t.md", trusted=True)

    assert [c.section for c in chunks] == ["Real"]


def test_crlf_and_bom_are_normalised():
    doc = "﻿# Title\r\n\r\n## Sec\r\nline one\r\nline two\r\n"

    title, chunks = chunk_markdown(doc, "t", "kb/t.md", trusted=True)

    assert title == "Title"
    assert chunks[0].text == "line one\nline two"


def test_linearize_tables_flattens_rows_and_keeps_other_lines():
    out = linearize_tables("Intro\n| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\nOutro")

    assert out == "Intro\nA: 1; B: 2\nA: 3; B: 4\nOutro"


def test_untrusted_detection_by_filename_and_header():
    assert is_untrusted("community-forum-post", "# anything")
    assert is_untrusted("user-tips", "# Tips\n\n_UNTRUSTED user content_")
    assert not is_untrusted("billing-payments", "# Billing\n\nPolicy text")
    late = "# Billing\n\n" + "line\n" * 10 + "This is not untrusted-looking at the top"
    assert not is_untrusted("billing", late)  # the marker only counts near the top of the file


def test_content_hash_changes_with_text_model_and_trust():
    _, chunks = chunk_markdown(DOC, "d", "kb/d.md", trusted=True)
    _, untrusted = chunk_markdown(DOC, "d", "kb/d.md", trusted=False)
    base = chunks[0].content_hash("m1")

    assert base == chunks[0].content_hash("m1")
    assert base != chunks[0].content_hash("m2")
    assert base != untrusted[0].content_hash("m1")


def test_real_kb_documents_are_chunked_and_flagged():
    docs = {d.doc_id: d for d in load_documents(get_settings().kb_dir)}

    assert set(docs) == {
        "account-security-cancellation",
        "billing-payments",
        "community-forum-post",
        "outage-sla",
        "plans-pricing",
        "technical-troubleshooting",
    }
    assert [d.doc_id for d in docs.values() if not d.trusted] == ["community-forum-post"]
    assert all(len(c.text) <= MAX_CHUNK_CHARS for d in docs.values() for c in d.chunks)
    assert docs["outage-sla"].title == "Outage Credits and Service Level Agreement (SLA)"
    credit = next(c for c in docs["outage-sla"].chunks if c.section == "Outage credit table")
    assert "5 days of credit" in credit.text
    pricing = next(c for c in docs["plans-pricing"].chunks if "Luma Pro" in c.text)
    assert "1,800 BDT" in pricing.text
