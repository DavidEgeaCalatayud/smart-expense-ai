# API contracts

Smart Expense AI exposes versioned application contracts under `/api/v1` and `/api/v2`.

`/health` is intentionally outside the versioned application contract because it is an infrastructure probe. Unversioned `/api/*` application routes are not supported.

## Version overview

`/api/v1` remains the backwards-compatible contract for existing clients. Its transaction/analytics money fields remain JSON numbers at the serialization boundary.

`/api/v2` is the strict money and analytical contract used by the web application:

- transaction amounts are decimal strings;
- aggregate monetary values are decimal strings;
- monetary values inside intelligence evidence are decimal strings;
- transaction writes must send `amount` as a JSON string;
- JSON numeric amounts are rejected with HTTP `422`;
- historical-analysis evidence includes completeness/canonicalization metadata.

PostgreSQL stores `NUMERIC(12,2)` and Python financial services use `Decimal`. The v1 number conversion is compatibility serialization only.

Current FastAPI application version:

```text
1.4.0
```

## Authentication and account controls

The browser session is carried in an HttpOnly JWT cookie shared by both API versions. JWTs include a server-checked session-version claim; password changes increment the persisted account version and invalidate previously issued tokens.

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

`PUT /api/v1/auth/password` requires the current password and a different new password of at least 12 characters. A successful change rotates the current cookie and revokes older session versions.

`GET /api/v1/auth/privacy-export` returns `privacy-export-v1`, scoped to the authenticated user. It includes account identity fields, transactions, intelligence findings, scan metadata and historical-analysis snapshots. Password hashes, session-version internals and JWTs are excluded.

`DELETE /api/v1/auth/account` requires the current password plus the exact confirmation value `DELETE`. Successful deletion removes the user and database-cascaded user-owned financial/intelligence data and clears the authentication cookie.

Password reset by email is not part of the current contract because the project does not yet provide a verified recovery-token delivery channel.

Authenticated v2 endpoints include:

```text
GET    /api/v2/transactions
POST   /api/v2/transactions
PUT    /api/v2/transactions/{transaction_id}
DELETE /api/v2/transactions/{transaction_id}
GET    /api/v2/analytics/summary
GET    /api/v2/analytics/monthly-expenses
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

Recurring findings use canonical merchant identity plus descriptor/amount/temporal stream segmentation and calendar-aware recurrence features. `recurring_pattern` is informational and exposes an explainable deterministic `patternScore`, not a probability.

`recurring_payment_missing` is a separate warning/high signal requiring stronger history and a learned schedule. It can indicate cancellation, date changes or missing imported data; it does not assert a cause. Same-cadence-period extra charges suppress this missing-payment signal while the schedule is ambiguous.

### rules-v2 basic anomalies

`spending_anomaly` evaluates charges chronologically. Baselines use only earlier transaction amounts:

- canonical merchant baseline after at least 4 earlier charges, up to 12;
- otherwise category fallback after at least 8 earlier charges, up to 20.

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

Historical-v2.2 includes:

- monthly spend with explicit partial-month completeness;
- complete-month least-squares trend;
- auditable merchant canonicalization;
- descriptor/amount/temporal-phase recurring streams;
- calendar-aware recurrence features and pattern score;
- missed expected occurrences;
- chronological robust outliers with merchant/category baselines;
- complete-month category shifts;
- coverage and segmentation evidence.

The incomplete cutoff month remains visible but is excluded from trend/category-shift calculations. The engine does not extrapolate the partial month.

`patternScore` is deterministic, not calibrated confidence. Historical outlier baselines are chronological: future transactions never participate in an earlier candidate's amount baseline.

### Latest snapshot

```text
GET /api/v2/intelligence/historical-analysis/latest
```

Returns the newest snapshot owned by the authenticated user. If none exists it returns `404 historical_analysis_not_found`.

See [`historical-analysis.md`](historical-analysis.md), [`evaluation-protocol.md`](evaluation-protocol.md) and [`occurrence-evaluation.md`](occurrence-evaluation.md) for algorithm and evaluation details.

## Error contract

Both versions use the same safe envelope:

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

Semantic codes include `invalid_date_range`, `invalid_transaction`, `transaction_not_found`, `intelligence_finding_not_found`, `historical_analysis_not_found`, `validation_error` and `cross_site_request_rejected`.

## Versioning policy

Breaking HTTP representation changes require a new URL version. Backwards-compatible fields/types may be added within an existing version.

`rules-v2` and `historical-v2.2` are **algorithm versions**, not URL versions. API v2 remains the decimal-safe web contract while finding/snapshot versions identify which deterministic logic produced persisted analytical evidence.