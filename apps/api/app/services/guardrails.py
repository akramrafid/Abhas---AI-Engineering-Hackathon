"""Deterministic triage guardrails. They run around the LLM and always win over it.

- injection detection (en / bn / banglish + hidden HTML comments)
- needs_human rules
- reply safety (no promised refunds/credits/approvals, language match, citation markers)
- urgency evidence grounding
- a keyword classifier used by mock mode (offline demo/tests)

No LLM, no network, no I/O. All regexes are bounded so an 8000-char ticket cannot cause backtracking blowups.
"""

import re
import unicodedata
from dataclasses import dataclass, field

from app.schemas import Category, Language, Sentiment, Urgency

_ZERO_WIDTH = re.compile("[\u200b\u200e\u200f\u2060\ufeff\u00ad]")
_WS = re.compile(r"\s+")
_BENGALI = re.compile("[\u0980-\u09ff]")
_CITE = re.compile(r"\[(\d{1,3})\]")


def _normalize(text: str) -> str:
    """Fold look-alikes / invisible characters so obfuscated payloads still match."""
    return _ZERO_WIDTH.sub("", unicodedata.normalize("NFKC", text))


def _flat(text: str) -> str:
    return _WS.sub(" ", text).strip()


def _rx(pattern: str) -> re.Pattern[str]:
    return re.compile(pattern, re.IGNORECASE | re.DOTALL)


# --------------------------------------------------------------------------------------------------
# Injection detection
# --------------------------------------------------------------------------------------------------
_INJECTION_RULES: list[tuple[str, re.Pattern[str]]] = [
    (
        "tells the assistant to ignore its instructions",
        _rx(
            r"\b(?:ignore|disregard|forget|override|bypass)\b.{0,25}\b(?:instructions?|rules?|prompts?"
            r"|guidelines?|polic(?:y|ies)|guardrails?|everything above)\b"
        ),
    ),
    ("claims a system override", _rx(r"\bsystem\s*(?:override|prompt|message|instructions?)\b")),
    (
        "claims admin/developer mode",
        _rx(r"\b(?:admin|administrator|developer|debug|god|jailbreak|dan)\s*mode\b"),
    ),
    (
        "tries to reassign the assistant's role",
        _rx(r"\byou\s+are\s+now\b|\bpretend\s+(?:to\s+be|you\s+are|that\s+you)\b"),
    ),
    ("dictates the exact reply", _rx(r"\b(?:reply|respond|answer|say)\s+(?:only|just)\s+with\b")),
    ("demands approval of a refund", _rx(r"\bapprove\b.{0,20}\b(?:refund|credit|compensation)\b")),
    (
        "tells the assistant to change the ticket status",
        _rx(r"\bmark\s+(?:this|the|my)\s+(?:ticket|case)\b.{0,15}\b(?:resolved|closed|solved|low)\b"),
    ),
    (
        "tells the assistant to change urgency/category",
        _rx(r"\bset\s+(?:the\s+)?(?:urgency|priority|category|status)\s+to\b"),
    ),
    ("tells the assistant not to escalate", _rx(r"\b(?:do\s*n[o']?t|never)\s+escalate\b")),
    ("hidden HTML comment in the ticket", _rx(r"<!--")),
    ("fake role marker", _rx(r"(?:^|\n)\s*(?:system|assistant)\s*:")),
    ("asks to reveal the prompt", _rx(r"\breveal\b.{0,20}\b(?:system\s+)?prompt\b")),
    (
        "injects new instructions",
        _rx(r"\bnew\s+instructions?\s*:|\bfrom\s+now\s+on,?\s+(?:you|reply|respond|answer)\b"),
    ),
    # Bangla
    (
        "Bangla: tells the assistant to ignore instructions",
        _rx(
            r"(?:নির্দেশ\w*|নিয়ম\w*|ইনস্ট্রাকশন\w*|রুল\w*)[^.।]{0,25}"
            r"(?:উপেক্ষা|অগ্রাহ্য|ভুলে\s*যাও|ভুলে\s*যান)"
        ),
    ),
    ("Bangla: claims admin mode", _rx(r"(?:অ্যাডমিন|এডমিন|এ্যাডমিন|সিস্টেম)\s*(?:মোড|ওভাররাইড)")),
    ("Bangla: tries to reassign the assistant's role", _rx(r"(?:তুমি|তুই)\s*এখন")),
    (
        "Bangla: demands approval of a refund",
        _rx(
            r"(?:রিফান্ড|ফেরত|টাকা)[^.।]{0,25}(?:অনুমোদন|অ্যাপ্রুভ|এপ্রুভ)"
            r"|(?:অনুমোদন|অ্যাপ্রুভ|এপ্রুভ)[^.।]{0,25}(?:রিফান্ড|ফেরত)"
        ),
    ),
    ("Bangla: dictates the exact reply", _rx(r"শুধু(?:মাত্র)?\s*['\"“‘][^'\"”’]{1,60}['\"”’]\s*(?:লিখ|উত্তর|বল)")),
    # Banglish
    (
        "Banglish: tells the assistant to ignore instructions",
        _rx(
            r"\b(?:instructions?|rules?|nirdesh\w*|niyom\w*)\b.{0,25}\b(?:ignore|bhul\w*|ovogya|uppekkha)\w*"
            r"|\bignore\s+(?:koro|kore|korun|dao|den)\b"
        ),
    ),
    (
        "Banglish: demands approval of a refund",
        _rx(r"\b(?:refund|taka)\b.{0,25}\bapprove\b|\bapprove\s+(?:koro|kore|korun|dao|den)\b"),
    ),
    ("Banglish: tries to reassign the assistant's role", _rx(r"\b(?:tumi|tui)\s+ekhon\b")),
]


