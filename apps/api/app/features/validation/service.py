"""Business logic for the validation vertical slice (framework-free)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from .schemas import ValidationResponse


class ValidationService:
    """Validates and serves stored chronological backtest results."""

    def __init__(self, loader: Callable[[], dict[str, Any]]) -> None:
        self._loader = loader

    def get_validation(self) -> ValidationResponse:
        raw = self._loader()
        return ValidationResponse.model_validate(raw)
