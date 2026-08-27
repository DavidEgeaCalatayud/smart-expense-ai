# API contracts

Smart Expense AI exposes versioned application contracts under `/api/v1` and `/api/v2`. `/health` is an infrastructure probe and unversioned `/api/*` application routes are unsupported.

Stable analytical identifiers are defined in `backend/app/analysis_contracts.py`; see [`analysis-contracts.md`](analysis-contracts.md).

## Version overview

`/api/v1` remains the compatibility contract. `/api/v2` is the strict financial/product contract used by the web application:

- transaction and budget monetary writes are JSON decimal strings;
- financial calculations remain PostgreSQL `NUMERIC` / Python `Decimal`;
- category suggestions are explicit user-controlled assistance;
- intelligence and historical evidence remain versioned and explainable.

Current analytical/model identifiers include:

```text
rules-v2
historical-v2.2
merchant_mad_plus_extreme_iqr_v1
lifecycle-v1
tfidf-logreg-v1
merchant_descriptor_only_v1
```

`tfidf-logreg-v1` is a production **suggestion** model. It is not an automatic categorization contract.

## Authentication and account controls

Browser sessions use an HttpOnly JWT cookie with issuer/audience/expiry/session-version validation.

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

Password changes require the current password, increment the persisted session version and rotate the successful caller's cookie while invalidating older tokens.

`GET /api/v1/auth/privacy-export` returns `privacy-export-v1`, scoped to the authenticated user. Persisted collections include:

```text
account
transactions
intelligenceFindings
intelligenceScans
historicalAnalysisSnapshots
importBatches
customCategories
budgets
categorySuggestions
```

`categorySuggestions` exports the user's persisted suggestion provenance/corrections, including transaction ID, canonical merchant key, source, model/feature contract, suggested/selected category IDs and acceptance/correction timestamps. Cross-account regression tests verify that another user's feedback does not appear in the export.

`DELETE /api/v1/auth/account` requires the current password and exact confirmation `DELETE`. User-owned transactions, imports, categories, budgets, category suggestion feedback and analytical records are removed through their database lifecycle rules, then the authentication cookie is cleared.

## Categories

Authenticated v1 category endpoints:

```text
GET    /api/v1/categories?includeArchived=false
POST   /api/v1/categories
PATCH  /api/v1/categories/{category_id}
POST   /api/v1/categories/{category_id}/archive
POST   /api/v1/categories/{category_id}/restore
```

Seeded system categories are global/read-only. Authenticated users may add account-owned categories. Conflicts are case-insensitive inside the visible category/type namespace.

Archiving supports either preserving historical assignments or reassigning them first to another active visible category of the same transaction type. Archived categories are unavailable for new transaction/category-budget selection until restored.

Legacy category service contracts remain preserved while authenticated transaction/import flows resolve active system + user categories.

## API v2 endpoint overview

```text
GET    /api/v2/transactions
POST   /api/v2/transactions
PUT    /api/v2/transactions/{transaction_id}
DELETE /api/v2/transactions/{transaction_id}

POST   /api/v2/category-suggestions/preview

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

`{"amount": 0.1}` is intentionally rejected with `422 validation_error`. Budget writes follow the same rule for `limitAmount`.

```text
PostgreSQL NUMERIC(12,2)
        <-> Python Decimal
        <-> API v2 decimal string
        <-> frontend integer cents
