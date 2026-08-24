from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.services.historical_evaluation import evaluate_historical_dataset


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run chronological walk-forward evaluation for historical-v2."
    )
    parser.add_argument("dataset", type=Path, help="Path to a labelled historical evaluation JSON dataset")
    parser.add_argument("--output", type=Path, default=None, help="Optional path for the JSON report")
    args = parser.parse_args()

    payload = json.loads(args.dataset.read_text(encoding="utf-8"))
    report = evaluate_historical_dataset(payload)
    serialized = json.dumps(report, indent=2, sort_keys=True)

    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(serialized + "\n", encoding="utf-8")
    print(serialized)


if __name__ == "__main__":
    main()
