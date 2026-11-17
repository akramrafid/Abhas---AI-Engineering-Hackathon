"""Cheap, deterministic language detection: en | bn | banglish (no LLM call)."""

import re

_BENGALI = re.compile(r"[ঀ-৿]")
_BANGLISH_WORDS = {
    "amar",
    "ami",
    "apnar",
    "ki",
    "kobe",
    "koto",
    "hobe",
    "korbo",
    "kortese",
    "bhai",
    "ase",
    "jay",
    "hoy",
    "ekdom",
    "na",
    "er",
    "ar",
    "te",
    "achi",
    "pai",
    "dite",
    "keno",
    "kivabe",
    "kothay",
    "taka",
    "kaj",
    "korche",
    "korena",
    "valo",
    "kharap",
    "ekhon",
    "abar",
    "eta",
    "hole",
    "beshi",
}


def detect_language(text: str) -> str:
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return "en"
    bengali = sum(1 for c in letters if _BENGALI.match(c))
    if bengali / len(letters) > 0.3:
        return "bn"
    words = re.findall(r"[a-zA-Z]+", text.lower())
    hits = sum(1 for w in words if w in _BANGLISH_WORDS)
    if words and hits >= 2 and hits / len(words) >= 0.15:
        return "banglish"
    return "en"
