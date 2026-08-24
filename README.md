# Smart Expense AI

Smart Expense AI is a personal finance application being built around reliable transaction data first, with predictive and anomaly-detection features planned for later stages.

The current MVP does **not** simulate AI results. Transactions, categories and dashboard metrics use persisted PostgreSQL data; forecasting and automated alerts remain explicitly marked as planned until a real analysis layer is implemented.

## Current Capabilities

Implemented today:

- Persistent transaction creation, editing, deletion and listing.
- PostgreSQL persistence through SQLAlchemy 2.
- Alembic schema migrations and initial category seeding.
- Persisted categories exposed through `GET /api/categories`.
- Category/type validation for expense and income transactions.
- Dashboard metrics derived from real transactions.
- Six-month expense trend calculated from persisted history.
- Five most recent transactions displayed on the dashboard.
- Recurring transactions stored as an explicit user-provided flag.
- Transparent rule-based review: expenses above 120 EUR are marked as `review`.
- Delete confirmation and operation feedback in transaction management.
- Backend unit and PostgreSQL integration tests with pytest.
- Frontend component/page tests with Vitest and React Testing Library.
- Critical browser CRUD coverage with Playwright.
- GitHub Actions quality gates for migrations, tests, TypeScript, ESLint, production builds and Docker Compose.
- One-command Docker Compose environment for frontend, backend and PostgreSQL.

Not implemented yet:

- AI confidence scores.
- Automatic transaction classification.
- Anomaly detection.
- Duplicate-subscription detection.
- Spending forecasts.
- Automated financial alerts.
- Authentication and per-user data ownership.
- Bank integrations.

## Quick Start with Docker

With Docker Desktop or Docker Engine + Compose v2 installed, start the complete application from the repository root:

```bash
docker compose up --build
```

Then open:

```text
http://localhost:5173
```

The stack is:

```text
Browser
  |
  v
frontend :5173 (Nginx + React build)
  |
  | /api/*
  v
backend :8000 (FastAPI + Alembic)
  |
  v
db (PostgreSQL 16)
```

FastAPI documentation is also available at `http://localhost:8000/docs`.

Stop the stack with:

```bash
docker compose down
```

The PostgreSQL named volume is retained. Use `docker compose down -v` only when you intentionally want to delete the Compose-managed database.

See [`docs/docker.md`](docs/docker.md) for architecture, health checks, logs and reset instructions.

## Product Direction

The long-term objective is to go beyond traditional expense tracking and help users understand how their financial behavior is changing over time.

Planned intelligence features include:

- Spending pattern analysis.
- Recurring charge detection.
- Duplicate subscription detection.
- Anomaly detection over historical behavior.
- End-of-month spending forecasts.
- Explainable alerts and recommendations.

These features will be added only when they can operate on real persisted data and validated logic.

## Architecture

```text
React + TypeScript
        |
        v
Nginx reverse proxy
        |
        v
FastAPI REST API
        |
        v
Service layer
        |
        v
SQLAlchemy 2
        |
        v
PostgreSQL
```

Database schema changes are managed with Alembic. In Docker Compose, the backend automatically applies `alembic upgrade head` after PostgreSQL becomes healthy and before Uvicorn starts.

Repository structure:

```text
smart-expense-ai/
├── frontend/        # React + TypeScript web application and Nginx image
├── backend/         # FastAPI API, services, SQLAlchemy models and migrations
├── ai/              # Reserved for future intelligence services
├── docs/            # Product and technical documentation
├── scripts/         # Utility scripts
├── compose.yaml     # Full local stack
├── ROADMAP.md
└── README.md
```

## API

Current endpoints:

```text
GET    /health
GET    /api/categories
GET    /api/transactions
POST   /api/transactions
PUT    /api/transactions/{transaction_id}
DELETE /api/transactions/{transaction_id}
```

## Manual Local Development

Docker Compose is the shortest path for running the full stack. For direct development without containers, create the environment file from the repository root:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Update `DATABASE_URL` with your PostgreSQL credentials.

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
```

## Testing and CI

The repository has automated quality layers for:

1. Backend unit tests.
2. Backend API integration tests against migrated PostgreSQL.
3. Frontend tests with Vitest and React Testing Library.
4. Critical end-to-end browser coverage with Playwright.
5. Full Docker Compose build/startup smoke testing.

GitHub Actions runs these gates for pushes and pull requests targeting `main`. The Docker job builds the actual frontend/backend images, starts PostgreSQL, waits for health checks, and verifies the frontend plus proxied API before the consolidated `Quality gate` can pass.

See [`docs/testing.md`](docs/testing.md) for test-database safety and CI details.

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
- pytest

### Infrastructure

- Docker
- Docker Compose
- GitHub Actions

## Product Roadmap

The detailed roadmap is maintained in [`ROADMAP.md`](ROADMAP.md).

Near-term priorities are:

1. Stronger transaction UX and responsive behavior.
2. Authentication and per-user transaction ownership.
3. User-managed categories when required.
4. A real intelligence layer built over sufficient historical transaction data.
5. Staging and deployment automation.

## Business Model

The long-term product direction supports a freemium SaaS model. Premium capabilities may eventually include advanced forecasting, anomaly detection, bank integrations, exportable reports and personalized financial recommendations.

No payment or premium system is implemented yet.

## Author

Developed by [DavidEgeaCalatayud](https://github.com/DavidEgeaCalatayud).
