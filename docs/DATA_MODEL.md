# Data model

This document describes the **implemented PostgreSQL persistence model**. It is not a list of proposed future entities.

The executable source of truth is the SQLAlchemy model/migration code under:

```text
backend/app/models/
backend/alembic/versions/
```

If this document and a migration disagree, the migrated schema wins and the documentation must be corrected in the same change.

## Current persisted entities

```text
users
categories
transactions
intelligence_findings
intelligence_scans
historical_analysis_snapshots
```

There are currently no separate persisted `merchants`, `recurring_expenses`, `alerts` or `insights` tables. Merchant identity and recurring streams are derived analytical evidence; actionable alerts are represented by `intelligence_findings`; historical diagnostics are represented by versioned snapshot JSON.

## `users`

Application identity and authentication record.

| Column | Type / constraint | Purpose |
| --- | --- | --- |
| `id` | UUID PK | Stable user identifier. |
| `email` | string(320), unique, indexed | Login identity. |
| `display_name` | string(120) | Display name. |
| `password_hash` | string(255) | Argon2-compatible stored password hash. |
| `is_active` | boolean | Account active flag. |
| `created_at` | timestamptz | Creation time. |

Deleting a user cascades to user-owned transactions/findings/scans/snapshots through their foreign-key rules.

## `categories`

Global seeded transaction categories. User-managed custom category persistence has not been introduced yet.

| Column | Type / constraint | Purpose |
| --- | --- | --- |
| `id` | UUID PK | Category identifier. |
| `name` | string(80), unique, indexed | Category label. |
| `transaction_type` | `expense` or `income` | Type compatibility. |
| `created_at` | timestamptz | Creation time. |

A category referenced by a transaction uses `ON DELETE RESTRICT`.

## `transactions`

Authoritative financial movement record.

| Column | Type / constraint | Purpose |
| --- | --- | --- |
| `id` | UUID PK | Transaction identifier. |
| `user_id` | UUID FK -> `users.id`, indexed | Mandatory owner. |
| `category_id` | UUID FK -> `categories.id`, indexed | Assigned persisted category. |
| `merchant` | string(120) | Raw merchant/bank descriptor; analytical canonicalization never overwrites it. |
| `description` | string(255) | User/import description. |
| `amount` | `NUMERIC(12,2)`, `> 0` | Exact financial amount. |
| `currency` | string(3), default `EUR` | Currency code. |
| `transaction_date` | date, indexed | Financial date. |
| `transaction_type` | `expense` or `income` | Movement type. |
| `payment_method` | `card`, `cash`, `bank_transfer`, `direct_debit` | Payment method. |
| `is_recurring` | boolean | User/source recurring flag; not the analytical recurrence prediction. |
| `source` | `manual`, `import`, `bank_api` | Data source contract. |
| `created_at` | timestamptz | Creation time. |
| `updated_at` | timestamptz | Last persisted update time. |

Money remains PostgreSQL `NUMERIC` / Python `Decimal`. API v2 serializes financial amounts as decimal strings.

### Merchant identity is derived, not persisted as a merchant table

The current analysis pipeline derives canonical merchant identity from `transactions.merchant` while retaining the raw descriptor. This avoids treating an analytical normalization result as authoritative source data.

### Recurrence is derived, not persisted as a recurring-expense table

Recurring profiles, price continuity, lifecycle reactivation and calendar phases are computed from transaction history. Historical snapshots may persist the resulting evidence as JSON; `rules-v2` may persist an actionable recurring finding. Neither path creates a standalone `recurring_expenses` entity.

## `intelligence_findings`

Persisted actionable output from the current `rules-v2` engine.

| Column | Type / constraint | Purpose |
| --- | --- | --- |
| `id` | UUID PK | Finding identifier. |
| `user_id` | UUID FK -> `users.id` | Owner. |
| `finding_type` | constrained string | `recurring_pattern`, `recurring_payment_missing`, `duplicate_subscription`, `spending_anomaly`, `frequency_anomaly`. |
| `severity` | `info`, `warning`, `high` | Action severity. |
| `status` | `open`, `dismissed`, `resolved` | Persisted review state. |
| `fingerprint` | string(255) | Stable per-user identity for idempotent rescans. |
| `rule_version` | string(32), default `rules-v2` | Engine that produced the finding. |
| `title` | string(180) | Short presentation title. |
| `explanation` | string(1200) | Human-readable evidence explanation. |
| `evidence` | JSONB | Versioned structured evidence; money is stored as decimal strings. |
| `first_detected_at` | timestamptz | First detection. |
| `last_detected_at` | timestamptz | Latest matching scan. |
| `resolved_at` | nullable timestamptz | Resolution time where applicable. |

`(user_id, fingerprint)` is unique. Additional user/status and user/type indexes support scoped review queries.

## `intelligence_scans`

Audit record for explicit actionable-intelligence scans.

| Column | Type / constraint | Purpose |
| --- | --- | --- |
| `id` | UUID PK | Scan identifier. |
| `user_id` | UUID FK -> `users.id` | Owner. |
| `rule_version` | string(32), default `rules-v2` | Executed rules contract. |
| `transaction_count` | integer | Number of analyzed transactions. |
| `finding_count` | integer | Number of matching findings for the scan. |
| `created_at` | timestamptz | Scan time. |

## `historical_analysis_snapshots`

Versioned persisted diagnostic output. Current new runs use `historical-v2.2`.

| Column | Type / constraint | Purpose |
| --- | --- | --- |
| `id` | UUID PK | Snapshot identifier. |
| `user_id` | UUID FK -> `users.id` | Owner. |
| `analysis_version` | string(32) | Historical engine contract that produced the result. |
| `window_months` | integer | Requested analysis window. |
| `transaction_count` | integer | Number of window transactions. |
| `period_start` | date | Analysis period start. |
| `period_end` | date | Analysis period end. |
| `result` | JSONB | Versioned analysis payload. |
| `created_at` | timestamptz | Generation time. |

The JSON result currently contains concepts such as monthly spend/completeness, trend, recurring profiles, recurrence segmentation metadata, amount outliers, category shifts and coverage. Older snapshot versions remain audit history and are read through compatibility defaults.

## Relationships and ownership

```text
users 1 ─── N transactions
users 1 ─── N intelligence_findings
users 1 ─── N intelligence_scans
users 1 ─── N historical_analysis_snapshots

categories 1 ─── N transactions
```

Every private financial/analytical record is queried through authenticated user ownership. Categories remain global/read-only in the current product.

## Derived vs authoritative data

```text
Authoritative / source data
  users
  categories
  transactions

Derived persisted workflow/audit data
  intelligence_findings
  intelligence_scans
  historical_analysis_snapshots

Derived non-authoritative concepts
  canonical merchant identity
  recurring streams
  lifecycle episodes
  price regimes
  temporal phases
  category classifier predictions (offline only)
```

The offline `tfidf-logreg-v1` category classifier does not currently write predictions into `transactions.category_id`.

## Schema change discipline

A persistence change should include, as applicable:

1. SQLAlchemy model changes;
2. an Alembic migration;
3. integration/API tests;
4. this document;
5. related architecture/API documentation;
6. `CHANGELOG.md`;
7. full CI on the final PR.

Analysis/model identifiers are separately centralized in `backend/app/analysis_contracts.py`; see [`analysis-contracts.md`](analysis-contracts.md).
