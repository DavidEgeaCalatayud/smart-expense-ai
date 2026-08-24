# Docker Compose

The full Smart Expense AI stack can be started from the repository root with Docker Compose.

## Requirements

- Docker Desktop, or Docker Engine with Docker Compose v2.
- Ports `5173` and `8000` available on the host.

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
  | /api/* reverse proxy
  v
backend :8000 (FastAPI)
  |
  v
db :5432 (PostgreSQL 16)
```

Open the application at:

```text
http://localhost:5173
```

FastAPI remains directly available for development at:

```text
http://localhost:8000/docs
```

The backend container waits for PostgreSQL to become healthy and runs `alembic upgrade head` before starting Uvicorn. The frontend waits for the backend health check before starting.

## Run in the background

```bash
docker compose up --build -d
```

Inspect status and logs:

```bash
docker compose ps
docker compose logs -f
docker compose logs -f backend
```

## Stop the stack

```bash
docker compose down
```

PostgreSQL data is stored in the named `postgres_data` volume and survives a normal `docker compose down`.

To remove the local Docker database as well:

```bash
docker compose down -v
```

This permanently deletes the Compose-managed PostgreSQL data.

## Networking

The browser only needs the frontend origin. The production React build uses relative `/api` URLs, and Nginx proxies them to the internal `backend:8000` service. PostgreSQL is only addressed by the backend through the internal Compose network using hostname `db`.

The default credentials in `compose.yaml` are development-only credentials. They are not intended for a public or production deployment.

## CI smoke test

GitHub Actions validates Docker Compose in addition to the unit, integration and browser suites. The Docker job:

1. validates the Compose configuration;
2. builds the frontend and backend images;
3. starts PostgreSQL, FastAPI and Nginx;
4. waits for container health checks;
5. verifies the frontend root, proxied `/health`, and proxied `/api/categories` endpoints;
6. tears the stack down with its test volume.
