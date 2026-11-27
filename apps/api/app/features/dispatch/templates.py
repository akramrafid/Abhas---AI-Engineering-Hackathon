"""Deterministic dispatch templates, GSM-7/UCS-2 SMS classifier, and A4 brief HTML renderer (ADR-0014).

Pure, offline, framework-free module. Every number rendered into SMS, WhatsApp, or brief body
originates strictly from `NoticeFacts` (WP4-3), and every interpolated string in HTML is escaped
with `html.escape(..., quote=True)` (WP4-4 / D6).
"""

from __future__ import annotations

import html
import math
import re
from datetime import date

from app.core.run_meta import RunMeta
from app.core.types import TIER_BN, City, Tier

from .schemas import DeficitLevel, Lang, NoticeFacts, SmsMessage

# 3GPP TS 23.038 / GSM 03.38 7-bit default alphabet (127 chars, 1 septet each; excludes ESC 0x1B).
GSM7_BASIC: frozenset[str] = frozenset(
    "@£$¥èéùìòÇ\nØø\rÅå"
    "Δ_ΦΓΛΩΠΨΣΘΞÆæßÉ"
    " !\"#¤%&'()*+,-./"
    "0123456789:;<=>?"
    "¡ABCDEFGHIJKLMNO"
    "PQRSTUVWXYZÄÖÑÜ§"
    "¿abcdefghijklmno"
    "pqrstuvwxyzäöñüà"
)

# 3GPP TS 23.038 basic character set extension table (2 septets each: ESC + code).
GSM7_EXTENSION: frozenset[str] = frozenset("\f^{}\\[~]|€")

GSM7_SINGLE_LIMIT = 160
GSM7_MULTI_LIMIT = 153
UCS2_SINGLE_LIMIT = 70
UCS2_MULTI_LIMIT = 67

_BN_TO_ASCII = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
_ASCII_TO_BN = str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯")
_WARD_SUFFIX_RE = re.compile(r"Ward[_\s-]*(\d+)$", re.IGNORECASE)
_NUM_RE = re.compile(r"\d+(?:\.\d+)?")

CITY_BN: dict[str, str] = {
    "Dhaka North": "ঢাকা উত্তর",
    "Dhaka South": "ঢাকা দক্ষিণ",
    "Chattogram": "চট্টগ্রাম",
    "Gazipur": "গাজীপুর",
    "Narayanganj": "নারায়ণগঞ্জ",
}

CITY_SHORT_EN: dict[str, str] = {
    "Dhaka North": "DNCC",
    "Dhaka South": "DSCC",
    "Chattogram": "CCC",
    "Gazipur": "GCC",
    "Narayanganj": "NCC",
}

MONTH_EN: tuple[str, ...] = (
    "",
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
)

MONTH_BN: tuple[str, ...] = (
    "",
    "জানুয়ারি",
    "ফেব্রুয়ারি",
    "মার্চ",
    "এপ্রিল",
    "মে",
    "জুন",
    "জুলাই",
    "আগস্ট",
    "সেপ্টেম্বর",
    "অক্টোবর",
    "নভেম্বর",
    "ডিসেম্বর",
)

TIER_LEVEL: dict[Tier, int] = {
    "Low": 1,
    "Medium": 2,
    "High": 3,
    "Critical": 4,
}

# Risk palette strictly reserved for the risk badge + 1-4 bar meter (DESIGN.md).
_TIER_STYLE: dict[Tier, tuple[str, str, str]] = {
    "Low": ("#BFE3CC", "#16202B", "#9FCBB0"),
    "Medium": ("#F0B429", "#16202B", "#D99B16"),
    "High": ("#C2410C", "#FFFFFF", "#9A3412"),
    "Critical": ("#7F1D1D", "#FFFFFF", "#631717"),
}

# Zero digits in any action directive so number-faithfulness holds unconditionally (WP4-3).
_ACTIONS_EN: dict[tuple[Tier, bool], str] = {
    ("Critical", True): (
        "Deploy emergency larviciding and fogging crews immediately, escalate supply deficit "
        "requests to the city depot, and activate ward triage beds."
    ),
    ("Critical", False): (
        "Deploy emergency larviciding and fogging crews immediately, pre-position allocated "
        "supplies at ward clinics, and activate ward triage beds."
    ),
    ("High", True): (
        "Dispatch larviciding teams to stagnant drains, escalate regional supply shortfalls "
        "immediately, and audit ward clinic stock."
    ),
    ("High", False): (
        "Dispatch larviciding teams to stagnant drains, pre-position allocated saline and "
        "diagnostic kits, and run source clearance in dense blocks."
    ),
    ("Medium", True): (
        "Inspect and clear water-logged drains, request replenishment for supply shortfalls, "
        "and monitor weekly admissions closely."
    ),
    ("Medium", False): (
        "Inspect and clear water-logged drains, verify clinic stock readiness, and monitor "
        "weekly dengue admissions closely."
    ),
    ("Low", True): (
        "Maintain routine drain clearance and weekly surveillance while requesting "
        "replenishment for minor supply shortfalls."
    ),
    ("Low", False): (
        "Maintain routine drain maintenance and weekly dengue surveillance; re-check "
        "forecasts after heavy rainfall."
    ),
}

