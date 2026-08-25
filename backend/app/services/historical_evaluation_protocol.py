from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from hashlib import sha256
import json
from typing import Any


PROTOCOL_VERSION = "temporal_calibration_validation_holdout_v1"
DEFAULT_PARAMETER_SET_ID = "historical-v2.2-default"
DEFAULT_RECURRING_THRESHOLD = Decimal("55")


def _validate_month_key(value: str, field: str) -> str:
    if len(value) != 7 or value[4] != "-":
        raise ValueError(f"{field} must use YYYY-MM")
    try:
        date.fromisoformat(f"{value}-01")
    except ValueError as exc:
        raise ValueError(f"{field} must be a valid calendar month") from exc
    return value


@dataclass(frozen=True)
class TemporalSplit:
    name: str
    start_month: str
    end_month: str

    def contains(self, month_key: str) -> bool:
        return self.start_month <= month_key <= self.end_month

    def as_dict(self) -> dict[str, str]:
        return {
            "startMonth": self.start_month,
            "endMonth": self.end_month,
        }


@dataclass(frozen=True)
class EvaluationParameters:
    parameter_set_id: str
    recurring_score_threshold: Decimal
    analysis_version: str = "historical-v2.2"

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "recurring_score_threshold",
            Decimal(str(self.recurring_score_threshold)),
        )
        if not self.parameter_set_id:
            raise ValueError("parameter_set_id must not be empty")
        if not Decimal("55") <= self.recurring_score_threshold <= Decimal("100"):
            raise ValueError("recurring_score_threshold must be between 55 and 100")

    def canonical_payload(self) -> dict[str, str]:
        return {
            "analysisVersion": self.analysis_version,
            "parameterSetId": self.parameter_set_id,
            "recurringScoreThreshold": format(self.recurring_score_threshold, "f"),
        }

    @property
    def fingerprint(self) -> str:
        encoded = json.dumps(
            self.canonical_payload(),
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        return sha256(encoded).hexdigest()

    def as_frozen_dict(self) -> dict[str, str]:
        payload = self.canonical_payload()
        payload["fingerprint"] = self.fingerprint
        return payload

    @classmethod
    def from_frozen_dict(cls, raw: dict[str, Any]) -> "EvaluationParameters":
        parameters = cls(
            parameter_set_id=str(raw["parameterSetId"]),
            recurring_score_threshold=Decimal(str(raw["recurringScoreThreshold"])),
            analysis_version=str(raw.get("analysisVersion", "historical-v2.2")),
        )
        fingerprint = str(raw.get("fingerprint", ""))
        if not fingerprint:
            raise ValueError("frozen parameter set must include a fingerprint")
        if fingerprint != parameters.fingerprint:
            raise ValueError("frozen parameter set fingerprint does not match its contents")
        return parameters


@dataclass(frozen=True)
class EvaluationProtocol:
    calibration: TemporalSplit
    validation: TemporalSplit
    holdout: TemporalSplit
    recurring_threshold_candidates: tuple[Decimal, ...]

    def phase_for_month(self, month_key: str) -> str | None:
        for split in (self.calibration, self.validation, self.holdout):
            if split.contains(month_key):
                return split.name
        return None

    def months_for(self, phase: str, available_months: list[str]) -> set[str]:
        split = {
            "calibration": self.calibration,
            "validation": self.validation,
            "holdout": self.holdout,
        }.get(phase)
        if split is None:
            raise ValueError(f"unknown evaluation phase: {phase}")
        return {month for month in available_months if split.contains(month)}

    def as_dict(self) -> dict[str, object]:
        return {
            "version": PROTOCOL_VERSION,
            "calibration": self.calibration.as_dict(),
            "validation": self.validation.as_dict(),
            "holdout": self.holdout.as_dict(),
            "recurringScoreThresholdCandidates": [
                format(value, "f") for value in self.recurring_threshold_candidates
            ],
        }


def _parse_split(name: str, raw: object) -> TemporalSplit:
    if not isinstance(raw, dict):
        raise ValueError(f"evaluation.splits.{name} must be an object")
    start = _validate_month_key(
        str(raw.get("startMonth", "")),
        f"evaluation.splits.{name}.startMonth",
    )
    end = _validate_month_key(
        str(raw.get("endMonth", "")),
        f"evaluation.splits.{name}.endMonth",
    )
    if start > end:
        raise ValueError(f"evaluation.splits.{name} startMonth must not be after endMonth")
    return TemporalSplit(name=name, start_month=start, end_month=end)


def parse_evaluation_protocol(payload: dict[str, Any]) -> EvaluationProtocol | None:
    evaluation = payload.get("evaluation", {})
    splits_raw = evaluation.get("splits")
    if splits_raw is None:
        return None
    if not isinstance(splits_raw, dict):
        raise ValueError("evaluation.splits must be an object")

    calibration = _parse_split("calibration", splits_raw.get("calibration"))
    validation = _parse_split("validation", splits_raw.get("validation"))
    holdout = _parse_split("holdout", splits_raw.get("holdout"))

    if calibration.end_month >= validation.start_month:
        raise ValueError("calibration must end before validation starts")
    if validation.end_month >= holdout.start_month:
        raise ValueError("validation must end before holdout starts")

    candidates_raw = evaluation.get(
        "recurringScoreThresholdCandidates",
        ["55", "60", "65", "70"],
    )
    if not isinstance(candidates_raw, list) or not candidates_raw:
        raise ValueError("recurringScoreThresholdCandidates must be a non-empty list")
    candidates = tuple(sorted({Decimal(str(value)) for value in candidates_raw}))
    if any(value < Decimal("55") or value > Decimal("100") for value in candidates):
        raise ValueError("recurring score threshold candidates must be between 55 and 100")

    return EvaluationProtocol(
        calibration=calibration,
        validation=validation,
        holdout=holdout,
        recurring_threshold_candidates=candidates,
    )


def choose_recurring_threshold(candidate_reports: list[dict[str, object]]) -> dict[str, object]:
    """Choose on calibration only: F1, then precision, then stricter threshold."""

    if not candidate_reports:
        raise ValueError("at least one calibration candidate report is required")

    def key(item: dict[str, object]) -> tuple[float, float, Decimal]:
        metrics = item["metrics"]
        assert isinstance(metrics, dict)
        return (
            float(metrics.get("f1", 0.0)),
            float(metrics.get("precision", 0.0)),
            Decimal(str(item["recurringScoreThreshold"])),
        )

    return max(candidate_reports, key=key)