def detect_injection(text: str) -> list[str]:
    """Return human-readable labels of every injection heuristic that matched (empty = clean)."""
    norm = _normalize(text)
    return [label for label, rx in _INJECTION_RULES if rx.search(norm)]


# --------------------------------------------------------------------------------------------------
# needs_human
# --------------------------------------------------------------------------------------------------
_HUMAN_CATEGORIES = {Category.account_security, Category.cancellation, Category.plan_change}

_ACTION_RULES: list[tuple[str, re.Pattern[str]]] = [
    (
        "refund / compensation",
        _rx(r"\brefund|\breimburs|\bcompensat|\bmoney back\b|রিফান্ড|ক্ষতিপূরণ|টাকা\s*ফেরত|ফেরত\s*(?:দিন|চাই|দেন)"),
    ),
    (
        "technician visit",
        _rx(
            r"\btechnician|\bsend\s+(?:someone|a\s+(?:tech|technician|engineer)|an\s+engineer)"
            r"|\b(?:engineer|tech)\s+visit|টেকনিশিয়ান|ইঞ্জিনিয়ার|\btechnician\s+pathan|\bsomeone\s+(?:to\s+)?(?:come|visit)"
        ),
    ),
    (
        "plan change",
        _rx(
            r"\b(?:upgrade|downgrade)\b|\b(?:change|switch)\s+(?:my\s+)?plan|\bplan\s+change"
            r"|আপগ্রেড|ডাউনগ্রেড|প্ল্যান\s*(?:পরিবর্তন|বদল)"
        ),
    ),
    (
        "cancellation",
        _rx(
            r"\bcancel|\bterminate\b|\bclose\s+my\s+(?:account|connection)|বাতিল|লাইন\s*কেটে\s*দ"
            r"|\bbondho\s+korte\b|\bline\s+kete\b"
        ),
    ),
]

# Strong signs the account itself is compromised (urgency is floored to critical).
_COMPROMISE = _rx(
    r"\bhack(?:ed|er)?\b|\bcompromis|\bunknown\s+device\b|\bunauthori[sz]ed\b|\bsuspicious\s+(?:login|activity)\b"
    r"|\bsomeone\s+(?:logged|accessed|got\s+into)\b|\bOTP\b|হ্যাক|ওটিপি|অননুমোদিত"
)


def action_requests(text: str) -> list[str]:
    norm = _normalize(text)
    return [label for label, rx in _ACTION_RULES if rx.search(norm)]


def compromise_signal(text: str) -> bool:
    return bool(_COMPROMISE.search(_normalize(text)))


# --------------------------------------------------------------------------------------------------
# Reply safety
# --------------------------------------------------------------------------------------------------
_NEGATION = _rx(
    r"(?:\bnot|\bnever|n't|\bunless|\buntil|\bonce|\bif|\bbefore|\bwhen|\bonly after)\W+(?:\w+\W+){0,2}$"
)

