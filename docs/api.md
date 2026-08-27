# API contracts

Smart Expense AI exposes versioned application contracts under `/api/v1` and `/api/v2`.

`/health` is intentionally outside the versioned application contract because it is an infrastructure probe. Unversioned `/api/*` application routes are not supported.

Stable analytical identifiers are defined centrally in `backend/app/analysis_contracts.py` and documented in [`analysis-contracts.md`](analysis-contracts.md).

## Version overview

`/api/v1` remains the backwards-compatible contract for existing clients. Its transaction/analytics money fields remain JSON numbers at the serialization boundary.

`/api/v2` is the strict money and analytical contract used by the web application:

- transaction amounts are decimal strings;
- aggregate monetary values are decimal strings;
- budget limits and budget progress monetary values are decimal strings;
- monetary values inside intelligence evidence are decimal strings;
- transaction and budget writes must send monetary fields as JSON strings;
- JSON numeric monetary values are rejected with HTTP `422`;
- historical-analysis evidence includes completeness, merchant identity, recurrence segmentation and amount-baseline metadata.

PostgreSQL stores `NUMERIC(12,2)` and Python financial services use `Decimal`. The v1 number conversion is compatibility serialization only.

Current FastAPI application version:

```text
1.4.0
```

The application-version source of truth is `backend/app/version.py`. FastAPI and the CI import smoke check both consume `APP_VERSION`; CI does not duplicate the version literal.

Algorithm/model versions are independent from the HTTP application version. The current analytical contracts are:

```text
rules-v2
historical-v2.2
merchant_mad_plus_extreme_iqr_v1
lifecycle-v1
tfidf-logreg-v1   # offline only; not an API auto-categorization path
```

## Authentication and account controls

The browser session is carried in an HttpOnly JWT cookie shared by both API versions. JWTs include a server-checked session-version claim. Password changes increment the persisted session version, invalidate previously issued tokens and rotate the current browser cookie so the successful caller remains authenticated.

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

`PUT /api/v1/auth/password` requires the current password and a different new password of at least 12 characters. A successful change revokes older session versions and returns a newly versioned session cookie for the current browser.

`GET /api/v1/auth/privacy-export` returns `privacy-export-v1`, scoped to the authenticated user. The contract contains:

```text
account
transactions
intelligenceFindings
intelligenceScans
historicalAnalysisSnapshots
importBatches
customCategories
budgets
```

Every persisted collection is filtered by the authenticated `user_id`. Integration regression coverage seeds separate users and verifies that account-owned financial, intelligence, import, custom-category and budget data never crosses the ownership boundary. Password hashes, session-version internals and JWT/session-token material are excluded.

`DELETE /api/v1/auth/account` requires the current password plus the exact confirmation value `DELETE`. Successful deletion removes the user and database-cascaded user-owned financial/intelligence/import/category/budget data and clears the authentication cookie.

Password reset by email is not part of the current contract because the project does not yet provide a verified recovery-token delivery channel.

Authenticated v1 category endpoints:

```text
GET    /api/v1/categories?includeArchived=false
POST   /api/v1/categories
PATCH  /api/v1/categories/{category_id}
POST   /api/v1/categories/{category_id}/archive
POST   /api/v1/categories/{category_id}/restore
```

Authenticated v2 endpoints include:

```text
GET    /api/v2/transactions
POST   /api/v2/transactions
PUT    /api/v2/transactions/{transaction_id}
DELETE /api/v2/transactions/{transaction_id}
GET    /api/v2/analytics/summary
GET    /api/v2/analytics/monthly-expenses
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
```

## Monetary contract

A v2 transaction write uses a decimal string:

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

This is intentionally invalid in v2:

```json
{ "amount": 0.1 }
```

It returns `422 validation_error`.

Budget writes follow the same rule:

```json
{
  "month": "2026-08",
  "categoryId": null,
  "limitAmount": "2000.00"
}
```

`limitAmount` as a JSON number is intentionally rejected.

Precision invariant:

```text
PostgreSQL NUMERIC(12,2)
        <-> Python Decimal
        <-> API v2 decimal string
        <-> frontend integer cents for arithmetic
```

Recharts is the visualization-only boundary where fixed-point chart values may be converted to JavaScript numbers after financial arithmetic is complete.

## Transaction pagination and filters

`GET /api/v2/transactions` and its v1 equivalent are paginated. Defaults:

```text
page=1
pageSize=20
sort=newest
```

Constraints:

- `page >= 1`;
- `1 <= pageSize <= 100`;
- an empty result has `total=0` and `pages=0`.

Supported filters:

| Parameter | Values / format | Behavior |
| --- | --- | --- |
| `search` | text | case-insensitive merchant/description search |
| `category` | category name | exact persisted category |
| `status` | `normal`, `review` | deterministic review status |
| `type` | `expense`, `income` | transaction type |
| `recurring` | `true`, `false` | user-provided recurring flag |
| `dateFrom` | `YYYY-MM-DD` | inclusive lower bound |
| `dateTo` | `YYYY-MM-DD` | inclusive upper bound |
| `sort` | `newest`, `oldest`, `amount_high`, `amount_low` | ordering |

