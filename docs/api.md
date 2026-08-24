# API v1 contract

Smart Expense AI exposes its supported application API under `/api/v1`.

`/health` is intentionally outside the versioned application contract because it is an infrastructure probe. Unversioned `/api/*` application routes are not supported.

## Authentication

The browser session is carried in the existing HttpOnly JWT cookie. API examples below assume an authenticated session unless the endpoint is explicitly public.

Public endpoints:

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /health
```

Authenticated endpoints:

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

## Transaction pagination

`GET /api/v1/transactions` is always paginated.

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

Example response:

```json
{
  "items": [
    {
      "id": "f84a...",
      "merchant": "Market",
      "description": "Groceries",
      "category": "Food",
      "amount": 42.5,
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

## Transaction filters

Filters are applied in PostgreSQL before pagination.

Supported query parameters:

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
GET /api/v1/transactions?page=2&pageSize=10&type=expense&status=review&dateFrom=2026-08-01&dateTo=2026-08-31&sort=amount_high
```

A range where `dateFrom > dateTo` returns the semantic error code `invalid_date_range`.

## Analytics endpoints

### Summary

`GET /api/v1/analytics/summary` returns aggregates for the authenticated user's transactions:

```json
{
  "totalIncome": 2200.0,
  "totalExpenses": 910.5,
  "balance": 1289.5,
  "recurringCount": 4,
  "reviewCount": 1,
  "transactionCount": 18
}
```

Optional inclusive `dateFrom` and `dateTo` parameters allow month/range summaries without transferring the underlying rows to the browser.

### Monthly expenses

`GET /api/v1/analytics/monthly-expenses?months=6` returns a continuous monthly series, including zero-value months:

```json
[
  { "month": "2026-03", "amount": 720.5 },
  { "month": "2026-04", "amount": 0.0 },
  { "month": "2026-05", "amount": 840.0 }
]
```

`months` accepts values from 1 to 24. `through=YYYY-MM-DD` is available for deterministic consumers/tests; otherwise the server uses the current date.

## Financial intelligence

The Phase 3 intelligence contract is deterministic and explainable. The current ruleset is `rules-v1`; details and thresholds are documented in [`intelligence.md`](intelligence.md).

### Run analysis

```text
POST /api/v1/intelligence/scan
```

The endpoint analyses the authenticated user's persisted **expense** transactions and upserts findings by stable per-user fingerprint.

Example response:

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
GET /api/v1/intelligence/summary
```

Example:

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

Counts by finding type refer to **open** findings. Dismissed/resolved totals are reported separately.

### List findings

```text
GET /api/v1/intelligence/findings
```

Optional filters:

```text
status=open|dismissed|resolved
type=recurring_pattern|duplicate_subscription|spending_anomaly
```

Example finding:

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
    "amount": 85.0,
    "baselineMedian": 20.0,
    "baselineCount": 4,
    "ratio": 4.25,
    "threshold": 40.0
  },
  "ruleVersion": "rules-v1",
  "firstDetectedAt": "2026-08-24T10:15:00Z",
  "lastDetectedAt": "2026-08-24T10:15:00Z",
  "resolvedAt": null
}
```

### Review a finding

```text
PATCH /api/v1/intelligence/findings/{finding_id}
```

Body:

```json
{ "status": "dismissed" }
```

Accepted states are `open`, `dismissed` and `resolved`.

A dismissed finding remains dismissed across rescans for the same fingerprint. A resolved finding can be automatically reopened if later evidence satisfies the same rule again. Findings can also be manually reopened with `{ "status": "open" }`.

Cross-account finding IDs are treated as not found.

## Error contract

Application and validation failures use one envelope:

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
        "field": "pageSize",
        "message": "Input should be greater than or equal to 1",
        "type": "greater_than_equal"
      }
    ]
  }
}
```

The `requestId` matches the `X-Request-ID` response header and can be used to correlate a user-visible failure with application/security logs without exposing credentials or financial payloads.

Current semantic error codes include:

```text
invalid_date_range
invalid_transaction
transaction_not_found
intelligence_finding_not_found
validation_error
cross_site_request_rejected
```

Generic HTTP failures use `http_<status>`, for example `http_401` and `http_404`.

## Versioning policy

Breaking contract changes require a new URL version. Backwards-compatible additions may remain inside v1.

Examples of breaking changes:

- renaming/removing response fields;
- changing pagination shape;
- changing the meaning/type of an existing field;
- removing filters or accepted enum values;
- changing authentication semantics in a way that breaks existing v1 clients.

New optional fields, new endpoints, and new optional filters can normally be added without creating v2.
