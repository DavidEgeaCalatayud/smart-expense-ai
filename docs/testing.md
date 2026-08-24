# Testing and CI

Smart Expense AI uses multiple test layers so persistence, authentication, security controls, versioned API contracts, monetary precision, deterministic intelligence rules, historical algorithms, evaluation semantics and critical browser flows are verified automatically.

## Backend

Install development dependencies from `backend`:

```bash
pip install -r requirements.txt -r requirements-dev.txt
```

Pure/unit tests:

```bash
pytest -m "not integration"
```

Financial logic uses `Decimal`, including review thresholds, intelligence rules and historical amount features.

### Finding-rule coverage

`rules-v1` pure-function coverage includes merchant normalization, recurring positive/negative cases, duplicate-subscription patterns, merchant anomaly baselines, minimum-history requirements and decimal-string evidence.

### Historical-v2 algorithm coverage

Historical-v2 tests assert algorithm properties rather than merely HTTP success:

- a partial latest month remains visible but is excluded from trend regression;
- category shifts use six complete months only;
- an increasing complete-month series produces a meaningful positive slope/R²;
- noisy bank descriptors are canonicalized without discarding raw merchant text;
- canonical aliases share merchant anomaly baselines;
- month-end schedules survive February/30/31-day calendar differences;
- recurrence exposes day-of-month, month-end and day-of-week stability;
- amount MAD and coefficient of variation remain separately observable;
- consecutive periods and missed expected occurrences are derived from the learned schedule;
- overdue expected recurring payments are surfaced as schedule evidence;
- outlier baselines contain only earlier transactions, preventing future-data leakage;
- category history is used only when canonical merchant history is insufficient.

## Labelled walk-forward evaluation

The evaluation harness lives in `app/services/historical_evaluation.py`. Labelled datasets use JSON under `backend/evaluation/`.

Run the included synthetic regression fixture from `backend/`:

```bash
python scripts/evaluate_historical.py evaluation/historical_v2_fixture.json
```

Persist a report:

```bash
python scripts/evaluate_historical.py \
  evaluation/historical_v2_fixture.json \
  --output evaluation-report.json
```

The harness uses monthly chronological folds, never random time-series splitting. It reports:

- precision;
- recall;
- F1;
- TP/FP/FN/TN;
- false positives per 100 evaluation transactions;
- false negatives;
- fold-level results;
- recurrence performance by history length and canonical merchant;
- anomaly performance by category.

The checked-in fixture proves reproducibility of the evaluator; it is synthetic and is **not** evidence of real-world accuracy. Real-world threshold calibration remains pending.

CI executes the fixture after pytest and validates the machine-readable report schema.

## PostgreSQL integration

Integration tests intentionally use PostgreSQL rather than SQLite. Create a disposable test database, point `TEST_DATABASE_URL` at it, migrate it, then run pytest.

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

The test bootstrap deliberately does not inherit a normal development database URL, reducing the risk of integration tests deleting development transactions.

Backend contract/security regression coverage includes:

- backwards-compatible `/api/v1` behavior;
- decimal-safe `/api/v2` transaction, analytics and intelligence behavior;
- exact `"0.10" + "0.20" = "0.30"` persistence/aggregation;
- v2 rejection of JSON numeric money;
- normalized error envelopes and validation details;
- server-side transaction pagination/filtering;
- intelligence scan/summary/findings/review workflows;
- idempotent findings and cross-account finding isolation;
- migration `0005_historical_analysis`;
- persisted `historical-v2` snapshot creation/latest retrieval;
- explicit partial-month metadata;
- canonical merchant evidence in historical responses;
- 6–24 month historical window validation;
- historical snapshot isolation between accounts;
- authentication/JWT/security-header regressions.

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

Browser money remains decimal strings/integer cents. Recharts receives JavaScript numbers only at its visualization adapter boundary.

The API client has direct typed-error tests for authentication, authorization, not-found, conflict, validation, server and network failures while retaining safe backend messages/request IDs.

HistoricalAnalysisPanel tests now cover:

- partial-month exclusion notice;
- complete-month trend evidence;
- canonical merchant vs observed descriptor display;
- calendar-aware recurrence components;
- overdue expected payment evidence;
- robust historical outlier evidence;
- rerunning a persisted 12-month snapshot through the API.

## End-to-end

Playwright exercises the critical authenticated persisted-transaction flow against PostgreSQL/FastAPI/Vite. Financial-intelligence algorithm depth is intentionally covered by pure tests, integration tests, component tests, evaluation tests and Docker smoke checks rather than making one browser flow excessively large.

## Docker contract/security smoke test

The deployment-style Compose job verifies:

- Nginx security headers;
- API `Cache-Control: no-store`;
- authenticated proxy behavior;
- exact decimal-money aggregation;
- generation/retrieval of a persisted `historical-v2` snapshot;
- `exclude_partial` month-completeness policy through Nginx;
- sparse historical data reported as `insufficient_data` rather than fabricated trend;
- v2 numeric-money rejection;
- normalized 404/401 behavior;
- authentication rate limiting;
- internal-only backend/PostgreSQL networking.

## GitHub Actions

`.github/workflows/ci.yml` runs on pushes and pull requests targeting `main`.

Functional gates:

- **Backend tests**: dependencies, clean PostgreSQL migration, FastAPI import, pytest and historical-v2 walk-forward evaluation fixture.
- **Frontend quality**: locked npm install, Vitest, TypeScript, ESLint and production build.
- **Dependency security audit**: `pip-audit` and `npm audit --audit-level=high`.
- **Critical E2E**: real PostgreSQL/FastAPI/Vite/Chromium flow.
- **Docker Compose smoke test**: actual deployment-style images and proxy contract.
- **Quality gate**: fails unless every functional gate succeeds.

Third-party Actions are pinned to immutable commit SHAs. Dependabot monitors Actions, pip and npm dependencies.

Configure `Quality gate` as a required status check in the repository ruleset/branch protection for real merge enforcement.
