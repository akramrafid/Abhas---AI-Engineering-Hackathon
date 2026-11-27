"""WP4 dispatch tests: D1-D6, number faithfulness, XSS escaping, offline socket guard, and API paths."""

from __future__ import annotations

import json
import re
from datetime import UTC, date, datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from app.adapters.db.engine import create_db_engine
from app.adapters.db.factory import get_observation_repository
from app.adapters.db.plan_store import SqlPlanStore
from app.core.command_requests import AllocationRequest, DispatchRequest
from app.core.config import API_DIR
from app.core.run_meta import current_run_meta
from app.features.dispatch.deps import get_dispatch_service
from app.features.dispatch.schemas import DispatchResponse, NoticeFacts, SupplyPair
from app.features.dispatch.service import DispatchService
from app.features.dispatch.templates import (
    allowed_number_tokens,
    classify_sms,
    extract_numeric_tokens,
    normalize_digits,
    render_brief_html,
    render_sms,
    render_whatsapp,
    tier_action_text,
)
from app.main import create_app
from app.ports.repositories import StoredPlan
from tests.conftest import SocketGuardState


class _MainTextExtractor(HTMLParser):
    """Extract visible text exclusively inside `<main>...</main>` (ignoring CSS and tags)."""

    def __init__(self) -> None:
        super().__init__()
        self._in_main = False
        self._in_style = False
        self.chunks: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "main":
            self._in_main = True
        elif tag == "style":
            self._in_style = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "main":
            self._in_main = False
        elif tag == "style":
            self._in_style = False

    def handle_data(self, data: str) -> None:
        if self._in_main and not self._in_style:
            self.chunks.append(data)


def _extract_main_text(html_doc: str) -> str:
    parser = _MainTextExtractor()
    parser.feed(html_doc)
    return " ".join(parser.chunks)


def _migrated_plan_store(tmp_path: Path, name: str = "wp4_plans.sqlite") -> tuple[Any, SqlPlanStore]:
    db_file = tmp_path / name
    url = f"sqlite:///{db_file.as_posix()}"
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(API_DIR / "migrations"))
    cfg.attributes["url"] = url
    command.upgrade(cfg, "head")
    engine = create_db_engine(url)
    return engine, SqlPlanStore(engine)


def _make_sample_facts(
    *,
    ward_id: str = "DSCC_Ward_04",
    ward_name: str = "Ward 04",
    city: Any = "Dhaka South",
    tier: Any = "Critical",
    predicted_cases: float = 19.0,
    saline: tuple[int, int] = (45, 38),
    kits: tuple[int, int] = (22, 18),
    beds: tuple[int, int] = (6, 6),
    crews: int = 2,
    deficit_level: Any = "critical",
    lang: Any = "en",
) -> NoticeFacts:
    return NoticeFacts(
        ward_id=ward_id,
        ward_name=ward_name,
        city=city,
        window_start=date(2024, 8, 19),
        window_end=date(2024, 9, 2),
        tier=tier,
        predicted_cases=predicted_cases,
        saline_bags=SupplyPair(required=saline[0], allocated=saline[1]),
        diagnostic_kits=SupplyPair(required=kits[0], allocated=kits[1]),
        hospital_beds=SupplyPair(required=beds[0], allocated=beds[1]),
        crews_assigned=crews,
        deficit_level=deficit_level,
        action=tier_action_text(tier, deficit_level, lang),
    )


# ---------------------------------------------------------------------------
# D1–D6 hand-solved algorithm checks (docs/algorithms-phase2.md §6)
# ---------------------------------------------------------------------------


def test_alg_D1_gsm7_segment_boundaries() -> None:
    """D1: 160 / 161 / 306 / 307 × 'A' -> GSM-7: 1 / 2 / 2 / 3 segments."""
    for length, expected_segments in ((160, 1), (161, 2), (306, 2), (307, 3)):
        msg = classify_sms("A" * length)
        assert msg.encoding == "GSM-7"
        assert msg.characters == length
        assert msg.segments == expected_segments


def test_alg_D2_ucs2_segment_boundaries() -> None:
    """D2: 70 / 71 / 134 / 135 × 'অ' -> UCS-2: 1 / 2 / 2 / 3 segments."""
    for length, expected_segments in ((70, 1), (71, 2), (134, 2), (135, 3)):
        msg = classify_sms("অ" * length)
        assert msg.encoding == "UCS-2"
        assert msg.characters == length
        assert msg.segments == expected_segments


