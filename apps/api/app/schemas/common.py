from pydantic import BaseModel, Field


class Usage(BaseModel):
    """Per-request cost/latency accounting (shown in the UI and logged)."""

    model: str = Field(description="Model that served the request, or 'mock'")
    llm_calls: int = Field(ge=0, default=0)
    prompt_tokens: int = Field(ge=0, default=0)
    completion_tokens: int = Field(ge=0, default=0)
    cost_usd: float = Field(ge=0, default=0.0)
    latency_ms: float = Field(ge=0, default=0.0)
    cached: bool = False


class ErrorBody(BaseModel):
    code: str
    message: str
    request_id: str


class ErrorResponse(BaseModel):
    error: ErrorBody
