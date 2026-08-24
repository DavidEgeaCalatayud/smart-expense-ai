# API contracts

Smart Expense AI exposes versioned application contracts under `/api/v1` and `/api/v2`.

`/health` is intentionally outside the versioned application contract because it is an infrastructure probe. Unversioned `/api/*` application routes are not supported.

## Version overview

`/api/v1` remains the backwards-compatible contract for existing clients. It includes authentication, categories, transactions, analytics and financial intelligence. Its transaction/analytics money fields remain JSON numbers because changing an existing field from number to string would violate the repository's versioning policy.

`/api/v2` is the strict money and analytical contract used by the web application:

- transaction amounts are decimal strings;
- aggregate monetary values are decimal strings;
- monetary values inside intelligence evidence are decimal strings;
- transaction write requests must send `amount` as a JSON string;
- JSON numeric amounts are rejected with HTTP `422`;
- historical-analysis evidence includes explicit completeness/canonicalization metadata.

Financial calculations do not use the v1 floating representation. PostgreSQL stores `NUMERIC(12,2)`, Python services operate on `Decimal`, and the v1 number conversion exists only at the legacy serialization boundary.

## Authentication

The browser session is carried in an HttpOnly JWT cookie and is shared by both API versions. Authentication and global category reference data remain under v1 because their contracts did not require a breaking change.

