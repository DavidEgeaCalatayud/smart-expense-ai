# API contracts

Smart Expense AI exposes versioned application contracts under `/api/v1` and `/api/v2`. `/health` is an infrastructure probe; unversioned `/api/*` application routes are unsupported.

Stable analytical identifiers are defined in `backend/app/analysis_contracts.py`; see [`analysis-contracts.md`](analysis-contracts.md).

## Version overview

`/api/v1` remains the compatibility contract. `/api/v2` is the strict financial/product contract used by the web application:

- transaction, budget and forecast money uses decimal strings;
- financial calculations remain PostgreSQL `NUMERIC` / Python `Decimal`;
- category suggestions are explicit user-controlled assistance;
- intelligence, historical evidence, recurring-payment projections and month-end forecasts remain versioned and explainable.

Current analytical/model identifiers include:

```text
rules-v2
historical-v2.2
recurring-calendar-v1
spending-forecast-v1
merchant_mad_plus_extreme_iqr_v1
lifecycle-v1
tfidf-logreg-v1
merchant_descriptor_only_v1
```

## Authentication and account controls

Public endpoints:

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /health
```

Authenticated account endpoints:

```text
GET    /api/v1/auth/me
PUT    /api/v1/auth/password
GET    /api/v1/auth/privacy-export
DELETE /api/v1/auth/account
```

Browser sessions use an HttpOnly JWT cookie with issuer/audience/expiry/session-version validation. Password changes rotate the successful caller's current session and invalidate older session versions.

`privacy-export-v1` is scoped to the authenticated user and includes account data, transactions, intelligence findings/scans, historical snapshots, import batches, custom categories, budgets and `categorySuggestions`. Account deletion removes the same user-owned data through database lifecycle rules.

## Categories

```text
GET    /api/v1/categories?includeArchived=false
POST   /api/v1/categories
PATCH  /api/v1/categories/{category_id}
POST   /api/v1/categories/{category_id}/archive
POST   /api/v1/categories/{category_id}/restore
```

Seeded system categories are global/read-only. Authenticated users may add account-owned categories. Conflicts are case-insensitive inside the visible category/type namespace. Archive/reassign/restore preserves historical integrity and only active visible compatible categories can be selected for new transactions/budgets/imports.

## API v2 endpoint overview

```text
GET    /api/v2/transactions
POST   /api/v2/transactions
PUT    /api/v2/transactions/{transaction_id}
DELETE /api/v2/transactions/{transaction_id}

POST   /api/v2/category-suggestions/preview

GET    /api/v2/analytics/summary
GET    /api/v2/analytics/monthly-expenses
GET    /api/v2/analytics/spending-forecast?asOf=YYYY-MM-DD

POST   /api/v2/imports/csv/detect
POST   /api/v2/imports/csv/preview
POST   /api/v2/imports/csv/commit
GET    /api/v2/imports/batches

GET    /api/v2/budgets?month=YYYY-MM
POST   /api/v2/budgets
PUT    /api/v2/budgets/{budget_id}
DELETE /api/v2/budgets/{budget_id}

POST   /api/v2/intelligence/scan
GET    /api/v2/intelligence/summary
GET    /api/v2/intelligence/findings
PATCH  /api/v2/intelligence/findings/{finding_id}
POST   /api/v2/intelligence/historical-analysis?months=12
GET    /api/v2/intelligence/historical-analysis/latest
GET    /api/v2/intelligence/upcoming-payments?days=30&asOf=YYYY-MM-DD
```

## Monetary contract

V2 money is a JSON decimal string. A transaction example:

```json
{
  "merchant": "Market",
  "description": "Groceries",
  "category": "Food",
  "amount": "42.50",
  "date": "2026-08-25",
  "type": "expense",
  "paymentMethod": "card",
  "isRecurring": false
}
```

`{"amount": 0.1}` is intentionally rejected with `422 validation_error`. Budget writes follow the same rule for `limitAmount`.

```text
PostgreSQL NUMERIC
        <-> Python Decimal
        <-> API v2 decimal string
        <-> frontend integer cents / decimal-string display