def test_alg_D3_gsm7_extension_chars_count_two_septets() -> None:
    """D3: 80 × '[' -> 160 septets (1 seg); 81 × '[' -> 162 septets (2 segs)."""
    m80 = classify_sms("[" * 80)
    assert m80.encoding == "GSM-7"
    assert m80.characters == 160
    assert m80.segments == 1

    m81 = classify_sms("[" * 81)
    assert m81.encoding == "GSM-7"
    assert m81.characters == 162
    assert m81.segments == 2

    # Verify every GSM 03.38 extension char counts 2 septets
    for ext_ch in "^{}\\[~]|€":
        m = classify_sms(ext_ch)
        assert m.encoding == "GSM-7"
        assert m.characters == 2
        assert m.segments == 1


def test_alg_D4_english_sample_exact() -> None:
    """D4: English sample from contracts §2.4 is GSM-7, 141 characters, 1 segment."""
    sample = (
        "ABHAS Ward 04 Dhaka South, wk of 26 Aug: CRITICAL. 19 cases expected. "
        "Saline 38/45, kits 18/22, beds 6/6. Crews 2. Deficit: saline 7, kits 4."
    )
    msg = classify_sms(sample)
    assert msg.encoding == "GSM-7"
    assert msg.characters == 141
    assert msg.segments == 1


def test_alg_D5_bangla_sample_exact() -> None:
    """D5: Bangla sample from algorithms §6 is UCS-2, 120 characters, 2 segments."""
    sample = (
        "আভাস ওয়ার্ড ০৪ ঢাকা দক্ষিণ, ২৬ আগস্ট সপ্তাহ: সংকটপূর্ণ। প্রত্যাশিত রোগী ১৯। স্যালাইন ৩৮/৪৫, কিট ১৮/২২, শয্যা ৬/৬। দল ২।"
    )
    msg = classify_sms(sample)
    assert msg.encoding == "UCS-2"
    assert msg.characters == 120
    assert msg.segments == 2


def test_alg_D6_brief_escapes_html_and_has_zero_external_urls() -> None:
    """D6 / WP4-4: Ward name '<script>x</script>' is HTML-escaped and brief contains zero external URLs."""
    facts = _make_sample_facts(ward_name="<script>x</script>")
    meta = current_run_meta(git_sha="075e81b", offline=True)
    for lang in ("en", "bn"):
        doc = render_brief_html(
            facts,
            meta=meta,
            lang=lang,
            origin_week=date(2024, 8, 5),
            stock_pct=60,
            total_crews=10,
        )
        assert "&lt;script&gt;x&lt;/script&gt;" in doc
        assert "<script>" not in doc
        assert "http://" not in doc
        assert "https://" not in doc
        assert "@page" in doc and "A4 portrait" in doc
        assert "075e81b" in doc
        assert "offline=true" in doc


# ---------------------------------------------------------------------------
# WP4-1, WP4-2, WP4-3: Channel content, encoding limits, and number faithfulness
# ---------------------------------------------------------------------------


def _assert_number_faithful(text: str, facts: NoticeFacts, *, context: str) -> None:
    allowed = allowed_number_tokens(facts)
    found = extract_numeric_tokens(text)
    assert found, f"Expected numeric values in {context}"
    unexpected = [tok for tok in found if tok not in allowed]
    assert not unexpected, f"Ungrounded numbers in {context}: {unexpected} (allowed={sorted(allowed)})"


def test_wp4_1_and_2_deficit_ward_all_channels_and_segment_limits() -> None:
    """WP4-1 & WP4-2: Deficit ward renders cases, supplies, deficits, and crews within SMS segment caps."""
    for lang, expected_enc, max_seg in (("en", "GSM-7", 1), ("bn", "UCS-2", 3)):
        facts = _make_sample_facts(
            predicted_cases=47.2,
            saline=(139, 92),
            kits=(68, 45),
            beds=(18, 12),
            crews=3,
            deficit_level="critical",
            lang=lang,
        )
        sms = render_sms(facts, lang)
        assert sms.encoding == expected_enc
        assert sms.segments <= max_seg
        _assert_number_faithful(sms.text, facts, context=f"sms/{lang}")

        norm_sms = normalize_digits(sms.text)
        assert "47.2" in norm_sms
        assert "92/139" in norm_sms
        assert "45/68" in norm_sms
        assert "12/18" in norm_sms
        assert "3" in norm_sms
        # Deficits: saline 47, kits 23, beds 6
        assert "47" in norm_sms and "23" in norm_sms and "6" in norm_sms

        wa = render_whatsapp(facts, lang)
        _assert_number_faithful(wa, facts, context=f"whatsapp/{lang}")
        norm_wa = normalize_digits(wa)
        assert "47.2" in norm_wa
        assert "92 / 139" in norm_wa
        assert "45 / 68" in norm_wa
        assert "12 / 18" in norm_wa

        meta = current_run_meta(git_sha="075e81b", offline=True)
        brief = render_brief_html(
            facts,
            meta=meta,
            lang=lang,
            origin_week=date(2024, 8, 5),
            stock_pct=60,
            total_crews=10,
        )
        assert "http://" not in brief and "https://" not in brief
        _assert_number_faithful(_extract_main_text(brief), facts, context=f"brief-main/{lang}")


