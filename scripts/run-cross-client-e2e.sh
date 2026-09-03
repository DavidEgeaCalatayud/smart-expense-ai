#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ID='com.davidegea.smartexpenseai'
MAESTRO_RESULTS="${RUNNER_TEMP:-/tmp}/maestro-results"
BACKEND_PID_FILE="${RUNNER_TEMP:-/tmp}/mobile-e2e-backend.pid"
BACKEND_LOG="${RUNNER_TEMP:-/tmp}/mobile-e2e-backend.log"
SERVER_HELPER='scripts/mobile-e2e-server-helper.py'
e2e_email_b="mobile-e2e-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-b@example.com"
e2e_password='mobile-e2e-password-123'

run_flow() {
  local name="$1"
  shift
  maestro test \
    -e E2E_EMAIL_B="$e2e_email_b" \
    -e E2E_PASSWORD="$e2e_password" \
    --test-output-dir "$MAESTRO_RESULTS/$name" \
    "$@"
}

wait_for_backend() {
  for attempt in $(seq 1 60); do
    if curl --fail --silent http://127.0.0.1:8000/health > /dev/null; then
      return 0
    fi
    sleep 1
  done
  echo 'FastAPI did not become healthy for cross-client E2E.' >&2
  tail -n 200 "$BACKEND_LOG" >&2 || true
  return 1
}

stop_backend() {
  if [[ -f "$BACKEND_PID_FILE" ]]; then
    local pid
    pid="$(cat "$BACKEND_PID_FILE")"
    kill "$pid" 2>/dev/null || true
    for attempt in $(seq 1 30); do
      if ! kill -0 "$pid" 2>/dev/null; then
        break
      fi
      sleep 0.2
    done
    kill -9 "$pid" 2>/dev/null || true
    rm -f "$BACKEND_PID_FILE"
  fi
}

start_backend() {
  stop_backend
  (
    cd backend
    nohup python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 \
      >> "$BACKEND_LOG" 2>&1 &
    echo $! > "$BACKEND_PID_FILE"
  )
  wait_for_backend
}

server_helper_b() {
  python "$SERVER_HELPER" \
    --email "$e2e_email_b" \
    --password "$e2e_password" \
    "$@"
}

# Account B was created as the final invariant of the native suite and is intentionally empty.
# Prove a real browser write is pulled into the same account by the native sync engine.
(
  cd frontend
  node e2e/cross-client-driver.mjs create-web "$e2e_email_b" "$e2e_password"
)
run_flow web-to-android mobile/.maestro/09-pull-web-transaction.yaml

# Prove the reverse direction from a genuinely disconnected device. FastAPI is stopped before the
# local mutation exists, and the Android process is killed before the server comes back. The host
# then proves PostgreSQL does not contain the row until Android is relaunched and foreground sync
# runs against the durable SQLCipher outbox.
stop_backend
run_flow android-offline-create mobile/.maestro/10-create-offline-native-transaction.yaml

adb shell am force-stop "$PACKAGE_ID"
start_backend
server_helper_b assert-absent --merchant 'Native Bridge Coffee'
echo 'Cross-client server absence verified: Native Bridge Coffee is not in PostgreSQL before Android relaunch.'

run_flow android-reconnect-sync mobile/.maestro/11-reconnect-native-transaction.yaml
server_helper_b wait-present --merchant 'Native Bridge Coffee' --timeout-seconds 60
echo 'Cross-client server presence verified: Native Bridge Coffee reached PostgreSQL after Android relaunch and sync.'

(
  cd frontend
  node e2e/cross-client-driver.mjs assert-native "$e2e_email_b" "$e2e_password"
)

echo 'Cross-client E2E invariants passed: browser create -> Android pull and Android offline create -> server -> browser read.'
