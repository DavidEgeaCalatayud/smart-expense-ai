# Docker Compose

The full Smart Expense AI stack can be started from the repository root with Docker Compose.

## Requirements

- Docker Desktop, or Docker Engine with Docker Compose v2.
- Port `5173` available on the host.

## Start the application

```bash
docker compose up --build
```

Compose starts three services in dependency order:

```text
Browser
  |
  v
frontend :5173 (Nginx + React build)
  |
  | /api/v1/* reverse proxy
  v
backend :8000 (FastAPI + rules-v1, internal only)
  |
  v
db :5432 (PostgreSQL 16, internal only)
```

Open the application at:

```text
http://localhost:5173
```

The Compose backend is deliberately **not published to the host**. Nginx is the only public application entry point and provides the edge security policy/rate limiter before proxying to `backend:8000` on the internal network.

For direct FastAPI development outside Compose, run Uvicorn locally from `backend/` as documented in the main README.

The backend container waits for PostgreSQL to become healthy and runs `alembic upgrade head` before starting Uvicorn. This includes the Phase 3 intelligence persistence migration before the API can become healthy. The frontend waits for the backend health check before starting.

## Run in the background

```bash
docker compose up --build -d
```

Inspect status and logs:

```bash
docker compose ps
docker compose logs -f
docker compose logs -f backend
docker compose logs -f frontend
```

The backend container disables Uvicorn access logs in this topology. Nginx emits the edge access log using a reduced format containing timestamp, method, path without query string, status, and an Nginx request ID. Authentication credentials, cookies, request bodies, transaction payloads and intelligence evidence are not part of that format.

## Stop the stack

```bash
docker compose down
```

PostgreSQL data is stored in the named `postgres_data` volume and survives a normal `docker compose down`. Transactions, intelligence findings, review status and scan history are therefore retained across restarts.

To remove the local Docker database as well:

```bash
docker compose down -v
```

This permanently deletes the Compose-managed PostgreSQL data.

## Networking and container controls

The browser only needs the frontend origin. The production React build uses relative `/api/v1` URLs, and Nginx proxies them to the internal `backend:8000` service. PostgreSQL is only addressed by the backend through the internal Compose network using hostname `db`.

The backend runs as a non-root application user. Compose applies `no-new-privileges` to all three services.

The default credentials and JWT secret in `compose.yaml` are development-only values. They are not intended for a public or production deployment.

## Edge security behavior

The bundled Nginx configuration provides:

- Content Security Policy;
- MIME sniffing, framing, referrer, permissions, COOP and CORP headers;
- reduced access logging without query strings or authentication material;
- per-IP `/api/v1/auth/login` rate limiting;
- stricter `/api/v1/auth/register` rate limiting.

FastAPI independently applies API `Cache-Control: no-store`, request IDs, browser-origin checks for state-changing API calls, trusted-host validation, restricted CORS and other defense-in-depth headers. Intelligence scan/review requests use the same authenticated and origin-protected API boundary as transaction mutations.

HTTPS is not bundled into the local Compose development stack. A staging/production deployment must terminate TLS at a trusted edge and set `AUTH_COOKIE_SECURE=true`; the application rejects staging/production configuration that leaves that flag disabled.

## CI smoke test

GitHub Actions validates Docker Compose in addition to the unit, integration and browser suites. The Docker job:

1. validates the Compose configuration;
2. builds the frontend and backend images;
3. starts PostgreSQL, FastAPI and Nginx and applies all Alembic migrations, including the intelligence tables;
4. waits for container health checks;
5. verifies CSP and response security headers;
6. registers a test account through `/api/v1/auth/register`;
7. verifies paginated `/api/v1/transactions` and `/api/v1/analytics/summary` responses;
8. runs `/api/v1/intelligence/scan` through Nginx against the empty account and verifies zero analysed transactions/findings;
9. verifies `/api/v1/intelligence/summary` reports zero open findings and the active `rules-v1` version;
10. proves legacy unversioned application routes return a normalized 404;
11. verifies unauthenticated intelligence access is rejected with a request ID;
12. proves the versioned login limiter returns HTTP `429` after the configured burst;
13. tears the stack down with its test volume.

See `docs/api.md` for the supported API contract and `docs/intelligence.md` for the rules-engine behavior.
