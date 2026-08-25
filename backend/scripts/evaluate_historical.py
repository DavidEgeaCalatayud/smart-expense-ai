from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.evaluation_confidence import BootstrapConfig  # noqa: E402
from app.services.historical_evaluation import evaluate_historical_dataset  # noqa: E402
from app.services.historical_evaluation_protocol import EvaluationParameters  # noqa: E402
from app.services.historical_evaluation_runner import (  # noqa: E402
    run_development_evaluation,
    run_holdout_evaluation,
)


def _write_json(path: Path | None, payload: dict[str, object]) -> None:
    serialized = json.dumps(payload, indent=2, sort_keys=True)
    if path is not None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(serialized + "\n", encoding="utf-8")
    print(serialized)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Run chronological historical-v2.2 evaluation with optional sealed "
            "calibration/validation/holdout protocol."
        )
    )
    parser.add_argument("dataset", type=Path, help="Path to a labelled historical evaluation JSON dataset")
    parser.add_argument("--output", type=Path, default=None, help="Optional path for the JSON report")
    parser.add_argument(
        "--mode",
        choices=("development", "holdout", "legacy"),
        default="legacy",
        help=(
            "legacy preserves the original all-fold report; development seals holdout; "
            "holdout requires frozen parameters"
        ),
    )
    parser.add_argument(
        "--parameters",
        type=Path,
        default=None,
        help="Frozen parameter JSON produced by a prior development run; required for holdout",
    )
    parser.add_argument(
        "--parameters-output",
        type=Path,
        default=None,
        help="Write the frozen parameter set emitted by development mode",
    )
    parser.add_argument("--bootstrap-iterations", type=int, default=1000)
    parser.add_argument("--bootstrap-level", type=float, default=0.95)
    parser.add_argument("--bootstrap-seed", type=int, default=20260825)
    args = parser.parse_args()

    payload = json.loads(args.dataset.read_text(encoding="utf-8"))
    bootstrap = BootstrapConfig(
        level=args.bootstrap_level,
        iterations=args.bootstrap_iterations,
        seed=args.bootstrap_seed,
    )

    if args.mode == "legacy":
        report = evaluate_historical_dataset(payload)
    elif args.mode == "development":
        report = run_development_evaluation(payload, bootstrap=bootstrap)
        if args.parameters_output is not None:
            frozen = report["frozenParameters"]
            args.parameters_output.parent.mkdir(parents=True, exist_ok=True)
            args.parameters_output.write_text(
                json.dumps(frozen, indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
            )
    else:
        if args.parameters is None:
            parser.error("--parameters is required in holdout mode")
        raw_parameters = json.loads(args.parameters.read_text(encoding="utf-8"))
        parameters = EvaluationParameters.from_frozen_dict(raw_parameters)
        report = run_holdout_evaluation(payload, parameters, bootstrap=bootstrap)

    _write_json(args.output, report)


if __name__ == "__main__":
    main()
