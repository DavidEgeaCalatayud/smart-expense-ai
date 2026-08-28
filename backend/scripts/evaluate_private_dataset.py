from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.historical_evaluation_protocol import EvaluationParameters  # noqa: E402
from private_evidence import (  # noqa: E402
    build_public_evidence_summary,
    evaluate_private_evidence,
    require_real_evidence,
)


def _write_json(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Evaluate private/independent labelled transactions without emitting raw "
            "transaction, merchant or row-level error data."
        )
    )
    parser.add_argument(
        "dataset",
        type=Path,
        help="Private dataset directory containing manifest.json and JSONL label files",
    )
    parser.add_argument(
        "--mode",
        choices=("development", "holdout"),
        default="development",
        help="Development evaluates calibration/validation while sealing holdout",
    )
    parser.add_argument(
        "--calibration-method",
        choices=("raw", "platt", "isotonic"),
        default="raw",
        help=(
            "Frozen category-probability method to use when opening holdout. "
            "Development compares all methods on validation only."
        ),
    )
    parser.add_argument(
        "--historical-parameters",
        type=Path,
        default=None,
        help="Frozen historical-v2.2 parameter JSON required in holdout mode",
    )
    parser.add_argument(
        "--parameters-output",
        type=Path,
        default=None,
        help="Optional path for frozen historical parameters emitted by development mode",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Optional aggregate-only full report output path",
    )
    parser.add_argument(
        "--public-summary-output",
        type=Path,
        default=None,
        help=(
            "Optional compact aggregate-only evidence summary suitable for retention "
            "outside the ignored private directory"
        ),
    )
    parser.add_argument(
        "--require-real-evidence",
        action="store_true",
        help=(
            "Fail unless provenance is real_private + independent and the scored split "
            "contains non-zero classification, unseen merchant, calibration, observed "
            "suggestion feedback, anomaly and occurrence/amount evidence support"
        ),
    )
    parser.add_argument(
        "--require-final-holdout-evidence",
        action="store_true",
        help=(
            "Apply the real-evidence gate and additionally require holdout mode. Use only "
            "after model/calibration/historical choices were frozen before opening holdout."
        ),
    )
    args = parser.parse_args()

    historical_parameters = None
    if args.mode == "holdout":
        if args.historical_parameters is None:
            parser.error("--historical-parameters is required in holdout mode")
        raw_parameters = json.loads(
            args.historical_parameters.read_text(encoding="utf-8")
        )
        historical_parameters = EvaluationParameters.from_frozen_dict(raw_parameters)

    report = evaluate_private_evidence(
        args.dataset,
        mode=args.mode,
        calibration_method=args.calibration_method,
        historical_parameters=historical_parameters,
    )

    if args.mode == "development" and args.parameters_output is not None:
        frozen = report["historicalV2_2"]["frozenParameters"]
        _write_json(args.parameters_output, frozen)

    if args.output is not None:
        _write_json(args.output, report)

    if args.public_summary_output is not None:
        _write_json(args.public_summary_output, build_public_evidence_summary(report))

    payload = json.dumps(report, indent=2, sort_keys=True)
    print(payload)

    try:
        if args.require_final_holdout_evidence:
            require_real_evidence(report, final_holdout=True)
        elif args.require_real_evidence:
            require_real_evidence(report)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc


if __name__ == "__main__":
    main()
