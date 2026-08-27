# Product specification

## Product

Smart Expense AI is a personal-finance application focused on persisted transaction management, explainable financial intelligence and evidence-driven machine-learning assistance.

This document separates **implemented behavior** from roadmap intent. Future capabilities are not presented as current features.

## Product principles

1. Financial source data is persisted and user-scoped.
2. Money is handled exactly rather than with floating-point business arithmetic.
3. Analytical findings expose deterministic evidence rather than fake probability.
4. Historical diagnostics remain distinct from actionable review-state findings.
5. ML features enter the product behind explicit user control and reproducible evaluation.
6. Synthetic benchmark performance is regression/development evidence, not real banking accuracy.
7. A model suggestion never silently overrides a user's persisted category.
8. A private-evaluation harness is scientific infrastructure, not proof of real-world quality until it is actually run on independent labelled data.
9. ML forecasting/anomaly challengers must be compared with transparent baselines on the same causal evidence before displacing simpler methods.
10. Upcoming-payment and month-end forecast outputs are deterministic evidence with explicit assumptions/error, not calibrated probabilities.

## Implemented product capabilities

### Accounts and ownership

- registration/login/logout;
- Argon2 password hashing;
- HttpOnly JWT sessions with server-side session-version revocation;
- password change with current-session rotation;
- authenticated privacy export and confirmed account deletion;
- cross-account isolation across financial, analytical, planning and suggestion-feedback data.

### Transaction management

Users can create/read/update/delete persisted transactions with merchant, description, exact amount, date, system or account-owned category, income/expense type, payment method, recurring flag and source metadata.

The product also supports server-side pagination/search/filter/sort, responsive transaction presentation, authenticated CSV import, custom category management and persisted monthly budgets.

### User-controlled category suggestions — `tfidf-logreg-v1`

Users may ask the transaction form for a suggested category. Resolution order:

```text
1. previous compatible category selected by this user for the canonical merchant
2. global merchant-text tfidf-logreg-v1 suggestion over system categories
```

Global feature policy is `merchant_descriptor_only_v1`. Suggestions are explicit **Accept** / **Change** controls and do not modify the selected category until the user acts. V2 writes persist server-computed suggestion provenance together with the user's final selection. Account-owned categories can be learned only from that user's feedback history.

The product deliberately does **not** display raw classifier probability or a category confidence percentage. `productConfidenceEnabled=false` remains explicit.

### Dashboard and aggregates

The dashboard is backed by persisted data/server aggregates, including balances and monthly spending series.

### Actionable financial intelligence — `rules-v2`

Explicit scans persist reviewable findings:

```text
recurring_pattern
recurring_payment_missing
duplicate_subscription
spending_anomaly
frequency_anomaly
```

Findings expose explainable evidence and support `open`, `dismissed` and `resolved` states. Amount anomalies use `merchant_mad_plus_extreme_iqr_v1` with prior-only merchant history.

### Historical diagnostics — `historical-v2.2`

Versioned historical snapshots contain month completeness, spending trend, canonical merchant evidence, recurring profiles/`lifecycle-v1` segmentation, missed occurrences, chronological merchant-specific amount outliers, category shifts and coverage metadata.

### Upcoming recurring payments — `recurring-calendar-v1`

The **Predictions** workspace shows a recurring-payment calendar derived from the same recurrence/lifecycle primitives used elsewhere in the product.

Safeguards:

- overdue items never contribute to future `expectedTotal`;
- a missing/dormant schedule is not automatically rolled forward until new activity re-establishes it;
- month-end schedules preserve calendar alignment;
- price-continuity streams use the latest observed price regime;
- `patternScore` remains deterministic evidence, not confidence.

### Month-end spending forecast — `spending-forecast-v1`

Predictions also presents three causal deterministic baselines for the authenticated user's total expense spending at month end:

```text
Previous 3 complete months
Current-month run rate
Recurrence-aware projection
```

The recurrence-aware projection keeps spending already observed exactly once, extrapolates only the non-recurring/variable portion at its observed daily rate and adds future recurring occurrences already justified by `historical-v2.2` / `lifecycle-v1` through `recurring-calendar-v1`.

The API exposes the estimate, comparison against the previous-three-month mean, explicit assumptions/evidence and historical walk-forward error. Backtesting freezes each evaluated historical month at day 15, scores all three baselines on identical chronological support and reports:

- MAE;
- sMAPE;
- signed bias.

Insufficient history remains explicitly unavailable rather than being silently supplemented with future or partial-month rows.

The product does not convert backtest error into probability/confidence. The ML promotion gate is explicit: a future Ridge, Random Forest, Gradient Boosting or other challenger is not eligible for product use until it consistently improves transparent baselines on the same folds/support and remains robust across relevant slices.

