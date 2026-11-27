"""Business logic for the validation vertical slice (framework-free)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.core.run_meta import current_run_meta
from app.ports.planning import TriggerEvaluationSource

from .schemas import TriggerValidationResponse, ValidationResponse


class ValidationService:
    """Validates and serves stored chronological backtest & early-action trigger results."""

    def __init__(
        self,
        loader: Callable[[], dict[str, Any]],
        trigger_source: TriggerEvaluationSource | None = None,
    ) -> None:
        self._loader = loader
        self._trigger_source = trigger_source

    def get_validation(self) -> ValidationResponse:
        raw = self._loader()
        return ValidationResponse.model_validate(raw)

    def get_trigger(self) -> TriggerValidationResponse:
        if self._trigger_source is None:
            raise RuntimeError("TriggerEvaluationSource not configured on ValidationService")
        raw = self._trigger_source.load_trigger()
        meta = current_run_meta(
            model_version=str(raw.get("model_version") or "abhas-lgbm-1.1.2"),
            git_sha=str(raw.get("git_sha") or "unknown"),
        )
        payload = {
            **raw,
            "model_version": meta.model_version,
            "git_sha": meta.git_sha,
            "data_as_of": raw.get("data_as_of") or meta.data_as_of,
            "offline": meta.offline,
            "generated_at": raw.get("generated_at") or meta.generated_at,
        }
        return TriggerValidationResponse.model_validate(payload)
