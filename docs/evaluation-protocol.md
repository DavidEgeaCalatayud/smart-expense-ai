# Evaluation protocol

The historical-intelligence evaluation harness separates iterative development from final reporting. This avoids selecting thresholds or design choices on the same observations later presented as final evidence.

The same split discipline now also applies to the local `private-real-data-v1` evaluator used for independent/private labelled transactions. The private path changes the privacy boundary and evidence source; it does not relax the calibration/validation/holdout rules.

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

## Independent/private labelled data

`private-real-data-v1` provides the same methodological separation without requiring private financial records to be stored in Git or CI.

Local data is placed under ignored `data/private/` and evaluated with:

```bash
cd backend
python scripts/evaluate_private_dataset.py \
  ../data/private \
  --mode development \
  --parameters-output ../data/private/historical-parameters.json \
  --output ../data/private/development-report.json
```

The private evaluator has several additional constraints:

1. **The deployed category classifier is fixed.** Private transactions are ground truth for independent evaluation; they are not used to refit `tfidf-logreg-v1` before measuring its production generalization.
2. **Natural unseen merchants are measured against the immutable runtime bootstrap corpus.** This is distinct from the synthetic merchant-group holdout.
3. **Probability calibrators are fit only on the private calibration range and compared only on private validation.** Raw, Platt and isotonic methods are not all compared again after opening holdout.
4. **`rules-v2` is evaluated causally.** The engine may use historical context available through the evaluation boundary, while precision/recall/F1/FP-per-100 are scored only on the configured validation or holdout transactions.
5. **`historical-v2.2` reuses the normal walk-forward runner.** The private harness is an adapter/privacy layer, not a second implementation with different semantics.
6. **The report is aggregate-only.** Raw merchant strings, transaction IDs, row-level errors, raw transactions and merchant-specific historical slices are omitted.
7. **Dataset identity is auditable without publishing the dataset.** The report includes a SHA-256 fingerprint of the local source files.

Opening the private holdout is separate and explicit:

```bash
python scripts/evaluate_private_dataset.py \
  ../data/private \
  --mode holdout \
  --calibration-method platt \
  --historical-parameters ../data/private/historical-parameters.json \
  --output ../data/private/holdout-report.json
```

The calibration method (`raw`, `platt` or `isotonic`) must be chosen from calibration/validation evidence **before** this command is used. If a design is changed because of holdout results, the correct response is a new versioned holdout rather than repeated tuning against the same final set.

CI validates this private-data path with temporary synthetic records only. Therefore a green CI job proves the evaluator mechanism and privacy contract, **not** that `rules-v2`, `historical-v2.2` or the classifier have already been validated on real finances.

See [`private-evaluation.md`](private-evaluation.md) for the full local schema.

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
- confidence interval where the evaluator supports it;
- support/sample count;
- number of temporal blocks for block-bootstrap metrics;
- evaluation split;
- analysis/model version;
- frozen parameter fingerprint where applicable;
- natural unseen-merchant support for category classification;
- out-of-taxonomy support instead of silently discarding unsupported labels.

If the interval is wide, the correct conclusion is that the dataset is still too small or variable for a precise estimate. More decimal places do not fix inadequate evidence.

## Current limitation

The protocol and private-data tooling are now in place, but **actual real-world evidence remains pending** until `private-real-data-v1` is run on a genuinely independent/private labelled dataset. Real parameter calibration must then use calibration data only, validation for design checks and one final holdout opening.

The project must not optimize synthetic fixtures—or one repeatedly inspected private holdout—and then present those results as general model quality.
