# API contracts

Smart Expense AI exposes versioned application contracts under `/api/v1` and `/api/v2`.

`/health` is intentionally outside the versioned application contract because it is an infrastructure probe. Unversioned `/api/*` application routes are not supported.

## Version overview

`/api/v1` remains the backwards-compatible contract for existing clients. It includes authentication, categories, transactions, analytics and financial intelligence. Its transaction/analytics money fields remain JSON numbers because changing an existing field from number to string would violate the repository's versioning policy.

`/api/v2` introduces the strict monetary representation used by the web application:

- transaction amounts are decimal strings;
- aggregate monetary values are decimal strings;
- monetary values inside intelligence evidence are decimal strings;
- transaction write requests must send `amount` as a JSON string;
- JSON numeric amounts are rejected with HTTP `422`.

Financial calculations do not use the v1 floating representation. PostgreSQL stores `NUMERIC(12,2)`, Python services operate on `Decimal`, and the v1 number conversion exists only at the legacy serialization boundary.

## Authentication

The browser session is carried in the existing HttpOnly JWT cookie and is shared by both API versions. Authentication and global category reference data remain under v1 because their contracts did not require a breaking change.

Public endpoints:

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /health
```

Authenticated v1 endpoints:

```text
GET    /api/v1/auth/me
GET    /api/v1/categories
GET    /api/v1/transactions
POST   /api/v1/transactions
PUT    /api/v1/transactions/{transaction_id}
DELETE /api/v1/transactions/{transaction_id}
GET    /api/v1/analytics/summary
GET    /api/v1/analytics/monthly-expenses
POST   /api/v1/intelligence/scan
GET    /api/v1/intelligence/summary
GET    /api/v1/intelligence/findings
PATCH  /api/v1/intelligence/findings/{finding_id}
```

Authenticated decimal-safe v2 endpoints:

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

For new clients, v2 is the supported money contract.

A transaction write uses a decimal string:

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

The string must represent a positive value with at most two decimal places and must fit the database's `NUMERIC(12,2)` constraint. For example, `"0.10"`, `"42"` and `"42.50"` are valid inputs. The API returns canonical two-decimal values after persistence.

This is intentionally invalid in v2:

```json
{ "amount": 0.1 }
```

It returns `422 validation_error`. Rejecting JSON numbers prevents an API consumer from accidentally passing an already-rounded IEEE-754 value into financial logic.

The precision invariant is therefore:

```text
PostgreSQL NUMERIC(12,2)
        <-> Python Decimal
        <-> API v2 decimal string
        <-> frontend integer cents for arithmetic
