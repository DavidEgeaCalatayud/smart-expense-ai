from pathlib import Path
import json
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from benchmark.dataset import build_historical_evaluation_payload


if __name__ == "__main__":
    root = BACKEND_ROOT / "datasets" / "benchmark_v1"
    target = root / "historical_evaluation_payload.json"
    target.write_text(json.dumps(build_historical_evaluation_payload(root), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(target)
