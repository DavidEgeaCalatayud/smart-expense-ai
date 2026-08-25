from __future__ import annotations

import json
from pathlib import Path
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from benchmark.dataset import validate_benchmark


if __name__ == "__main__":
    root = BACKEND_ROOT / "datasets" / "benchmark_v1"
    print(json.dumps(validate_benchmark(root), indent=2, sort_keys=True))