def test_wp4_3_number_faithfulness_all_wards_pinned_scenario_en_and_bn() -> None:
    """WP4-3: Every number in SMS, WhatsApp, and brief main body across all Dhaka South wards (EN + BN) is in NoticeFacts."""
    repo = get_observation_repository()
    dhaka_south_wards = list(repo.wards(city="Dhaka South"))
    assert len(dhaka_south_wards) == 20

    # Synthetic multi-ward allocation runner simulating real WP1 output across all 20 wards (with & without deficits)
    def multi_ward_alloc_runner(kind: str, req: AllocationRequest) -> tuple[dict[str, Any], dict[str, Any]]:
        assert kind == "allocation"
        tiers = ("Critical", "High", "Medium", "Low")
        wards_out: list[dict[str, Any]] = []
        for idx, w in enumerate(dhaka_south_wards):
            tier = tiers[idx % 4]
            cases = round(48.3 - idx * 1.9, 1)
            sal_req = 120 - idx * 4
            kit_req = 58 - idx * 2
            bed_req = 16 - (idx % 6)
            if idx % 3 == 0:
                sal_alloc, kit_alloc, bed_alloc = sal_req, kit_req, bed_req
                dlevel = "none"
            else:
                sal_alloc = round(sal_req * (req.stock_pct / 100.0))
                kit_alloc = round(kit_req * (req.stock_pct / 100.0))
                bed_alloc = round(bed_req * (req.stock_pct / 100.0))
                dlevel = "critical" if tier in ("Critical", "High") else "deficit"
            wards_out.append(
                {
                    "ward_id": w.ward_id,
                    "city": w.city,
                    "tier": tier,
                    "expected_cases": cases,
                    "saline_bags": {"required": sal_req, "allocated": sal_alloc},
                    "diagnostic_kits": {"required": kit_req, "allocated": kit_alloc},
                    "hospital_beds": {"required": bed_req, "allocated": bed_alloc},
                    "crews": 2 if idx < 5 else 0,
                    "deficit_level": dlevel,
                }
            )
        return (
            {
                "model_version": "abhas-lgbm-1.1.2",
                "request": req.model_dump(mode="json"),
                "wards": wards_out,
            },
            {"stock_pct": req.stock_pct, "crews": req.total_crews},
        )

    service = DispatchService(repo=repo, allocation_runner=multi_ward_alloc_runner)

    for lang in ("en", "bn"):
        req = DispatchRequest(
            origin_week=date(2024, 8, 5),
            scope="Dhaka South",
            channels=["sms", "whatsapp", "brief"],
            lang=lang,
            stock_pct=60,
            total_crews=10,
        )
        resp = service.notices(req)
        assert len(resp.notices) == 20

        for notice in resp.notices:
            assert notice.sms is not None
            assert notice.whatsapp is not None
            assert notice.brief_url is not None

            if lang == "en":
                assert notice.sms.encoding == "GSM-7"
                assert notice.sms.characters <= 160
                assert notice.sms.segments == 1
            else:
                assert notice.sms.encoding == "UCS-2"
                assert notice.sms.segments <= 3
                # Ensure Bangla SMS uses Bangla numerals (no stray ASCII digits)
                assert not re.search(r"[0-9]", notice.sms.text), f"ASCII digit in BN SMS: {notice.sms.text}"

            _assert_number_faithful(
                notice.sms.text, notice.facts, context=f"sms/{lang}/{notice.facts.ward_id}"
            )
            _assert_number_faithful(
                notice.whatsapp, notice.facts, context=f"whatsapp/{lang}/{notice.facts.ward_id}"
            )

            html_doc = service.brief_html(
                ward_id=notice.facts.ward_id,
                origin_week=date(2024, 8, 5),
                lang=lang,
                stock_pct=60,
                total_crews=10,
            )
            assert "http://" not in html_doc and "https://" not in html_doc
            _assert_number_faithful(
                _extract_main_text(html_doc),
                notice.facts,
                context=f"brief/{lang}/{notice.facts.ward_id}",
            )