```

## Transactions

GET endpoints are paginated. Defaults are `page=1`, `pageSize=20`, `sort=newest`; `pageSize` is capped at 100. Supported server filters include search, category, status, type, recurring, `dateFrom`, `dateTo` and sort. `dateFrom > dateTo` returns `invalid_date_range`.

Manual v2 create/update preserves the user's explicit category selection. A model suggestion never independently changes `transactions.category_id`.

## Category suggestions and feedback

```text
POST /api/v2/category-suggestions/preview
```

Example request:

```json
{
  "merchant": "MERCADONA 3921",
  "type": "expense"
}
```

A global response returns category ID/name plus `source=global_model`, `modelVersion=tfidf-logreg-v1` and `featurePolicy=merchant_descriptor_only_v1`. Personalized responses can use prior canonical-merchant feedback from the authenticated user.

The response contains no confidence or probability vector. Transaction writes recompute suggestion provenance server-side and persist transaction + feedback atomically. `productConfidenceEnabled=false` remains the product policy until representative real labelled calibration exists.

## Analytics

### Summary and monthly series

`GET /api/v2/analytics/summary` returns exact decimal-string aggregates. `GET /api/v2/analytics/monthly-expenses?months=6` returns a continuous monthly series including zero-value months.

### Month-end spending forecast — `spending-forecast-v1`

```text
GET /api/v2/analytics/spending-forecast?asOf=YYYY-MM-DD
```

`asOf` is optional and exists for reproducible evaluation/testing; normal product requests use the server date. Transactions after `asOf` are excluded before any forecast component is calculated.

The response contains:

```text
forecastVersion
asOf
month
daysInMonth
elapsedDays
remainingDays
spentSoFar
historicalThreeMonthMean
backtestCutoffDay
backtestMonths
baselines[]
```

Each baseline contains:

```text
baseline
label
available
projectedMonthEnd
differenceFromThreeMonthMean
assumptions[]
evidence
backtest {
  support
  cutoffDay
  mae
  smapePercent
  bias
}
```

Implemented baselines are `three_month_mean`, `run_rate` and `recurrence_aware`. All monetary fields remain decimal strings. Insufficient history is represented with `available=false` / null estimate rather than future or partial-month backfilling.

Backtesting uses a fixed day-15 chronological cutoff and identical fold support for all baselines. MAE/sMAPE/bias are historical errors, not calibrated confidence. The recurrence-aware baseline reuses qualified `historical-v2.2` / `lifecycle-v1` streams plus `recurring-calendar-v1`, excluding recurring spend already observed from its variable run-rate numerator so charges are counted once.

See [`spending-forecast.md`](spending-forecast.md).

## Budgets

Budgets are user-owned planning records and never mutate transactions.

Database invariants:

```text
UNIQUE (user_id, month)
WHERE category_id IS NULL

UNIQUE (user_id, month, category_id)
WHERE category_id IS NOT NULL
```

`month` is `YYYY-MM` at the API boundary. `limitAmount` must be a positive decimal string. Category budgets target only visible active expense categories; archived categories retain historical visibility but cannot receive new budgets.

## Financial intelligence findings

The current persisted actionable engine is `rules-v2`:

```text
recurring_pattern
recurring_payment_missing
duplicate_subscription
spending_anomaly
frequency_anomaly
```

Findings are user-scoped and idempotent by stable fingerprint. Review states are `open`, `dismissed` and `resolved`. Amount anomalies use prior-only canonical-merchant history with `merchant_mad_plus_extreme_iqr_v1`; category-only history is insufficient for a merchant amount alert.

## Historical analysis

Current new-run diagnostic engine: `historical-v2.2`. Historical analysis is separate from review-state findings and never rewrites transactions. It provides month completeness, complete-month trend, canonical merchant evidence, `lifecycle-v1` recurrence segmentation, missed expected payments, prior-only merchant amount outliers, category shifts and coverage metadata.

## Upcoming recurring payments

```text
GET /api/v2/intelligence/upcoming-payments?days=30&asOf=YYYY-MM-DD
```

The projection contract is `recurring-calendar-v1`. `days` defaults to 30 and is bounded to 1–90. All monetary fields are decimal strings. `expectedTotal` sums only future occurrences inside the requested product window; overdue schedules are returned separately.

Statuses `expected`, `likely`, `price_changed` and `overdue` are deterministic evidence labels, not probabilities. Missing/dormant streams are not automatically rolled forward, while price-continuity streams use the latest observed price regime.

The internal projection primitive also accepts a projection-window start separate from its historical `asOf` cutoff. `spending-forecast-v1` uses that separation to freeze recurrence evidence at the forecast cutoff and project only subsequent dates without same-day double counting.

See [`upcoming-payments.md`](upcoming-payments.md).

## Error contract

Both API versions use the normalized safe envelope:

```json
{
  "error": {
    "code": "transaction_not_found",
    "message": "Transaction not found",
    "requestId": "..."
  }
}
```

Validation errors may include safe structured details. Frontend typed errors distinguish authentication, authorization, validation, not-found, conflict, server and network failures while preserving safe backend messages/request IDs.
