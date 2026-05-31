# Smart Expense AI Backend

FastAPI backend for Smart Expense AI.

## Stack

- Python
- FastAPI
- Pydantic
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

The backend currently uses an in-memory store. Data will reset when the server restarts.

Next backend steps:

- Add PostgreSQL.
- Add SQLAlchemy models.
- Add Alembic migrations.
- Add authentication.
- Add transaction ownership by user.
