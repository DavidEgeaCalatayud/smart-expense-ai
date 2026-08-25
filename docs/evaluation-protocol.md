# Evaluation protocol

The historical-intelligence evaluation harness separates iterative development from final reporting. This avoids selecting thresholds or design choices on the same observations later presented as final evidence.

## Temporal split policy

Labelled datasets may define three chronological ranges:

```json
{
  "evaluation": {
    "splits": {
      "calibration": {"startMonth": "2023-01", "endMonth": "2023-12"},
      "validation": {"startMonth": "2024-01", "endMonth": "2024-06"},
      "holdout": {"startMonth": "2024-07", "endMonth": "2024-12"}
    }
  }
}
```

The harness rejects overlapping or out-of-order ranges.

The roles are deliberately different:

- **Calibration**: parameter exploration and threshold selection belong here.
- **Validation**: confirm design decisions and detect overfitting to calibration. Do not repeatedly tune against validation until it becomes another training set.
- **Holdout**: final unbiased result. It is not included in development reports.

The current production recurring-profile extractor has an established minimum pattern score of 55. The protocol records a candidate grid for future labelled calibration, but the current runner freezes the executed `historical-v2.2` default rather than pretending to tune settings that the low-level evaluator does not yet execute parametrically end to end.

## Development mode

```bash
cd backend
python scripts/evaluate_historical.py \
  evaluation/historical_v2_fixture.json \
  --mode development \
  --parameters-output /tmp/historical-parameters.json \
  --output /tmp/historical-development.json
```

Development mode physically removes holdout transactions before invoking the underlying walk-forward evaluator. The output contains separate `calibration` and `validation` reports and a sealed holdout descriptor:

```json
{
  "mode": "development",
  "calibration": {"...": "..."},
  "validation": {"...": "..."},
  "holdout": {
    "status": "sealed"
  }
}
```

Calibration and validation metrics are never merged into one headline score.

## Frozen parameter set

Development mode emits a small parameter manifest:

```json
{
  "analysisVersion": "historical-v2.2",
  "parameterSetId": "historical-v2.2-default",
  "recurringScoreThreshold": "55",
  "fingerprint": "...sha256..."
}
```

The SHA-256 fingerprint is calculated from the canonical parameter payload. Holdout mode recomputes it and rejects a modified file.

This does not make the holdout cryptographically secret; the repository owner can always inspect the dataset. The purpose is methodological discipline and an auditable workflow that makes accidental test-set tuning harder.

## Holdout mode

```bash
python scripts/evaluate_historical.py \
  evaluation/historical_v2_fixture.json \
  --mode holdout \
  --parameters /tmp/historical-parameters.json \
  --output /tmp/historical-holdout.json
```

Holdout mode evaluates only the configured holdout months. It requires the previously frozen parameter manifest.

For a real labelled financial dataset, the holdout command should not be part of the ordinary iterative CI loop. The synthetic repository fixture may exercise it in CI solely to prove that the mechanism remains functional; its scores are not product-quality evidence.

## Confidence intervals

Point metrics without sample-size context are insufficient. Development and holdout reports therefore attach confidence metadata to recurrence, anomaly and occurrence aggregate metrics.

The current method is:

```text
month-block percentile bootstrap
```

Instead of sampling individual transactions independently, the bootstrap resamples whole evaluation months with replacement. That keeps observations from the same month together and is a more defensible default for temporal financial data.

Default configuration:

```text
confidence level: 95%
iterations:       1000
seed:             20260825
sampling unit:    evaluation month
```

Example output:

```json
{
  "precision": 0.82,
  "confidence": {
    "method": "month_block_percentile_bootstrap_v1",
    "level": 0.95,
    "iterations": 1000,
    "blocks": 12,
    "support": 1842,
    "intervals": {
      "precision": {"lower": 0.74, "upper": 0.88},
      "recall": {"lower": 0.67, "upper": 0.81},
      "f1": {"lower": 0.71, "upper": 0.84}
    }
  }
}
```

The numbers above are illustrative only. Repository fixtures are synthetic and must never be quoted as real-world accuracy.

## Interpretation rules

A serious result should be reported with at least:

- point estimate;
- confidence interval;
- support/sample count;
- number of temporal blocks;
- evaluation split;
- analysis version;
- frozen parameter fingerprint.

If the interval is wide, the correct conclusion is that the dataset is still too small or variable for a precise estimate. More decimal places do not fix inadequate evidence.

## Current limitation

The protocol foundation is now in place, but real parameter calibration remains intentionally pending until a sufficiently large labelled dataset exists. The project should not optimize a synthetic fixture and then present that fixture's score as model quality.
