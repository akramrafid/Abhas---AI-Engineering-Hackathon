"""Dispatch slice HTTP router: POST /api/v1/dispatch/notices and GET /api/v1/dispatch/brief/{ward_id}.html."""

from __future__ import annotations

import html
from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Path, Query
from fastapi.responses import HTMLResponse

from app.core.errors import PROBLEM_RESPONSES
from app.core.run_meta import current_run_meta
from app.core.types import WARD_ID_PATTERN, DatasetOriginWeek

from .schemas import (
    DispatchRequest,
    DispatchResponse,
    Lang,
    Notice,
    NoticeFacts,
    SmsMessage,
    SupplyPair,
    UuidStr,
)

router = APIRouter(prefix="/api/v1", tags=["dispatch"], responses=PROBLEM_RESPONSES)

_SAMPLE_SMS_EN = (
    "ABHAS Ward 04 Dhaka South, wk of 26 Aug: CRITICAL. 19 cases expected. "
    "Saline 38/45, kits 18/22, beds 6/6. Crews 2. Deficit: saline 7, kits 4."
)
_SAMPLE_SMS_BN = (
    "আভাস ওয়ার্ড ০৪ ঢাকা দক্ষিণ, ২৬ আগস্ট সপ্তাহ: সংকটপূর্ণ। প্রত্যাশিত রোগী ১৯। স্যালাইন ৩৮/৪৫, কিট ১৮/২২, শয্যা ৬/৬। দল ২।"
)


def build_stub_dispatch_response(req: DispatchRequest) -> DispatchResponse:
    """Return a schema-valid fixture response matching contracts §2.4."""
    meta = current_run_meta()
    ward_id = req.ward_ids[0] if req.ward_ids else "DSCC_Ward_04"
    is_bn = req.lang == "bn"

    facts = NoticeFacts(
        ward_id=ward_id,
        ward_name="Ward 04",
        city="Dhaka South",
        window_start=date(2024, 8, 19),
        window_end=date(2024, 9, 2),
        tier="Critical",
        predicted_cases=19.0,
        saline_bags=SupplyPair(required=45, allocated=38),
        diagnostic_kits=SupplyPair(required=22, allocated=18),
        hospital_beds=SupplyPair(required=6, allocated=6),
        crews_assigned=2,
        deficit_level="critical",
        action=(
            "জরুরি লার্ভিসাইডিং ও ফগিং দল মোতায়েন করুন এবং স্যালাইন ও কিট ঘাটতি পূরণ করুন।"
            if is_bn
            else "Deploy emergency larviciding and fogging crews immediately and cover saline/kit deficits."
        ),
    )

    sms: SmsMessage | None = None
    if "sms" in req.channels:
        if is_bn:
            sms = SmsMessage(
                text=_SAMPLE_SMS_BN,
                encoding="UCS-2",
                characters=len(_SAMPLE_SMS_BN),
                segments=2,
            )
        else:
            sms = SmsMessage(
                text=_SAMPLE_SMS_EN,
                encoding="GSM-7",
                characters=len(_SAMPLE_SMS_EN),
                segments=1,
            )

    whatsapp: str | None = None
    if "whatsapp" in req.channels:
        if is_bn:
            whatsapp = (
                "*আভাস ওয়ার্ড ০৪ · ঢাকা দক্ষিণ*\n"
                "স্তর: *সংকটপূর্ণ* | প্রত্যাশিত রোগী: ১৯.০\n"
                "স্যালাইন: ৩৮/৪৫ | কিট: ১৮/২২ | শয্যা: ৬/৬ | দল: ২"
            )
        else:
            whatsapp = (
                "*ABHAS Ward 04 · Dhaka South*\n"
                "Tier: *Critical* | Expected cases: 19.0\n"
                "Saline: 38/45 | Kits: 18/22 | Beds: 6/6 | Crews: 2\n"
                "Deficit: saline 7, kits 4"
            )

    brief_url: str | None = None
    if "brief" in req.channels:
        brief_url = (
            f"/api/v1/dispatch/brief/{ward_id}.html"
            f"?origin_week={req.origin_week.isoformat()}&lang={req.lang}"
            f"&stock_pct={req.stock_pct}&total_crews={req.total_crews}"
        )
        if req.plan_id is not None:
            brief_url += f"&plan_id={req.plan_id}"

    return DispatchResponse(
        model_version=meta.model_version,
        git_sha=meta.git_sha,
        data_as_of=meta.data_as_of,
        offline=meta.offline,
        generated_at=meta.generated_at,
        request=req,
        lang=req.lang,
        notices=[Notice(facts=facts, sms=sms, whatsapp=whatsapp, brief_url=brief_url)],
    )