Public endpoints:

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /health
```

Authenticated v1 endpoints include auth/session, categories and the compatibility transaction/analytics/intelligence contracts.

Authenticated v2 endpoints:

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

For new clients, v2 is the supported money contract. A transaction write uses a decimal string:

```json
{
  "merchant": "Market",
  "description": "Groceries",
  "category": "Food",
  "amount": "42.50",
  "date": "2026-08-24",
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

Recharts is the only browser boundary that receives a JavaScript number; conversion happens after fixed-point financial arithmetic and is visualization-only.

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

Supported server-side filters:

| Parameter | Values / format | Behavior |
| --- | --- | --- |
| `search` | text | case-insensitive merchant or description search |
| `category` | category name | exact persisted category |
| `status` | `normal`, `review` | deterministic review status |
| `type` | `expense`, `income` | transaction type |
| `recurring` | `true`, `false` | recurring flag |
| `dateFrom` | `YYYY-MM-DD` | inclusive lower date bound |
| `dateTo` | `YYYY-MM-DD` | inclusive upper date bound |
| `sort` | `newest`, `oldest`, `amount_high`, `amount_low` | result ordering |

A range where `dateFrom > dateTo` returns `invalid_date_range`.

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

`0.10 + 0.20` is explicitly regression-tested as `"0.30"`.

### Monthly expenses

`GET /api/v2/analytics/monthly-expenses?months=6` returns a continuous series, including zero-value months. `months` accepts 1–24. `through=YYYY-MM-DD` is available for deterministic tests/consumers.

## Financial intelligence findings

The persisted actionable finding engine is `rules-v1`; thresholds and evidence are documented in [`intelligence.md`](intelligence.md).

```text
POST  /api/v2/intelligence/scan
GET   /api/v2/intelligence/summary
GET   /api/v2/intelligence/findings
PATCH /api/v2/intelligence/findings/{finding_id}
```

Findings are per-user, idempotent by stable fingerprint and have `open`, `dismissed` and `resolved` workflow states. A dismissed finding stays dismissed across equivalent rescans; a resolved finding can reopen when evidence reappears.

## Historical analysis

Historical analysis is a separate persisted diagnostic layer. It does not create review-state findings and does not mutate source transactions.

Current engine:

```text
historical-v2
```

Historical-v1 snapshots remain readable as previous baseline snapshots. New runs create historical-v2 results.

### Generate a snapshot

```text
POST /api/v2/intelligence/historical-analysis?months=12
```

`months` accepts 6–24. The period ends at the latest persisted expense date, making historical fixture analysis reproducible.

Historical-v2 returns:

- monthly expense totals with `isComplete`, `daysObserved`, `daysInMonth`;
- explicit `monthCompleteness` strategy and any excluded partial cutoff month;
- complete-month least-squares trend (`monthlySlope`, `rSquared`, direction);
- canonical-merchant recurring profiles;
- calendar-aware recurrence features and deterministic pattern score;
- missed expected occurrences / overdue schedule flag;
- chronological robust outliers using only earlier observations;
- raw + canonical merchant identity on merchant-level evidence;
- latest-three-complete-month vs previous-three-complete-month category shifts;
- data-coverage evidence.

Illustrative response fragment:

```json
{
  "analysisVersion": "historical-v2",
  "periodEnd": "2026-08-10",
  "monthCompleteness": {
    "strategy": "exclude_partial",
    "partialMonth": "2026-08",
    "completeMonthsUsed": 11,
    "reason": "The dataset cutoff falls before calendar month-end..."
  },
  "trend": {
    "direction": "increasing",
    "monthlySlope": "18.50",
    "averageMonthlySpend": "390.25",
    "rSquared": "0.742",
    "activeMonths": 10,
    "completeMonthsUsed": 11,
    "excludedPartialMonth": "2026-08"
  },
  "recurringProfiles": [
    {
      "merchant": "AMZN Mktp ES*84HG2",
      "canonicalMerchant": "amazon",
      "observedMerchants": ["AMZN Mktp ES*84HG2", "Amazon EU SARL"],
      "cadence": "monthly",
      "dayOfMonthStability": "0.960",
      "monthEndFit": "0.875",
      "amountCv": "0.021",
      "missedExpectedOccurrences": 1,
      "isExpectedPaymentMissing": true,
      "patternScore": "94.7",
      "nextExpectedDate": "2026-07-31"
    }
  ]
}
```

The partial cutoff month remains in `monthlySpend` for transparency but is not included in trend or category-shift calculations. Historical-v2 deliberately does not extrapolate partial-month spend.

`patternScore` is a deterministic feature index, not a calibrated probability. `R²` is descriptive regression evidence, not forecast accuracy.

Merchant canonicalization preserves original descriptors. The canonical value is analytical grouping evidence, not a destructive rewrite of the source transaction.

Historical outlier baselines are strictly chronological; future transactions never participate in an earlier candidate's baseline.

### Latest persisted snapshot

```text
GET /api/v2/intelligence/historical-analysis/latest
```

Returns the newest snapshot owned by the authenticated user. If none exists:

```text
404 historical_analysis_not_found
```

Snapshots are account-scoped and cascade-delete with the user.

For full algorithms, score features, completeness policy and walk-forward evaluation semantics, see [`historical-analysis.md`](historical-analysis.md).

## Error contract

Both versions use the same normalized safe error envelope:

```json
{
  "error": {
    "code": "transaction_not_found",
    "message": "Transaction not found",
    "requestId": "0f32..."
  }
}
```

Validation failures can expose safe field-level `details`. The frontend maps errors into typed categories while retaining the safe backend `message`, `requestId` and details:

| Condition | Client category | Typical UX |
| --- | --- | --- |
| `422` | `validation` | submitted-data feedback |
| `401` | `authentication` | authentication feedback |
| `403` | `authorization` | action-not-allowed feedback |
| `409` | `conflict` | conflict-specific feedback |
| `404` | `not_found` | missing-resource feedback |
| `5xx` | `server` | safe message + retry |
| network failure | `network` | connection feedback + retry |

Current semantic codes include `invalid_date_range`, `invalid_transaction`, `transaction_not_found`, `intelligence_finding_not_found`, `historical_analysis_not_found`, `validation_error` and `cross_site_request_rejected`.

## Versioning policy

Breaking contract changes require a new URL version. Backwards-compatible additions may remain within an existing version.

Changing money from JSON number to decimal string was breaking, so the strict representation entered v2 rather than silently changing v1. Historical-v2 is an **algorithm/snapshot version**, not a URL contract version; the added response evidence is backwards-compatible within API v2.
