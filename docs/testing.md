# Testing and CI

Smart Expense AI uses layered automated verification for persistence, authentication, security controls, versioned API contracts, monetary precision, deterministic financial intelligence, historical analysis, evaluation semantics, offline ML baselines and critical browser flows.

Current analytical identifiers come from `backend/app/analysis_contracts.py`; see [`analysis-contracts.md`](analysis-contracts.md). Tests include explicit checks that those identifiers and the primary technical documentation do not silently drift apart.

## Backend

Install development dependencies from `backend`:

```bash
pip install -r requirements.txt -r requirements-dev.txt
```

Run pure/unit tests:

```bash
pytest -m "not integration"
```

Run the complete backend suite against the configured disposable PostgreSQL test database with:

```bash
pytest
```

Financial logic uses `Decimal`; money is not evaluated with binary floating-point business arithmetic.

## Actionable findings: `rules-v2`

Current pure/integration coverage includes:

- canonical merchant identity;
- multiple recurring streams under one merchant;
- monthly/quarterly/yearly and short-cadence recurrence evidence;
- recurring price continuity and its hard negatives;
- cancellation/dormancy/reactivation lifecycle behavior through shared recurrence primitives;
- missing expected-payment detection;
- same-period collision suppression;
- possible duplicate-subscription evidence;
- chronological merchant-only amount anomaly baselines;
- shared `merchant_mad_plus_extreme_iqr_v1` median/MAD/IQR evidence;
- minimum merchant-history requirements and no category-only fallback for amount alerts;
- frequency anomalies and their minimum prior-active-month guards;
- stable fingerprints, idempotent rescans and review-state behavior;
- decimal-string financial evidence.

`rules-v1` remains covered where compatibility/legacy behavior is intentionally retained, but `rules-v2` is the current actionable engine.

## Historical analysis: `historical-v2.2`

Historical tests assert algorithm properties rather than merely HTTP success:

- a partial latest month remains visible but is excluded from trend regression/category-shift calculations;
- category shifts compare complete months only;
- merchant canonicalization preserves raw descriptor evidence;
- fold-local merchant identity prevents future-descriptor leakage;
- month-end schedules survive February/30/31-day differences;
- recurrence exposes cadence, interval, calendar, amount-stability and history-depth evidence;
- amount-only temporal splitting requires stronger calendar/consecutive evidence;
- qualified price changes preserve stream identity without merging concurrent subscriptions;
- long dormant gaps do not become uninterrupted recurrence;
- reactivation requires an established prior episode plus fresh compatible current evidence;
- overdue expected payments and missed expected occurrences remain observable;
- amount outlier baselines contain only earlier transactions from the same canonical merchant;
- the shared amount baseline exposes MAD, quartiles, IQR and the extreme distribution fence;
- insufficient merchant history produces no amount outlier rather than borrowing heterogeneous category history;
- persisted snapshots identify `historical-v2.2` and expose recurrence segmentation version `lifecycle-v1`;
- older persisted snapshots remain readable through compatibility defaults.

## Analysis contract / documentation consistency

`backend/tests/unit/test_analysis_contracts.py` verifies that current modules alias the central contract registry:

```text
rules-v2
historical-v2.2
merchant_mad_plus_extreme_iqr_v1
lifecycle-v1
tfidf-logreg-v1
merchant_descriptor_only_v1
```

It also checks key current technical documents for those identifiers and rejects known stale claims such as `historical-v2.1` being current or category fallback being part of the current amount-anomaly policy.

This turns version/policy documentation debt into a CI failure instead of relying only on manual review.

## Labelled chronological financial evaluation

The historical/financial evaluation harness uses chronological monthly folds rather than random time-series splitting.

Run the checked-in historical regression fixture from `backend/`:

```bash
python scripts/evaluate_historical.py evaluation/historical_v2_fixture.json
```

The broader deterministic `financial-benchmark-v1` workflow additionally verifies:

- generated dataset hashes and label integrity;
- calibration/validation split discipline;
- sealed 2025 H2 holdout behavior;
- scenario-level recurrence, amount and frequency metrics;
- fold-local identity;
- deterministic optimal stream matching;
- prospective occurrence metrics;
- lifecycle/price-continuity diagnostics;
- protected amount-anomaly behavior.

The evidence hierarchy is:

```text
small fixture -> regression protection
financial-benchmark-v1 -> strong synthetic evaluation
independent / real labelled data -> real quality evidence
```

Synthetic evaluation is not presented as real-world banking accuracy.

## Category classifier benchmark

The first supervised categorization baseline is:

```text
model = tfidf-logreg-v1
featurePolicy = merchant_descriptor_only_v1
```

The dedicated category workflow:

