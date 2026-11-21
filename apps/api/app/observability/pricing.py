"""Model token pricing loaded from pricing.json (unknown models return None + warning, never guess)."""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

logger = logging.getLogger("abhas.llm")
PRICING_PATH = Path(__file__).resolve().parent / "pricing.json"


@lru_cache
def load_pricing_table() -> dict[str, Any]:
    return json.loads(PRICING_PATH.read_text(encoding="utf-8"))


def estimate_cost_usd(
    model: str,
    tokens_in: int | None,
    tokens_out: int | None,
) -> float | None:
    """Compute USD cost for a model call from pricing.json; returns None if model or tokens unknown."""
    models = load_pricing_table().get("models", {})
    price = models.get(model)
    if price is None or tokens_in is None or tokens_out is None:
        logger.warning("llm_no_price_for_model: %s", model, extra={"event": "llm_no_price"})
        return None
    cost = (tokens_in / 1_000_000.0) * float(price["input_per_1m"]) + (tokens_out / 1_000_000.0) * float(
        price["output_per_1m"]
    )
    return round(max(0.0, cost), 6)
