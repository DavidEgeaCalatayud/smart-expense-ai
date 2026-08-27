# Spending Forecast (`spending-forecast-v1`)

## Purpose

`spending-forecast-v1` estimates the authenticated user's total expense spending at the end of the current calendar month. It is intentionally a transparent deterministic baseline contract, not a probabilistic model.

The product exposes three estimates side by side so error and assumptions remain visible before any forecasting ML challenger is considered.

## Endpoint

```text
GET /api/v2/analytics/spending-forecast?asOf=YYYY-MM-DD
```

`asOf` is optional and exists for reproducibility, testing and causal evaluation. When omitted, the backend uses the current server date.

All monetary values are decimal strings. No forecast path converts money through IEEE-754 floating point.

## Baselines

### Previous three complete months

The baseline is the arithmetic mean of the three complete calendar months immediately before the forecast month.

It is unavailable when the account does not contain sufficient historical coverage. Partial current-month spending never enters this mean and zero-spend complete months remain genuine zero observations.

### Current-month run rate

```text
spent_so_far / elapsed_calendar_days * days_in_month
```

This assumes the average daily spend observed so far continues through month end. Calendar days with no transactions remain in the denominator.

### Recurrence-aware projection

```text
spent_so_far
+ projected_remaining_variable_spend
+ qualified_future_recurring_payments
```

The service first identifies transaction IDs belonging to recurrence streams that satisfy the existing `historical-v2.2` / `lifecycle-v1` contract. Recurring spending already observed in the month stays inside `spent_so_far` exactly once and is removed from the variable-spend numerator before extrapolation.

Future recurring occurrences are then obtained from `recurring-calendar-v1`. Forecasting does not introduce a second recurrence detector.

## Causality and leakage policy

Every production forecast discards transactions dated after `asOf` before calculating any component.

The recurring calendar supports a projection `window_start` separate from its historical evidence cutoff. Forecast folds freeze recurrence evidence at the cutoff date but start future recurrence projection on the following day. This prevents both future-data leakage and same-day double counting.

## Walk-forward backtesting

Backtesting uses a fixed day-15 cutoff for each eligible complete month.

A fold is scored only when all three baselines are available. Therefore the three reported baselines always use identical chronological folds and identical support.

Metrics:

- **MAE** — mean absolute monetary error;
- **sMAPE** — symmetric mean absolute percentage error;
- **bias** — mean signed error (`forecast - actual`), showing systematic over- or under-estimation.

The implementation does not label any of these metrics as probability or confidence.

## Reproducible benchmark

`backend/scripts/evaluate_spending_forecast.py` creates a deterministic stationary fixture containing variable spending plus a qualified day-20 recurring charge. The dedicated **Spending forecast benchmark** GitHub Actions workflow verifies:

- `spending-forecast-v1` contract identity;
- fixed day-15 cutoff;
- common fold support for all baselines;
- complete MAE/sMAPE/bias metrics;
- exact three-month mean behavior in the stationary fixture;
- recurrence-aware improvement over raw run rate when a known future recurring charge is present;
- explicit ML promotion-gate metadata.

## ML promotion gate

A future Ridge, Random Forest, Gradient Boosting or other challenger is not eligible for product use merely because it is more complex.

A challenger must be evaluated causally on the same chronological folds/support and consistently improve the simple baselines on the agreed error metrics and meaningful slices. Any probabilistic confidence display requires a separate calibration contract.

## Current boundaries

`spending-forecast-v1` is an overall expense forecast only. Category-level forecasts, warning thresholds and predictive ML remain future work until the overall contract has enough real-world evaluation evidence.
