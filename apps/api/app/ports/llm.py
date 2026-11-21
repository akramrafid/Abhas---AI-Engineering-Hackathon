"""Port: structured-output LLM used only by the advisory slice (COULD). Fake adapter when no key is set."""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class LLMResult:
    data: Mapping[str, Any]  # parsed JSON matching the requested schema
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    latency_ms: float


class LLM(Protocol):
    model: str

    def complete_json(
        self, system: str, user: str, schema: Mapping[str, Any], max_output_tokens: int
    ) -> LLMResult:
        """One call with timeout, bounded retries and a daily budget check; raises BudgetExceeded / LLMUnavailable."""
        ...


class BudgetExceededError(RuntimeError):
    pass


class LLMUnavailableError(RuntimeError):
    pass
