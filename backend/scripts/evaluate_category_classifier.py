from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from ml.category_evaluation import build_category_evaluation_report  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Evaluate the TF-IDF + Logistic Regression category classifier."
    )
    parser.add_argument("dataset_dir", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    report = build_category_evaluation_report(args.dataset_dir)
    payload = json.dumps(report, indent=2, sort_keys=True)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload + "\n", encoding="utf-8")
    print(payload)


if __name__ == "__main__":
    main()
