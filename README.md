# Smart Expense AI

Smart Expense AI is a personal-finance application built around persisted transaction data, account isolation and explainable analysis before probabilistic or machine-learning features are introduced into user-facing financial decisions.

The product does **not** simulate AI results. Transactions, dashboard metrics, actionable findings and historical-analysis snapshots come from PostgreSQL data and reproducible algorithms. An offline automatic category-classification baseline is now implemented and evaluated, but production auto-assignment, forecasting and calibrated ML confidence remain explicitly gated on stronger real-world evidence.

## Current capabilities

### Persistent finance core

- PostgreSQL persistence through SQLAlchemy 2 and Alembic.
- Authenticated per-user transaction ownership.
- Transaction CRUD with server-side pagination, search, filters and sorting.
- Server-side summary/monthly analytics.
- PostgreSQL `NUMERIC(12,2)` and Python `Decimal` for financial calculations.
- Decimal-string monetary contracts in `/api/v2` and integer-cent arithmetic in the frontend.
- Backwards-compatible `/api/v1` serialization for existing clients.
- Typed frontend API errors preserving safe backend messages, validation details and request IDs.

### Accounts and security baseline

- User registration/login/logout.
- Argon2 password hashing.
- Signed JWT sessions in HttpOnly, SameSite=Lax cookies.
- Issuer/audience/expiry validation.
- Trusted-host validation, restricted CORS and cross-site mutation protection.
- Nginx login/registration rate limiting and browser security headers.
- Dependency audits through `pip-audit` and `npm audit`.

### Actionable financial intelligence — `rules-v2`

The persisted findings engine now uses canonical merchants, recurring streams and chronological baselines rather than simple merchant-string grouping.

It produces five explainable finding types:

```text
recurring_pattern
recurring_payment_missing
duplicate_subscription
spending_anomaly
frequency_anomaly
```

Highlights:

- Canonical merchant grouping while retaining the original bank descriptor.
- Descriptor/amount/temporal recurring-stream segmentation, so one merchant can contain several independent recurring payments.
- Calendar-aware recurrence with deterministic `patternScore`, not fake probability.
- Separate expected-but-missing recurring-payment alerts with stronger history requirements.
- Same-period collision suppression so an extra charge inside one billing period does not manufacture a missing-payment alert.
- Possible duplicate-subscription detection across repeated near-duplicate months.
- Chronological amount anomalies using prior-only merchant history.
- Shared `merchant_mad_plus_extreme_iqr_v1` amount baseline combining median/MAD with an extreme IQR fence; heterogeneous category fallback is no longer treated as sufficient merchant-level evidence.
- Frequency anomalies based on prior active-month counts plus rolling seven-day burst evidence.
- Stable fingerprints and persisted `open`, `dismissed`, `resolved` workflow states.
- Separate summary counts for recurring, missing-recurring, duplicate, amount-anomaly and frequency-anomaly signals.

### Historical analysis — `historical-v2.2`

Historical analysis is a separate persisted diagnostic layer and does not create review-state findings automatically.

It includes:

- Complete-month least-squares spending trend analysis.
- Partial cutoff-month exclusion from trend/category-shift calculations without extrapolation.
- Auditable merchant canonicalization.
- Multiple recurring streams per merchant.
- Descriptor/amount plus conservative temporal-phase clustering.
- Calendar-aware cadence, month-end behavior, amount MAD/CV and history-depth features.
- Missed expected-occurrence evidence.
- Chronological robust amount outliers using the same merchant-specific distribution-aware amount baseline as `rules-v2`.
- Three-complete-month vs previous-three-complete-month category shifts.
- Versioned snapshots per authenticated user.

### Evaluated category classification — `tfidf-logreg-v1`

The repository now contains the first supervised ML baseline for automatic transaction categorization. It is deliberately an **offline evaluated model**, not a production auto-assignment path.

- TF-IDF over merchant descriptor text only.
- Word 1–2 grams plus character 3–5 grams for bank-descriptor variation.
- Logistic Regression with class balancing.
- 2,560 complete category labels from `financial-benchmark-v1`.
- Chronological development protocol: 2023 history -> 2024 calibration; unchanged pipeline refit on 2023+2024 -> 2025 H1 validation.
- 2025 H2 remains sealed.
- Reports macro-F1, accuracy, weighted F1, per-category precision/recall/F1/support and a confusion matrix.
- Separately reports seen-vs-unseen merchant performance so repeated synthetic merchants are not confused with cold-start generalization.
- Current synthetic validation macro-F1 is 0.994367, but unseen-merchant macro-F1 is only 0.20 on four rows; neither figure is presented as real-world banking accuracy.

