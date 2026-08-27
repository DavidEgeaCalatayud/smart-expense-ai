# Data model

This document describes the **implemented PostgreSQL persistence model**. The executable source of truth is the SQLAlchemy models and Alembic migrations under `backend/app/models/` and `backend/alembic/versions/`.

## Current persisted entities

```text
users
categories
transactions
import_batches
budgets
category_suggestions
intelligence_findings
intelligence_scans
historical_analysis_snapshots
```

Merchant identity and recurring streams remain derived analytical concepts rather than standalone authoritative tables.

## `users`

Application identity/authentication record.

| Column | Type / constraint | Purpose |
| --- | --- | --- |
| `id` | UUID PK | Stable user identifier. |
| `email` | string(320), unique, indexed | Login identity. |
| `display_name` | string(120) | Display name. |
| `password_hash` | string(255) | Argon2-compatible password hash. |
| `is_active` | boolean | Account active flag. |
| `session_version` | integer | Server-side session revocation version. |
| `created_at` | timestamptz | Creation time. |

Deleting a user cascades through account-owned records, including transactions, categories, imports, budgets, category suggestion feedback and analytical records according to their FK rules.

## `categories`

Categories have two ownership scopes: seeded system categories and account-owned custom categories.

| Column | Type / constraint | Purpose |
| --- | --- | --- |
| `id` | UUID PK | Category identifier. |
| `owner_user_id` | nullable UUID FK -> `users.id` | Null for system categories; user for custom categories. |
| `name` | string(80), indexed | Category label. |
| `transaction_type` | `expense` / `income` | Type compatibility. |
| `system_category` | boolean | Distinguishes global seeded taxonomy. |
| `archived` | boolean | Hides a user category from active selection while preserving history. |
| `created_at` | timestamptz | Creation time. |

Database constraints require system categories to have no owner and user categories to have an owner. Case-insensitive partial unique indexes protect system and per-user name/type namespaces independently.

A transaction category FK uses `ON DELETE RESTRICT`. Budgets and suggestion category references have lifecycle-specific FK behavior described below.

## `transactions`

Authoritative financial movement record.

| Column | Type / constraint | Purpose |
| --- | --- | --- |
| `id` | UUID PK | Transaction identifier. |
| `user_id` | UUID FK -> `users.id`, indexed | Mandatory owner. |
| `category_id` | UUID FK -> `categories.id`, indexed | User-selected persisted category. |
| `import_batch_id` | nullable UUID FK | CSV import lineage. |
| `import_fingerprint` | nullable string(64), per-user partial unique | Duplicate protection. |
| `merchant` | string(120) | Raw merchant/bank descriptor. |
| `description` | string(255) | User/import description. |
| `amount` | `NUMERIC(12,2)`, `> 0` | Exact amount. |
| `currency` | string(3), default `EUR` | Currency code. |
| `transaction_date` | date, indexed | Financial date. |
| `transaction_type` | `expense` / `income` | Movement type. |
| `payment_method` | constrained string | Card/cash/transfer/direct debit. |
| `is_recurring` | boolean | User/source flag, not analytical recurrence output. |
| `source` | `manual`, `import`, `bank_api` | Source contract. |
| `created_at` | timestamptz | Creation time. |
| `updated_at` | timestamptz | Last update. |

Money remains PostgreSQL `NUMERIC` / Python `Decimal`; API v2 uses decimal strings.

## `import_batches`

Audit record for authenticated CSV imports. It stores owner, filename/hash, row counts and creation metadata. Imported transactions reference the originating batch while duplicate fingerprints prevent duplicate account history.

## `budgets`

User-owned monthly planning records.

| Column | Type / constraint | Purpose |
| --- | --- | --- |
| `id` | UUID PK | Budget ID. |
| `user_id` | UUID FK -> `users.id` | Owner. |
| `category_id` | nullable UUID FK -> `categories.id` | Null for overall monthly budget. |
| `month` | date, first day of month | Budget period. |
| `limit_amount` | `NUMERIC(12,2)`, `> 0` | Exact limit. |
| `created_at` / `updated_at` | timestamptz | Audit timestamps. |