def test_dispatch_plan_id_resolution_and_404_errors(tmp_path: Path) -> None:
    """Dispatch resolves saved allocation plans by plan_id and returns RFC 9457 404 on unknown ward/plan."""
    engine, store = _migrated_plan_store(tmp_path)
    try:
        saved_plan_id = "550e8400-e29b-41d4-a716-446655440042"
        plan_inputs = AllocationRequest(
            scope="Dhaka South",
            origin_week=date(2024, 8, 5),
            h_start=2,
            h_end=4,
            stock_pct=60,
            total_crews=10,
        )
        plan_outputs = {
            "model_version": "abhas-lgbm-1.1.2",
            "request": plan_inputs.model_dump(mode="json"),
            "wards": [
                {
                    "ward_id": "DSCC_Ward_04",
                    "city": "Dhaka South",
                    "tier": "Critical",
                    "expected_cases": 31.4,
                    "saline_bags": {"required": 80, "allocated": 50},
                    "diagnostic_kits": {"required": 40, "allocated": 25},
                    "hospital_beds": {"required": 10, "allocated": 8},
                    "crews": 3,
                    "deficit_level": "critical",
                }
            ],
        }
        store.save(
            StoredPlan(
                id=saved_plan_id,
                kind="allocation",
                label="Pinned DSCC 60% plan",
                origin_week=date(2024, 8, 5),
                model_version="abhas-lgbm-1.1.2",
                git_sha="075e81b",
                data_as_of=date(2025, 12, 29),
                offline=True,
                created_at=datetime(2026, 11, 27, 6, 0, tzinfo=UTC),
                inputs_json=plan_inputs.model_dump_json(),
                outputs_json=json.dumps(plan_outputs),
                headline_json=json.dumps({"stock_pct": 60, "crews": 10}),
                solve_ms=5.2,
            )
        )

        app = create_app()
        repo = get_observation_repository()
        app.dependency_overrides[get_dispatch_service] = lambda: DispatchService(repo=repo, plan_store=store)

        with TestClient(app) as client:
            # Known saved plan -> uses stored ward allocation verbatim
            r_ok = client.post(
                "/api/v1/dispatch/notices",
                json={
                    "origin_week": "2024-08-05",
                    "ward_ids": ["DSCC_Ward_04"],
                    "channels": ["sms", "whatsapp", "brief"],
                    "lang": "en",
                    "plan_id": saved_plan_id,
                },
            )
            assert r_ok.status_code == 200, r_ok.text
            parsed = DispatchResponse.model_validate(r_ok.json())
            facts = parsed.notices[0].facts
            assert facts.predicted_cases == pytest.approx(31.4)
            assert facts.saline_bags == SupplyPair(required=80, allocated=50)
            assert facts.diagnostic_kits == SupplyPair(required=40, allocated=25)
            assert facts.hospital_beds == SupplyPair(required=10, allocated=8)
            assert facts.crews_assigned == 3
            assert parsed.notices[0].brief_url is not None
            assert saved_plan_id in parsed.notices[0].brief_url

            # Brief using saved plan_id renders exact saved numbers
            r_brief = client.get(
                "/api/v1/dispatch/brief/DSCC_Ward_04.html",
                params={"origin_week": "2024-08-05", "lang": "en", "plan_id": saved_plan_id},
            )
            assert r_brief.status_code == 200
            assert "31.4" in r_brief.text
            assert saved_plan_id in r_brief.text

            # 404 unknown-ward on notices and brief
            r_bad_ward = client.post(
                "/api/v1/dispatch/notices",
                json={"origin_week": "2024-08-05", "ward_ids": ["NO_SUCH_WARD_99"]},
            )
            assert r_bad_ward.status_code == 404
            assert r_bad_ward.headers["content-type"].startswith("application/problem+json")
            assert r_bad_ward.json()["type"].endswith("/unknown-ward")

            r_bad_brief = client.get(
                "/api/v1/dispatch/brief/NO_SUCH_WARD_99.html",
                params={"origin_week": "2024-08-05"},
            )
            assert r_bad_brief.status_code == 404
            assert r_bad_brief.headers["content-type"].startswith("application/problem+json")
            assert r_bad_brief.json()["type"].endswith("/unknown-ward")

            # 404 unknown-plan on notices and brief
            missing_plan = "00000000-0000-0000-0000-000000000000"
            r_bad_plan = client.post(
                "/api/v1/dispatch/notices",
                json={
                    "origin_week": "2024-08-05",
                    "ward_ids": ["DSCC_Ward_04"],
                    "plan_id": missing_plan,
                },
            )
            assert r_bad_plan.status_code == 404
            assert r_bad_plan.headers["content-type"].startswith("application/problem+json")
            assert r_bad_plan.json()["type"].endswith("/unknown-plan")

            r_bad_plan_brief = client.get(
                "/api/v1/dispatch/brief/DSCC_Ward_04.html",
                params={"origin_week": "2024-08-05", "plan_id": missing_plan},
            )
            assert r_bad_plan_brief.status_code == 404
            assert r_bad_plan_brief.headers["content-type"].startswith("application/problem+json")
            assert r_bad_plan_brief.json()["type"].endswith("/unknown-plan")
    finally:
        engine.dispose()


