#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ID='com.davidegea.smartexpenseai'
DATABASE_NAME='smart-expense-ai-secure.db'
APK_PATH='mobile/android/app/build/outputs/apk/debug/app-debug.apk'
MAESTRO_RESULTS="${RUNNER_TEMP:-/tmp}/maestro-results"
BACKEND_PID_FILE="${RUNNER_TEMP:-/tmp}/mobile-e2e-backend.pid"
BACKEND_LOG="${RUNNER_TEMP:-/tmp}/mobile-e2e-backend.log"

mkdir -p "$MAESTRO_RESULTS"

e2e_email_a="mobile-e2e-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-a@example.com"
e2e_email_b="mobile-e2e-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-b@example.com"
e2e_password='mobile-e2e-password-123'

wait_for_backend() {
  for attempt in $(seq 1 60); do
    if curl --fail --silent http://127.0.0.1:8000/health > /dev/null; then
      return 0
    fi
    sleep 1
  done
  echo 'FastAPI did not become healthy for Android E2E.' >&2
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

run_flow() {
  local name="$1"
  shift
  maestro test \
    -e E2E_EMAIL_A="$e2e_email_a" \
    -e E2E_EMAIL_B="$e2e_email_b" \
    -e E2E_PASSWORD="$e2e_password" \
    --test-output-dir "$MAESTRO_RESULTS/$name" \
    "$@"
}

adb wait-for-device
adb reverse tcp:8081 tcp:8081
adb install -r "$APK_PATH"

# Real FastAPI registration proves the native auth path and creates the first account boundary.
run_flow register mobile/.maestro/01-register.yaml

# SQLCipher databases must not expose the standard plaintext SQLite header on disk.
plaintext_header='53514c69746520666f726d6174203300'
encrypted_header="$({ adb exec-out run-as "$PACKAGE_ID" cat "databases/$DATABASE_NAME" | head -c 16 | od -An -tx1 | tr -d ' \n'; } || true)"
if [[ -z "$encrypted_header" ]]; then
  echo 'Could not read the encrypted database header through run-as.' >&2
  exit 1
fi
if [[ "$encrypted_header" == "$plaintext_header" ]]; then
  echo 'The hardened mobile database still has a plaintext SQLite header.' >&2
  exit 1
fi

# Take the API offline before persisting user intent. The UI write must remain durable locally.
stop_backend
run_flow create-offline mobile/.maestro/02-create-offline.yaml

# Simulate process death. Reopening must retain both the row and its pending sync state.
adb shell am force-stop "$PACKAGE_ID"
run_flow restart-offline mobile/.maestro/03-verify-offline-restart.yaml

# Restore the real backend and prove that the retained mutation converges to authoritative state.
start_backend
run_flow reconnect-sync mobile/.maestro/04-reconnect-sync.yaml

# Explicit logout followed by a second account must expose an empty local workspace.
run_flow account-isolation mobile/.maestro/05-account-isolation.yaml

echo 'Android native E2E invariants passed.'