_ACTIONS_BN: dict[tuple[Tier, bool], str] = {
    ("Critical", True): (
        "অবিলম্বে জরুরি লার্ভিসাইডিং ও ফগিং দল মোতায়েন করুন, কেন্দ্রীয় ডিপোতে সরবরাহ ঘাটতি "
        "পূরণের অনুরোধ পাঠান এবং ওয়ার্ড ট্রায়াজ শয্যা চালু করুন।"
    ),
    ("Critical", False): (
        "অবিলম্বে জরুরি লার্ভিসাইডিং ও ফগিং দল মোতায়েন করুন, ওয়ার্ড ক্লিনিকে বরাদ্দকৃত "
        "সরবরাহ মজুত রাখুন এবং ওয়ার্ড ট্রায়াজ শয্যা চালু করুন।"
    ),
    ("High", True): (
        "জলাবদ্ধ ড্রেনে লার্ভিসাইড দল পাঠান, অবিলম্বে আঞ্চলিক সরবরাহ ঘাটতি জানান এবং ওয়ার্ড ক্লিনিকের মজুত যাচাই করুন।"
    ),
    ("High", False): (
        "জলাবদ্ধ ড্রেনে লার্ভিসাইড দল পাঠান, বরাদ্দকৃত স্যালাইন ও টেস্ট কিট প্রস্তুত রাখুন এবং ঘনবসতিপূর্ণ এলাকায় পরিচ্ছন্নতা অভিযান চালান।"
    ),
    ("Medium", True): (
        "জলাবদ্ধ ড্রেন পরিদর্শন ও পরিষ্কার করুন, সরবরাহ ঘাটতি পূরণের চাহিদা পাঠান এবং "
        "সাপ্তাহিক রোগী ভর্তি নিবিড়ভাবে পর্যবেক্ষণ করুন।"
    ),
    ("Medium", False): (
        "জলাবদ্ধ ড্রেন পরিদর্শন ও পরিষ্কার করুন, ক্লিনিকের মজুত প্রস্তুতি যাচাই করুন এবং "
        "সাপ্তাহিক ডেঙ্গু ভর্তি নিবিড়ভাবে পর্যবেক্ষণ করুন।"
    ),
    ("Low", True): ("নিয়মিত ড্রেন পরিষ্কার ও সাপ্তাহিক নজরদারি বজায় রাখুন এবং সামান্য সরবরাহ ঘাটতি পূরণের অনুরোধ পাঠান।"),
    ("Low", False): ("নিয়মিত ড্রেন রক্ষণাবেক্ষণ ও সাপ্তাহিক ডেঙ্গু নজরদারি বজায় রাখুন; ভারী বৃষ্টির পর পুনরায় পূর্বাভাস যাচাই করুন।"),
}


def normalize_digits(text: str) -> str:
    """Map Bangla numerals (০-৯) to ASCII numerals (0-9)."""
    return text.translate(_BN_TO_ASCII)


def to_bangla_digits(text: str) -> str:
    """Map ASCII numerals (0-9) to Bangla numerals (০-৯)."""
    return text.translate(_ASCII_TO_BN)


def ward_display_name(ward_id: str) -> str:
    """Derive a concise display name such as 'Ward 04' from 'DSCC_Ward_04'."""
    match = _WARD_SUFFIX_RE.search(ward_id)
    if match:
        return f"Ward {match.group(1)}"
    return ward_id.replace("_", " ")


def _ward_name_for_lang(ward_name: str, lang: Lang) -> str:
    if lang != "bn":
        return ward_name
    if ward_name.lower().startswith("ward "):
        return "ওয়ার্ড " + to_bangla_digits(ward_name[5:])
    return to_bangla_digits(ward_name)


def _city_for_lang(city: City | str, lang: Lang) -> str:
    if lang == "bn":
        return CITY_BN.get(city, city)
    return str(city)


def tier_action_text(tier: Tier, deficit_level: DeficitLevel, lang: Lang) -> str:
    """Return a digit-free deterministic operational directive for the tier and deficit state."""
    has_deficit = deficit_level != "none"
    table = _ACTIONS_BN if lang == "bn" else _ACTIONS_EN
    return table[(tier, has_deficit)]


def _fmt_cases(value: float) -> str:
    rounded = round(float(value), 1)
    if rounded.is_integer():
        return str(int(rounded))
    return f"{rounded:.1f}"


def _fmt_num_for_lang(raw: int | float | str, lang: Lang) -> str:
    text = _fmt_cases(raw) if isinstance(raw, float) else str(raw)
    return to_bangla_digits(text) if lang == "bn" else text


def _fmt_trigger_rule_line(rain_mm: float, wl_min: float, lang: Lang) -> str:
    r_str = str(int(rain_mm)) if float(rain_mm).is_integer() else f"{rain_mm:.1f}"
    w_str = f"{wl_min:.2f}"
    if lang == "bn":
        return (
            f"নিয়ম: ২ সপ্তাহের মোট বৃষ্টিপাত > {to_bangla_digits(r_str)} মিমি এবং "
            f"জলাবদ্ধতা সূচক >= {to_bangla_digits(w_str)} হলে ৩ সপ্তাহ আগেই মাঠপর্যায়ে ব্যবস্থা নিন।"
        )
    return (
        f"Rule: Act 3 weeks ahead when 2-week rainfall > {r_str} mm AND "
        f"water-logging risk index >= {w_str} (works with no model or server)."
    )


