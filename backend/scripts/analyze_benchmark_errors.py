from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from benchmark.error_analysis import analyze_benchmark_errors  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Run scenario-level development diagnostics for financial-benchmark-v1 while "
            "keeping the synthetic holdout sealed."
        )
    )
    parser.add_argument(
        "dataset",
        type=Path,
        nargs="?",
        default=Path("datasets/benchmark_v1"),
        help="Benchmark directory (default: datasets/benchmark_v1)",
    )
    parser.add_argument(
        "--phase",
        action="append",
        choices=("calibration", "validation"),
        dest="phases",
        help="Development phase to include; repeat to select both. Defaults to both.",
    )
    parser.add_argument("--output", type=Path, default=None, help="Optional JSON report path")
    parser.add_argument("--fp-weight", type=float, default=2.0)
    parser.add_argument("--fn-weight", type=float, default=1.0)
    parser.add_argument("--max-errors", type=int, default=50)
    args = parser.parse_args()

    report = analyze_benchmark_errors(
        args.dataset,
        phases=tuple(args.phases or ("calibration", "validation")),
        false_positive_weight=args.fp_weight,
        false_negative_weight=args.fn_weight,
        max_errors=args.max_errors,
    )
    serialized = json.dumps(report, indent=2, sort_keys=True)
    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(serialized + "\n", encoding="utf-8")
    print(serialized)


if __name__ == "__main__":
    main()