- regenerates the 2,560-label deterministic benchmark;
- trains/evaluates chronologically rather than with a random split;
- keeps 2025 H2 sealed;
- reports macro-F1, accuracy and weighted F1;
- reports per-category precision/recall/F1/support;
- validates confusion-matrix structure/support;
- reports seen-vs-unseen merchant slices;
- runs deterministic model/protocol unit tests.

The currently high global synthetic validation score is not treated as proof of cold-start or real-world accuracy; unseen-merchant evidence remains a known limitation.

## PostgreSQL integration

Integration tests use PostgreSQL rather than SQLite. Create a disposable test database, point `TEST_DATABASE_URL` at it, migrate it, then run pytest.

PowerShell:

```powershell
$env:TEST_DATABASE_URL="postgresql+psycopg://postgres:postgres@localhost:5432/smart_expense_ai_test"
$env:DATABASE_URL=$env:TEST_DATABASE_URL
alembic upgrade head
pytest
```

Bash:

```bash
export TEST_DATABASE_URL="postgresql+psycopg://postgres:postgres@localhost:5432/smart_expense_ai_test"
export DATABASE_URL="$TEST_DATABASE_URL"
alembic upgrade head
pytest
```

The test bootstrap deliberately does not inherit a normal development database URL, reducing the risk of integration tests modifying development transactions.

Backend contract/security coverage includes:

- backwards-compatible `/api/v1` behavior;
- decimal-safe `/api/v2` transaction, analytics and intelligence behavior;
- exact `"0.10" + "0.20" = "0.30"` persistence/aggregation;
- v2 rejection of JSON numeric money;
- normalized error envelopes and validation details;
- transaction pagination/filtering;
- intelligence scan/summary/findings/review workflows;
- idempotent findings and cross-account isolation;
- Alembic migrations on a clean PostgreSQL database;
- persisted `historical-v2.2` snapshot creation/latest retrieval;
- partial-month and recurrence segmentation metadata;
- distribution-aware outlier evidence;
- historical snapshot isolation between accounts;
- authentication/JWT/security regressions.

## Frontend

Use locked dependencies:

```bash
cd frontend
npm ci
npm run test
npm run typecheck
npm run lint
npm run build
npm audit --audit-level=high
```

Browser money remains decimal strings/integer cents. Recharts receives JavaScript numbers only at its visualization adapter boundary after fixed-point arithmetic is complete.

The API client has direct typed-error tests for authentication, authorization, not-found, conflict, validation, server and network failures while retaining safe backend messages/request IDs.

Historical Analysis component coverage includes:

- partial-month exclusion notice;
- complete-month trend evidence;
- canonical merchant vs observed descriptor display;
- calendar-aware recurrence components;
- overdue expected-payment evidence;
- robust historical outlier evidence;
- persisted analysis reruns through the API.

## End-to-end

Playwright exercises the critical authenticated persisted-transaction flow against PostgreSQL/FastAPI/Vite. Algorithm depth is intentionally tested at service/integration/evaluation layers rather than forcing all financial semantics through one browser test.

## Docker contract/security smoke test

The deployment-style Compose job verifies:

- Nginx security headers;
- API `Cache-Control: no-store`;
- authenticated proxy behavior;
- exact decimal-money aggregation;
- generation/retrieval of the current persisted historical-analysis contract;
- partial-month completeness behavior;
- sparse historical data reported as insufficient rather than fabricated trend;
- v2 numeric-money rejection;
- normalized 404/401 behavior;
- authentication rate limiting;
- internal-only backend/PostgreSQL networking.

The offline category classifier is not loaded by the Compose production runtime.

## GitHub Actions

`.github/workflows/ci.yml` runs on pushes and pull requests targeting `main`.

Functional gates:

- **Backend tests**: dependencies, clean PostgreSQL migration, FastAPI import, pytest, historical regression evaluation and sealed-split checks.
- **Frontend quality**: locked npm install, Vitest, TypeScript, ESLint and production build.
- **Dependency security audit**: `pip-audit` and `npm audit --audit-level=high`.
- **Critical E2E**: PostgreSQL/FastAPI/Vite/Chromium flow.
- **Docker Compose smoke test**: deployment-style images and proxy/API contract.
- **Quality gate**: fails unless every functional gate succeeds.

Additional analysis/model gates:

- **Financial benchmark**: deterministic labelled financial benchmark and protected development scenarios.
- **Category classifier benchmark**: chronological TF-IDF/Logistic Regression evaluation and label/holdout contract.

Third-party Actions are pinned to immutable commit SHAs. Dependabot monitors Actions, pip and npm dependencies.

Repository-level branch protection/ruleset enforcement remains a separate pending production-readiness task; `Quality gate` should be configured as a required check before external collaboration relies on GitHub enforcement alone.
