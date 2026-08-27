# Smart Expense AI

Smart Expense AI is a personal-finance application built around persisted transaction data, account isolation, exact monetary arithmetic and explainable analysis. Machine-learning output is introduced as user-controlled assistance rather than silently rewriting financial records.

The product does **not** simulate AI results. Transactions, budgets, dashboard metrics, actionable findings, historical snapshots, recurring-payment projections and category-suggestion feedback come from PostgreSQL-backed workflows and reproducible algorithms.

## Current capabilities

### Persistent finance core

- PostgreSQL persistence through SQLAlchemy 2 and Alembic.
- Authenticated per-user transaction ownership.
- Transaction CRUD with server-side pagination, search, filters and sorting.
- Guided authenticated CSV history import with mapping, validation, normalization, per-user duplicate fingerprints and transactional import batches.
- User-managed custom categories with system/user ownership, explicit type, case-insensitive conflicts, rename, archive/reassign and restore semantics.
- Persisted monthly overall and per-expense-category budgets with `Decimal` limits and server-calculated progress.
- Server-side summary/monthly analytics.
- PostgreSQL `NUMERIC(12,2)` and Python `Decimal` for financial calculations.
- Decimal-string monetary contracts in `/api/v2` and integer-cent frontend arithmetic.
- Backwards-compatible `/api/v1` serialization for existing clients.
- Typed frontend API errors preserving safe backend messages, validation details and request IDs.

CSV ingestion deliberately accepts EUR only until a real FX/multi-currency accounting model exists. See [`docs/csv-import.md`](docs/csv-import.md).

### Accounts, privacy and security

- Registration, login and logout.
- Argon2 password hashing.
- Signed JWT sessions in HttpOnly, SameSite=Lax cookies.
- Issuer/audience/expiry/session-version validation.
- Password rotation with server-side session revocation and current-session rotation.
- Authenticated `privacy-export-v1` and confirmed account deletion.
- Privacy export covers transactions, intelligence/history records, import batches, custom categories, budgets and category-suggestion feedback, always scoped by authenticated user ownership.
- Trusted-host validation, restricted CORS and cross-site mutation protection.
- Nginx authentication rate limiting and browser security headers.
- `pip-audit`, `npm audit` and reproducible CycloneDX backend/frontend dependency SBOMs in CI.

### Actionable financial intelligence — `rules-v2`

The persisted findings engine uses canonical merchants, recurring streams and chronological baselines. Current finding types are:

```text
recurring_pattern
recurring_payment_missing
duplicate_subscription
spending_anomaly
frequency_anomaly
```

Highlights include lifecycle/calendar-aware recurrence, missed-payment evidence, duplicate-subscription signals, prior-only merchant amount anomalies using `merchant_mad_plus_extreme_iqr_v1`, frequency anomalies and persisted review states.

### Historical analysis — `historical-v2.2`

Historical analysis is a separate persisted diagnostic layer. It includes complete-month trend analysis, partial-month handling, auditable merchant canonicalization, recurrence segmentation under `lifecycle-v1`, missed expected occurrences, chronological merchant amount outliers, category shifts and versioned snapshots.

### Upcoming recurring payments — `recurring-calendar-v1`

The protected **Predictions** workspace now turns established `historical-v2.2` recurrence evidence into a visible upcoming-payment calendar. No additional ML model is introduced.

```text
historical-v2.2 recurring profile
        -> next expected date / cadence / lifecycle / price evidence
        -> recurring-calendar-v1
        -> upcoming payments + overdue schedules
```

The API returns exact decimal-string amounts for a bounded future window, defaulting to 30 days. Future items are classified as deterministic `expected`, `likely` or `price_changed` evidence states; overdue schedules are shown separately and excluded from `expectedTotal`.

Missing/dormant streams are deliberately not rolled forward into future months until a new transaction confirms activity. Price-continuity streams project the latest observed price regime rather than a stale historical median. Month-end monthly/quarterly/yearly schedules remain month-end aligned.

See [`docs/upcoming-payments.md`](docs/upcoming-payments.md).

### User-controlled category suggestions — `tfidf-logreg-v1`

The classifier is now a production **suggestion** path, not automatic categorization.

```text
merchant descriptor
      |
      +--> authenticated user's prior canonical-merchant feedback
      |          |
      |          +--> active visible compatible category
      |
      +--> otherwise global word + character TF-IDF
                    |
                    v
             Logistic Regression
                    |
                    v
          compatible system category

Suggested category
      |
      +--> Accept
      |
      +--> Change -> persisted correction label
```

Global model contract:

