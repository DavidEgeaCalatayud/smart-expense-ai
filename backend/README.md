# Smart Expense AI Backend

FastAPI backend for Smart Expense AI.

## Stack

- Python
- FastAPI
- Pydantic
- SQLAlchemy 2
- PostgreSQL
- Alembic
- Psycopg 3
- Uvicorn

## Getting Started

From the `backend` directory:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

On macOS/Linux:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API will run by default at:

```txt
http://localhost:8000
```

## Database Configuration

Copy the repository `.env.example` file to `.env` and update `DATABASE_URL` with your local PostgreSQL credentials.

Example:

```txt
DATABASE_URL=postgresql+psycopg://smart_expense_user:smart_expense_password@localhost:5432/smart_expense_ai
```

Both the application SQLAlchemy engine and Alembic read the same `DATABASE_URL` through `app/core/config.py`.

## Database Migrations

Run Alembic commands from the `backend` directory.

Apply all migrations:

```bash
alembic upgrade head
```

This creates the `categories` and `transactions` tables and seeds the initial categories:

- Food
- Subscriptions
- Shopping
- Transport
- Health
- Salary
- Other

Check the current revision:

```bash
alembic current
```

After changing SQLAlchemy models, create a migration with:

```bash
alembic revision --autogenerate -m "describe the schema change"
```

Review generated migrations before applying them.

Rollback one migration:

```bash
alembic downgrade -1
```

## Health Check

```txt
GET /health
```

## Transaction Endpoints

```txt
GET    /api/transactions
POST   /api/transactions
PUT    /api/transactions/{transaction_id}
DELETE /api/transactions/{transaction_id}
```

The public transaction contract remains compatible with the current frontend while persistence is handled internally with SQLAlchemy and PostgreSQL.

## API Docs

FastAPI generates interactive documentation automatically:

```txt
http://localhost:8000/docs
```

## Current Status

Transaction CRUD is now persistent:

```txt
router -> transaction service -> SQLAlchemy session -> PostgreSQL
```

The old in-memory transaction store has been removed. Transactions survive backend restarts as long as PostgreSQL is running and migrations have been applied.

`status` and `aiConfidence` remain compatibility fields derived by the service for now; they are not persisted as database columns.

Next backend steps:

- Connect `TransactionsPage` to the existing REST client and remove frontend transaction mocks.
- Add category management when needed.
- Add authentication later.
- Add transaction ownership by user when authentication is introduced.