def stub_dispatch_runner(req: DispatchRequest) -> tuple[dict[str, Any], dict[str, Any]]:
    """Plan registry runner returning (outputs_dict, headline_dict) for dispatch plans."""
    resp = build_stub_dispatch_response(req)
    headline: dict[str, Any] = {
        "notices": len(resp.notices),
        "stock_pct": req.stock_pct,
        "crews": req.total_crews,
    }
    return resp.model_dump(mode="json"), headline


@router.post(
    "/dispatch/notices",
    response_model=DispatchResponse,
    summary="Generate deterministic SMS, WhatsApp, and brief URL dispatch notices",
)
async def create_dispatch_notices(req: DispatchRequest) -> DispatchResponse:
    return build_stub_dispatch_response(req)


@router.get(
    "/dispatch/brief/{ward_id}.html",
    response_class=HTMLResponse,
    summary="Self-contained printable A4 commissioner brief (HTML)",
    responses={
        200: {
            "description": "Self-contained A4 portrait printable HTML brief",
            "content": {"text/html": {"schema": {"type": "string"}}},
        },
        **PROBLEM_RESPONSES,
    },
)
async def get_commissioner_brief(
    ward_id: Annotated[str, Path(pattern=WARD_ID_PATTERN, max_length=32)],
    origin_week: Annotated[
        DatasetOriginWeek,
        Query(description="Monday of the last observed week; 2016-02-29 … 2025-12-29"),
    ],
    lang: Annotated[Lang, Query()] = "en",
    plan_id: Annotated[UuidStr | None, Query()] = None,
    stock_pct: Annotated[int, Query(ge=30, le=100)] = 100,
    total_crews: Annotated[int, Query(ge=0, le=300)] = 0,
) -> HTMLResponse:
    meta = current_run_meta()
    safe_ward = html.escape(ward_id, quote=True)
    safe_plan = html.escape(plan_id, quote=True) if plan_id else "ad-hoc"
    title = f"Abhas Commissioner Brief — {safe_ward}"
    doc = f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
  <meta charset="utf-8" />
  <title>{title}</title>
  <style>
    @page {{ size: A4 portrait; margin: 14mm; }}
    body {{ font-family: "Manrope", "Noto Sans Bengali", system-ui, -apple-system, sans-serif; color: #0B1528; margin: 0; padding: 24px; line-height: 1.45; }}
    header {{ border-bottom: 2px solid #0B1528; padding-bottom: 12px; margin-bottom: 16px; }}
    h1 {{ font-size: 20px; margin: 0 0 4px 0; }}
    .meta {{ font-size: 12px; color: #334155; font-family: ui-monospace, monospace; }}
    table {{ width: 100%; border-collapse: collapse; margin: 12px 0; }}
    th, td {{ border: 1px solid #CBD5E1; padding: 6px 10px; text-align: left; font-size: 13px; }}
    th {{ background: #F1F5F9; }}
    footer {{ margin-top: 24px; border-top: 1px solid #CBD5E1; padding-top: 10px; font-size: 11px; color: #475569; font-family: ui-monospace, monospace; }}
  </style>
</head>
<body>
  <header>
    <h1>{title}</h1>
    <div class="meta">Origin week: {origin_week.isoformat()} · Tier: Critical (4/4) · Stock: {stock_pct}% · Crews: {total_crews} · Plan: {safe_plan}</div>
  </header>
  <section>
    <h2>Predicted Cases (Weeks 2–4)</h2>
    <p>Expected: <strong>19.0</strong> cases (80% range: 13.0–27.0).</p>
  </section>
  <section>
    <h2>Supplies Allocation</h2>
    <table>
      <thead><tr><th>Resource</th><th>Required</th><th>Allocated</th><th>Deficit</th></tr></thead>
      <tbody>
        <tr><td>Saline bags</td><td>45</td><td>38</td><td>7</td></tr>
        <tr><td>Diagnostic kits</td><td>22</td><td>18</td><td>4</td></tr>
        <tr><td>Hospital beds</td><td>6</td><td>6</td><td>0</td></tr>
      </tbody>
    </table>
  </section>
  <section>
    <h2>Assigned Spraying Crews &amp; Priority Actions</h2>
    <p>Assigned crews: <strong>2</strong>. Deploy emergency larviciding and fogging crews immediately.</p>
  </section>
  <footer>
    model_version={html.escape(meta.model_version)} · git_sha={html.escape(meta.git_sha)} · data_as_of={meta.data_as_of.isoformat()} · offline={str(meta.offline).lower()} · generated_at={meta.generated_at.isoformat()}
  </footer>
</body>
</html>
"""
    return HTMLResponse(content=doc, status_code=200)
