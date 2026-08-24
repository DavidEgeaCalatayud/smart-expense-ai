# Smart Expense AI

Smart Expense AI is a personal finance application built around reliable persisted transaction data, account isolation and explainable analysis before predictive or machine-learning features are introduced.

The current product does **not** simulate AI results. Transactions, dashboard metrics, persisted findings and historical-analysis snapshots come from PostgreSQL data and reproducible algorithms. Forecasting, automatic classification and calibrated confidence metrics remain explicitly unimplemented until they can be validated.

## Current Capabilities

Implemented today:

- User registration, login and logout.
- Argon2 password hashing and a 12-character registration minimum.
- Signed JWT sessions stored in HttpOnly, SameSite=Lax cookies with issuer/audience/expiry validation.
- Mandatory secure auth cookies and disabled debug/API docs in production configuration.
- Mandatory per-user transaction ownership and API-level data isolation.
- Trusted-host validation, restricted CORS and cross-site mutation defense.
- Nginx login/registration rate limiting and browser security headers.
- Security event logging without passwords, emails, request bodies, JWTs or cookies.
- Backwards-compatible `/api/v1` plus decimal-safe monetary `/api/v2` contracts.
- PostgreSQL `NUMERIC(12,2)` and Python `Decimal` throughout financial calculations.
- Decimal-string money over API v2 and integer-cent arithmetic in the frontend instead of IEEE-754 financial arithmetic.
- Typed frontend API failures for validation, authentication, authorization, conflict, not-found, server and network errors while preserving safe backend messages/request IDs.
- Paginated transaction listing with server-side search, category, status, type, recurring, date-range and sort filters.
- Normalized API error envelopes with semantic codes and request IDs.
- Server-side summary and monthly-expense analytics endpoints.
- Persistent transaction creation, editing, deletion and listing.
- PostgreSQL persistence through SQLAlchemy 2.
- Alembic schema migrations and initial category seeding.
- Persisted shared categories exposed through authenticated `GET /api/v1/categories`.
- Category/type validation for expense and income transactions.
- Dashboard metrics derived from server-side aggregates for the authenticated user.
- Six-month expense trend served by the analytics API.
- Five most recent transactions loaded through the paginated API.
- Recurring transactions stored as an explicit user-provided flag.
- Transparent rule-based review: expenses above 120 EUR are marked as `review`.
- Persisted Phase 3 financial-intelligence findings and scan history per authenticated user.
- Explainable recurring-payment, duplicate-subscription and robust amount-anomaly findings.
- Stable `rules-v1` fingerprints and persisted `open`, `dismissed` and `resolved` review states.
- Versioned historical-analysis snapshots persisted per user; `historical-v1` remains the previous baseline and new runs use `historical-v2`.
- Complete-month least-squares spending trend analysis: partial cutoff months remain visible but are excluded from regression and category-shift windows.
- Auditable merchant canonicalization that preserves raw bank descriptors while consolidating references, legal suffixes, aliases and only high-similarity variants.
- Calendar-aware recurring-behavior scores using cadence, interval regularity, day-of-month/month-end/day-of-week stability, amount MAD/CV, history depth and consecutive periods.
- Detection of missed expected recurring occurrences and overdue learned schedule dates.
- Chronological robust outlier analysis with no future-data leakage and canonical-merchant/category fallback baselines.
- Latest-three-complete-month versus previous-three-complete-month category spending shifts.
- Labelled monthly walk-forward evaluation harness reporting precision, recall, F1, false positives per 100 transactions, false negatives and performance slices.
- Financial Intelligence workspace for findings plus historical behavior analysis with completeness/canonicalization evidence.
- Delete confirmation, loading/refreshing states, retry feedback and operation toasts in transaction management.
- Backend unit and PostgreSQL integration tests with pytest.
- Frontend component/page tests with Vitest and React Testing Library.
- Critical authenticated browser coverage with Playwright, including cross-account isolation.
- GitHub Actions quality gates for migrations, tests, historical evaluation, TypeScript, ESLint, production builds, dependency auditing and Docker Compose.
- Weekly Dependabot monitoring for Python, npm and GitHub Actions dependencies.
- One-command Docker Compose environment for frontend, backend and PostgreSQL.

Not implemented yet:

- Password reset/change and account deletion/privacy export controls.
- MFA.
- Centralized security log monitoring/alerting.
- User-managed custom categories.
- Calibrated AI confidence probabilities.
- Automatic transaction classification.
- Spending forecasts.
- Automatic/background intelligence scans.
- Bank integrations.
- Probabilistic fraud detection.
- Trained ML anomaly/forecasting models validated against labelled real-world data.
- Real-world calibration of `historical-v2` thresholds and recurrence weights.

## Quick Start with Docker