def _fmt_trigger_ward_note(ward_wl: float | None, wl_min: float, lang: Lang) -> str:
    w_str = f"{wl_min:.2f}"
    if ward_wl is None:
        return (
            "এই ওয়ার্ডের জলাবদ্ধতা সূচক স্থানীয় বৃষ্টির রেকর্ডের সাথে মিলিয়ে যাচাই করুন।"
            if lang == "bn"
            else "Check this ward's drainage risk index against local 2-week rainfall gauge totals."
        )
    v_str = f"{ward_wl:.2f}"
    qualifies = ward_wl >= wl_min
    if lang == "bn":
        status = (
            f"এই ওয়ার্ড যোগ্য (সূচক {to_bangla_digits(v_str)} >= {to_bangla_digits(w_str)}) — ২ সপ্তাহের বৃষ্টি > সীমা হলেই অ্যালার্ট।"
            if qualifies
            else f"এই ওয়ার্ডের জলাবদ্ধতা সূচক ({to_bangla_digits(v_str)}) সীমার নিচে (< {to_bangla_digits(w_str)})।"
        )
        return status
    return (
        f"This ward qualifies (water-logging index {v_str} >= {w_str}) — trigger fires whenever 2-week rain exceeds threshold."
        if qualifies
        else f"This ward's water-logging index ({v_str}) is below the trigger floor (< {w_str})."
    )


def _deficits(facts: NoticeFacts) -> tuple[int, int, int]:
    saline_def = max(0, facts.saline_bags.required - facts.saline_bags.allocated)
    kits_def = max(0, facts.diagnostic_kits.required - facts.diagnostic_kits.allocated)
    beds_def = max(0, facts.hospital_beds.required - facts.hospital_beds.allocated)
    return saline_def, kits_def, beds_def


def _format_day_month_en(d: date) -> str:
    return f"{d.day} {MONTH_EN[d.month]}"


def _format_day_month_bn(d: date) -> str:
    return f"{to_bangla_digits(str(d.day))} {MONTH_BN[d.month]}"


def _gsm7_septet_count(text: str) -> int | None:
    """Return total GSM-7 septets if every char fits GSM 03.38 basic/extension, else None."""
    septets = 0
    for ch in text:
        if ch in GSM7_BASIC:
            septets += 1
        elif ch in GSM7_EXTENSION:
            septets += 2
        else:
            return None
    return septets


def classify_sms(text: str) -> SmsMessage:
    """Classify SMS encoding (GSM-7 vs UCS-2), character/septet count, and segment count (D1-D5)."""
    septets = _gsm7_septet_count(text)
    if septets is not None:
        segments = 1 if septets <= GSM7_SINGLE_LIMIT else math.ceil(septets / GSM7_MULTI_LIMIT)
        return SmsMessage(
            text=text,
            encoding="GSM-7",
            characters=septets,
            segments=segments,
        )
    char_count = len(text)
    segments = 1 if char_count <= UCS2_SINGLE_LIMIT else math.ceil(char_count / UCS2_MULTI_LIMIT)
    return SmsMessage(
        text=text,
        encoding="UCS-2",
        characters=char_count,
        segments=segments,
    )


def _render_sms_en(facts: NoticeFacts) -> SmsMessage:
    """Render GSM-7 English SMS guaranteed to fit 1 segment (<= 160 septets)."""
    day_mon = _format_day_month_en(facts.window_start)
    tier_up = facts.tier.upper()
    cases_s = _fmt_cases(facts.predicted_cases)
    sa, sr = facts.saline_bags.allocated, facts.saline_bags.required
    ka, kr = facts.diagnostic_kits.allocated, facts.diagnostic_kits.required
    ba, br = facts.hospital_beds.allocated, facts.hospital_beds.required
    crews = facts.crews_assigned
    sd, kd, bd = _deficits(facts)

    full_def_items: list[str] = []
    short_def_items: list[str] = []
    if sd > 0:
        full_def_items.append(f"saline {sd}")
        short_def_items.append(f"S {sd}")
    if kd > 0:
        full_def_items.append(f"kits {kd}")
        short_def_items.append(f"K {kd}")
    if bd > 0:
        full_def_items.append(f"beds {bd}")
        short_def_items.append(f"B {bd}")

    def_full = f" Deficit: {', '.join(full_def_items)}." if full_def_items else ""
    def_short = f" Def: {', '.join(short_def_items)}." if short_def_items else ""

    city_short = CITY_SHORT_EN.get(facts.city, facts.city)
    candidates = [
        (
            f"ABHAS {facts.ward_name} {facts.city}, wk of {day_mon}: {tier_up}. "
            f"{cases_s} cases. Saline {sa}/{sr}, kits {ka}/{kr}, beds {ba}/{br}. "
            f"Crews {crews}.{def_full}"
        ),
        (
            f"ABHAS {facts.ward_name} {facts.city}, {day_mon}: {tier_up}. "
            f"{cases_s} cases. Saline {sa}/{sr}, kits {ka}/{kr}, beds {ba}/{br}. "
            f"Crews {crews}.{def_short}"
        ),
        (
            f"ABHAS {facts.ward_name} {city_short} {day_mon}: {tier_up}. "
            f"{cases_s}c. Sal {sa}/{sr} kit {ka}/{kr} bed {ba}/{br}. "
            f"Cr {crews}.{def_short}"
        ),
    ]
    for candidate in candidates:
        msg = classify_sms(candidate)
        if msg.encoding == "GSM-7" and msg.segments == 1:
            return msg
    return classify_sms(candidates[-1])