See [`ai/category-classifier/README.md`](ai/category-classifier/README.md).

### Evaluation methodology

The repository includes labelled chronological evaluation harnesses rather than random train/test splitting for temporal financial behavior.

Implemented methodology includes:

- fold-local merchant identity to avoid future-descriptor leakage;
- temporal recurrence labels and explicit expected occurrences;
- optimal bipartite matching for stream labels;
- prospective next-occurrence evaluation using only the prior-month baseline;
- precision, recall, F1, false-positive cost, date/amount error metrics and slices;
- explicit calibration / validation / sealed holdout ranges;
- SHA-256-fingerprinted frozen parameter manifests before holdout evaluation;
- deterministic 95% month-block bootstrap confidence intervals with support and temporal-block reliability metadata;
- chronological category-classifier calibration/validation with macro-F1, per-category metrics, confusion matrices and merchant cold-start slices.

The included evaluation fixtures are synthetic and prove reproducibility/regression behavior only. They are **not** evidence of real-world accuracy.

## Not implemented yet

- Password reset/change and account deletion/privacy export controls.
- MFA.
- User-managed custom categories.
- Production automatic category assignment or personalized category-model training.
- Automatic/background intelligence scans.
- Bank integrations.
- Calibrated AI probabilities.
- Probabilistic fraud detection.
- Trained ML anomaly/forecasting models validated against labelled real-world data.
- Real-world calibration of `rules-v2` and `historical-v2.2` parameters.
- Spending forecasts / Phase 4 prediction.
- Production staging/TLS/centralized monitoring.

## Quick start with Docker

With Docker Desktop or Docker Engine + Compose v2:

```bash
docker compose up --build
```

Open:

```text
http://localhost:5173
```

The stack is:

```text
Browser
  |
  v
Nginx + React :5173
  |  security headers / rate limiting / /api/* proxy
  v
FastAPI :8000 (internal)
  |  authenticated user scoping
  |  Decimal financial domain
  |  rules-v2 actionable findings
  |  historical-v2.2 persisted analysis
  |  chronological evaluation harness
  v
PostgreSQL 16 :5432 (internal)
```

The category classifier is currently evaluated offline and is not loaded by the production Compose stack.

The backend and PostgreSQL are not published to the host in Compose. Nginx is the browser-facing entry point.

Stop the stack with:

```bash
docker compose down
```

Use `docker compose down -v` only when you intentionally want to remove the Compose database volume.

See [`docs/docker.md`](docs/docker.md).

## Architecture

```text
React + TypeScript
        |
        | MoneyAmount decimal strings
        | integer cents for monetary arithmetic
        | typed API error presentation
        v
Nginx reverse proxy
        |
        v
FastAPI /api/v1 + /api/v2
        |
        v
Authentication + user-scoped services
        |
        +---------------------------+
        |                           |
        v                           v
rules-v2 findings             historical-v2.2
        |                           |
        | canonical merchants       | snapshots
        | recurring streams         | trends/outliers
        | missing recurrence        | recurrence diagnostics
        | amount/frequency alerts   | evaluation evidence
        +-------------+-------------+
                      |
                      v
                 SQLAlchemy 2
                      |
                      v
             PostgreSQL NUMERIC(12,2)

Offline ML evaluation
        |
        v
merchant text -> TF-IDF -> Logistic Regression
        |
        v
category benchmark report (not production auto-assignment)
```

Inferred findings and historical snapshots are separate from source transactions. Neither engine silently rewrites a user's financial data.

Financial values do not pass through `float`/JavaScript `Number` in business logic. API v1 retains numeric money only as a compatibility serialization boundary. Recharts receives numeric plot coordinates only after fixed-point monetary arithmetic has completed.

## Repository structure

```text
smart-expense-ai/
├── frontend/        # React + TypeScript, tests and Nginx image
├── backend/         # FastAPI, SQLAlchemy, Alembic, intelligence and evaluation
│   ├── evaluation/  # labelled deterministic evaluation fixtures
│   ├── ml/          # reusable offline ML baselines/evaluation code
│   └── scripts/     # reproducible evaluation commands
├── ai/              # model cards and validated ML experiment documentation
├── docs/
├── compose.yaml
├── SECURITY.md
├── ROADMAP.md
└── README.md
```

## API

Authentication/shared categories remain under v1. Existing v1 transaction, analytics and intelligence endpoints remain available for compatibility.

