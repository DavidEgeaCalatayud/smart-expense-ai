# Testing and CI

Smart Expense AI uses multiple test layers so persistence, API contracts and critical browser flows are verified automatically.

## Backend

Install development test dependencies from `backend`:

```bash
pip install -r requirements.txt -r requirements-dev.txt
```

Unit tests do not need a running database:

```bash
pytest -m "not integration"
```

Integration tests intentionally use PostgreSQL rather than SQLite. Create a disposable test database, point `TEST_DATABASE_URL` at it, migrate it, then run the full suite.

PowerShell example:

```powershell
$env:TEST_DATABASE_URL="postgresql+psycopg://postgres:postgres@localhost:5432/smart_expense_ai_test"
$env:DATABASE_URL=$env:TEST_DATABASE_URL
alembic upgrade head
pytest
```

Bash example:

```bash
export TEST_DATABASE_URL="postgresql+psycopg://postgres:postgres@localhost:5432/smart_expense_ai_test"
export DATABASE_URL="$TEST_DATABASE_URL"
alembic upgrade head
pytest
```

The test bootstrap deliberately does not inherit a development `DATABASE_URL`. This reduces the risk of integration tests deleting real development transactions.

## Frontend

From `frontend`:

```bash
npm install
npm run test
npm run typecheck
npm run lint
npm run build
```

Vitest and React Testing Library cover component behavior and API-driven page behavior.

## End-to-end

Playwright exercises the critical persisted transaction flow against a real FastAPI process and PostgreSQL database:

```bash
npm run test:e2e
```

Playwright starts Vite and FastAPI automatically. PostgreSQL must already be running and migrated through Alembic.

The critical flow verifies:

1. A transaction can be created from the browser.
2. The dashboard reflects the persisted transaction.
3. The transaction can be edited and the deterministic review rule is reflected.
4. The transaction can be deleted.

## GitHub Actions

`.github/workflows/ci.yml` runs on pushes and pull requests targeting `main`.

The workflow contains four gates:

- **Backend tests**: dependency installation, `alembic upgrade head`, FastAPI import and pytest unit/integration tests against PostgreSQL 16.
- **Frontend quality**: Vitest, TypeScript, ESLint and production build.
- **Critical E2E**: PostgreSQL 16, real migrations, FastAPI, Vite and Playwright Chromium.
- **Quality gate**: fails unless all previous jobs succeed.

For merge enforcement, configure the `Quality gate` check as a required status check in the repository branch protection/ruleset for `main`.
