"""Contract: ops slice (LEAD owns). GET /api/v1/ops — measured cost and cache numbers (rubric R6)."""

from pydantic import BaseModel, Field


class PredictionStats(BaseModel):
    requests: int = Field(ge=0)
    cache_hits: int = Field(ge=0)
    cache_hit_rate: float = Field(ge=0, le=1)
    p50_ms: float = Field(ge=0)
    p95_ms: float = Field(ge=0, description="In-process inference latency per ward")


class CallStats(BaseModel):
    calls_today: int = Field(ge=0)
    calls_total: int = Field(ge=0)
    cache_hits: int = Field(ge=0)
    errors: int = Field(ge=0)


class LLMStats(CallStats):
    spend_usd_today: float = Field(ge=0)
    budget_usd_per_day: float = Field(ge=0)
    enabled: bool


class OpsResponse(BaseModel):
    model_version: str
    model_loads: int = Field(ge=0, description="Must stay 1: the model is loaded once at startup")
    uptime_s: float = Field(ge=0)
    predictions: PredictionStats
    weather: CallStats
    llm: LLMStats
    est_monthly_cost_usd: float = Field(ge=0, description="Estimated monthly cost for one city office")
