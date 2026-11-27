"""Shared Phase 2 request models and literals (LEAD-owned contract module, contracts §1–§2).

Placed in app/core/ so the plans slice validates all four operational request types
without importing another feature slice (ADR-0001). Each feature's schemas.py re-exports
its own request model from here.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,
    ValidationInfo,
    field_validator,
)

from app.core.types import DatasetOriginWeek, Horizon, WardId

Scope = Literal["Dhaka North", "Dhaka South", "Chattogram", "Gazipur", "Narayanganj", "all"]
EfficacyPreset = Literal["low", "base", "high"]
Channel = Literal["sms", "whatsapp", "brief"]
Lang = Literal["en", "bn"]
PlanKind = Literal["allocation", "overflow", "simulation", "dispatch"]

UUID_PATTERN = r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
UuidStr = Annotated[
    str,
    StringConstraints(pattern=UUID_PATTERN),
    Field(examples=["550e8400-e29b-41d4-a716-446655440000"]),
]


def _strict_int(value: object) -> object:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError("must be an integer")
    return value


def _strict_float(value: object) -> object:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("must be a JSON number")
    return float(value)


StockPct = Annotated[
    int,
    Field(ge=30, le=100, description="Available Regional Stock percentage (30–100)"),
    BeforeValidator(_strict_int),
]
TotalCrews = Annotated[
    int,
    Field(ge=0, le=300, description="Total spraying crews to assign (0–300)"),
    BeforeValidator(_strict_int),
]
ServiceLevel = Annotated[
    float,
    Field(ge=0.50, le=0.99, allow_inf_nan=False, description="Forecast quantile service level (0.50–0.99)"),
    BeforeValidator(_strict_float),
]
EquityFloorPct = Annotated[
    int,
    Field(ge=0, le=50, description="Minimum share of demand guaranteed per ward (0–50 %)"),
    BeforeValidator(_strict_int),
]
CapacityOverrideInt = Annotated[
    int,
    Field(ge=1, le=500, description="Bed capacity override for one ward (1–500)"),
    BeforeValidator(_strict_int),
]
DeploymentCrews = Annotated[
    int,
    Field(ge=1, le=20, description="Spraying crews deployed to this ward (1–20)"),
    BeforeValidator(_strict_int),
]
AutoCrews = Annotated[
    int,
    Field(ge=1, le=300, description="Total crews placed greedily by the engine (1–300)"),
    BeforeValidator(_strict_int),
]
PlanLabel = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=80),
    Field(description="Human-readable label for the saved plan (1–80 chars)"),
]


class AllocationRequest(BaseModel):
    """POST /api/v1/allocation/plan request (contracts §2.1)."""

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    scope: Scope = "all"
    origin_week: DatasetOriginWeek = Field(
        description="Monday of the last observed week; 2016-02-29 … 2025-12-29"
    )
    h_start: Horizon = 2
    h_end: Horizon = Field(default=4, validate_default=True)
    stock_pct: StockPct = 100
    total_crews: TotalCrews = 0
    service_level: ServiceLevel | None = Field(
        default=None,
        description="Optional quantile override; null uses P80 saline/kits and P90 beds",
    )
    equity_floor_pct: EquityFloorPct = 20

    @field_validator("h_end", mode="after")
    @classmethod
    def _h_end_ge_h_start(cls, value: int, info: ValidationInfo) -> int:
        h_start = info.data.get("h_start")
        if h_start is not None and value < h_start:
            raise ValueError("h_end must be greater than or equal to h_start")
        return value


class OverflowRequest(BaseModel):
    """POST /api/v1/overflow/route request (contracts §2.2)."""

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    scope: Scope = "all"
    origin_week: DatasetOriginWeek = Field(
        description="Monday of the last observed week; 2016-02-29 … 2025-12-29"
    )
    horizon: Horizon = 3
    service_level: ServiceLevel = 0.90
    capacity_overrides: dict[WardId, CapacityOverrideInt] = Field(
        default_factory=dict,
        max_length=60,
        description="Optional ward_id -> capacity overrides (1–500 beds, ≤ 60 entries)",
    )


class Deployment(BaseModel):
    """Single ward crew deployment entry for SimulatorRequest."""

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    ward_id: WardId
    crews: DeploymentCrews


class SimulatorRequest(BaseModel):
    """POST /api/v1/simulator/run request (contracts §2.3)."""

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    origin_week: DatasetOriginWeek = Field(
        description="Monday of the last observed week; 2016-02-29 … 2025-12-29"
    )
    deployments: list[Deployment] | None = Field(
        default=None,
        min_length=1,
        max_length=60,
        validate_default=True,
        description="Explicit ward deployments (unique wards); mutually exclusive with auto_crews",
    )
    auto_crews: AutoCrews | None = Field(
        default=None,
        validate_default=True,
        description="Total crews placed greedily by the engine; mutually exclusive with deployments",
    )
    efficacy: EfficacyPreset = "base"

    @field_validator("deployments", mode="after")
    @classmethod
    def _unique_deployment_wards(cls, value: list[Deployment] | None) -> list[Deployment] | None:
        if value is not None:
            seen = [d.ward_id for d in value]
            if len(set(seen)) != len(seen):
                raise ValueError("deployments must contain unique ward_id values")
        return value

    @field_validator("auto_crews", mode="after")
    @classmethod
    def _exactly_one_mode(cls, value: int | None, info: ValidationInfo) -> int | None:
        if "deployments" not in info.data:
            return value
        deployments = info.data["deployments"]
        if deployments is not None and value is not None:
            raise ValueError("set either deployments or auto_crews, not both")
        if deployments is None and value is None:
            raise ValueError("set exactly one of deployments or auto_crews")
        return value


class DispatchRequest(BaseModel):
    """POST /api/v1/dispatch/notices request (contracts §2.4)."""

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    origin_week: DatasetOriginWeek = Field(
        description="Monday of the last observed week; 2016-02-29 … 2025-12-29"
    )
    ward_ids: list[WardId] | None = Field(
        default=None,
        min_length=1,
        max_length=60,
        validate_default=True,
        description="Explicit ward list (1–60 unique wards); mutually exclusive with scope",
    )
    scope: Scope | None = Field(
        default=None,
        validate_default=True,
        description="City or 'all'; mutually exclusive with ward_ids",
    )
    channels: list[Channel] = Field(
        default_factory=lambda: ["sms", "whatsapp", "brief"],
        min_length=1,
        max_length=3,
        description="Channels to render (default all three)",
    )
    lang: Lang = "en"
    plan_id: UuidStr | None = Field(
        default=None,
        description="Optional saved allocation plan UUID; if omitted, computes allocation from stock_pct and total_crews",
    )
    stock_pct: StockPct = 100
    total_crews: TotalCrews = 0

    @field_validator("ward_ids", mode="after")
    @classmethod
    def _unique_wards(cls, value: list[str] | None) -> list[str] | None:
        if value is not None and len(set(value)) != len(value):
            raise ValueError("ward_ids must be unique")
        return value

    @field_validator("scope", mode="after")
    @classmethod
    def _exactly_one_target(cls, value: Scope | None, info: ValidationInfo) -> Scope | None:
        if "ward_ids" not in info.data:
            return value
        ward_ids = info.data["ward_ids"]
        if ward_ids is not None and value is not None:
            raise ValueError("set either ward_ids or scope, not both")
        if ward_ids is None and value is None:
            raise ValueError("set exactly one of ward_ids or scope")
        return value

    @field_validator("channels", mode="after")
    @classmethod
    def _unique_channels(cls, value: list[Channel]) -> list[Channel]:
        if len(set(value)) != len(value):
            raise ValueError("channels must be unique")
        return value


class _PlanCreateBase(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    label: PlanLabel


class AllocationPlanCreate(_PlanCreateBase):
    kind: Literal["allocation"]
    request: AllocationRequest


class OverflowPlanCreate(_PlanCreateBase):
    kind: Literal["overflow"]
    request: OverflowRequest


class SimulationPlanCreate(_PlanCreateBase):
    kind: Literal["simulation"]
    request: SimulatorRequest


class DispatchPlanCreate(_PlanCreateBase):
    kind: Literal["dispatch"]
    request: DispatchRequest


PlanCreateRequest = Annotated[
    AllocationPlanCreate | OverflowPlanCreate | SimulationPlanCreate | DispatchPlanCreate,
    Field(discriminator="kind"),
]
