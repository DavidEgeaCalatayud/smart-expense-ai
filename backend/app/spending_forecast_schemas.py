from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict


ForecastBaselineId = Literal[
    "three_month_mean",
    "run_rate",
    "recurrence_aware",
]


class ForecastBacktestMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    support: int
    cutoffDay: int
    mae: str | None
    smapePercent: str | None
    bias: str | None


class SpendingForecastBaseline(BaseModel):
    model_config = ConfigDict(extra="forbid")

    baseline: ForecastBaselineId
    label: str
    available: bool
    projectedMonthEnd: str | None
    differenceFromThreeMonthMean: str | None
    assumptions: list[str]
    evidence: dict[str, str | int]
    backtest: ForecastBacktestMetrics


class SpendingForecastResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    forecastVersion: str
    asOf: str
    month: str
    daysInMonth: int
    elapsedDays: int
    remainingDays: int
    spentSoFar: str
    historicalThreeMonthMean: str | None
    backtestCutoffDay: int
    backtestMonths: int
    baselines: list[SpendingForecastBaseline]
