# Analytics correctness and intelligence-scan concurrency

This document records backend correctness invariants that are easy to regress because they depend on temporal boundaries, stable ordering and transaction concurrency rather than only on API shape.

## Monthly expense as-of boundary

`monthly_expenses(db, user_id, months=..., through=...)` is an as-of query.

Its persisted transaction window is inclusive on both sides:

```text
start_month <= transaction_date <= through
```

The upper bound is mandatory even when `through` falls inside the final calendar month. For example, an evaluation through `2026-08-15` must not include transactions dated `2026-08-20` or `2026-08-31` in the August bucket.

This is a causal/correctness guarantee, not merely a display rule. Callers may use the aggregation in historical comparisons, so future-in-window leakage is prohibited.

## Deterministic transaction pagination

Offset pagination requires a total ordering. Transaction lists therefore order by:

1. the requested primary sort (`transaction_date` or `amount`);
2. `created_at DESC`;
3. `id DESC` as the final unique tiebreaker.

The UUID tiebreaker prevents rows that share both the business sort value and creation timestamp from changing relative order between repeated page reads solely because PostgreSQL is free to return tied rows in any physical order.

This makes a static dataset deterministic. Offset pagination still cannot provide snapshot isolation against rows inserted or deleted between separate page requests; cursor/keyset pagination would be a separate product/API decision.

## Category ownership boundary

Transaction write paths resolve categories only through `_get_visible_category(db, user_id, ...)`, which delegates to account-aware active-category resolution.

The legacy ownership-blind `_get_category()` helper has been removed so a future write path cannot accidentally bypass user visibility/ownership rules by importing it.

Unknown category and incompatible transaction-type errors remain distinct.

## Financial-intelligence scan serialization

`IntelligenceFinding` has a database uniqueness invariant on:

```text
(user_id, fingerprint)
```

A read-existing -> generate candidates -> insert-new sequence can race if two scans for the same user execute concurrently. The unique constraint protects integrity but, by itself, would allow one scan transaction to fail with `IntegrityError`.

The service therefore acquires a PostgreSQL transaction-scoped advisory lock before reading the user's expense snapshots:

```text
pg_advisory_xact_lock(scan_lock_key(user_id))
```

Properties:

- scans for the same user serialize until commit/rollback;
- scans for different users use different lock keys and are not globally serialized;
- the lock is released automatically with the database transaction;
- the existing `(user_id, fingerprint)` unique constraint remains the final integrity backstop;
- existing `open`, `dismissed` and `resolved` finding semantics are unchanged;
- expense snapshot ordering also ends with transaction `id` so equal date/creation timestamps are deterministic.

The integration regression uses two independent SQLAlchemy sessions against PostgreSQL and asserts that the rules section never overlaps for the same user, both scans succeed, five unique findings remain and two scan records are persisted.

## Performance work is evidence-driven

This correctness change deliberately does **not** add a transaction composite index or a trigram/text-search index.

The central transaction query shape is commonly:

```text
user_id + transaction_date range/order
```

and free-text search currently uses case-normalized substring matching. Before changing indexes, measure representative production-scale plans with PostgreSQL, including:

```sql
EXPLAIN (ANALYZE, BUFFERS)
```

Candidate work can then evaluate, based on measured selectivity and cost:

- `transactions(user_id, transaction_date, id/created_at)` variants for account-scoped temporal reads;
- `pg_trgm`/GIN indexes for substring merchant/description search;
- keyset pagination if offset costs or cross-request churn become material.

Indexes should be introduced only with before/after plans and representative cardinality, not as part of a correctness hotfix.
