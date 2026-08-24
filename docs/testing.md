# Testing and CI

Smart Expense AI uses multiple test layers so persistence, authentication, security controls, API contracts, deterministic intelligence rules and critical browser flows are verified automatically.

## Backend

Install development test dependencies from `backend`:

```bash
pip install -r requirements.txt -r requirements-dev.txt
```

Unit tests do not need a running database:

```bash
pytest -m "not integration"
```

The financial-intelligence rules are deliberately implemented as pure functions, so their thresholds can be tested without PostgreSQL. Unit coverage includes:

- merchant normalization across case, accents and punctuation;
- recurring-pattern positive and negative cases;
- stable-amount and cadence requirements;
- repeated near-duplicate subscription billing across multiple months;
- merchant-specific anomaly baselines;
- minimum-history requirements that prevent premature anomaly findings.

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

Backend contract/security regression coverage includes:

- `/api/v1` as the supported application namespace;
- normalized `error.code`, `error.message`, `error.requestId` envelopes;
- validation error details;
- transaction page metadata and pagination boundaries;
- server-side search/category/status/type/recurring/date/sort filters;
- aggregate summary and continuous monthly-expense endpoints;
- financial-intelligence scan/summary/findings/review endpoints;
- persisted finding explanations, evidence and `rules-v1` metadata;
- idempotent rescans preserving finding IDs through stable fingerprints;
- dismissed findings remaining dismissed after the same evidence is detected again;
- intelligence findings and review updates scoped to the authenticated user;
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

Vitest and React Testing Library cover component behavior and API-driven page behavior. Transaction-page tests verify that filters are sent to the API rather than applied to a partial page in memory, and that mutations refresh the authoritative page/summary before success feedback is shown.

The Financial Intelligence page tests verify that persisted findings and their evidence render from the API, that `Run analysis` invokes the scan endpoint and refreshes authoritative state, and that review actions such as dismissing a finding are persisted through the API rather than changing only local React state.

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

1. User A registers and creates a transaction through API v1.
2. The dashboard aggregate/recent endpoints reflect the persisted transaction.
3. User A logs out.
4. User B registers and cannot see User A's transaction.
5. User A logs back in and still owns the transaction.
6. The transaction can be edited and the deterministic review rule is reflected.
7. The transaction can be deleted after confirmation.

Financial-intelligence behavior is currently covered by pure rule tests, PostgreSQL integration tests, frontend page tests and Docker contract smoke tests rather than making the single critical browser flow substantially larger. A dedicated browser intelligence flow can be added when the review workspace gains more cross-page behavior.

## Docker contract/security smoke test

The Compose job builds the actual deployment-style images and checks more than simple availability. It verifies:

- Nginx CSP and MIME-sniffing protection;
- API `Cache-Control: no-store`;
- `/api/v1` registration and authenticated proxy access;
- paginated transaction metadata through Nginx;
- the aggregate summary endpoint;
- migration of the persisted intelligence tables through normal backend startup;
- an authenticated empty-data `POST /api/v1/intelligence/scan` returning zero analysed transactions/findings;
- the intelligence summary reporting zero open findings and `rules-v1` through Nginx;
- normalized 404 behavior for unsupported unversioned application routes;
- unauthenticated intelligence access rejected with a request ID;
- login rate limiting reaching HTTP `429` after the configured burst;
- successful health checks with the backend not published directly to the host.

## GitHub Actions

`.github/workflows/ci.yml` runs on pushes and pull requests targeting `main`.

The workflow contains five functional gates plus the consolidated gate:

- **Backend tests**: dependency installation, `alembic upgrade head`, FastAPI/API version import and pytest unit/integration tests against PostgreSQL 16.
- **Frontend quality**: locked `npm ci` install, Vitest, TypeScript, ESLint and production build.
- **Dependency security audit**: `pip-audit` plus `npm audit --audit-level=high`.
- **Critical E2E**: PostgreSQL 16, real migrations, locked `npm ci` install, FastAPI, Vite and Playwright Chromium.
- **Docker Compose smoke test**: actual images, API v1 transaction/analytics/intelligence contract checks, security headers, authenticated proxy behavior and rate limiting.
- **Quality gate**: fails unless every preceding job succeeds.

Third-party GitHub Actions are referenced by immutable commit SHA rather than mutable version tags. Dependabot monitors those SHAs together with pip and npm dependencies.

For merge enforcement, configure the `Quality gate` check as a required status check in the repository branch protection/ruleset for `main`.

See `docs/api.md` for the supported HTTP contract and `docs/intelligence.md` for the current deterministic rule definitions and validation strategy.