`dateFrom > dateTo` returns `invalid_date_range`.

## Categories

Seeded system categories remain global and read-only. Authenticated users can add account-owned categories without changing the legacy system-category contract.

`GET /api/v1/categories` returns active system categories plus categories owned by the authenticated user. `includeArchived=true` also exposes that user's archived categories.

A category response contains:

```json
{
  "id": "...",
  "name": "Gym",
  "transactionType": "expense",
  "scope": "user",
  "archived": false,
  "transactionCount": 4
}
```

Creation requires an explicit `transactionType`. Conflicts are case-insensitive inside the visible category/type namespace, so an account-owned category cannot shadow an already visible category of the same transaction type.

Only account-owned categories may be renamed, archived or restored by the owning user. System categories cannot be mutated through these endpoints.

Archiving is explicit. The request supports:

```json
{ "mode": "archive", "reassignToCategoryId": null }
```

or:

```json
{ "mode": "reassign", "reassignToCategoryId": "..." }
```

`archive` preserves historical transaction assignments while hiding the category from active selection. `reassign` moves existing assignments to another visible active category of the same transaction type before archiving. Restore reactivates an archived account-owned category when no visible conflict exists.

Manual transaction writes and CSV import resolve active system categories together with the authenticated user's active custom categories. Unknown categories remain distinct from categories that exist but are incompatible with the requested transaction type.

## Analytics

### Summary

`GET /api/v2/analytics/summary` returns exact decimal-string aggregates:

```json
{
  "totalIncome": "2200.00",
  "totalExpenses": "910.50",
  "balance": "1289.50",
  "recurringCount": 4,
  "reviewCount": 1,
  "transactionCount": 18
}
```

`0.10 + 0.20` is regression-tested as `"0.30"`.

### Monthly expenses

`GET /api/v2/analytics/monthly-expenses?months=6` returns a continuous monthly series including zero-value months. `months` accepts 1–24. `through=YYYY-MM-DD` is available for deterministic tests/consumers.

## Budgets

Budgets are authenticated, user-owned planning records. They do not alter transactions and they do not predict future spending.

A user can have at most one overall budget per month and at most one budget per category/month. Database partial unique indexes enforce both invariants:

```text
UNIQUE (user_id, month)
WHERE category_id IS NULL

UNIQUE (user_id, month, category_id)
WHERE category_id IS NOT NULL
```

The `month` field uses `YYYY-MM` at the HTTP boundary and is persisted as the first day of that month. `limitAmount` must be a positive decimal string.

Category budgets may target only a visible active expense category. Income-category budgets are rejected.

`GET /api/v2/budgets?month=2026-08` returns an optional overall budget plus category budgets with server-calculated progress:

```json
{
  "month": "2026-08",
  "totalBudget": {
    "id": "...",
    "month": "2026-08",
    "categoryId": null,
    "categoryName": null,
    "categoryArchived": false,
    "limitAmount": "2000.00",
    "spentAmount": "328.00",
    "remainingAmount": "1672.00",
    "percentUsed": "16.4",
    "daysRemaining": 5,
    "overBudget": false
  },
  "categoryBudgets": []
}
```

Progress is derived from persisted expense transactions for the requested month. Archived categories retain historical budget visibility through `categoryArchived`; they are not eligible for new category budgets while archived.

`PUT /api/v2/budgets/{budget_id}` updates only the decimal limit. `DELETE` removes the planning record and never deletes transactions.

## Financial intelligence findings

The current persisted actionable engine is:

```text
rules-v2
```

Endpoints:

```text
POST  /api/v2/intelligence/scan
GET   /api/v2/intelligence/summary
GET   /api/v2/intelligence/findings
PATCH /api/v2/intelligence/findings/{finding_id}
```

Findings are user-scoped and idempotent by stable fingerprint. Review states are `open`, `dismissed` and `resolved`.

`GET /findings` accepts optional `status` and `type` filters. Current finding types:

```text
recurring_pattern
recurring_payment_missing
duplicate_subscription
spending_anomaly
frequency_anomaly
```

### rules-v2 recurrence

Recurring findings use canonical merchant identity plus the shared `historical-v2.2` recurring-stream primitives. The current segmentation metadata is versioned as `lifecycle-v1` and combines lifecycle, qualified price continuity, descriptor/amount and conservative calendar-phase evidence.

`recurring_pattern` is informational and exposes a deterministic `patternScore`, not a probability.

`recurring_payment_missing` is a separate warning/high signal requiring stronger history and a learned schedule. It can indicate cancellation, date changes or missing imported data; it does not assert a cause. Same-cadence-period collisions suppress this missing-payment signal while the schedule is ambiguous.

### rules-v2 amount anomaly

`spending_anomaly` evaluates charges chronologically using the shared policy:

```text
merchant_mad_plus_extreme_iqr_v1
```

Baseline contract:

- only amounts from transactions earlier than the candidate are eligible;
- history is scoped to the same canonical merchant;
- at least four prior merchant observations are required;
- at most the last 12 prior merchant amounts are used;
- category-only history is not sufficient evidence for a merchant-level amount alert.