_PROMISE_RULES: list[re.Pattern[str]] = [
    _rx(r"\bapproved\b"),
    _rx(
        r"\b(?:refund|refunds|credit|credits|compensation)\s+(?:has|have|is|are|was|were|will)\s+(?:been\s+|be\s+)?"
        r"(?:approved|issued|processed|granted|applied|credited|refunded|sent)\b"
    ),
    _rx(r"\b(?:has|have)\s+been\s+(?:refunded|credited|reimbursed)\b|\bwas\s+(?:refunded|credited)\b"),
    _rx(r"\bwill\s+be\s+(?:refunded|credited|reimbursed)\b|\bcredited\b|\brefunded\b"),
    _rx(r"\b(?:we|i)(?:'ll|\s+will|\s+shall)\s+(?:refund|credit|reimburse|approve)\b"),
    _rx(
        r"\b(?:we|i)(?:'ll|\s+will|\s+shall)\s+(?:issue|process|give|grant|apply)\b.{0,25}"
        r"\b(?:refund|credit|compensation)\b"
    ),
    # Bangla
    _rx(r"অনুমোদিত|অনুমোদন\s*(?:করা\s*)?হ(?:য়েছে|বে)|অ্যাপ্রুভ(?:ড)?\s*(?:করা\s*)?হ"),
    _rx(
        r"(?:রিফান্ড|ফেরত|ক্রেডিট|ক্ষতিপূরণ)[^.।]{0,25}"
        r"(?:হয়েছে|দেওয়া\s*হবে|দেয়া\s*হবে|দিয়ে\s*দেব|দিয়ে\s*দিব|দেব|দিব|পাবেন|করা\s*হবে)"
    ),
    # Banglish
    _rx(r"\b(?:refund|credit)\b.{0,25}\b(?:hoyeche|hoise|hoyese|hoeche|dibo|debo|pabe|paben|pawa\s+jabe)\b"),
    _rx(r"\bapprove\s+(?:kora\s+hoyeche|hoise|hoyeche)\b"),
]

_SAFE_REPLY: dict[Language, str] = {
    Language.en: (
        "Thank you for contacting LumaNet Fiber. Your request needs a decision that only our "
        "support team can make, so we have passed it to a human agent who will review it and get back "
        "to you. This message does not confirm any refund, credit or approval."
    ),
    Language.bn: (
        "LumaNet Fiber-এ যোগাযোগ করার জন্য ধন্যবাদ। আপনার অনুরোধে এমন সিদ্ধান্ত জড়িত যা শুধু আমাদের সাপোর্ট টিম "
        "নিতে পারে, তাই আমরা এটি একজন সাপোর্ট এজেন্টের কাছে পাঠিয়েছি। তিনি বিষয়টি দেখে আপনার সাথে যোগাযোগ করবেন। "
        "এই বার্তায় কোনো রিফান্ড, ক্রেডিট বা অনুমোদনের নিশ্চয়তা দেওয়া হচ্ছে না।"
    ),
    Language.banglish: (
        "LumaNet Fiber-e jogajog korar jonno dhonnobad. Apnar onurodhe emon siddhanto jorito ja "
        "shudhu amader support team nite pare, tai amra eta ekjon support agent-er kache pathiyechi. "
        "Tini bishoyti dekhe apnar sathe jogajog korben. Ei message-e kono refund, credit ba "
        "approval-er nishchoyota deoa hocche na."
    ),
}


def safe_reply(language: Language) -> str:
    return _SAFE_REPLY[language]


def promise_violations(reply: str) -> list[str]:
    """Phrases in `reply` that promise or confirm a refund/credit/approval (negated mentions are ignored)."""
    norm = _normalize(reply)
    found: list[str] = []
    for rx in _PROMISE_RULES:
        for m in rx.finditer(norm):
            if _NEGATION.search(norm[max(0, m.start() - 24) : m.start()]):
                continue
            found.append(m.group(0).strip())
            break
    return found


def language_matches(reply: str, language: Language) -> bool:
    letters = [c for c in reply if c.isalpha()]
    if not letters:
        return False
    ratio = sum(1 for c in letters if _BENGALI.match(c)) / len(letters)
    return ratio >= 0.5 if language == Language.bn else ratio <= 0.1


def _fix_citation_markers(reply: str, n_citations: int) -> str:
    def repl(m: re.Match[str]) -> str:
        return m.group(0) if 1 <= int(m.group(1)) <= n_citations else ""

    return _flat(_CITE.sub(repl, reply)).replace(" .", ".").replace(" ,", ",")


# --------------------------------------------------------------------------------------------------
# Evidence grounding
# --------------------------------------------------------------------------------------------------
_SENT_SPLIT = re.compile(r"(?<=[.!?।])\s+|\n+")


def split_sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENT_SPLIT.split(text) if s.strip()]


