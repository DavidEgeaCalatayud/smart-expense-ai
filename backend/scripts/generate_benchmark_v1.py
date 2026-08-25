from pathlib import Path
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from benchmark.generator import write_dataset


if __name__ == "__main__":
    output = BACKEND_ROOT / "datasets" / "benchmark_v1"
    write_dataset(output)
    print(f"Generated benchmark at {output}")