New financial flows use v2:

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

A v2 amount is JSON text:

```json
{ "amount": "42.50" }
```

not a JSON number.

Errors use a stable envelope with semantic `code`, safe `message`, `requestId` and optional safe `details`.

See:

- [`docs/api.md`](docs/api.md) — HTTP contract.
- [`docs/intelligence.md`](docs/intelligence.md) — `rules-v2` actionable findings.
- [`docs/historical-analysis.md`](docs/historical-analysis.md) — historical algorithms.
- [`docs/evaluation-protocol.md`](docs/evaluation-protocol.md) — calibration/validation/holdout protocol.
- [`docs/occurrence-evaluation.md`](docs/occurrence-evaluation.md) — prospective recurring-occurrence evaluation.
- [`ai/category-classifier/README.md`](ai/category-classifier/README.md) — category classifier model card and metrics.

## Manual local development

Create environment configuration:

```bash
cp .env.example .env
```

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

Windows activation:

```powershell
.venv\Scripts\activate
```

Run the labelled historical fixture:

```bash
python scripts/evaluate_historical.py evaluation/historical_v2_fixture.json
```

Development evaluation with sealed holdout:

```bash
python scripts/evaluate_historical.py evaluation/historical_v2_fixture.json \
  --mode development \
  --parameters-output frozen-parameters.json \
  --output development-report.json
```

Run the category-classifier benchmark:

```bash
pip install -r requirements-dev.txt
python scripts/generate_benchmark_v1.py
python scripts/evaluate_category_classifier.py \
  datasets/benchmark_v1 \
  --output /tmp/category-classifier-report.json
```

### Frontend

```bash
cd frontend
npm ci
npm run dev
```

Quality commands:

```bash
npm run test
npm run typecheck
npm run lint
npm run build
npm audit --audit-level=high
```

## Testing and CI

GitHub Actions validates:

- clean PostgreSQL Alembic migrations;
- backend unit/integration tests;
- `rules-v2` recurrence, missing-payment, duplicate, amount and frequency finding behavior;
- `historical-v2.2` algorithms;
- chronological financial evaluation and sealed holdout protocol;
- TF-IDF + Logistic Regression category-classifier regression metrics, per-category metrics, confusion matrix structure and sealed holdout;
- TypeScript, ESLint, Vitest and production frontend build;
- Python/npm dependency audits;
- critical authenticated Playwright E2E;
- complete Docker Compose startup and API smoke contract.

The consolidated `Quality gate` requires backend, frontend, dependency security, E2E and Docker jobs to pass. Financial and category benchmark workflows run as additional model/evaluation gates. Repository-level branch protection is still a separate pending configuration task.

See [`docs/testing.md`](docs/testing.md).

## Security

- [`SECURITY.md`](SECURITY.md)
- [`docs/authentication.md`](docs/authentication.md)
- [`docs/SECURITY_REVIEW.md`](docs/SECURITY_REVIEW.md)

The security review is an engineering baseline, not a penetration-test certification. Internet-facing production still requires TLS, production secret management, monitoring/alerting and review of documented residual risks.

## Technology stack

Frontend: React 19, TypeScript, Vite, Tailwind CSS, Recharts, Vitest, React Testing Library, Playwright, Nginx.

Backend: Python 3.12, FastAPI, Pydantic, SQLAlchemy 2, PostgreSQL 16, Alembic, Psycopg 3, PyJWT, pwdlib/Argon2, pytest.

Offline ML evaluation: scikit-learn 1.9, TF-IDF and Logistic Regression.

Infrastructure: Docker, Docker Compose, GitHub Actions, Dependabot, pip-audit, npm audit.

## Near-term priorities

1. Run `rules-v2`, `historical-v2.2` and category classification against sufficiently large independent/real labelled data.
2. Improve category cold-start evidence with merchant-group evaluation and user-specific corrections before any production auto-assignment.
3. Continue reducing the remaining `frequency_anomaly` false-positive surface using labelled evidence rather than threshold chasing.
4. Calibrate financial thresholds only on calibration data, use validation for design decisions, then open final holdout once.
5. Only after deterministic baselines have real-world evidence, compare an ML anomaly candidate such as Isolation Forest.
6. Add automatic/background analysis when deployment scheduling exists and continue account/privacy/production-readiness work.

The detailed roadmap is maintained in [`ROADMAP.md`](ROADMAP.md).

## Author

Developed by [DavidEgeaCalatayud](https://github.com/DavidEgeaCalatayud).