def _tokens(s: str) -> set[str]:
    return set(re.findall(r"\w+", s.lower()))


def ground_evidence(evidence: str, text: str) -> str:
    """Return a sentence that really occurs in the ticket ('' when nothing matches)."""
    ev = _flat(evidence or "")
    if not ev:
        return ""
    flat_text = _flat(text)
    idx = flat_text.lower().find(ev.lower())
    if idx >= 0:
        return flat_text[idx : idx + len(ev)]
    ev_tokens = _tokens(ev)
    best, best_score = "", 0.0
    for sent in split_sentences(flat_text):
        overlap = len(ev_tokens & _tokens(sent)) / max(1, len(ev_tokens))
        if overlap > best_score:
            best, best_score = sent, overlap
    return best if best_score >= 0.6 else ""


# --------------------------------------------------------------------------------------------------
# Combined decision
# --------------------------------------------------------------------------------------------------
@dataclass
class Guarded:
    category: Category
    urgency: Urgency
    injection_detected: bool
    needs_human: bool
    reply: str
    urgency_evidence: str
    reasons: list[str] = field(default_factory=list)


def apply_guardrails(
    *,
    text: str,
    language: Language,
    category: Category,
    urgency: Urgency,
    injection_suspected: bool,
    reply: str,
    evidence: str,
    n_citations: int,
) -> Guarded:
    """Override / repair the LLM output. Every override is explained in `reasons`."""
    reasons: list[str] = []

    inj = detect_injection(text)
    injection = bool(inj) or injection_suspected
    if inj:
        reasons.append("Prompt injection detected: " + "; ".join(inj[:3]))
    elif injection_suspected:
        reasons.append("Prompt injection suspected by the model")

    if compromise_signal(text) and urgency != Urgency.critical:
        reasons.append("Account-compromise signals in the ticket: urgency raised to critical")
        urgency = Urgency.critical

    needs_human = injection
    if urgency == Urgency.critical:
        needs_human = True
        reasons.append("Critical urgency needs a human agent")
    if category in _HUMAN_CATEGORIES:
        needs_human = True
        reasons.append(f"Category '{category.value}' needs a human decision")
    actions = action_requests(text)
    if actions:
        needs_human = True
        reasons.append("Customer asks for an account action: " + ", ".join(actions))

    cleaned = _fix_citation_markers(reply, n_citations)
    if not cleaned or not language_matches(cleaned, language):
        reasons.append(f"Reply was not in the customer's language ({language.value}): safe template used")
        cleaned = safe_reply(language)
    elif needs_human or injection:
        bad = promise_violations(cleaned)
        if bad:
            reasons.append("Reply promised a refund/credit/approval (" + ", ".join(bad[:3]) + "): replaced")
            cleaned = safe_reply(language)

    return Guarded(
        category=category,
        urgency=urgency,
        injection_detected=injection,
        needs_human=needs_human,
        reply=cleaned,
        urgency_evidence=ground_evidence(evidence, text),
        reasons=reasons,
    )


# --------------------------------------------------------------------------------------------------
# Mock-mode keyword classifier (offline demo/tests; also documents the rubric)
# --------------------------------------------------------------------------------------------------
@dataclass(frozen=True)
class Heuristic:
    category: Category
    urgency: Urgency
    sentiment: Sentiment
    evidence: str


