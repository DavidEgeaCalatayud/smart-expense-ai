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

The initial migration creates the `categories` and `transactions` tables.

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

## API Docs

FastAPI generates interactive documentation automatically:

```txt
http://localhost:8000/docs
```

## Current Status

The PostgreSQL configuration, SQLAlchemy models and Alembic migration infrastructure are now present.

The transaction endpoints still use the existing in-memory store, so API data will continue to reset when the server restarts until the persistence service is connected.

Next backend steps:

- Seed the initial categories.
- Replace the in-memory transaction store with SQLAlchemy persistence.
- Connect the existing transaction CRUD endpoints to database sessions.
- Add authentication later.
- Add transaction ownership by user when authentication is introduced.
