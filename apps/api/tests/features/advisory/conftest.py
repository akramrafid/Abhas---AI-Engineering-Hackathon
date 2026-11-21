"""Ensure apps/api is importable when pytest collects nested slice tests directly."""

from __future__ import annotations

import sys
from pathlib import Path

_API_DIR = str(Path(__file__).resolve().parents[3])
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)