_SECURITY = _COMPROMISE
_H_CANCEL = _rx(r"\bcancel|\bterminate\b|বাতিল|\bbondho\s+korte\b|\bclose\s+my\s+(?:account|connection)")
_H_PLAN = _rx(r"\b(?:upgrade|downgrade)\b|\b(?:change|switch)\s+(?:my\s+)?plan|আপগ্রেড|ডাউনগ্রেড|প্ল্যান\s*পরিবর্তন")
_H_OUTAGE = _rx(
    r"\bno\s+internet\b|\binternet\b.{0,25}\b(?:completely\s+)?down\b|\bcompletely\s+down\b|\boutage\b"
    r"|\bfib(?:er|re)\s+cable\b|\bcable\b.{0,15}\bcut\b|ফাইবার.{0,25}কেটে|কেবল\s*কেটে|ইন্টারনেট\s*নেই|\bnet\s+(?:nai|nei)\b"
    r"|\bLOS\b.{0,30}\bred\b|\bred\b.{0,20}\bLOS\b|LOS.{0,20}লাল"
)
_H_BILLING = _rx(
    r"\bbill\w*|\bcharg(?:e|ed|es)\b|\brefund|\bpayment|\bpaid\b|\bbkash\b|\bnagad\b|\binvoice|\bdue\b|\bfine\b"
    r"|বিল|পেমেন্ট|রিফান্ড|জরিমানা"
)
_H_BILLING_DISPUTE = _rx(
    r"\bcharged\b|\btwice\b|\bdouble\b|\brefund|\bdispute|\bdeduct|\bovercharg|রিফান্ড|দুইবার"
)
_H_TECH = _rx(
    r"\binternet\b|\bnet\b|\bwi-?fi\b|\brouter\b|\bspeed\b|\bslow\b|\bmbps\b|\bpassword\b|\bPON\b|\bLOS\b|\bdisconnect"
    r"|ইন্টারনেট|ধীর|স্পিড|ওয়াই|রাউটার|এমবিপিএস"
)
_H_WIDE = _rx(
    r"\b(?:whole|entire)\s+(?:area|building|neighbou?rhood|locality)\b|\bneighbou?rs\b|\bclinic\b|\bhospital\b"
    r"|\beveryone\b|পুরো\s*এলাকা|হাসপাতাল|ক্লিনিক"
)
_H_DURATION = _rx(r"\bdays?\b|\bsince\b|\byesterday\b|\bweeks?\b|\bhours?\b|\bdin\b|দিন|সপ্তাহ|ঘণ্টা|গত")
_H_INTERMITTENT = _rx(
    r"\bdisconnect\w*|\bdrops?\b|\bdropping\b|\babar\s+jay\b|\bintermittent|\bevery\s+\d+\s+min|বারবার"
)
_H_ANGRY = _rx(r"\bunacceptable\b|\bfurious\b|\bangry\b|\bworst\b|\bfed\s+up\b|\bridiculous\b|!{2,}|বিরক্ত")
_H_NEGATIVE = _rx(
    r"\bslow\b|\bdown\b|\bnot\s+working\b|\bproblem|\bissue\b|\bcharged\b|\bhack|\bemergency\b|\bcosting\b"
    r"|\bcut\b|\bkharap\b|\bdisconnect|\bno\s+internet\b|ধীর|সমস্যা|কেটে|বাতিল"
)
_H_POSITIVE = _rx(r"\bthank|\bthanks\b|\bgreat\b|\blove\b|ধন্যবাদ")


def _sentence_with(text: str, rx: re.Pattern[str]) -> str:
    flat = _flat(text)
    for sent in split_sentences(flat):
        if rx.search(sent):
            return sent
    return ""


def heuristic_triage(text: str) -> Heuristic:
    """Keyword classifier following the same rubric as the LLM prompt."""
    norm = _flat(_normalize(text))
    category = Category.other
    urgency = Urgency.low
    driver: re.Pattern[str] | None = None

    if _SECURITY.search(norm):
        category, urgency, driver = Category.account_security, Urgency.critical, _SECURITY
    elif _H_CANCEL.search(norm):
        category, urgency, driver = Category.cancellation, Urgency.medium, _H_CANCEL
    elif _H_PLAN.search(norm):
        category, urgency, driver = Category.plan_change, Urgency.low, _H_PLAN
    elif _H_OUTAGE.search(norm):
        category, driver = Category.outage, _H_OUTAGE
        urgency = Urgency.critical if _H_WIDE.search(norm) else Urgency.high
        if urgency == Urgency.critical:
            driver = _H_WIDE
    elif _H_BILLING.search(norm):
        category, driver = Category.billing, _H_BILLING
        urgency = Urgency.medium if _H_BILLING_DISPUTE.search(norm) else Urgency.low
        if urgency == Urgency.medium:
            driver = _H_BILLING_DISPUTE
    elif _H_TECH.search(norm):
        category, driver = Category.technical, _H_TECH
        if _H_INTERMITTENT.search(norm):
            urgency, driver = Urgency.medium, _H_INTERMITTENT
        elif _H_DURATION.search(norm):
            urgency, driver = Urgency.medium, _H_DURATION

    if _H_ANGRY.search(norm):
        sentiment = Sentiment.angry
    elif _H_POSITIVE.search(norm) and not _H_NEGATIVE.search(norm):
        sentiment = Sentiment.positive
    elif _H_NEGATIVE.search(norm):
        sentiment = Sentiment.negative
    else:
        sentiment = Sentiment.neutral

    evidence = _sentence_with(text, driver) if driver else ""
    return Heuristic(category=category, urgency=urgency, sentiment=sentiment, evidence=evidence)
