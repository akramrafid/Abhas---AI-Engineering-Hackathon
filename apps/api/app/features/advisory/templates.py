"""Deterministic EN/BN advisory templates and ASCII+Bangla numeric grounding validator (AC-17)."""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any, Literal

_BN_TO_ASCII = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
_ASCII_TO_BN = str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯")
_NUM_RE = re.compile(r"\d+(?:\.\d+)?")

TIER_BN_LABEL: dict[str, str] = {
    "Low": "নিম্ন",
    "Medium": "মাঝারি",
    "High": "উচ্চ",
    "Critical": "সংকটপূর্ণ",
}

DRIVER_BN_LABEL: dict[str, str] = {
    "rain_2_4w": "২–৪ সপ্তাহ আগের বৃষ্টি",
    "recent_rain": "সাম্প্রতিক বৃষ্টি",
    "heat": "তাপমাত্রা",
    "humidity": "আর্দ্রতা",
    "water_logging": "জলাবদ্ধতা",
    "crowding": "জনঘনত্ব",
    "sanitation": "স্যানিটেশন",
    "season": "মৌসুমি প্রবণতা",
}


def normalize_digits(text: str) -> str:
    """Normalize Bangla digits (০-৯) to ASCII digits (0-9) for numeric validation (AC-17)."""
    return text.translate(_BN_TO_ASCII)


def to_bangla_digits(text: str) -> str:
    return text.translate(_ASCII_TO_BN)


def _canonical_number_tokens(text: str) -> set[str]:
    norm = normalize_digits(text)
    tokens: set[str] = set()
    for raw in _NUM_RE.findall(norm):
        tokens.add(raw)
        try:
            val = float(raw)
            if val.is_integer():
                tokens.add(str(int(val)))
                tokens.add(f"{int(val)}.0")
            else:
                tokens.add(f"{val:g}")
        except ValueError:
            pass
    return tokens


def extract_output_numbers(advisory_data: Mapping[str, Any]) -> list[str]:
    """Extract all numeric tokens (normalized from ASCII + Bangla digits) from advisory text fields."""
    parts: list[str] = [
        str(advisory_data.get("headline", "")),
        str(advisory_data.get("summary", "")),
    ]
    raw_actions = advisory_data.get("actions")
    if isinstance(raw_actions, list):
        for item in raw_actions:
            if isinstance(item, Mapping):
                parts.append(str(item.get("action", "")))
                parts.append(str(item.get("when", "")))
    combined = normalize_digits(" ".join(parts))
    return _NUM_RE.findall(combined)


def validate_advisory_numbers(
    advisory_data: Mapping[str, Any],
    allowed_input_text: str,
) -> tuple[bool, list[str]]:
    """Verify every number in headline/summary/actions (ASCII or Bangla digits) appears in input (AC-17)."""
    allowed = _canonical_number_tokens(allowed_input_text)
    found = extract_output_numbers(advisory_data)
    offending: list[str] = []
    for tok in found:
        canon_set = _canonical_number_tokens(tok)
        if not (canon_set & allowed):
            offending.append(tok)
    return (len(offending) == 0, offending)


def _fmt_num(val: float) -> str:
    if float(val).is_integer():
        return str(int(val))
    return f"{val:.1f}"


def _fmt_signed_pct(val: float) -> str:
    sign = "+" if val >= 0 else "-"
    mag = abs(val)
    return f"{sign}{mag:.1f}%"


