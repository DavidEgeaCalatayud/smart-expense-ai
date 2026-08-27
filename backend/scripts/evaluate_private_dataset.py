from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.historical_evaluation_protocol import EvaluationParameters  # noqa: E402
from private_evaluation import evaluate_private_dataset  # noqa: E402


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
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()

    historical_parameters = None
    if args.mode == "holdout":
        if args.historical_parameters is None:
            parser.error("--historical-parameters is required in holdout mode")
        raw_parameters = json.loads(
            args.historical_parameters.read_text(encoding="utf-8")
        )
        historical_parameters = EvaluationParameters.from_frozen_dict(raw_parameters)

    report = evaluate_private_dataset(
        args.dataset,
        mode=args.mode,
        calibration_method=args.calibration_method,
        historical_parameters=historical_parameters,
    )

    if args.mode == "development" and args.parameters_output is not None:
        frozen = report["historicalV2_2"]["frozenParameters"]
        args.parameters_output.parent.mkdir(parents=True, exist_ok=True)
        args.parameters_output.write_text(
            json.dumps(frozen, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    payload = json.dumps(report, indent=2, sort_keys=True)
    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload + "\n", encoding="utf-8")
    print(payload)


if __name__ == "__main__":
    main()