```text
modelVersion   = tfidf-logreg-v1
featurePolicy  = merchant_descriptor_only_v1
```

The global model remains merchant-text-only and targets seeded system categories. User-owned categories are learned only through that account's persisted correction history; they are never injected into the global taxonomy.

A suggestion never changes the selected transaction category until the user explicitly accepts it or chooses another category. API v2 transaction writes persist the transaction and its suggestion decision atomically, including source, model/feature contract, suggested category, selected category and acceptance/correction state.

The suggestion API deliberately exposes **no confidence percentage or probability vector**. Raw `predict_proba` values remain an evaluation primitive only.

### Category-classifier evidence

`financial-benchmark-v1` contains 2,560 complete synthetic category labels. Chronological development metrics remain very high when merchant identities repeat, but a canonical merchant-group-disjoint benchmark demonstrates the real cold-start weakness:

```text
merchant-group holdout
samples                  382
evaluation merchant groups 9
train/evaluation overlap   0
accuracy               0.400524
macro-F1               0.201242
weighted-F1            0.254513
```

Synthetic probability diagnostics on the separate 2023-fit / 2024-calibration / 2025-H1-evaluation protocol are:

| Method | Multiclass Brier | ECE |
| --- | ---: | ---: |
| Raw logistic probabilities | 0.018193 | 0.082021 |
| Platt scaling | 0.008871 | 0.004624 |
| Isotonic calibration | 0.009156 | 0.004711 |

These numbers are **synthetic development evidence**, not real-world banking accuracy. `productConfidenceEnabled=false` remains part of the evaluation contract. The 2025 H2 holdout stays sealed and is not used for development metrics.

See [`ai/category-classifier/README.md`](ai/category-classifier/README.md).

### Privacy-safe independent/private evaluation

The repository includes a `private-real-data-v1` evaluation harness for running the deployed category classifier, `rules-v2` and `historical-v2.2` against independently labelled transactions without committing financial records.

Local data lives under ignored `data/private/`. The evaluator emits only aggregate support/metrics and a SHA-256 dataset fingerprint; raw merchants, transaction IDs, row-level prediction errors and merchant-specific historical slices are deliberately omitted.

From `backend/`:

```bash
python scripts/evaluate_private_dataset.py \
  ../data/private \
  --mode development \
  --parameters-output ../data/private/historical-parameters.json \
  --output ../data/private/development-report.json
```

Development mode seals holdout, measures the **fixed production runtime classifier** rather than retraining on the private dataset, reports natural unseen-merchant support, compares raw/Platt/isotonic calibration only on calibration/validation data, evaluates transaction-level amount/frequency anomaly labels and reuses the established historical walk-forward/bootstrap machinery.

Opening holdout is a separate explicit action requiring frozen historical parameters and one preselected category calibration method. CI never needs or accesses private financial data; it verifies the contract with temporary synthetic fixtures.

See [`docs/private-evaluation.md`](docs/private-evaluation.md).

## Evaluation methodology

The repository favors chronological and leakage-aware evaluation over random time-series splits. Implemented methodology includes fold-local merchant identity, temporal recurrence labels, optimal stream matching, prospective occurrence evaluation, explicit calibration/validation/sealed holdout ranges, month-block confidence intervals, merchant-group cold-start classification, probability-calibration diagnostics and a privacy-safe aggregate-only path for independent/private labelled data.

Evidence hierarchy:

```text
small fixture -> regression protection
financial-benchmark-v1 -> synthetic development evidence
private-real-data-v1 harness -> mechanism for independent/private real evidence
independent / real labelled results -> real quality evidence
```

Having the private evaluator does **not** itself count as real-world validation. Real-world claims remain blocked until a genuinely independent/private labelled dataset is run and its aggregate results are reviewed.

## Analysis contracts: single source of truth

Stable engine/model/policy identifiers crossing code, API, benchmark and documentation boundaries are centralized in:

```text
backend/app/analysis_contracts.py
```

Current contracts include:

```text
rules-v2
historical-v2.2
recurring-calendar-v1
merchant_mad_plus_extreme_iqr_v1
lifecycle-v1
tfidf-logreg-v1
merchant_descriptor_only_v1
```

Ownership and change rules are documented in [`docs/analysis-contracts.md`](docs/analysis-contracts.md). CI checks critical documentation/version consistency.

## Not implemented yet