def render_template_advisory(
    forecast_input: Mapping[str, Any],
    language: Literal["en", "bn"] = "en",
) -> dict[str, Any]:
    """Render a deterministic, strictly grounded EN or BN advisory with zero external calls."""
    ward_id = str(forecast_input["ward_id"])
    horizon = int(forecast_input["horizon"])
    target_week = str(forecast_input["target_week"])
    tier = str(forecast_input["tier"])
    expected_cases = float(forecast_input["expected_cases"])
    p10 = float(forecast_input["p10"])
    p90 = float(forecast_input["p90"])
    risk_score = int(forecast_input["risk_score"])
    drivers = list(forecast_input.get("drivers") or [])

    exp_s = _fmt_num(expected_cases)
    p10_s = _fmt_num(p10)
    p90_s = _fmt_num(p90)

    if language == "bn":
        tier_bn = TIER_BN_LABEL.get(tier, tier)
        h_bn = to_bangla_digits(str(horizon))
        exp_bn = to_bangla_digits(exp_s)
        p10_bn = to_bangla_digits(p10_s)
        p90_bn = to_bangla_digits(p90_s)
        rs_bn = to_bangla_digits(str(risk_score))
        tw_bn = to_bangla_digits(target_week)

        headline = f"{ward_id}: আগামী {h_bn} সপ্তাহে {tier_bn} ডেঙ্গু ঝুঁকি ({exp_bn} সম্ভাব্য রোগী)"[:160]

        driver_bits: list[str] = []
        for d in drivers[:2]:
            d_key = str(d.get("key", ""))
            d_lbl = DRIVER_BN_LABEL.get(d_key, str(d.get("label", d_key)))
            d_pct = to_bangla_digits(_fmt_signed_pct(float(d.get("effect_pct", 0.0))))
            driver_bits.append(f"{d_lbl} ({d_pct})")
        driver_clause = f" প্রধান প্রভাবক: {', '.join(driver_bits)}।" if driver_bits else ""
        summary = (
            f"{tw_bn} সপ্তাহের জন্য পূর্বাভাসিত রোগী {exp_bn} জন "
            f"(৮০% পরিসর {p10_bn} থেকে {p90_bn}, ঝুঁকি স্কোর {rs_bn})।{driver_clause}"
        )[:800]

        if tier == "Critical":
            actions = [
                {"action": "জমে থাকা পানি ও ড্রেনে জরুরি লার্ভিসাইড ও ফগিং জোরদার করুন", "when": "এই সপ্তাহে"},
                {
                    "action": "ওয়ার্ড স্বাস্থ্যকেন্দ্রে স্যালাইন, র‍্যাপিড টেস্ট কিট ও শয্যা প্রস্তুত রাখুন",
                    "when": "লক্ষ্য সপ্তাহের আগে",
                },
                {"action": "জলাবদ্ধ গলি ও নির্মাণস্থলে ডোর-টু-ডোর সোর্স রিডাকশন অভিযান চালান", "when": "অবিলম্বে"},
            ]
        elif tier == "High":
            actions = [
                {"action": "উচ্চ ঝুঁকির ড্রেন ও জলাবদ্ধ এলাকায় লার্ভিসাইড প্রয়োগ করুন", "when": "এই সপ্তাহে"},
                {"action": "স্থানীয় ক্লিনিকে ডেঙ্গু টেস্ট কিট ও স্যালাইন মজুদ যাচাই করুন", "when": "লক্ষ্য সপ্তাহের আগে"},
                {"action": "বাসাবাড়ি ও ছাদের জমে থাকা পানি অপসারণে প্রচারণা চালান", "when": "চলতি সপ্তাহে"},
            ]
        elif tier == "Medium":
            actions = [
                {"action": "জলাবদ্ধ পয়েন্ট ও ড্রেন পরিদর্শন ও পরিষ্কার নিশ্চিত করুন", "when": "এই সপ্তাহে"},
                {"action": "সাপ্তাহিক কেস ও বৃষ্টিপাতের প্রবণতা নিবিড়ভাবে পর্যবেক্ষণ করুন", "when": "পরবর্তী সপ্তাহে"},
            ]
        else:
            actions = [
                {"action": "নিয়মিত ড্রেন পরিষ্কার ও সাপ্তাহিক নজরদারি বজায় রাখুন", "when": "এই সপ্তাহে"},
                {"action": "ভারী বৃষ্টি হলে পুনরায় পূর্বাভাস যাচাই করুন", "when": "পরবর্তী পর্যালোচনায়"},
            ]
    else:
        headline = f"{ward_id}: {tier} dengue risk in {horizon} weeks ({exp_s} expected cases)"[:160]
        driver_bits = [
            f"{d.get('label', d.get('key'))} ({_fmt_signed_pct(float(d.get('effect_pct', 0.0)))})"
            for d in drivers[:2]
        ]
        driver_clause = f" Primary drivers: {', '.join(driver_bits)}." if driver_bits else ""
        summary = (
            f"Forecast for week {target_week} projects {exp_s} weekly cases "
            f"(80% range {p10_s} to {p90_s}, risk score {risk_score}, tier {tier}).{driver_clause}"
        )[:800]

        if tier == "Critical":
            actions = [
                {
                    "action": "Launch emergency larvicide and targeted fogging across stagnant drains",
                    "when": "immediately",
                },
                {
                    "action": "Pre-position saline, rapid diagnostic kits, and triage beds at ward clinics",
                    "when": "this week",
                },
                {
                    "action": "Run door-to-door breeding-site clearance in water-logged lanes",
                    "when": "before target week",
                },
            ]
        elif tier == "High":
            actions = [
                {
                    "action": "Deploy larvicide teams to stagnant drains and water-logged containers",
                    "when": "this week",
                },
                {
                    "action": "Audit ward clinic saline and rapid dengue test kit inventory",
                    "when": "before target week",
                },
                {
                    "action": "Issue targeted community clean-up advisories in high-density blocks",
                    "when": "this week",
                },
            ]
        elif tier == "Medium":
            actions = [
                {
                    "action": "Inspect and clear blocked stormwater drains and open containers",
                    "when": "this week",
                },
                {"action": "Monitor weekly rainfall and hospital admissions closely", "when": "next week"},
            ]
        else:
            actions = [
                {"action": "Maintain routine drain maintenance and weekly surveillance", "when": "this week"},
                {"action": "Re-check forecast after any heavy rainfall event", "when": "next review"},
            ]

    return {"headline": headline, "summary": summary, "actions": actions}