Partial unique indexes enforce one overall budget per user/month and one category budget per user/month/category.

## `category_suggestions`

Persisted provenance and user feedback for category suggestions. It is **not** an automatic categorization table: the authoritative category remains `transactions.category_id`.

| Column | Type / constraint | Purpose |
| --- | --- | --- |
| `id` | UUID PK | Feedback record. |
| `user_id` | UUID FK -> `users.id`, indexed | Owner / personalization boundary. |
| `transaction_id` | UUID FK -> `transactions.id`, unique | Transaction whose final category produced the label. |
| `merchant_key` | string(160) | Canonical merchant used for personalization lookup. |
| `transaction_type` | `expense` / `income` | Compatibility boundary. |
| `source` | `global_model` / `user_history` | Suggestion provenance. |
| `model_version` | string(80) | `tfidf-logreg-v1` or personalization version. |
| `feature_policy` | string(120) | Merchant/model or personalization feature contract. |
| `suggested_category_id` | nullable UUID FK -> `categories.id`, `SET NULL` | Category suggested at decision time. |
| `selected_category_id` | nullable UUID FK -> `categories.id`, `SET NULL` | Category ultimately selected by the user. |
| `accepted` | boolean | Whether selected == suggested. |
| `corrected_at` | nullable timestamptz | Correction timestamp when suggestion was changed. |
| `created_at` / `updated_at` | timestamptz | Audit timestamps. |

`transaction_id` is unique, so a manual v2 transaction has at most one current suggestion-feedback record. Transaction deletion cascades its feedback. Account deletion cascades all user-owned feedback. Category references use `SET NULL` so historical provenance does not block category/account lifecycle operations.

The personalization query is scoped by `(user_id, merchant_key, transaction_type)`. A prior selected category is reused only while it remains active, visible to that user and type-compatible.

## `intelligence_findings`

Persisted actionable output from `rules-v2`. It stores owner, finding type/severity/status, stable fingerprint, rule version, explanation/evidence and detection timestamps. `(user_id, fingerprint)` is unique.

Current finding types:

```text
recurring_pattern
recurring_payment_missing
duplicate_subscription
spending_anomaly
frequency_anomaly
```

## `intelligence_scans`

Audit record for explicit actionable-intelligence scans, including owner, rule version, analyzed transaction count, finding count and creation time.

## `historical_analysis_snapshots`

Versioned persisted diagnostic output. Current new runs use `historical-v2.2`. The JSON result contains monthly spend/completeness, trend, recurring profiles/segmentation evidence, amount outliers, category shifts and coverage. Older versions remain readable audit history.

## Relationships and ownership

```text
users 1 ─── N transactions
users 1 ─── N custom categories
users 1 ─── N import_batches
users 1 ─── N budgets
users 1 ─── N category_suggestions
users 1 ─── N intelligence_findings
users 1 ─── N intelligence_scans
users 1 ─── N historical_analysis_snapshots

categories 1 ─── N transactions
transactions 1 ─── 0..1 category_suggestions
```

Every private financial/analytical/feedback record is queried through authenticated ownership. Seeded categories are global/read-only.

## Derived vs authoritative data

```text
Authoritative source/user data
  users
  categories
  transactions
  budgets
  import_batches

Derived persisted workflow/audit/feedback data
  category_suggestions
  intelligence_findings
  intelligence_scans
  historical_analysis_snapshots

Derived non-authoritative concepts
  canonical merchant identity
  recurring streams
  lifecycle episodes
  price regimes
  temporal phases
  category suggestion probabilities
```

`tfidf-logreg-v1` can propose a category, but it never writes `transactions.category_id` without an explicit user-selected transaction write. Raw probabilities are not persisted or exposed as product confidence.

## Schema change discipline

A persistence change should include, as applicable:

1. SQLAlchemy model changes;
2. Alembic migration;
3. integration/API tests;
4. this document;
5. related architecture/API documentation;
6. `CHANGELOG.md` and `ROADMAP.md` alignment;
7. full CI on the final PR HEAD.

Analysis/model identifiers are centralized in `backend/app/analysis_contracts.py`; see [`analysis-contracts.md`](analysis-contracts.md).