- Verified password reset/recovery through an email/token delivery channel.
- MFA.
- Automatic category assignment or per-user model retraining.
- User-facing calibrated category confidence; representative real labelled calibration evidence is still required.
- Automatic/background intelligence scans.
- Direct bank API integrations.
- Multi-currency/FX accounting and foreign-currency CSV import.
- Probabilistic fraud detection.
- Actual real-world validation/calibration results for classifier, `rules-v2` and `historical-v2.2`; the private harness exists but no private financial dataset is committed or claimed as evaluated evidence.
- End-of-month spending forecasts / Phase 4 forecasting baselines.
- Production staging/TLS/centralized monitoring.
- Container-image vulnerability scanning and image-level SBOM/provenance generation.

## Quick start with Docker

```bash
docker compose up --build
```

Open:

```text
http://localhost:5173
```

Production Compose path:

```text
Browser
  |
  v
Nginx + React :5173
  |
  v
FastAPI :8000 (internal)
  |  authenticated transaction/category/budget/import APIs
  |  category suggestion + persisted feedback
  |  rules-v2 findings
  |  historical-v2.2 diagnostics
  |  recurring-calendar-v1 upcoming payments
  v
PostgreSQL 16 :5432 (internal)
```

The backend runtime includes the `tfidf-logreg-v1` suggestion layer and `scikit-learn`; neither backend nor PostgreSQL is exposed directly to the host.

Stop with `docker compose down`. Use `docker compose down -v` only when intentionally deleting the database volume.

## Architecture

```text
React + TypeScript
        |
        v
Nginx reverse proxy
        |
        v
FastAPI /api/v1 + /api/v2
        |
        +--> transaction/category/budget/import services
        +--> category suggestions -> user feedback history / tfidf-logreg-v1
        +--> rules-v2 findings
        +--> historical-v2.2
        +--> recurring-calendar-v1
        |
        v
SQLAlchemy 2 -> PostgreSQL NUMERIC

Evaluation tooling
        +--> financial-benchmark-v1
        +--> chronological / cold-start / calibration reports
        +--> private-real-data-v1 aggregate-only local evaluation
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Repository structure

```text
smart-expense-ai/
├── frontend/        # React + TypeScript, Vitest, Playwright, Nginx
├── backend/         # FastAPI, persistence, ML runtime, evaluation, tests
│   ├── app/
│   ├── ml/
│   ├── benchmark/
│   ├── datasets/
│   ├── scripts/
│   └── tests/
├── data/private/    # local real-data evaluation; contents ignored except README
├── ai/              # model cards
├── docs/
├── .github/workflows/
├── compose.yaml
├── ROADMAP.md
├── CHANGELOG.md
├── SECURITY.md
├── LICENSE
└── README.md
```

## Main API groups

```text
/api/v1/auth/*
/api/v1/categories
/api/v2/transactions
/api/v2/category-suggestions/preview
/api/v2/analytics/*
/api/v2/imports/*
/api/v2/budgets
/api/v2/intelligence/*
```

Full contract: [`docs/api.md`](docs/api.md).

## Testing and CI

Backend:

```bash
cd backend
pip install -r requirements.txt -r requirements-dev.txt
pytest
```

Frontend quality chain:

```bash
cd frontend
npm ci
npm run test
npm run typecheck
npm run lint
npm run build
```

GitHub Actions additionally gates PostgreSQL migrations, critical Playwright E2E, Docker Compose, dependency security audits, the financial benchmark, lifecycle diagnostics, category classifier evaluation/calibration and CycloneDX SBOM generation. Backend unit coverage also generates a temporary synthetic private dataset and asserts that the aggregate-only report does not leak merchant strings or transaction IDs. Critical browser coverage now includes persisted recurring-history → upcoming-calendar projection.

See [`docs/testing.md`](docs/testing.md), [`docs/private-evaluation.md`](docs/private-evaluation.md) and [`docs/upcoming-payments.md`](docs/upcoming-payments.md).

## Documentation and governance

- [`ROADMAP.md`](ROADMAP.md) — implemented vs future work.
- [`CHANGELOG.md`](CHANGELOG.md) — Unreleased change log.
- [`docs/analysis-contracts.md`](docs/analysis-contracts.md) — analytical identifiers and ownership.
- [`docs/private-evaluation.md`](docs/private-evaluation.md) — local independent/private evaluation contract and privacy boundary.
- [`docs/upcoming-payments.md`](docs/upcoming-payments.md) — recurring calendar projection semantics.
- [`docs/api.md`](docs/api.md) — HTTP contracts.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — implemented architecture.
- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — persistence model.
- [`docs/testing.md`](docs/testing.md) — verification layers.
- [`SECURITY.md`](SECURITY.md) — vulnerability reporting/security policy.
- [`LICENSE`](LICENSE) — MIT license.
