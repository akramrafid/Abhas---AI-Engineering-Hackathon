"""Port: conversational chat LLM used by the chat vertical slice (Gemini adapter or offline fallback)."""

from __future__ import annotations

from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass
from typing import Literal, Protocol


@dataclass(frozen=True)
class ChatTurnInput:
    role: Literal["user", "assistant"]
    content: str


@dataclass(frozen=True)
class ChatLLMResult:
    text: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    latency_ms: float


class ChatLLM(Protocol):
    model: str

    async def complete(
        self,
        *,
        system: str,
        messages: Sequence[ChatTurnInput],
        max_output_tokens: int,
        language: str = "en",
        ward_id: str | None = None,
    ) -> ChatLLMResult:
        """One fast completion call with timeout, bounded retry, budget guard, and tracing."""
        ...

    def stream(
        self,
        *,
        system: str,
        messages: Sequence[ChatTurnInput],
        max_output_tokens: int,
        language: str = "en",
        ward_id: str | None = None,
    ) -> AsyncIterator[str]:
        """Yield text chunks incrementally over SSE; falls back cleanly on error."""
        ...


class ChatBudgetExceededError(RuntimeError):
    pass


class ChatLLMUnavailableError(RuntimeError):
    pass