The decision combines median/MAD evidence with an extreme Tukey fence. The candidate must exceed:

```text
max(
  1.50 * median,
  median + 3 * robustSpread,
  Q3 + 3 * IQR
)
```

and also satisfy the minimum absolute-delta and robust-deviation requirements documented in [`intelligence.md`](intelligence.md).

Amount-anomaly evidence exposes:

```text
baselineScope = merchant
baselinePolicy = merchant_mad_plus_extreme_iqr_v1
baselineCount
baselineMedian
baselineMad
robustSpread
firstQuartile
thirdQuartile
interquartileRange
distributionUpperFence
deviationScore
ratio
threshold
```

### rules-v2 frequency anomaly

`frequency_anomaly` compares a merchant's current monthly charge count with up to six previous active months and requires at least three prior active periods. It also exposes the maximum number of charges in any rolling seven-day interval.

Summary response separates signal families:

```json
{
  "openCount": 4,
  "recurringCount": 1,
  "missingRecurringCount": 1,
  "duplicateSubscriptionCount": 0,
  "anomalyCount": 2,
  "amountAnomalyCount": 1,
  "frequencyAnomalyCount": 1,
  "dismissedCount": 0,
  "resolvedCount": 0,
  "lastScanAt": "2026-08-25T07:30:00Z",
  "analyzedTransactions": 120,
  "ruleVersion": "rules-v2"
}
```

The example counts are illustrative.

Monetary evidence is persisted as decimal strings. API v2 returns those strings. API v1 keeps the legacy numeric representation for known monetary evidence keys at the response adapter only.

Full thresholds and evidence semantics: [`intelligence.md`](intelligence.md).

## Historical analysis

Historical analysis is a separate persisted diagnostic layer. It does not create review-state findings and does not mutate source transactions.

Current new-run engine:

```text
historical-v2.2
```

Older versioned snapshots remain readable.

### Generate a snapshot

```text
POST /api/v2/intelligence/historical-analysis?months=12
```

`months` accepts 6–24. The period ends at the latest persisted expense date so historical fixture analysis is reproducible.

`historical-v2.2` includes:

- monthly spend with explicit partial-month completeness;
- complete-month least-squares trend;
- auditable merchant canonicalization;
- recurrence segmentation under `lifecycle-v1`;
- lifecycle, price-continuity, descriptor/amount and temporal-phase recurrence evidence;
- calendar-aware recurrence features and pattern score;
- missed expected occurrences;
- chronological robust amount outliers using `merchant_mad_plus_extreme_iqr_v1` and merchant-only prior history;
- complete-month category shifts;
- coverage and segmentation evidence.

The incomplete cutoff month remains visible but is excluded from trend/category-shift calculations. The engine does not extrapolate the partial month.

`patternScore` is deterministic, not calibrated confidence. Future transactions never participate in an earlier candidate's amount baseline.

### Latest snapshot

```text
GET /api/v2/intelligence/historical-analysis/latest
```

Returns the newest snapshot owned by the authenticated user. If none exists it returns `404 historical_analysis_not_found`.

See [`historical-analysis.md`](historical-analysis.md), [`analysis-contracts.md`](analysis-contracts.md), [`evaluation-protocol.md`](evaluation-protocol.md) and [`occurrence-evaluation.md`](occurrence-evaluation.md) for algorithm and evaluation details.

## Offline category classifier boundary

`tfidf-logreg-v1` is evaluated in repository tooling with feature policy `merchant_descriptor_only_v1`, but it is not exposed as a production automatic-category API. Transaction categories therefore remain explicit application data rather than silently rewritten model output.

## Error contract

Both HTTP versions use the same safe envelope:

```json
{
  "error": {
    "code": "transaction_not_found",
    "message": "Transaction not found",
    "requestId": "0f32..."
  }
}
```

Validation failures may expose safe field-level `details`. The frontend maps failures into typed categories while retaining safe backend messages and request IDs.

| Condition | Client category |
| --- | --- |
| `422` | `validation` |
| `401` | `authentication` |
| `403` | `authorization` |
| `409` | `conflict` |
| `404` | `not_found` |
| `5xx` | `server` |
| network failure | `network` |

Semantic codes include `invalid_date_range`, `invalid_transaction`, `transaction_not_found`, `category_not_found`, `category_conflict`, `invalid_category`, `budget_not_found`, `budget_conflict`, `invalid_budget`, `intelligence_finding_not_found`, `historical_analysis_not_found`, `validation_error` and `cross_site_request_rejected`.

## Versioning policy

Breaking HTTP representation changes require a new URL version. Backwards-compatible fields/types may be added within an existing URL version.

The FastAPI application release identifier lives in `backend/app/version.py`. `rules-v2`, `historical-v2.2`, `merchant_mad_plus_extreme_iqr_v1`, `lifecycle-v1` and `tfidf-logreg-v1` are algorithm/model/policy identifiers, not URL versions. Their source of truth and change procedure are defined in [`analysis-contracts.md`](analysis-contracts.md).
