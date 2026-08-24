# Testing and CI

Smart Expense AI uses multiple test layers so persistence, authentication, security controls, API contracts and critical browser flows are verified automatically.

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

Backend security regression coverage includes:

- password hashing and hardened JWT claim validation;
- production configuration invariants;
- cross-account transaction ownership;
- HttpOnly/SameSite cookie attributes;
- trusted-host rejection;
- cross-site unsafe request rejection;
- response security headers and `Cache-Control: no-store`;
- generic authentication failure responses.

## Frontend

`frontend/package-lock.json` is versioned. Use `npm ci` for clean, reproducible installs from the exact dependency graph recorded in the lockfile.

From `frontend`:

```bash
npm ci
npm run test
npm run typecheck
npm run lint
npm run build
npm audit --audit-level=high
```

Vitest and React Testing Library cover component behavior and API-driven page behavior.

When intentionally changing frontend dependencies, update `package.json` and regenerate `package-lock.json` together with npm. CI uses `npm ci`, so dependency metadata drift causes the install step to fail instead of silently rewriting the lockfile.

## Python dependency audit

CI installs the PyPA `pip-audit` tool independently and scans the runtime dependency declaration:

```bash
pip install pip-audit==2.10.1
pip-audit -r requirements.txt --strict
```

A known Python vulnerability causes the dependency security job to fail. Do not suppress a finding without documenting why it is non-exploitable and when the suppression expires.

## End-to-end

Playwright exercises the critical authenticated persisted-transaction flow against a real FastAPI process and PostgreSQL database:

```bash
npm run test:e2e
```

Playwright starts Vite and FastAPI automatically. PostgreSQL must already be running and migrated through Alembic.

The critical flow verifies:

1. User A registers and creates a transaction.
2. The dashboard reflects the persisted transaction.
3. User A logs out.
4. User B registers and cannot see User A's transaction.
5. User A logs back in and still owns the transaction.
6. The transaction can be edited and the deterministic review rule is reflected.
7. The transaction can be deleted.

## Docker security smoke test

The Compose job builds the actual deployment-style images and checks more than simple availability. It verifies:

- Nginx CSP and MIME-sniffing protection;
- API `Cache-Control: no-store`;
- registration and authenticated proxy access;
- unauthenticated API rejection;
- login rate limiting reaching HTTP `429` after the configured burst;
- successful health checks with the backend not published directly to the host.

## GitHub Actions

`.github/workflows/ci.yml` runs on pushes and pull requests targeting `main`.

The workflow contains five functional gates plus the consolidated gate:

- **Backend tests**: dependency installation, `alembic upgrade head`, FastAPI import and pytest unit/integration tests against PostgreSQL 16.
- **Frontend quality**: locked `npm ci` install, Vitest, TypeScript, ESLint and production build.
- **Dependency security audit**: `pip-audit` plus `npm audit --audit-level=high`.
- **Critical E2E**: PostgreSQL 16, real migrations, locked `npm ci` install, FastAPI, Vite and Playwright Chromium.
- **Docker Compose smoke test**: actual images, security headers, authenticated proxy behavior and rate limiting.
- **Quality gate**: fails unless every preceding job succeeds.

Third-party GitHub Actions are referenced by immutable commit SHA rather than mutable version tags. Dependabot monitors those SHAs together with pip and npm dependencies.

For merge enforcement, configure the `Quality gate` check as a required status check in the repository branch protection/ruleset for `main`.
