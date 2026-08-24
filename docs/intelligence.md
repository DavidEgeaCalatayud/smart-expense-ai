# Financial intelligence rules

Smart Expense AI Phase 3 starts with deterministic, explainable rules over persisted transaction history. The implementation deliberately does not label these results as machine-learning predictions and does not expose invented confidence scores.

The current rule engine version is:

```text
rules-v1
```

Every analysis run and every persisted finding records that version so thresholds can evolve without hiding which logic produced an alert.

## Data flow

```text
Authenticated user
      |
      v
POST /api/v2/intelligence/scan
      |
      v
PostgreSQL NUMERIC(12,2) expense transactions
      |
      v
Python Decimal rules-v1
  | recurring-pattern rule
  | duplicate-subscription rule
  | amount-anomaly rule
      |
      v
finding candidates with decimal-string monetary evidence
      |
      v
idempotent fingerprint upsert
      |
      v
PostgreSQL intelligence_findings
      |
      v
open / dismissed / resolved review workflow
```

The engine reads only transactions owned by the authenticated user. Findings and scan history are also scoped by `user_id` and cascade-delete with the owning account.

No amount-based rule converts persisted money to Python `float`. Median amounts, tolerances, anomaly baselines and thresholds are evaluated with `Decimal`.

## Persisted entities

`intelligence_findings` stores:

- finding type;
- severity;
- review status;
- stable per-user fingerprint;
- rule version;
- user-facing title and explanation;
- structured JSON evidence;
- first/last detection timestamps;
- resolution timestamp when applicable.

Monetary values written into JSON evidence are canonical decimal strings such as `"9.99"` and `"85.00"`. This avoids introducing binary floating-point values into persisted intelligence evidence.

`intelligence_scans` stores:

- user;
- rule version;
- number of expense transactions analysed;
- number of findings produced;
- scan timestamp.

A repeated scan updates an existing finding with the same fingerprint instead of inserting duplicates. Open findings that no longer satisfy a rule are moved to `resolved`. A previously resolved finding is reopened if the evidence returns. A user-dismissed finding remains dismissed when the same fingerprint is detected again.

## Rule 1: recurring payment pattern

Purpose: identify a stable payment cadence from historical transactions without changing the transaction's manually supplied `isRecurring` field.

Requirements:

- same normalized merchant;
- at least 3 distinct charge dates;
- cadence median falls into one supported interval;
- at least 75% of observed intervals match that cadence, with a minimum of 2 matching intervals;
- every observed amount remains within 15% of the Decimal median amount.

Supported cadence windows:

| Cadence | Interval |
| --- | ---: |
| weekly | 5–9 days |
| biweekly | 12–16 days |
| monthly | 25–35 days |
| quarterly | 80–100 days |
| yearly | 350–380 days |

Evidence includes merchant, cadence, occurrence count, median amount, average interval, last charge date, expected next date and supporting transaction IDs.

This rule detects a recurring **pattern**, not a contractual subscription. Repeated purchases at the same merchant can satisfy the rule if their timing and amounts are sufficiently stable.

## Rule 2: possible duplicate subscription

Purpose: find repeated double-billing patterns rather than flagging a single accidental duplicate as a subscription problem.

Requirements:

- same normalized merchant;
- two charges occur within 7 days of each other;
- amounts differ by no more than the greater of 1 EUR or 5%;
- this near-duplicate pattern appears in at least 2 different calendar months.

The amount comparison uses Decimal arithmetic. Evidence includes merchant, affected months, number of duplicate pairs, approximate amount and supporting transaction IDs.

The finding is deliberately named **possible duplicate subscription**. Two legitimate services billed by the same merchant can match the rule, so user review is required.

## Rule 3: unusual amount at a known merchant

Purpose: flag a latest charge that is unusually high relative to the user's own history at that merchant.

Requirements:

- at least 4 earlier charges at the same normalized merchant;
- baseline uses up to the previous 12 charges;
- baseline centre is the Decimal median;
- dispersion uses median absolute deviation (MAD), with a conservative floor;
- candidate amount must exceed both a robust statistical threshold and 2× the historical median;
- the absolute increase over the median must be at least 20 EUR.

The robust threshold is:

```text
max(
  historical median * 2,
  historical median + 3 * robust spread
)
```

where `robust spread` is the maximum of MAD, 5% of the median, and 1 EUR.

A ratio of 3× or more is severity `high`; other qualifying anomalies are `warning`.

Evidence includes merchant, triggering transaction ID/date/amount, historical median, baseline count, ratio and threshold. In API v2 the monetary fields and ratio are serialized as decimal strings.

## Review states

Findings support three persisted states:

```text
open
  -> dismissed
  -> resolved
```

The UI also allows dismissed/resolved findings to be reopened.

- `open`: requires user attention.
- `dismissed`: user reviewed it and does not want the same fingerprint reopened automatically.
- `resolved`: condition is no longer active or the user explicitly resolved it; a later scan may reopen it if the evidence returns.

## API

The web application uses the decimal-safe v2 endpoints:

```text
POST  /api/v2/intelligence/scan
GET   /api/v2/intelligence/summary
GET   /api/v2/intelligence/findings
PATCH /api/v2/intelligence/findings/{finding_id}
```

The v1 equivalents remain available for backwards compatibility. Because v1 had already published numeric evidence examples, its response adapter keeps the known monetary evidence fields numeric. v2 normalizes those fields to decimal strings, including findings that may have been persisted before the decimal hardening.

`GET /findings` accepts optional `status` and `type` filters.

## Known limitations

`rules-v1` is intentionally conservative and is not a fraud detector or financial-advice system.

Known limitations include:

- merchant normalization does not yet map different processor labels to one canonical merchant;
- recurring-pattern detection can classify stable repeated purchases that are not subscriptions;
- duplicate-subscription detection requires the pattern in two months, so it intentionally misses one-off duplicate charges;
- amount anomalies need merchant-specific history and do not yet fall back to category-level baselines;
- rules use transaction dates and amounts only; no bank metadata, MCC codes or external merchant data are available;
- findings are refreshed when the user runs an analysis; automatic background scanning is not implemented yet.

## Validation strategy

The rules have unit tests for positive and negative threshold cases using Decimal inputs. PostgreSQL integration tests verify persistence, idempotent rescans, review-state persistence, cross-account isolation and versioned evidence representation.

The next Phase 3 validation step is to build labelled fixture datasets containing true positives and plausible false positives, then measure precision/recall per rule before loosening thresholds or adding probabilistic models.
