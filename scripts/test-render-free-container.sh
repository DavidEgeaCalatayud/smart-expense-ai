#!/usr/bin/env bash
# Disposable CI fixture: external TLS PostgreSQL, same-origin edge and 512 MiB runtime.
set -euo pipefail
image="${1:?Pass the combined runtime image tag}"
fixture_dir="$(mktemp -d)"
network="free-smoke-${GITHUB_RUN_ID:-local}"
app_name="$network-app"
db_name="$network-db"
db_image="$network-postgres"
cleanup() {
  if [[ "$?" != 0 ]]; then docker logs "$app_name" || true; fi
  docker rm -f "$app_name" "$db_name" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  docker image rm "$db_image" >/dev/null 2>&1 || true
  rm -rf "$fixture_dir"
}
trap cleanup EXIT
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -keyout "$fixture_dir/server.key" -out "$fixture_dir/server.crt" \
  -subj '/CN=postgres' -addext 'subjectAltName=DNS:postgres' >/dev/null 2>&1
cat > "$fixture_dir/Dockerfile" <<'EOF'
FROM postgres:16
COPY --chown=postgres:postgres server.key server.crt /tls/
RUN chmod 600 /tls/server.key
EOF
docker build --quiet -t "$db_image" "$fixture_dir" >/dev/null
docker network create "$network" >/dev/null
docker run -d --name "$db_name" --network "$network" --network-alias postgres \
  -e POSTGRES_USER=fixture -e POSTGRES_PASSWORD=fixture -e POSTGRES_DB=finance \
  "$db_image" -c ssl=on -c ssl_cert_file=/tls/server.crt -c ssl_key_file=/tls/server.key >/dev/null
for attempt in $(seq 1 60); do
  if docker exec "$db_name" pg_isready -U fixture -d finance >/dev/null 2>&1; then break; fi
  sleep 1
done
docker run -d --name "$app_name" --network "$network" --memory=512m --memory-swap=512m \
  -p 127.0.0.1:18080:10000 \
  -v "$fixture_dir/server.crt:/etc/ssl/certs/ca-certificates.crt:ro" \
  -e APP_ENV=staging -e APP_DEBUG=false -e AUTH_COOKIE_SECURE=true \
  -e RENDER_EXTERNAL_URL=https://finance-fixture.onrender.com \
  -e 'DATABASE_URL=postgresql://fixture:fixture@postgres/finance?sslmode=require' \
  -e JWT_SECRET=ci-only-free-runtime-secret-at-least-32-bytes \
  -e OMP_NUM_THREADS=1 -e OPENBLAS_NUM_THREADS=1 -e WEB_CONCURRENCY=1 \
  "$image" >/dev/null
for attempt in $(seq 1 120); do
  if curl --fail --silent -H 'Host: finance-fixture.onrender.com' http://127.0.0.1:18080/health >/dev/null; then break; fi
  sleep 1
done
python scripts/test-render-free-http.py create "$fixture_dir/session.json"
docker restart "$app_name" >/dev/null
for attempt in $(seq 1 120); do
  if curl --fail --silent -H 'Host: finance-fixture.onrender.com' http://127.0.0.1:18080/health >/dev/null; then break; fi
  sleep 1
done
python scripts/test-render-free-http.py verify "$fixture_dir/session.json"
test "$(docker inspect -f '{{.State.OOMKilled}}' "$app_name")" = false
test "$(docker exec "$app_name" id -u)" != 0
docker stop --time 15 "$app_name" >/dev/null
test "$(docker inspect -f '{{.State.ExitCode}}' "$app_name")" = 0
echo 'Free runtime passed: authenticated PostgreSQL TLS, migrations, web/API, persistence, auth limits, 512 MiB startup and graceful shutdown.'