@pytest.mark.offline
def test_wp4_5_offline_socket_guard_dispatch_and_brief(
    monkeypatch: pytest.MonkeyPatch,
    socket_guard: SocketGuardState,
) -> None:
    """WP4-5: Under ABHAS_OFFLINE=1 + socket guard, dispatch notices (EN/BN) and HTML briefs make zero external calls."""
    monkeypatch.setenv("ABHAS_OFFLINE", "1")
    monkeypatch.setenv("ABHAS_GIT_SHA", "075e81b")

    with TestClient(create_app()) as client:
        for lang, expected_enc, max_seg in (("en", "GSM-7", 1), ("bn", "UCS-2", 3)):
            r_disp = client.post(
                "/api/v1/dispatch/notices",
                json={
                    "origin_week": "2024-08-05",
                    "scope": "Dhaka South",
                    "channels": ["sms", "whatsapp", "brief"],
                    "lang": lang,
                    "stock_pct": 60,
                    "total_crews": 10,
                },
            )
            assert r_disp.status_code == 200, r_disp.text
            parsed = DispatchResponse.model_validate(r_disp.json())
            assert parsed.offline is True
            assert len(parsed.notices) == 20
            for notice in parsed.notices:
                assert notice.sms is not None
                assert notice.sms.encoding == expected_enc
                assert notice.sms.segments <= max_seg
                assert notice.whatsapp is not None
                assert notice.brief_url is not None
                _assert_number_faithful(notice.sms.text, notice.facts, context=f"offline-sms/{lang}")
                _assert_number_faithful(notice.whatsapp, notice.facts, context=f"offline-wa/{lang}")

            r_brief = client.get(
                "/api/v1/dispatch/brief/DSCC_Ward_04.html",
                params={
                    "origin_week": "2024-08-05",
                    "lang": lang,
                    "stock_pct": 60,
                    "total_crews": 10,
                },
            )
            assert r_brief.status_code == 200
            assert r_brief.headers["content-type"].startswith("text/html")
            assert (
                r_brief.headers.get("content-security-policy")
                == "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'"
            )
            assert "offline=true" in r_brief.text
            assert "075e81b" in r_brief.text
            assert "http://" not in r_brief.text and "https://" not in r_brief.text

    assert socket_guard.blocked == []


def test_brief_ward_outside_plan_scope_409() -> None:
    """B2: Requesting a brief for a ward outside the saved plan scope returns 409 ward-not-in-plan."""
    with TestClient(create_app()) as client:
        plan_resp = client.post(
            "/api/v1/plans",
            json={
                "kind": "allocation",
                "label": "DSCC scope plan for B2 brief check",
                "request": {"scope": "Dhaka South", "origin_week": "2024-08-05", "stock_pct": 60},
            },
        )
        assert plan_resp.status_code == 201, plan_resp.text
        plan_id = plan_resp.json()["id"]

        r = client.get(
            "/api/v1/dispatch/brief/GCC_Ward_01.html",
            params={"origin_week": "2024-08-05", "lang": "en", "plan_id": plan_id},
        )
        assert r.status_code == 409, r.text
        assert r.headers["content-type"].startswith("application/problem+json")
        body = r.json()
        assert body["type"].endswith("/ward-not-in-plan")
        assert "GCC_Ward_01" in body["detail"]
        assert "Dhaka South" in body["detail"]