With Docker Desktop or Docker Engine + Compose v2 installed, start the complete application from the repository root:

```bash
docker compose up --build
```

Then open:

```text
http://localhost:5173
```

Create an account on first use. The full stack is:

```text
Browser
  |
  | v1 auth/categories + v2 money/intelligence
  v
frontend :5173 (Nginx + React build)
  |
  | security headers + rate limiting + /api/*
  v
backend :8000 (FastAPI + Alembic, internal only)
  |
  | Decimal money + authenticated user_id scoping
  | rules-v1 + historical-v2 + walk-forward evaluation
  v
db :5432 (PostgreSQL 16 NUMERIC(12,2), internal only)
```

The Compose backend is intentionally not published to the host. Nginx is the only browser-facing entry point. For direct backend development, run Uvicorn locally from `backend/`; development API docs are then available at `http://localhost:8000/docs`.

Stop the stack with:

```bash
docker compose down
```

The PostgreSQL named volume is retained. Use `docker compose down -v` only when you intentionally want to delete the Compose-managed database.

Existing transactions created before the authentication migration are preserved under a temporary inactive legacy owner. The first active account registered after migration automatically claims that pre-authentication history.

See [`docs/docker.md`](docs/docker.md) for architecture, health checks, logs and reset instructions.

## Architecture

```text
React + TypeScript
        |
        | MoneyAmount decimal strings
        | integer cents for browser monetary arithmetic
        | typed API error presentation
        v
Nginx reverse proxy
        | rate limits + CSP/security headers
        v
FastAPI /api/v1 + /api/v2
        | v1 legacy money serialization only
        | v2 decimal-string monetary contract
        | pagination + filters + normalized errors
        v
Authentication + service layer
        | Python Decimal for monetary decisions/aggregates
        | user-scoped transaction/finding/snapshot queries
        v
Financial intelligence
        | rules-v1 persisted actionable findings
        | merchant canonicalization
        | historical-v2 persisted analytical snapshots
        | complete-month trend + calendar-aware recurrence
        | chronological robust outliers + complete-month category shifts
        | labelled walk-forward evaluation harness
        v
SQLAlchemy 2
        |
        v
PostgreSQL NUMERIC(12,2)
```

Financial values do not move through `float`/JavaScript `Number` in business logic. API v1 keeps numeric money only as a compatibility serialization adapter; new frontend financial flows use v2 decimal strings. Recharts requires numeric plot coordinates, so fixed-point values are converted to JavaScript numbers only at that visualization boundary, after all financial arithmetic has completed.

The findings engine keeps inferred findings separate from source transactions. The historical engine also stores results separately as versioned snapshots; neither silently rewrites source financial data.

Historical outlier baselines are chronological: a candidate transaction may only be compared with transactions that occurred before it. This prevents future-data leakage and makes the algorithm suitable for offline evaluation. Historical-v2 also treats an incomplete cutoff month conservatively: it is displayed but never fed into trend/category-shift calculations.

Merchant canonicalization is auditable. Raw descriptors remain in the response alongside canonical merchant identities and observed aliases.

Database schema changes are managed with Alembic. In Docker Compose, the backend automatically applies `alembic upgrade head` after PostgreSQL becomes healthy and before Uvicorn starts.

Repository structure:

```text
smart-expense-ai/
├── frontend/        # React + TypeScript web application and Nginx image
├── backend/         # FastAPI API, auth, analysis, evaluation, SQLAlchemy models and migrations
│   ├── evaluation/  # labelled evaluation datasets/fixtures
│   └── scripts/     # reproducible evaluation commands
├── ai/              # reserved for future validated probabilistic/ML experiments
├── docs/            # product, API, intelligence, historical-analysis, testing and security docs
├── scripts/         # repository utility scripts
├── compose.yaml
├── SECURITY.md
├── ROADMAP.md
└── README.md
```

## API

Authentication and shared category data remain under v1:

```text
GET    /health
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/auth/me
GET    /api/v1/categories
```

Existing v1 transaction, analytics and intelligence endpoints remain available for compatibility. Their published numeric monetary representation is preserved at the response boundary.

New frontend financial flows use the strict v2 endpoints:

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

A v2 amount is represented as JSON text:

```json
{ "amount": "42.50" }
```

not:

```json
{ "amount": 42.5 }
```

Transaction listing is paginated and filtered server-side. Errors use a stable envelope with `code`, safe `message`, `requestId` and optional safe `details`. The frontend retains those semantics instead of collapsing every failure into a generic string.

See [`docs/api.md`](docs/api.md) for the HTTP contract, [`docs/intelligence.md`](docs/intelligence.md) for actionable finding rules and [`docs/historical-analysis.md`](docs/historical-analysis.md) for historical-v2 formulas, completeness semantics, canonicalization and evaluation.

