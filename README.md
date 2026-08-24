# Smart Expense AI

Smart Expense AI is a personal finance application built around reliable persisted transaction data, account isolation and explainable analysis before predictive or machine-learning features are introduced.

The current product does **not** simulate AI results. Transactions, dashboard metrics and Phase 3 financial-intelligence findings come from persisted PostgreSQL data and deterministic rules. Forecasting, automatic classification and confidence metrics remain explicitly unimplemented until they can be validated.

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
- Versioned `/api/v1` application contract.
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
- Explainable recurring-payment pattern detection from stable historical cadence and amounts.
- Possible duplicate-subscription detection from repeated near-identical double-billing patterns.
- Merchant-specific unusual-amount detection using median and median absolute deviation baselines.
- Stable `rules-v1` fingerprints that make rescans idempotent instead of creating duplicate alerts.
- Persisted `open`, `dismissed` and `resolved` intelligence review states.
- Financial Intelligence workspace for running scans, reviewing evidence, dismissing/resolving and reopening findings.
- Delete confirmation, loading/refreshing states, retry feedback and operation toasts in transaction management.
- Backend unit and PostgreSQL integration tests with pytest.
- Frontend component/page tests with Vitest and React Testing Library.
- Critical authenticated browser coverage with Playwright, including cross-account isolation.
- GitHub Actions quality gates for migrations, tests, TypeScript, ESLint, production builds, dependency auditing and Docker Compose.
- Weekly Dependabot monitoring for Python, npm and GitHub Actions dependencies.
- One-command Docker Compose environment for frontend, backend and PostgreSQL.

Not implemented yet:

- Password reset/change and account deletion/privacy export controls.
- MFA.
- Centralized security log monitoring/alerting.
- User-managed custom categories.
- AI confidence scores.
- Automatic transaction classification.
- Spending forecasts.
- Automatic/background intelligence scans.
- Bank integrations.
- Probabilistic fraud detection.

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
  v
frontend :5173 (Nginx + React build)
  |
  | security headers + rate limiting + /api/v1/*
  v
backend :8000 (FastAPI + Alembic, internal only)
  |
  | authenticated user_id scoped queries + rules-v1
  v
db :5432 (PostgreSQL 16, internal only)
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
        | versioned API client + HttpOnly JWT session
        v
Nginx reverse proxy
        | rate limits + CSP/security headers
        v
FastAPI /api/v1
        | pagination + filters + normalized errors + analytics
        | financial intelligence scan/review API
        v
Authentication + service layer
        |
        | user-scoped transaction/finding queries
        v
Deterministic rules-v1
        | recurring pattern
        | possible duplicate subscription
        | robust amount anomaly
        v
SQLAlchemy 2
        |
        v
PostgreSQL
```

The intelligence engine keeps inferred findings separate from source transactions. It does not silently overwrite the manually supplied `isRecurring` transaction field. Every finding stores its explanation, structured evidence, rule version and review state.

Database schema changes are managed with Alembic. In Docker Compose, the backend automatically applies `alembic upgrade head` after PostgreSQL becomes healthy and before Uvicorn starts.

Repository structure:

```text
smart-expense-ai/
├── frontend/        # React + TypeScript web application and Nginx image
├── backend/         # FastAPI API, auth, rules, services, SQLAlchemy models and migrations
├── ai/              # Reserved for future probabilistic/ML experiments
├── docs/            # Product, API, intelligence, testing and security documentation
├── scripts/         # Utility scripts
├── compose.yaml     # Full local stack
├── SECURITY.md      # Vulnerability reporting policy
├── ROADMAP.md
└── README.md
```

## API

The supported application contract is versioned under:

```text
/api/v1
```

Public endpoints:

```text
GET    /health
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
```

Authenticated endpoints:

```text
GET    /api/v1/auth/me
GET    /api/v1/categories
GET    /api/v1/transactions
POST   /api/v1/transactions
PUT    /api/v1/transactions/{transaction_id}
DELETE /api/v1/transactions/{transaction_id}
GET    /api/v1/analytics/summary
GET    /api/v1/analytics/monthly-expenses
POST   /api/v1/intelligence/scan
GET    /api/v1/intelligence/summary
GET    /api/v1/intelligence/findings
PATCH  /api/v1/intelligence/findings/{finding_id}
```

Transaction listing is paginated and filtered server-side. Errors use a stable envelope with `code`, `message`, `requestId` and optional safe `details`. Breaking contract changes require a new URL version.

The intelligence endpoints remain inside v1 because they are backwards-compatible additions. `POST /intelligence/scan` analyses persisted expenses and idempotently upserts explainable findings; review state is persisted through the finding endpoint.

See [`docs/api.md`](docs/api.md) for the full HTTP contract and [`docs/intelligence.md`](docs/intelligence.md) for rule thresholds, evidence and known limitations.

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

1. Backend unit tests, including password hashing, JWT validation and secure configuration invariants.
2. Pure deterministic intelligence-rule tests covering recurring, duplicate-subscription and anomaly thresholds.
3. Backend API integration tests against migrated PostgreSQL.
4. API v1 contract tests for pagination, filters, error envelopes, analytics and financial intelligence.
5. Intelligence persistence tests for idempotent rescans, review-state persistence and cross-account isolation.
6. Explicit cross-account ownership tests proving one user cannot mutate another user's transaction or finding.
7. HTTP security regression tests covering headers, cookie flags, trusted hosts and cross-site mutation rejection.
8. Frontend tests with Vitest and React Testing Library, including the Financial Intelligence workspace.
9. Critical authenticated end-to-end browser coverage with Playwright.
10. Python dependency auditing with `pip-audit`.
11. npm dependency auditing that blocks high/critical findings.
12. Full Docker Compose build/startup smoke testing, including the versioned API contract, intelligence migration/endpoints, security headers and authentication rate limiting.

GitHub Actions runs these gates for pushes and pull requests targeting `main`. The consolidated `Quality gate` requires backend, frontend, dependency security, browser E2E and Docker jobs to succeed.

See [`docs/testing.md`](docs/testing.md) for test-database safety and CI details.

## Security

- Vulnerability reporting policy: [`SECURITY.md`](SECURITY.md)
- Authentication/ownership model: [`docs/authentication.md`](docs/authentication.md)
- Financial intelligence rules: [`docs/intelligence.md`](docs/intelligence.md)
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

1. Validate `rules-v1` against labelled real-world transaction datasets and measure precision/recall.
2. Improve merchant normalization/category baselines only where validation shows they add value.
3. Stronger responsive transaction UX.
4. Password reset/change plus account deletion/privacy controls.
5. Phase 4 forecasting only after sufficient historical data and evaluation criteria exist.
6. Staging/deployment automation, TLS and production monitoring.

## Business Model

The long-term product direction supports a freemium SaaS model. Premium capabilities may eventually include advanced forecasting, bank integrations, exportable reports and personalized financial recommendations.

No payment or premium system is implemented yet.

## Author

Developed by [DavidEgeaCalatayud](https://github.com/DavidEgeaCalatayud).