```

## Transactions

Transaction GET endpoints are paginated. Defaults are `page=1`, `pageSize=20`, `sort=newest`; `pageSize` is capped at 100.

Supported server filters include search, category, status, type, recurring, `dateFrom`, `dateTo` and sort. `dateFrom > dateTo` returns `invalid_date_range`.

Manual v2 create/update preserves the user's explicit category selection. A model suggestion never independently modifies `transactions.category_id`.

## Category suggestion and feedback contract

### Preview

```text
POST /api/v2/category-suggestions/preview
```

Request:

```json
{
  "merchant": "MERCADONA 3921",
  "type": "expense"
}
```

Example global response:

```json
{
  "categoryId": "...",
  "categoryName": "Food",
  "source": "global_model",
  "modelVersion": "tfidf-logreg-v1",
  "featurePolicy": "merchant_descriptor_only_v1"
}
```

A personalized response uses `source=user_history`, `modelVersion=user-merchant-history-v1` and `featurePolicy=canonical_merchant_feedback_v1`.

The response deliberately contains **no** `confidence`, probability vector or auto-assignment instruction.

### Resolution order

For the authenticated user:

1. normalize/canonicalize merchant identity;
2. look for the latest prior feedback for the same canonical merchant + transaction type;
3. reuse the selected category only if it remains active, visible and type-compatible;
4. otherwise run the global `tfidf-logreg-v1` classifier and choose from active compatible system categories.

The global classifier uses merchant descriptor text only. User-owned categories are learned only through the current user's feedback history, never by mutating the global taxonomy.

### Feedback persistence

The client does not submit authoritative model provenance when a transaction is saved. For a v2 manual create/update, the backend recomputes the applicable suggestion and persists transaction + feedback in the same database transaction.

Persisted feedback includes:

```text
user_id
transaction_id
merchant_key
transaction_type
source
model_version
feature_policy
suggested_category_id
selected_category_id
accepted
corrected_at
created_at
updated_at
```

If selected category equals suggested category, `accepted=true` and `corrected_at=null`. Otherwise the selected category becomes a real user correction label for future merchant-history personalization.

Transaction deletion cascades its suggestion feedback. Category references use `SET NULL` so historical feedback does not block category lifecycle operations. Account deletion cascades all user-owned feedback.

### Confidence policy

`CategoryClassifier.predict_with_probabilities()` remains available internally for evaluation/ranking. Raw probabilities are not product confidence.

Current synthetic diagnostics:

```text
raw       Brier 0.018193   ECE 0.082021
Platt     Brier 0.008871   ECE 0.004624
isotonic  Brier 0.009156   ECE 0.004711
```

These are development diagnostics only. `productConfidenceEnabled=false` remains explicit until representative real labelled data supports a calibration policy.

The canonical merchant-group-disjoint synthetic cold-start evaluation has 382 rows across nine held-out groups with zero group overlap, accuracy `0.400524` and macro-F1 `0.201242`. This is evidence against enabling automatic categorization now, not a production accuracy claim. The 2025 H2 benchmark holdout remains sealed.

## Analytics

`GET /api/v2/analytics/summary` returns exact decimal-string aggregates. `GET /api/v2/analytics/monthly-expenses?months=6` returns a continuous monthly series including zero-value months.

## Budgets

Budgets are user-owned planning records and never mutate transactions.

Database invariants:

```text
UNIQUE (user_id, month)
WHERE category_id IS NULL

UNIQUE (user_id, month, category_id)
WHERE category_id IS NOT NULL
```

`month` is `YYYY-MM` at the API boundary and persists as the first day of that month. `limitAmount` must be a positive decimal string. Category budgets may target only visible active expense categories.

Budget progress is calculated from persisted expense transactions. Archived categories retain historical budget visibility but cannot receive new budgets while archived.

## Financial intelligence findings

The current persisted actionable engine is `rules-v2`.

```text
recurring_pattern
recurring_payment_missing
duplicate_subscription
spending_anomaly
frequency_anomaly
```

Findings are user-scoped and idempotent by stable fingerprint. Review states are `open`, `dismissed` and `resolved`.

`rules-v2` recurrence uses canonical merchant identity and shared recurrence segmentation under `lifecycle-v1`. Amount anomalies use prior-only merchant history with `merchant_mad_plus_extreme_iqr_v1`; category-only history is insufficient for a merchant amount alert. Frequency anomalies compare current counts against prior active-month evidence and rolling seven-day bursts.

## Historical analysis

Current new-run diagnostic engine:

```text
historical-v2.2
```

Historical analysis is separate from review-state findings and never rewrites transactions. It provides month completeness, complete-month trend, canonical merchant evidence, recurrence segmentation, missed expected payments, prior-only merchant amount outliers, category shifts and coverage metadata. Older persisted snapshot versions remain readable.

See [`historical-analysis.md`](historical-analysis.md), [`analysis-contracts.md`](analysis-contracts.md), [`evaluation-protocol.md`](evaluation-protocol.md) and [`occurrence-evaluation.md`](occurrence-evaluation.md).

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