def _render_sms_bn(facts: NoticeFacts) -> SmsMessage:
    """Render UCS-2 Bangla SMS with Bangla digits guaranteed <= 3 segments (<= 201 chars)."""
    ward_bn = _ward_name_for_lang(facts.ward_name, "bn")
    city_bn = _city_for_lang(facts.city, "bn")
    day_mon_bn = _format_day_month_bn(facts.window_start)
    tier_bn = TIER_BN.get(facts.tier, facts.tier)
    cases_bn = to_bangla_digits(_fmt_cases(facts.predicted_cases))
    sa = to_bangla_digits(str(facts.saline_bags.allocated))
    sr = to_bangla_digits(str(facts.saline_bags.required))
    ka = to_bangla_digits(str(facts.diagnostic_kits.allocated))
    kr = to_bangla_digits(str(facts.diagnostic_kits.required))
    ba = to_bangla_digits(str(facts.hospital_beds.allocated))
    br = to_bangla_digits(str(facts.hospital_beds.required))
    crews_bn = to_bangla_digits(str(facts.crews_assigned))

    sd, kd, bd = _deficits(facts)
    def_items: list[str] = []
    if sd > 0:
        def_items.append(f"স্যালাইন {to_bangla_digits(str(sd))}")
    if kd > 0:
        def_items.append(f"কিট {to_bangla_digits(str(kd))}")
    if bd > 0:
        def_items.append(f"শয্যা {to_bangla_digits(str(bd))}")
    def_clause = f" ঘাটতি: {', '.join(def_items)}।" if def_items else ""

    candidates = [
        (
            f"আভাস {ward_bn} {city_bn}, {day_mon_bn} সপ্তাহ: {tier_bn}। "
            f"প্রত্যাশিত রোগী {cases_bn}। স্যালাইন {sa}/{sr}, কিট {ka}/{kr}, শয্যা {ba}/{br}। "
            f"দল {crews_bn}।{def_clause}"
        ),
        (
            f"আভাস {ward_bn} {city_bn}, {day_mon_bn}: {tier_bn}। "
            f"রোগী {cases_bn}। স্যালাইন {sa}/{sr}, কিট {ka}/{kr}, শয্যা {ba}/{br}। "
            f"দল {crews_bn}।{def_clause}"
        ),
    ]
    for candidate in candidates:
        msg = classify_sms(candidate)
        if msg.segments <= 3:
            return msg
    return classify_sms(candidates[-1])


def render_sms(facts: NoticeFacts, lang: Lang) -> SmsMessage:
    """Render a deterministic, number-faithful, segment-classified SMS notice."""
    if lang == "bn":
        return _render_sms_bn(facts)
    return _render_sms_en(facts)


def render_whatsapp(facts: NoticeFacts, lang: Lang) -> str:
    """Render a structured WhatsApp operational alert referencing only `NoticeFacts`."""
    sd, kd, bd = _deficits(facts)

    if lang == "bn":
        ward_bn = _ward_name_for_lang(facts.ward_name, "bn")
        city_bn = _city_for_lang(facts.city, "bn")
        win_start = to_bangla_digits(facts.window_start.isoformat())
        win_end = to_bangla_digits(facts.window_end.isoformat())
        tier_bn = TIER_BN.get(facts.tier, facts.tier)
        cases_bn = to_bangla_digits(_fmt_cases(facts.predicted_cases))
        sa, sr = (
            to_bangla_digits(str(facts.saline_bags.allocated)),
            to_bangla_digits(str(facts.saline_bags.required)),
        )
        ka, kr = (
            to_bangla_digits(str(facts.diagnostic_kits.allocated)),
            to_bangla_digits(str(facts.diagnostic_kits.required)),
        )
        ba, br = (
            to_bangla_digits(str(facts.hospital_beds.allocated)),
            to_bangla_digits(str(facts.hospital_beds.required)),
        )
        crews_bn = to_bangla_digits(str(facts.crews_assigned))

        sal_line = f"- স্যালাইন ব্যাগ: {sa} / {sr}" + (f" (ঘাটতি {to_bangla_digits(str(sd))})" if sd > 0 else "")
        kit_line = f"- ডায়াগনস্টিক কিট: {ka} / {kr}" + (f" (ঘাটতি {to_bangla_digits(str(kd))})" if kd > 0 else "")
        bed_line = f"- হাসপাতাল শয্যা: {ba} / {br}" + (f" (ঘাটতি {to_bangla_digits(str(bd))})" if bd > 0 else "")

        def_parts: list[str] = []
        if sd > 0:
            def_parts.append(f"স্যালাইন {to_bangla_digits(str(sd))}")
        if kd > 0:
            def_parts.append(f"কিট {to_bangla_digits(str(kd))}")
        if bd > 0:
            def_parts.append(f"শয্যা {to_bangla_digits(str(bd))}")

        if def_parts:
            alert_tag = "*জরুরি ঘাটতি*" if facts.deficit_level == "critical" else "*ঘাটতি*"
            deficit_line = f"ঘাটতি সতর্কতা: {alert_tag} — {', '.join(def_parts)}"
        else:
            deficit_line = "ঘাটতি সতর্কতা: কোনো ঘাটতি নেই"

        return "\n".join(
            [
                f"*আভাস অপারেশনাল বার্তা · {ward_bn} ({city_bn})*",
                f"পূর্বাভাস সময়কাল: {win_start} থেকে {win_end}",
                f"ঝুঁকির স্তর: *{tier_bn}*",
                f"প্রত্যাশিত রোগী: *{cases_bn}*",
                "সরবরাহ (বরাদ্দ / প্রয়োজন):",
                sal_line,
                kit_line,
                bed_line,
                deficit_line,
                f"নিয়োজিত দল: *{crews_bn}*",
                f"করণীয়: {facts.action}",
            ]
        )

    win_start_en = facts.window_start.isoformat()
    win_end_en = facts.window_end.isoformat()
    cases_en = _fmt_cases(facts.predicted_cases)
    sa_en, sr_en = facts.saline_bags.allocated, facts.saline_bags.required
    ka_en, kr_en = facts.diagnostic_kits.allocated, facts.diagnostic_kits.required
    ba_en, br_en = facts.hospital_beds.allocated, facts.hospital_beds.required

    sal_line_en = f"- Saline bags: {sa_en} / {sr_en}" + (f" (deficit {sd})" if sd > 0 else "")
    kit_line_en = f"- Diagnostic kits: {ka_en} / {kr_en}" + (f" (deficit {kd})" if kd > 0 else "")
    bed_line_en = f"- Hospital beds: {ba_en} / {br_en}" + (f" (deficit {bd})" if bd > 0 else "")

    def_parts_en: list[str] = []
    if sd > 0:
        def_parts_en.append(f"saline {sd}")
    if kd > 0:
        def_parts_en.append(f"kits {kd}")
    if bd > 0:
        def_parts_en.append(f"beds {bd}")

    if def_parts_en:
        alert_tag_en = "*CRITICAL DEFICIT*" if facts.deficit_level == "critical" else "*DEFICIT*"
        deficit_line_en = f"Deficit Alert: {alert_tag_en} — {', '.join(def_parts_en)}"
    else:
        deficit_line_en = "Deficit Alert: None"

    return "\n".join(
        [
            f"*ABHAS Operational Dispatch · {facts.ward_name} ({facts.city})*",
            f"Window: {win_start_en} to {win_end_en}",
            f"Risk Tier: *{facts.tier}*",
            f"Predicted Cases: *{cases_en}*",
            "Supplies (Allocated / Required):",
            sal_line_en,
            kit_line_en,
            bed_line_en,
            deficit_line_en,
            f"Assigned Crews: *{facts.crews_assigned}*",
            f"Action: {facts.action}",
        ]
    )


