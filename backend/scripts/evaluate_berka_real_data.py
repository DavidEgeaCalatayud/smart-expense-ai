from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.berka_real_data_evaluation import evaluate_berka_dataset


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Evaluate the public PKDD'99 Berka banking dataset and emit aggregate-only "
            "real-world financial evidence. Raw Berka files are never copied into the report."
        )
    )
    parser.add_argument("dataset", type=Path, help="Berka dataset directory or ZIP archive")
    parser.add_argument("--output", type=Path, help="Optional aggregate JSON output path")
    args = parser.parse_args()

    report = evaluate_berka_dataset(args.dataset)
    serialized = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if args.output is None:
        print(serialized, end="")
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(serialized, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