## Manual Local Development

Docker Compose is the shortest path for running the full stack. For direct development without containers, create the environment file from the repository root:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Update `DATABASE_URL` and replace `JWT_SECRET` with at least 32 random bytes.

### Backend

```bash
cd backend
python -m venv .venv
```

Windows:

```powershell
.venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

macOS/Linux:

```bash
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

Run the labelled historical evaluation fixture from `backend/`:

```bash
python scripts/evaluate_historical.py evaluation/historical_v2_fixture.json
```

The included fixture validates the evaluation machinery; it is synthetic and is not evidence of real-world accuracy.

### Frontend

```bash
cd frontend
npm ci
npm run dev
```

Useful validation commands:

```bash
npm run test
npm run typecheck
npm run lint
npm run build
npm audit --audit-level=high
```

## Testing and CI

The repository has automated quality layers for:

1. Backend unit tests, including password hashing, JWT validation, secure configuration and exact Decimal review thresholds.
2. Pure deterministic intelligence-rule tests using Decimal monetary inputs.
3. Historical-v2 tests for complete-month regression, merchant canonicalization, calendar-aware recurrence, missed expected payments, no-leakage outliers, category fallback and complete-month category shifts.
4. Labelled monthly walk-forward evaluation tests and a reproducible evaluation command.
5. Backend API integration tests against migrated PostgreSQL.
6. Explicit v1 compatibility plus v2 decimal-money contract tests, including exact `0.10 + 0.20 = 0.30` aggregation and rejection of JSON numeric amounts in v2.
7. Intelligence persistence tests for idempotent rescans, review-state persistence, versioned evidence representation and cross-account isolation.
8. Historical-analysis persistence tests for versioned snapshots, completeness metadata, latest retrieval, window validation and account isolation.
9. HTTP security regression tests covering headers, cookie flags, trusted hosts and cross-site mutation rejection.
10. Frontend fixed-point money tests, typed API error tests and historical-v2 component tests.
11. Critical authenticated end-to-end browser coverage with Playwright.
12. Python dependency auditing with `pip-audit`.
13. npm dependency auditing that blocks high/critical findings.
14. Full Docker Compose build/startup smoke testing, including decimal strings and historical-v2 partial-month semantics through Nginx.

GitHub Actions runs these gates for pushes and pull requests targeting `main`. The consolidated `Quality gate` requires backend, frontend, dependency security, browser E2E and Docker jobs to succeed.

See [`docs/testing.md`](docs/testing.md) for test-database safety and CI details.

## Security

- Vulnerability reporting policy: [`SECURITY.md`](SECURITY.md)
- Authentication/ownership model: [`docs/authentication.md`](docs/authentication.md)
- Financial intelligence rules: [`docs/intelligence.md`](docs/intelligence.md)
- Historical analysis algorithms/evaluation: [`docs/historical-analysis.md`](docs/historical-analysis.md)
- OWASP Top 10:2025 review: [`docs/SECURITY_REVIEW.md`](docs/SECURITY_REVIEW.md)

The OWASP review is a secure-engineering baseline, not a penetration-test result or certification. Internet-facing production use still requires HTTPS/TLS configuration, secret management, monitoring/alerting and review of the residual risks documented there.

## Technology Stack

### Frontend

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Recharts
- Nginx
- Vitest
- React Testing Library
- Playwright

### Backend

- Python 3.12
- FastAPI
- Pydantic
- SQLAlchemy 2
- PostgreSQL 16
- Alembic
- Psycopg 3
- PyJWT
- pwdlib / Argon2
- pytest

### Infrastructure and security automation

- Docker
- Docker Compose
- GitHub Actions
- Dependabot
- pip-audit
- npm audit

## Product Roadmap

The detailed roadmap is maintained in [`ROADMAP.md`](ROADMAP.md).

Near-term priorities are:

1. Feed labelled real-world/realistically curated transaction datasets through the walk-forward evaluation harness.
2. Calibrate recurring-score weights/cutoffs and robust-anomaly thresholds from measured precision/recall/false-positive cost.
3. Only then evaluate an ML anomaly candidate such as Isolation Forest against `historical-v2`.
4. Stronger responsive transaction UX.
5. Password reset/change plus account deletion/privacy controls.
6. Phase 4 forecasting only after sufficient historical data and evaluation criteria exist.
7. Staging/deployment automation, TLS and production monitoring.

## Business Model

The long-term product direction supports a freemium SaaS model. Premium capabilities may eventually include advanced forecasting, bank integrations, exportable reports and personalized financial recommendations.

No payment or premium system is implemented yet.

## Author

Developed by [DavidEgeaCalatayud](https://github.com/DavidEgeaCalatayud).