See [`spending-forecast.md`](spending-forecast.md).

## Category classifier evaluation evidence

The deterministic synthetic benchmark uses chronological development/validation plus a sealed holdout and a canonical merchant-group-disjoint cold-start slice:

```text
evaluationSamples        382
evaluationMerchantGroups 9
merchantGroupOverlap     0
accuracy                 0.400524
macroF1                  0.201242
```

Synthetic calibration diagnostics are:

```text
raw       Brier 0.018193   ECE 0.082021
Platt     Brier 0.008871   ECE 0.004624
isotonic  Brier 0.009156   ECE 0.004711
```

These figures are development evidence and do not justify automatic assignment or confidence display without representative real data.

## Private real-data evaluation capability

`private-real-data-v1` is a local/offline path for independently labelled transactions. Private financial records remain under ignored `data/private/`; reports are aggregate-only and deliberately omit merchants, transaction IDs and row-level errors.

The harness can evaluate the fixed production classifier, natural seen/unseen merchant support, calibration diagnostics, transaction-level `rules-v2` anomaly metrics and `historical-v2.2` through its established chronological/bootstrap machinery.

This is an implemented evaluation capability, not an implemented real-world result.

## Evidence hierarchy

```text
small fixture -> regression protection
financial-benchmark-v1 -> synthetic financial-development evidence
spending-forecast-benchmark-v1 -> deterministic forecast regression evidence
private-real-data-v1 -> mechanism for independent/private evaluation
independent / real labelled results -> real quality evidence
```

## Not implemented

The following must not be described as current capabilities:

- completed real-world validation results for classifier, `rules-v2`, `historical-v2.2` or forecast quality;
- bank/account aggregation APIs;
- automatic/background intelligence scheduling;
- automatic category assignment;
- user-facing calibrated category confidence;
- per-user classifier retraining;
- ML anomaly/fraud classification in the product;
- forecasting ML in the product;
- category-level forecasts and forecast warning thresholds;
- MFA;
- verified password-reset email flow;
- multi-currency business support;
- paid subscription/billing integration;
- mobile application.

## Near-term product direction

The intended sequence is evidence-first:

1. **Recurring-payment calendar — implemented.** `recurring-calendar-v1` exposes future qualified recurring charges and separate overdue schedules.
2. **Transparent overall month-end baselines — implemented.** `spending-forecast-v1` provides three-month mean, run rate and recurrence-aware estimates with explicit assumptions.
3. **Walk-forward error evidence — implemented.** MAE, sMAPE and bias use the same fixed day-15 chronological folds/support for every baseline; a dedicated forecast workflow protects the contract.
4. **Run private/independent evaluation.** Measure real category/anomaly/recurrence quality and accumulate representative real forecast history before making production-quality claims.
5. **Evaluate forecasting ML challengers later.** Ridge, Random Forest, Gradient Boosting or another model may be tested, but promotion requires consistent improvement on the same causal folds/support and relevant slices.
6. **Treat anomaly ML as a challenger.** `IsolationForest-v1` should use causal/prior-only features and be compared against `rules-v2` and a hybrid on the same labelled evidence; complexity alone cannot replace deterministic rules.
7. Add category-level forecasts or warning thresholds only after the overall baseline contract has sufficient evidence.
8. Continue deployment/security hardening in parallel.

The authoritative sequence is maintained in [`../ROADMAP.md`](../ROADMAP.md).

## Product trust boundaries

Smart Expense AI does not claim to detect fraud with certainty, provide financial advice, infer why a recurring payment disappeared, produce real-world-calibrated probabilities from synthetic data, or guarantee month-end spending from deterministic estimates.

Suggestions/findings, recurring-calendar states and forecasts are evidence for user control and planning. Forecast cards expose assumptions and historical error precisely so a point estimate is not presented as certainty.

## Technical references

- [`ARCHITECTURE.md`](ARCHITECTURE.md)
- [`DATA_MODEL.md`](DATA_MODEL.md)
- [`analysis-contracts.md`](analysis-contracts.md)
- [`api.md`](api.md)
- [`testing.md`](testing.md)
- [`private-evaluation.md`](private-evaluation.md)
- [`upcoming-payments.md`](upcoming-payments.md)
- [`spending-forecast.md`](spending-forecast.md)
- [`intelligence.md`](intelligence.md)
- [`historical-analysis.md`](historical-analysis.md)
- [`evaluation-protocol.md`](evaluation-protocol.md)
- [`../ai/category-classifier/README.md`](../ai/category-classifier/README.md)
