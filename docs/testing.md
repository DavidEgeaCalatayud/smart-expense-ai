# Testing and CI

Smart Expense AI uses multiple test layers so persistence, authentication, security controls, versioned API contracts, monetary precision, deterministic intelligence rules, historical algorithms and critical browser flows are verified automatically.

## Backend

Install development test dependencies from `backend`:

```bash
pip install -r requirements.txt -r requirements-dev.txt
```

Unit tests do not need a running database:

```bash
pytest -m "not integration"
```

Financial logic uses `Decimal`, including the 120 EUR review threshold and all amount-based intelligence rules. Unit coverage includes the exact `120.00` / `120.01` boundary and Decimal-based recurring, duplicate-subscription and anomaly calculations.

The financial-intelligence finding rules are deliberately implemented as pure functions, so their thresholds can be tested without PostgreSQL. Coverage includes:

- merchant normalization across case, accents and punctuation;
- recurring-pattern positive and negative cases;
- stable-amount and cadence requirements;
- repeated near-duplicate subscription billing across multiple months;
- merchant-specific anomaly baselines;
- minimum-history requirements that prevent premature anomaly findings;
- decimal-string monetary evidence generated without float conversion.

The `historical-v1` engine also exposes a pure analysis function. Its unit tests verify algorithm properties rather than merely checking HTTP success:

- an increasing six-month series produces a positive least-squares slope and meaningful R²;
- a stable monthly merchant series receives a high recurrence pattern score;
- cadence fit, interval regularity and amount stability remain separately observable;
- an outlier baseline contains only transactions dated before the candidate, preventing future-data leakage;
- category history is used as a fallback only when merchant history is insufficient;
- three-month category-shift windows produce the expected absolute and percentage change.

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

- backwards-compatible `/api/v1` behavior;
- decimal-safe `/api/v2` transaction, analytics and intelligence behavior;
- exact persistence/aggregation for `"0.10" + "0.20" = "0.30"`;
- v2 rejection of JSON numeric money and values with more than two fractional digits;
- v1 legacy numeric money responses preserved at the serialization boundary;
- v1 numeric versus v2 decimal-string intelligence evidence;
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
- migration `0005_historical_analysis`;
- persisted `historical-v1` snapshot creation and latest-snapshot retrieval;
- historical-analysis 6–24 month window validation;
- historical snapshot isolation between authenticated accounts;
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

The browser monetary type is a decimal string. Financial formatting and sign/arithmetic helpers parse it into integer cents rather than `Number(decimalString)`. Unit tests explicitly prove that `0.10 + 0.20` becomes 30 cents exactly, check negative balances/formatting, and reject values with more than two decimal places.

Recharts requires JavaScript numeric plot coordinates. The dashboard has a dedicated visualization adapter that converts integer cents to a number only when building chart data; that number is not reused for balances, thresholds, comparisons or persistence.

The API client also has direct tests for typed error semantics. It distinguishes:

- `401` authentication;
- `403` authorization;
- `404` not found;
- `409` conflict;
- `422` validation;
- `5xx` server failures;
- network/fetch failures.

Safe backend `message`, `requestId` and `details` are retained. Only network and server failures are marked retryable by default, avoiding misleading retry actions for validation/auth/conflict failures.

Vitest and React Testing Library additionally cover component behavior and API-driven page behavior. Transaction-page tests verify that filters are sent to the API rather than applied to a partial page in memory, and that mutations refresh the authoritative page/summary before success feedback is shown.

The Financial Intelligence page tests verify persisted findings and review actions. `HistoricalAnalysisPanel` has separate tests that render persisted trend/recurrence/outlier evidence and verify that a new 12-month snapshot is requested through the v2 API.

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

1. User A registers through the v1 authentication contract.
2. The React transaction client creates `42.50` through decimal-safe API v2.
3. The dashboard v2 aggregate/recent endpoints reflect the persisted transaction exactly.
4. User A logs out.
5. User B registers and cannot see User A's transaction.
6. User A logs back in and still owns the transaction.
7. The transaction is edited to `150.25` through v2 and the Decimal review rule is reflected.
8. The transaction can be deleted after confirmation.

Financial-intelligence behavior is covered by pure algorithm tests, PostgreSQL integration tests, frontend component/page tests and Docker contract smoke tests rather than making the single critical browser flow substantially larger.

## Docker contract/security smoke test

The Compose job builds the actual deployment-style images and checks more than simple availability. It verifies:

- Nginx CSP and MIME-sniffing protection;
- API `Cache-Control: no-store`;
- v1 registration and authenticated proxy access;
- legacy v1 transaction/analytics compatibility;
- migration of the persisted intelligence and historical-analysis tables through normal backend startup;
- an authenticated empty-data findings scan;
- two v2 transactions with amounts `"0.10"` and `"0.20"` through Nginx;
- an exact v2 aggregate of `"0.30"` and balance `"-0.30"`;
- generation of a persisted `historical-v1` snapshot through Nginx;
- latest historical-snapshot retrieval;
- sparse historical data reported as `insufficient_data` rather than a fabricated trend;
- rejection of the JSON numeric v2 amount `0.1` with HTTP `422`;
- normalized 404 behavior for unsupported unversioned application routes;
- unauthenticated intelligence access rejected with a request ID;
- login rate limiting reaching HTTP `429` after the configured burst;
- successful health checks with the backend not published directly to the host.

## GitHub Actions

`.github/workflows/ci.yml` runs on pushes and pull requests targeting `main`.

The workflow contains five functional gates plus the consolidated gate:

- **Backend tests**: dependency installation, `alembic upgrade head`, FastAPI 1.2 contract import and pytest unit/integration tests against PostgreSQL 16.
- **Frontend quality**: locked `npm ci` install, Vitest, TypeScript, ESLint and production build.
- **Dependency security audit**: `pip-audit` plus `npm audit --audit-level=high`.
- **Critical E2E**: PostgreSQL 16, real migrations, FastAPI, Vite and Playwright Chromium using the frontend's v2 financial clients.
- **Docker Compose smoke test**: actual images, v1 compatibility, v2 decimal contract, historical snapshot API, security headers, authenticated proxy behavior and rate limiting.
- **Quality gate**: fails unless every preceding job succeeds.

Third-party GitHub Actions are referenced by immutable commit SHA rather than mutable version tags. Dependabot monitors those SHAs together with pip and npm dependencies.

For merge enforcement, configure the `Quality gate` check as a required status check in the repository branch protection/ruleset for `main`.

See `docs/api.md` for the supported HTTP contracts, `docs/intelligence.md` for actionable finding rules and `docs/historical-analysis.md` for the historical algorithm definitions and evaluation strategy.
