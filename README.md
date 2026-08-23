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

Not implemented yet:

- AI confidence scores.
- Automatic transaction classification.
- Anomaly detection.
- Duplicate-subscription detection.
- Spending forecasts.
- Automated financial alerts.
- Authentication and per-user data ownership.
- Bank integrations.

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

```txt
React + TypeScript
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

Database schema changes are managed with Alembic.

Repository structure:

```txt
smart-expense-ai/
├── frontend/        # React + TypeScript web application
├── backend/         # FastAPI API, services, SQLAlchemy models and migrations
├── ai/              # Reserved for future intelligence services
├── docs/            # Product and technical documentation
├── scripts/         # Utility scripts
├── ROADMAP.md
└── README.md
```

## API

Current endpoints:

```txt
GET    /health
GET    /api/categories
GET    /api/transactions
POST   /api/transactions
PUT    /api/transactions/{transaction_id}
DELETE /api/transactions/{transaction_id}
```

FastAPI interactive documentation is available locally at:

```txt
http://localhost:8000/docs
```

## Local Development

Create the environment file from the repository root:

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
npm install
npm run dev
```

Useful validation commands:

```bash
npm run build
npm run lint
```

## Technology Stack

### Frontend

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Recharts

### Backend

- Python
- FastAPI
- Pydantic
- SQLAlchemy 2
- PostgreSQL
- Alembic
- Psycopg 3

## Product Roadmap

The detailed roadmap is maintained in [`ROADMAP.md`](ROADMAP.md).

Near-term priorities are:

1. Automated tests and CI.
2. Stronger transaction UX and responsive behavior.
3. Authentication and per-user transaction ownership.
4. User-managed categories when required.
5. A real intelligence layer built over sufficient historical transaction data.

## Business Model

The long-term product direction supports a freemium SaaS model. Premium capabilities may eventually include advanced forecasting, anomaly detection, bank integrations, exportable reports and personalized financial recommendations.

No payment or premium system is implemented yet.

## Author

Developed by [DavidEgeaCalatayud](https://github.com/DavidEgeaCalatayud).
