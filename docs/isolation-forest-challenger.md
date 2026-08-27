# IsolationForest-v1 anomaly challenger

`IsolationForest-v1` is an **offline evaluation challenger** to the production `rules-v2` anomaly engine. It is not used by the FastAPI product path, does not replace deterministic findings, and is not a fraud detector.

## Contracts

- model: `isolation-forest-v1`
- feature policy: `causal-transaction-features-v1`
- hybrid: `rules-v2-or-isolation-forest-v1`
- evaluation report: `anomaly-challenger-evaluation-v1`
- synthetic benchmark: `anomaly-challenger-benchmark-v1`
- production engine: `rules-v2`

The identifiers live in `backend/app/analysis_contracts.py`.

## Causal feature policy

Transactions are sorted by `(date, transaction_id)`. Before a row is appended to merchant state, the challenger computes:

- current amount;
- prior merchant median;
- robust amount deviation using prior median/MAD with the same minimum spread concept used by the deterministic baseline;
- days since the previous merchant purchase;
- prior merchant frequency among all earlier transactions;
- current-month merchant count, including the current observed transaction but no later row;
- rolling seven-day merchant count, including the current observed transaction and only earlier rows in the window;
- prior merchant amount coefficient of variation;
- prior merchant history depth.

Merchant normalization is evaluated from the current descriptor alone. The feature builder never constructs fuzzy identity using future descriptors. Appending a future transaction must therefore leave every existing feature row unchanged; unit tests and the benchmark enforce this invariant.

## Chronological protocol

The protocol has three disjoint stages:

1. **Fit** — IsolationForest is fitted only on rows at or before `fit_end`. The minimum fit support is 20 rows.
2. **Calibration** — the already fitted model scores a later calibration window. Labels in this window may select the anomaly-score threshold; they never refit the forest.
3. **Evaluation** — a strictly later validation or holdout range is scored with the frozen forest and threshold.

The final holdout is never used for fitting or threshold selection. `random_state=41`, a single worker and fixed estimator configuration keep the benchmark reproducible.

## Same-evidence comparison

For one evaluation range, the report scores exactly the same labelled transaction observations for:

- `rules-v2`;
- `isolation-forest-v1`;
- `rules-v2-or-isolation-forest-v1`, a transparent union that flags a row if either challenger path flags it.

Each system reports:

- support and positive support;
- precision;
- recall;
- F1;
- false positives per 100 transactions;
- confusion counts;
- history-depth slices: `0–3`, `4–11`, and `12+` prior merchant observations.

The hybrid is an evaluation policy only. A union may improve recall while increasing false positives, so it is not inherently preferable.

## Promotion policy

Every challenger report sets `replaceProductionRules=false`. Complexity and synthetic-fixture performance are not acceptance criteria. `rules-v2` remains the production engine unless representative, independently labelled real transaction evidence shows a justified improvement on the same causal support and the false-positive cost is acceptable.

The synthetic benchmark deliberately validates reproducibility, no future leakage, shared support, metric completeness and the non-promotion guard. It does **not** claim representative banking performance.

## Private data boundary

`private-real-data-v1` remains the preferred mechanism for representative local evaluation because it already enforces complete anomaly labels and sealed calibration/validation/holdout ranges. This PR does not require private financial records in CI and never emits row-level private merchants, transaction IDs or errors. The challenger module accepts aggregate-compatible labels so it can be wired into that local evaluator without changing the production API.

## Run the synthetic gate

From `backend/`:

```bash
python scripts/evaluate_anomaly_challenger.py --output /tmp/anomaly-challenger.json
```

GitHub Actions executes the same command in **Anomaly challenger benchmark**.

## Limitations

- IsolationForest is unsupervised; calibration labels only choose a score threshold and do not make the underlying representation supervised.
- Sparse merchant histories produce weaker merchant-specific context and are reported separately.
- The synthetic fixture is intentionally controlled and cannot establish real-world superiority.
- This is personal-spending anomaly evaluation, not fraud detection or payment authorization.
- No probability/confidence is exposed; IsolationForest scores are ranking scores, not calibrated probabilities.