def _render_risk_meter_bars(tier: Tier) -> str:
    """Render Abhas's 4-bar ascending risk meter in pure CSS spans (zero external URLs/SVG)."""
    level = TIER_LEVEL[tier]
    bars: list[str] = []
    for idx in range(1, 5):
        state_cls = "active" if idx <= level else "inactive"
        bars.append(f'<span class="meter-bar bar-{idx} {state_cls}"></span>')
    return "".join(bars)


def render_brief_html(
    facts: NoticeFacts,
    *,
    meta: RunMeta,
    lang: Lang,
    origin_week: date,
    plan_id: str | None = None,
    stock_pct: int = 100,
    total_crews: int = 0,
    trigger_rain_mm: float = 80.0,
    trigger_wl_min: float = 0.30,
    ward_wl_index: float | None = None,
) -> str:
    """Render a self-contained A4 portrait HTML commissioner brief (ADR-0014, DESIGN.md).

    - Inline CSS only; zero http:// or https:// URLs anywhere.
    - All dynamic strings HTML-escaped via html.escape(..., quote=True) (D6).
    - Every number inside `<main>` comes strictly from `NoticeFacts` (WP4-3).
    """
    is_bn = lang == "bn"
    tier_bg, tier_on, tier_border = _TIER_STYLE[facts.tier]
    tier_bn = TIER_BN.get(facts.tier, facts.tier)
    tier_bilingual = f"{tier_bn} · {facts.tier}" if is_bn else f"{facts.tier} · {tier_bn}"

    safe_ward_id = html.escape(facts.ward_id, quote=True)
    safe_ward_name = html.escape(_ward_name_for_lang(facts.ward_name, lang), quote=True)
    safe_city = html.escape(_city_for_lang(facts.city, lang), quote=True)
    safe_action = html.escape(facts.action, quote=True)
    safe_model = html.escape(meta.model_version, quote=True)
    safe_sha = html.escape(meta.git_sha, quote=True)
    safe_plan = html.escape(plan_id, quote=True) if plan_id else ("স্বতন্ত্র" if is_bn else "ad-hoc")

    win_start_s = _fmt_num_for_lang(facts.window_start.isoformat(), lang)
    win_end_s = _fmt_num_for_lang(facts.window_end.isoformat(), lang)
    origin_s = _fmt_num_for_lang(origin_week.isoformat(), lang)
    cases_s = _fmt_num_for_lang(facts.predicted_cases, lang)
    crews_s = _fmt_num_for_lang(facts.crews_assigned, lang)

    sd, kd, bd = _deficits(facts)
    sal_req = _fmt_num_for_lang(facts.saline_bags.required, lang)
    sal_alloc = _fmt_num_for_lang(facts.saline_bags.allocated, lang)
    sal_def = _fmt_num_for_lang(sd, lang)

    kit_req = _fmt_num_for_lang(facts.diagnostic_kits.required, lang)
    kit_alloc = _fmt_num_for_lang(facts.diagnostic_kits.allocated, lang)
    kit_def = _fmt_num_for_lang(kd, lang)

    bed_req = _fmt_num_for_lang(facts.hospital_beds.required, lang)
    bed_alloc = _fmt_num_for_lang(facts.hospital_beds.allocated, lang)
    bed_def = _fmt_num_for_lang(bd, lang)

    stock_s = _fmt_num_for_lang(stock_pct, lang)
    pool_crews_s = _fmt_num_for_lang(total_crews, lang)

    if is_bn:
        doc_title = f"আভাস কমিশনার ব্রিফ — {safe_ward_name} ({safe_ward_id})"
        brand_sub = "ওয়ার্ড কমিশনার অপারেশনাল ব্রিফ · ডেঙ্গু পূর্বাভাস ও সরবরাহ পরিকল্পনা"
        lbl_window = "পূর্বাভাস সময়কাল"
        lbl_origin = "ভিত্তি সপ্তাহ"
        lbl_plan = "পরিকল্পনা"
        lbl_scenario = f"আঞ্চলিক মজুত {stock_s}% · মোট দল {pool_crews_s}"
        lbl_cases_kpi = "প্রত্যাশিত রোগী"
        lbl_cases_sub = "পূর্বাভাস সময়কালে মোট সম্ভাব্য রোগী"
        lbl_crews_kpi = "নিয়োজিত স্প্রে দল"
        lbl_crews_sub = "ওয়ার্ডে বরাদ্দকৃত লার্ভিসাইড ও ফগিং দল"
        lbl_status_kpi = "সরবরাহ অবস্থা"
        status_label = {
            "none": "পূর্ণ বরাদ্দ",
            "deficit": "ঘাটতি সতর্কতা",
            "critical": "জরুরি ঘাটতি",
        }[facts.deficit_level]
        status_sub = (
            "কোনো সরবরাহ ঘাটতি নেই" if facts.deficit_level == "none" else "আঞ্চলিক ডিপো থেকে সমন্বয় প্রয়োজন"
        )
        sec_supplies = "সরবরাহ বরাদ্দ ও ঘাটতি"
        col_resource = "সরবরাহ উপকরণ"
        col_req = "প্রয়োজন"
        col_alloc = "বরাদ্দ"
        col_def = "ঘাটতি"
        row_saline = "স্যালাইন ব্যাগ"
        row_kits = "ডায়াগনস্টিক কিট"
        row_beds = "হাসপাতাল শয্যা"
        sec_actions = "নিয়োজিত দল ও অগ্রাধিকার করণীয়"
        crew_note = f"এই ওয়ার্ডে নিয়োজিত স্প্রে দল: {crews_s}"
        deficit_items: list[str] = []
        if sd > 0:
            deficit_items.append(f"স্যালাইন ব্যাগ {sal_def}")
        if kd > 0:
            deficit_items.append(f"ডায়াগনস্টিক কিট {kit_def}")
        if bd > 0:
            deficit_items.append(f"হাসপাতাল শয্যা {bed_def}")
        deficit_banner = (
            f'<div class="callout"><strong>ঘাটতি সতর্কতা:</strong> {", ".join(deficit_items)}। '
            "কেন্দ্রীয় ডিপো বা পার্শ্ববর্তী ওয়ার্ডের সাথে দ্রুত সমন্বয় করুন।</div>"
            if deficit_items
            else '<div class="callout callout-ok"><strong>সরবরাহ পূর্ণ:</strong> এই ওয়ার্ডের সকল প্রয়োজনীয় সরবরাহ সম্পূর্ণ বরাদ্দ করা হয়েছে।</div>'
        )
    else:
        doc_title = f"Abhas Commissioner Brief — {safe_ward_name} ({safe_ward_id})"
        brand_sub = "Ward Commissioner Operational Brief · Dengue Early Warning & Supply Plan"
        lbl_window = "Forecast window"
        lbl_origin = "Origin week"
        lbl_plan = "Plan"
        lbl_scenario = f"Regional stock {stock_s}% · Crew pool {pool_crews_s}"
        lbl_cases_kpi = "Predicted Cases"
        lbl_cases_sub = "Expected cases across forecast window"
        lbl_crews_kpi = "Assigned Spraying Crews"
        lbl_crews_sub = "Larviciding & fogging teams placed in ward"
        lbl_status_kpi = "Supply Status"
        status_label = {
            "none": "Fully Covered",
            "deficit": "Deficit Alert",
            "critical": "Critical Deficit",
        }[facts.deficit_level]
        status_sub = (
            "All ward supply needs met"
            if facts.deficit_level == "none"
            else "Escalation to city depot required"
        )
        sec_supplies = "Supplies Allocation & Deficit"
        col_resource = "Resource"
        col_req = "Required"
        col_alloc = "Allocated"
        col_def = "Deficit"
        row_saline = "Saline bags"
        row_kits = "Diagnostic kits"
        row_beds = "Hospital beds"
        sec_actions = "Assigned Crews & Priority Actions"
        crew_note = f"Assigned spraying crews in this ward: {crews_s}"
        deficit_items = []
        if sd > 0:
            deficit_items.append(f"Saline bags {sal_def}")
        if kd > 0:
            deficit_items.append(f"Diagnostic kits {kit_def}")
        if bd > 0:
            deficit_items.append(f"Hospital beds {bed_def}")
        deficit_banner = (
            f'<div class="callout"><strong>Deficit Alert:</strong> {", ".join(deficit_items)}. '
            "Coordinate replenishment from city depot or neighbouring headroom wards.</div>"
            if deficit_items
            else '<div class="callout callout-ok"><strong>Supplies Covered:</strong> All required ward supplies are fully allocated.</div>'
        )

    scenario_meta = f"{lbl_plan}: {safe_plan}" if plan_id else f"{lbl_scenario} · {lbl_plan}: {safe_plan}"
    meter_html = _render_risk_meter_bars(facts.tier)
    safe_aria_tier = html.escape(f"Risk tier {facts.tier}", quote=True)

    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
  <meta charset="utf-8" />
  <title>{doc_title}</title>
  <style>
    @page {{
      size: A4 portrait;
      margin: 14mm;
    }}
    * {{
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }}
    body {{
      margin: 0;
      padding: 0;
      background: #FFFFFF;
      color: #0B0F14;
      font-family: "Manrope", "Noto Sans Bengali", system-ui, -apple-system, "Segoe UI", sans-serif;
      font-size: 14px;
      line-height: 1.5;
    }}
    .sheet {{
      max-width: 794px;
      margin: 0 auto;
      padding: 0;
    }}
    header.hero {{
      background: #0B1A5C;
      color: #FFFFFF;
      border-radius: 12px;
      padding: 20px 24px;
      margin-bottom: 18px;
      border-bottom: 4px solid #2F5BFF;
    }}
    .brand-row {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(221, 227, 243, 0.22);
    }}
    .brand-name {{
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #DDE3F3;
    }}
    .brand-sub {{
      font-size: 12px;
      color: #DDE3F3;
    }}
    .title-row {{
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      flex-wrap: wrap;
    }}
    h1 {{
      margin: 0;
      font-size: 26px;
      font-weight: 700;
      line-height: 1.2;
      color: #FFFFFF;
    }}
    .ward-sub {{
      margin-top: 4px;
      font-size: 13px;
      color: #DDE3F3;
    }}
    .mono {{
      font-family: "IBM Plex Mono", "Noto Sans Bengali", ui-monospace, SFMono-Regular, Consolas, monospace;
      font-variant-numeric: tabular-nums;
      font-feature-settings: "tnum" 1;
    }}
    .risk-badge {{
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 8px 14px;
      border-radius: 10px;
      background: {tier_bg};
      color: {tier_on};
      border: 1px solid {tier_border};
      font-weight: 700;
      font-size: 13px;
      white-space: nowrap;
    }}
    .meter {{
      display: inline-flex;
      align-items: flex-end;
      gap: 3px;
      height: 16px;
    }}
    .meter-bar {{
      display: inline-block;
      width: 4px;
      border-radius: 1px;
    }}
    .meter-bar.bar-1 {{ height: 6px; }}
    .meter-bar.bar-2 {{ height: 9px; }}
    .meter-bar.bar-3 {{ height: 12px; }}
    .meter-bar.bar-4 {{ height: 15px; }}
    .meter-bar.active {{
      background: {tier_on};
    }}
    .meter-bar.inactive {{
      background: transparent;
      border: 1px solid {tier_on};
      opacity: 0.55;
    }}
    .meta-strip {{
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1px solid rgba(221, 227, 243, 0.22);
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      font-size: 12px;
      color: #DDE3F3;
    }}
    .kpi-grid {{
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 18px;
    }}
    .card {{
      background: #FFFFFF;
      border: 1px solid #DDE3F3;
      border-radius: 12px;
      padding: 14px 16px;
    }}
    .kpi-label {{
      font-size: 12px;
      font-weight: 600;
      color: #4B5578;
      margin-bottom: 6px;
    }}
    .kpi-value {{
      font-size: 26px;
      font-weight: 700;
      color: #0B1A5C;
      line-height: 1.15;
    }}
    .kpi-value.status-text {{
      font-size: 19px;
      padding-top: 4px;
    }}
    .kpi-sub {{
      margin-top: 6px;
      font-size: 11px;
      color: #4B5578;
    }}
    section.panel {{
      background: #FFFFFF;
      border: 1px solid #DDE3F3;
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 16px;
    }}
    h2 {{
      margin: 0 0 12px 0;
      font-size: 15px;
      font-weight: 700;
      color: #0B1A5C;
      padding-bottom: 8px;
      border-bottom: 1px solid #DDE3F3;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
    }}
    th, td {{
      padding: 9px 10px;
      border-bottom: 1px solid #DDE3F3;
      text-align: left;
      font-size: 13px;
    }}
    th {{
      background: #F4F6FD;
      color: #0B1A5C;
      font-weight: 700;
      font-size: 12px;
    }}
    th.num, td.num {{
      text-align: right;
    }}
    tbody tr:last-child td {{
      border-bottom: none;
    }}
    .deficit-nonzero {{
      font-weight: 700;
      color: #0B1A5C;
    }}
    .callout {{
      margin-top: 12px;
      padding: 10px 14px;
      border-radius: 8px;
      background: #F4F6FD;
      border-left: 4px solid #2F5BFF;
      color: #0B0F14;
      font-size: 13px;
    }}
    .callout-ok {{
      border-left-color: #0B1A5C;
    }}
    .action-text {{
      margin: 0 0 8px 0;
      font-size: 14px;
      color: #0B0F14;
    }}
    .crew-pill {{
      display: inline-block;
      margin-top: 4px;
      padding: 4px 10px;
      border-radius: 8px;
      background: #F4F6FD;
      border: 1px solid #DDE3F3;
      color: #0B1A5C;
      font-weight: 600;
      font-size: 12px;
    }}
    aside.trigger-box {{
      margin-top: 14px;
      padding: 12px 14px;
      border-radius: 10px;
      background: #F8FAFF;
      border: 1px dashed #2F5BFF;
      color: #0B0F14;
      font-size: 12.5px;
    }}
    aside.trigger-box h3 {{
      margin: 0 0 4px 0;
      font-size: 12.5px;
      font-weight: 700;
      color: #0B1A5C;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }}
    aside.trigger-box p {{
      margin: 2px 0;
    }}
    footer.provenance {{
      margin-top: 18px;
      padding-top: 10px;
      border-top: 1px solid #DDE3F3;
      font-size: 11px;
      color: #4B5578;
      word-break: break-word;
    }}
  </style>
</head>
<body>
  <div class="sheet">
    <header class="hero">
      <div class="brand-row">
        <span class="brand-name">ABHAS · আভাস</span>
        <span class="brand-sub">{brand_sub}</span>
      </div>
      <div class="title-row">
        <div>
          <h1>{safe_ward_name} · {safe_city}</h1>
          <div class="ward-sub mono">{safe_ward_id}</div>
        </div>
        <div class="risk-badge" role="img" aria-label="{safe_aria_tier}">
          <span class="meter" aria-hidden="true">{meter_html}</span>
          <span>{tier_bilingual}</span>
        </div>
      </div>
      <div class="meta-strip mono">
        <span>{lbl_window}: {win_start_s} – {win_end_s}</span>
        <span>{lbl_origin}: {origin_s}</span>
        <span>{scenario_meta}</span>
      </div>
    </header>

    <main>
      <div class="kpi-grid">
        <div class="card">
          <div class="kpi-label">{lbl_cases_kpi}</div>
          <div class="kpi-value mono">{cases_s}</div>
          <div class="kpi-sub">{lbl_cases_sub}</div>
        </div>
        <div class="card">
          <div class="kpi-label">{lbl_crews_kpi}</div>
          <div class="kpi-value mono">{crews_s}</div>
          <div class="kpi-sub">{lbl_crews_sub}</div>
        </div>
        <div class="card">
          <div class="kpi-label">{lbl_status_kpi}</div>
          <div class="kpi-value status-text">{status_label}</div>
          <div class="kpi-sub">{status_sub}</div>
        </div>
      </div>

      <section class="panel">
        <h2>{sec_supplies}</h2>
        <table>
          <thead>
            <tr>
              <th>{col_resource}</th>
              <th class="num">{col_req}</th>
              <th class="num">{col_alloc}</th>
              <th class="num">{col_def}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{row_saline}</td>
              <td class="num mono">{sal_req}</td>
              <td class="num mono">{sal_alloc}</td>
              <td class="num mono{" deficit-nonzero" if sd > 0 else ""}">{sal_def}</td>
            </tr>
            <tr>
              <td>{row_kits}</td>
              <td class="num mono">{kit_req}</td>
              <td class="num mono">{kit_alloc}</td>
              <td class="num mono{" deficit-nonzero" if kd > 0 else ""}">{kit_def}</td>
            </tr>
            <tr>
              <td>{row_beds}</td>
              <td class="num mono">{bed_req}</td>
              <td class="num mono">{bed_alloc}</td>
              <td class="num mono{" deficit-nonzero" if bd > 0 else ""}">{bed_def}</td>
            </tr>
          </tbody>
        </table>
        {deficit_banner}
      </section>

      <section class="panel">
        <h2>{sec_actions}</h2>
        <p class="action-text">{safe_action}</p>
        <div class="crew-pill mono">{crew_note}</div>
      </section>
    </main>

    <aside class="trigger-box" aria-label="{html.escape("অফলাইন পূর্ব-সতর্কতা নিয়ম" if is_bn else "Zero-model early-action trigger", quote=True)}">
      <h3>{html.escape("অফলাইন পূর্ব-সতর্কতা নিয়ম (কোনো মডেল ছাড়াই কার্যকর · ADR-0020)" if is_bn else "Zero-Model Early-Action Trigger (Clipboard Rule · ADR-0020)", quote=True)}</h3>
      <p><strong>{html.escape(_fmt_trigger_rule_line(trigger_rain_mm, trigger_wl_min, lang), quote=True)}</strong></p>
      <p>{html.escape(_fmt_trigger_ward_note(ward_wl_index, trigger_wl_min, lang), quote=True)}</p>
    </aside>

    <footer class="provenance mono">
      model_version={safe_model} · git_sha={safe_sha} · data_as_of={meta.data_as_of.isoformat()} · offline={str(meta.offline).lower()} · generated_at={meta.generated_at.isoformat()}
    </footer>
  </div>
</body>
</html>
"""


def extract_numeric_tokens(text: str) -> list[str]:
    """Extract all numeric tokens from text after mapping Bangla numerals (০-৯) to ASCII."""
    return _NUM_RE.findall(normalize_digits(text))


def allowed_number_tokens(facts: NoticeFacts) -> set[str]:
    """Return every numeric token canonically justified by `NoticeFacts` (including derived deficits)."""
    tokens: set[str] = set()

    def _add_int(val: int) -> None:
        tokens.add(str(val))
        tokens.add(f"{val:02d}")
        tokens.add(f"{val}.0")

    def _add_float(val: float) -> None:
        rounded = round(float(val), 1)
        tokens.add(f"{rounded:.1f}")
        tokens.add(f"{rounded:g}")
        if rounded.is_integer():
            tokens.add(str(int(rounded)))
        tokens.add(str(round(rounded)))

    for raw in _NUM_RE.findall(normalize_digits(f"{facts.ward_id} {facts.ward_name}")):
        tokens.add(raw)
        if raw.isdigit():
            _add_int(int(raw))

    for d in (facts.window_start, facts.window_end):
        for part in (d.year, d.month, d.day):
            _add_int(part)

    _add_float(facts.predicted_cases)
    _add_int(facts.crews_assigned)

    for pair in (facts.saline_bags, facts.diagnostic_kits, facts.hospital_beds):
        _add_int(pair.required)
        _add_int(pair.allocated)
        _add_int(max(0, pair.required - pair.allocated))

    return tokens