```

The chart library is the only browser boundary that receives a JavaScript number; conversion happens after fixed-point monetary processing and is used only for visualization.

## Transaction pagination

`GET /api/v2/transactions` and its v1 equivalent are always paginated.

Default parameters:

```text
page=1
pageSize=20
sort=newest
```

Constraints:

- `page >= 1`;
- `1 <= pageSize <= 100`;
- an empty result has `total=0` and `pages=0`.

Example v2 response:

```json
{
  "items": [
    {
      "id": "f84a...",
      "merchant": "Market",
      "description": "Groceries",
      "category": "Food",
      "amount": "42.50",
      "date": "2026-08-24",
      "type": "expense",
      "paymentMethod": "card",
      "status": "normal",
      "isRecurring": false
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1,
  "pages": 1
}
```

The equivalent v1 response keeps `"amount": 42.5` for compatibility.

## Transaction filters

Filters are applied in PostgreSQL before pagination.

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

Example:

```text
GET /api/v2/transactions?page=2&pageSize=10&type=expense&status=review&dateFrom=2026-08-01&dateTo=2026-08-31&sort=amount_high
```

A range where `dateFrom > dateTo` returns the semantic error code `invalid_date_range`.

## Analytics endpoints

### Summary

`GET /api/v2/analytics/summary` returns exact aggregates for the authenticated user's transactions:

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

A precision regression such as `0.10 + 0.20` is covered explicitly: the v2 summary must return `"0.30"`.

Optional inclusive `dateFrom` and `dateTo` parameters allow month/range summaries without transferring underlying rows to the browser.

### Monthly expenses

`GET /api/v2/analytics/monthly-expenses?months=6` returns a continuous monthly series, including zero-value months:

```json
[
  { "month": "2026-03", "amount": "720.50" },
  { "month": "2026-04", "amount": "0.00" },
  { "month": "2026-05", "amount": "840.00" }
]
```

`months` accepts values from 1 to 24. `through=YYYY-MM-DD` is available for deterministic consumers/tests; otherwise the server uses the current date.

## Financial intelligence findings

The persisted finding contract is deterministic and explainable. The current ruleset is `rules-v1`; details and thresholds are documented in [`intelligence.md`](intelligence.md).

### Run findings scan

```text
POST /api/v2/intelligence/scan
```

The endpoint analyses the authenticated user's persisted expense transactions and upserts findings by stable per-user fingerprint.

```json
{
  "scanId": "97a7...",
  "ruleVersion": "rules-v1",
  "analyzedTransactions": 42,
  "detectedFindings": 3,
  "scannedAt": "2026-08-24T10:15:00Z"
}
```

Repeated scans are idempotent for the same finding fingerprint. A scan also persists its transaction/finding counts for later summary display.

### Intelligence summary

```text
GET /api/v2/intelligence/summary
```

```json
{
  "openCount": 3,
  "recurringCount": 1,
  "duplicateSubscriptionCount": 1,
  "anomalyCount": 1,
  "dismissedCount": 0,
  "resolvedCount": 2,
  "lastScanAt": "2026-08-24T10:15:00Z",
  "analyzedTransactions": 42,
  "ruleVersion": "rules-v1"
}
```

Counts by finding type refer to open findings. Dismissed/resolved totals are reported separately.

### List findings

```text
GET /api/v2/intelligence/findings
```

Optional filters:

```text
status=open|dismissed|resolved
type=recurring_pattern|duplicate_subscription|spending_anomaly
```

Example v2 finding:

```json
{
  "id": "f63a...",
  "type": "spending_anomaly",
  "severity": "high",
  "status": "open",
  "title": "Unusual amount: Cloud Tools",
  "explanation": "The latest charge at Cloud Tools is 4.2× the median of 4 earlier charges at the same merchant.",
  "evidence": {
    "merchant": "Cloud Tools",
    "transactionId": "a902...",
    "transactionDate": "2026-05-01",
    "amount": "85.00",
    "baselineMedian": "20.00",
    "baselineCount": 4,
    "ratio": "4.25",
    "threshold": "40.00"
  },
  "ruleVersion": "rules-v1",
  "firstDetectedAt": "2026-08-24T10:15:00Z",
  "lastDetectedAt": "2026-08-24T10:15:00Z",
  "resolvedAt": null
}
```

The v1 intelligence endpoint preserves the previously published numeric representation for these evidence values. v2 normalizes both existing numeric findings and newly generated findings to decimal strings at the response boundary.

### Review a finding

```text
PATCH /api/v2/intelligence/findings/{finding_id}
```

Body:

```json
{ "status": "dismissed" }
```

Accepted states are `open`, `dismissed` and `resolved`. A dismissed finding remains dismissed across rescans for the same fingerprint. A resolved finding can be automatically reopened if later evidence satisfies the same rule again. Cross-account finding IDs are treated as not found.

## Historical analysis

Historical analysis is a separate, persisted diagnostic layer. It does not create review-state findings and does not mutate source transactions. The current version is `historical-v1`; formulas and limitations are documented in [`historical-analysis.md`](historical-analysis.md).

### Generate a snapshot

```text
POST /api/v2/intelligence/historical-analysis?months=12
```

`months` accepts values from 6 to 24. The period ends at the user's latest persisted expense date, making fixture and historical analysis reproducible.

The response contains:

- monthly expense totals;
- least-squares trend (`monthlySlope`, `rSquared`, direction);
- deterministic recurring-behavior profiles and their score components;
- chronological robust outliers using only earlier data;
- three-month versus three-month category shifts;
- data-coverage evidence.

Example shape:

```json
{
  "snapshotId": "a12f...",
  "analysisVersion": "historical-v1",
  "windowMonths": 12,
  "periodStart": "2025-07-01",
  "periodEnd": "2026-06-30",
  "analyzedTransactions": 42,
  "generatedAt": "2026-08-24T13:30:00Z",
  "trend": {
    "direction": "increasing",
    "monthlySlope": "18.50",
    "averageMonthlySpend": "390.25",
    "rSquared": "0.742",
    "activeMonths": 10
  },
  "recurringProfiles": [
    {
      "merchant": "Stream Box",
      "cadence": "monthly",
      "patternScore": "98.0",
      "medianAmount": "20.00"
    }
  ],
  "outliers": [
    {
      "merchant": "Cloud Tools",
      "amount": "80.00",
      "baselineScope": "merchant",
      "baselineMedian": "10.00",
      "deviationScore": "70.00"
    }
  ]
}
```

The recurring `patternScore` is a deterministic feature index, not a calibrated probability. `R²` is descriptive regression evidence, not a guarantee of predictive accuracy.

Historical outlier baselines are strictly chronological. Future transactions never participate in the baseline of an earlier candidate.

### Latest persisted snapshot

```text
GET /api/v2/intelligence/historical-analysis/latest
```

Returns the newest snapshot owned by the authenticated user. If none exists, the API returns:

```text
404 historical_analysis_not_found
```

Snapshots are account-scoped and cascade-delete with the user.

## Error contract

Both versions use the same normalized error envelope and preserve messages that the backend has deliberately made safe for clients:

```json
{
  "error": {
    "code": "transaction_not_found",
    "message": "Transaction not found",
    "requestId": "0f32..."
  }
}
```

Validation failures additionally expose safe field-level details:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed",
    "requestId": "0f32...",
    "details": [
      {
        "field": "amount",
        "message": "amount must be sent as a decimal string",
        "type": "value_error"
      }
    ]
  }
}
```

The frontend does not collapse these responses into one generic failure. Its API client maps transport/HTTP failures to typed categories while retaining `code`, safe `message`, `requestId` and `details`:

| Condition | Client category | Typical UX |
| --- | --- | --- |
| validation / `422` | `validation` | explain submitted-data problem |
| unauthenticated / `401` | `authentication` | authentication-specific feedback |
| forbidden / `403` | `authorization` | action-not-allowed feedback |
| conflict / `409` | `conflict` | conflict-specific feedback |
| missing / `404` | `not_found` | resource-not-found feedback |
| server / `5xx` | `server` | safe backend message + retry option |
| fetch/network failure | `network` | connection feedback + retry option |

The `requestId` matches the `X-Request-ID` response header and can be correlated with application/security logs without exposing credentials or financial payloads.

Current semantic error codes include:

```text
invalid_date_range
invalid_transaction
transaction_not_found
intelligence_finding_not_found
historical_analysis_not_found
validation_error
cross_site_request_rejected
```

Generic HTTP failures use `http_<status>`, for example `http_401` and `http_404`.

## Versioning policy

Breaking contract changes require a new URL version. Backwards-compatible additions may remain inside an existing version.

The decimal migration is the concrete example: changing `amount` from a JSON number to a decimal string was treated as breaking, so the strict representation was introduced in v2 instead of silently changing v1.

Examples of breaking changes:

- renaming/removing response fields;
- changing pagination shape;
- changing the meaning/type of an existing field;
- removing filters or accepted enum values;
- changing authentication semantics in a way that breaks existing clients.

New optional fields, new endpoints, and new optional filters can normally be added without creating another version.