def test_notices_ward_ids_outside_plan_409() -> None:
    """B2: Requesting dispatch notices for a ward outside the saved plan scope returns 409 ward-not-in-plan."""
    with TestClient(create_app()) as client:
        plan_resp = client.post(
            "/api/v1/plans",
            json={
                "kind": "allocation",
                "label": "DSCC scope plan for B2 notices check",
                "request": {"scope": "Dhaka South", "origin_week": "2024-08-05", "stock_pct": 60},
            },
        )
        assert plan_resp.status_code == 201, plan_resp.text
        plan_id = plan_resp.json()["id"]

        r = client.post(
            "/api/v1/dispatch/notices",
            json={
                "origin_week": "2024-08-05",
                "ward_ids": ["GCC_Ward_01"],
                "channels": ["sms", "whatsapp", "brief"],
                "lang": "en",
                "plan_id": plan_id,
            },
        )
        assert r.status_code == 409, r.text
        assert r.headers["content-type"].startswith("application/problem+json")
        body = r.json()
        assert body["type"].endswith("/ward-not-in-plan")
        assert "GCC_Ward_01" in body["detail"]
        assert "Dhaka South" in body["detail"]


def test_dispatch_origin_mismatch_with_plan_id_422() -> None:
    """L8 (QA Q9): Dispatch with a plan_id whose origin_week differs from request returns 422 origin-mismatch."""
    with TestClient(create_app()) as client:
        plan_resp = client.post(
            "/api/v1/plans",
            json={
                "kind": "allocation",
                "label": "DSCC 2024-08-05 plan for L8",
                "request": {"scope": "Dhaka South", "origin_week": "2024-08-05", "stock_pct": 60},
            },
        )
        assert plan_resp.status_code == 201, plan_resp.text
        plan_id = plan_resp.json()["id"]

        r_notices = client.post(
            "/api/v1/dispatch/notices",
            json={
                "origin_week": "2020-08-03",
                "ward_ids": ["DSCC_Ward_04"],
                "plan_id": plan_id,
            },
        )
        assert r_notices.status_code == 422, r_notices.text
        assert r_notices.json()["type"].endswith("/origin-mismatch")

        r_brief = client.get(
            "/api/v1/dispatch/brief/DSCC_Ward_04.html",
            params={"origin_week": "2020-08-03", "plan_id": plan_id},
        )
        assert r_brief.status_code == 422, r_brief.text
        assert r_brief.json()["type"].endswith("/origin-mismatch")


def test_notice_facts_equal_allocation_rows() -> None:
    """B2: Every NoticeFacts field equals the matching live allocation/plan ward row."""
    with TestClient(create_app()) as client:
        alloc_resp = client.post(
            "/api/v1/allocation/plan",
            json={
                "scope": "Dhaka South",
                "origin_week": "2024-08-05",
                "h_start": 2,
                "h_end": 4,
                "stock_pct": 60,
                "total_crews": 10,
            },
        )
        assert alloc_resp.status_code == 200, alloc_resp.text
        alloc_by_id = {w["ward_id"]: w for w in alloc_resp.json()["wards"]}

        disp_resp = client.post(
            "/api/v1/dispatch/notices",
            json={
                "origin_week": "2024-08-05",
                "scope": "Dhaka South",
                "channels": ["sms", "whatsapp", "brief"],
                "lang": "en",
                "stock_pct": 60,
                "total_crews": 10,
            },
        )
        assert disp_resp.status_code == 200, disp_resp.text
        notices = disp_resp.json()["notices"]
        assert len(notices) == len(alloc_by_id) == 20

        for n in notices:
            facts = n["facts"]
            row = alloc_by_id[facts["ward_id"]]
            assert facts["predicted_cases"] == pytest.approx(round(row["expected_cases"], 1))
            for key in ("saline_bags", "diagnostic_kits", "hospital_beds"):
                assert facts[key]["required"] == row[key]["required"]
                assert facts[key]["allocated"] == row[key]["allocated"]
            assert facts["crews_assigned"] == row["crews"]
            assert facts["deficit_level"] == row["deficit_level"]
