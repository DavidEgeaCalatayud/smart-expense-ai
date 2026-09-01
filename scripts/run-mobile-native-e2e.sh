#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ID='com.davidegea.smartexpenseai'
DATABASE_NAME='smart-expense-ai-secure.db'
DATABASE_PATH="files/SQLite/$DATABASE_NAME"
LEGACY_DATABASE_PATH='files/SQLite/smart-expense-ai.db'
APK_PATH='mobile/android/app/build/outputs/apk/debug/app-debug.apk'
MAESTRO_RESULTS="${RUNNER_TEMP:-/tmp}/maestro-results"
BACKEND_PID_FILE="${RUNNER_TEMP:-/tmp}/mobile-e2e-backend.pid"
BACKEND_LOG="${RUNNER_TEMP:-/tmp}/mobile-e2e-backend.log"
METRO_LOG="${RUNNER_TEMP:-/tmp}/mobile-e2e-metro.log"
PREWARM_LAUNCH_LOG="${RUNNER_TEMP:-/tmp}/android-e2e-app-prewarm.log"
PREWARM_LOGCAT="${RUNNER_TEMP:-/tmp}/android-e2e-app-prewarm-logcat.log"
PREWARM_ACTIVITY_DUMP="${RUNNER_TEMP:-/tmp}/android-e2e-app-prewarm-activity.txt"
PREWARM_REVERSE_LOG="${RUNNER_TEMP:-/tmp}/android-e2e-adb-reverse.txt"
PREWARM_UI_HOST_DUMP="${RUNNER_TEMP:-/tmp}/android-e2e-app-prewarm-ui.xml"
PREWARM_UI_DUMP='/sdcard/smart-expense-ai-prewarm.xml'

mkdir -p "$MAESTRO_RESULTS"
export MAESTRO_CLI_NO_ANALYTICS=1

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

print_database_file_diagnostics() {
  local path
  echo 'On-device SQLite diagnostics:' >&2
  adb shell run-as "$PACKAGE_ID" sh -c 'ls -la files/SQLite 2>/dev/null || true' >&2 || true

  for path in "$DATABASE_PATH" "$LEGACY_DATABASE_PATH"; do
    if adb shell run-as "$PACKAGE_ID" test -f "$path" >/dev/null 2>&1; then
      local size
      local header
      size="$({ adb exec-out run-as "$PACKAGE_ID" cat "$path" | wc -c | tr -d ' \r\n'; } || true)"
      header="$({ adb exec-out run-as "$PACKAGE_ID" cat "$path" | head -c 16 | od -An -tx1 | tr -d ' \n'; } || true)"
      echo "  $path size=${size:-unknown} header=${header:-unavailable}" >&2
    else
      echo "  $path absent" >&2
    fi
  done
}

capture_prewarm_diagnostics() {
  {
    echo '=== adb reverse --list ==='
    adb reverse --list || true
  } > "$PREWARM_REVERSE_LOG" 2>&1
  adb shell dumpsys activity activities > "$PREWARM_ACTIVITY_DUMP" 2>&1 || true
  adb logcat -d -v threadtime > "$PREWARM_LOGCAT" 2>&1 || true
  if adb shell uiautomator dump "$PREWARM_UI_DUMP" > /dev/null 2>&1; then
    adb exec-out cat "$PREWARM_UI_DUMP" > "$PREWARM_UI_HOST_DUMP" 2>/dev/null || true
    adb shell rm -f "$PREWARM_UI_DUMP" || true
  fi
}

launch_android_app() {
  local label="$1"
  local launch_output

  adb shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true
  adb shell input keyevent 82 >/dev/null 2>&1 || true
  adb shell wm dismiss-keyguard >/dev/null 2>&1 || true
  adb shell am force-stop "$PACKAGE_ID" >/dev/null 2>&1 || true
  adb reverse tcp:8081 tcp:8081 >/dev/null

  if ! launch_output="$(
    adb shell am start -W \
      -a android.intent.action.MAIN \
      -c android.intent.category.LAUNCHER \
      -n "$PACKAGE_ID/.MainActivity" 2>&1
  )"; then
    {
      echo "=== $label ==="
      printf '%s\n' "$launch_output"
    } >> "$PREWARM_LAUNCH_LOG"
    return 1
  fi

  {
    echo "=== $label ==="
    printf '%s\n' "$launch_output"
    echo '--- process ---'
    adb shell pidof "$PACKAGE_ID" || true
    echo '--- reverse ---'
    adb reverse --list || true
  } >> "$PREWARM_LAUNCH_LOG" 2>&1

  if grep -qiE '(^|[[:space:]])(Error|Exception):' <<<"$launch_output"; then
    return 1
  fi
  adb shell pidof "$PACKAGE_ID" >/dev/null 2>&1
}

metro_log_since() {
  local initial_lines="$1"
  tail -n "+$((initial_lines + 1))" "$METRO_LOG" 2>/dev/null | tr '\r' '\n'
}

wait_for_metro_pattern() {
  local initial_lines="$1"
  local pattern="$2"
  local attempts="$3"

  for attempt in $(seq 1 "$attempts"); do
    # Do not use grep -q here: with pipefail an early grep exit can SIGPIPE tail/tr and turn a
    # successful match into status 141. Reading the short Metro delta fully keeps the probe stable.
    if metro_log_since "$initial_lines" | grep -E "$pattern" > /dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

prewarm_android_bundle() {
  local initial_lines=0
  if [[ -f "$METRO_LOG" ]]; then
    initial_lines="$(wc -l < "$METRO_LOG")"
  fi

  : > "$PREWARM_LAUNCH_LOG"
  adb logcat -c || true

  # Native debug builds discover Metro only after the activity starts. On hosted Android emulators,
  # the first launch can occasionally remain behind the keyguard or keep a stale dev-server socket.
  # Make the launch explicit and retry once only when Metro has received no Android bundle request.
  if ! launch_android_app 'launch-1'; then
    echo 'The first Android activity launch failed.' >&2
  fi

  if ! wait_for_metro_pattern "$initial_lines" 'Android .*index\.ts' 25; then
    echo 'Metro received no Android bundle request after the first launch; retrying the activity once.' >&2
    {
      echo '--- first-launch logcat tail ---'
      adb logcat -d -t 250 || true
    } >> "$PREWARM_LAUNCH_LOG" 2>&1

    if ! launch_android_app 'launch-2'; then
      echo 'The Android activity retry failed.' >&2
      capture_prewarm_diagnostics
      print_database_file_diagnostics
      return 1
    fi

    if ! wait_for_metro_pattern "$initial_lines" 'Android .*index\.ts' 25; then
      echo 'Android never requested its development bundle from Metro.' >&2
      tail -n 200 "$METRO_LOG" >&2 || true
      capture_prewarm_diagnostics
      print_database_file_diagnostics
      return 1
    fi
  fi

  # Expo CLI reports the entrypoint as "index.ts" in this workspace. Do not require a repository
  # path prefix: progress and completion lines use different display forms across Expo/Metro builds.
  if ! wait_for_metro_pattern "$initial_lines" 'Android Bundled .*index\.ts' 120; then
    echo 'Android requested Metro but the development bundle did not finish during E2E prewarm.' >&2
    tail -n 200 "$METRO_LOG" >&2 || true
    capture_prewarm_diagnostics
    print_database_file_diagnostics
    return 1
  fi

  # Reaching the unauthenticated UI proves the full key -> migration -> encryption verification
  # chain completed. Only then force-stop so the first Maestro flow also proves SQLCipher reopens
  # with the persisted SecureStore key after process death.
  for attempt in $(seq 1 60); do
    if adb shell uiautomator dump "$PREWARM_UI_DUMP" > /dev/null 2>&1 \
      && adb shell cat "$PREWARM_UI_DUMP" 2>/dev/null | grep 'Welcome back' > /dev/null; then
      adb shell rm -f "$PREWARM_UI_DUMP" || true
      adb shell am force-stop "$PACKAGE_ID"
      return 0
    fi

    if adb logcat -d -t 300 2>/dev/null | grep 'file is not a database' > /dev/null; then
      echo 'SQLCipher failed before the Android prewarm reached the login screen.' >&2
      tail -n 200 "$METRO_LOG" >&2 || true
      capture_prewarm_diagnostics
      print_database_file_diagnostics
      return 1
    fi
    sleep 1
  done

  echo 'Android app did not finish native initialization during E2E prewarm.' >&2
  tail -n 200 "$METRO_LOG" >&2 || true
  capture_prewarm_diagnostics
  print_database_file_diagnostics
  return 1
}

adb wait-for-device
adb reverse tcp:8081 tcp:8081 >/dev/null
adb install -r "$APK_PATH"

# Guarantee a deterministic empty app sandbox once, before SQLCipher creates its database key.
# All subsequent flows preserve app state so the encrypted database and SecureStore key stay paired.
adb shell pm clear "$PACKAGE_ID" > /dev/null
adb reverse tcp:8081 tcp:8081 >/dev/null
prewarm_android_bundle

# Real FastAPI registration proves the native auth path and creates the first account boundary.
run_flow register mobile/.maestro/01-register.yaml

# Expo SQLite stores Android databases under context.filesDir/SQLite by default. SQLCipher
# databases must not expose the standard plaintext SQLite header at that real on-device path.
plaintext_header='53514c69746520666f726d6174203300'
encrypted_header="$({ adb exec-out run-as "$PACKAGE_ID" cat "$DATABASE_PATH" | head -c 16 | od -An -tx1 | tr -d ' \n'; } || true)"
if [[ -z "$encrypted_header" ]]; then
  echo "Could not read the encrypted database header through run-as at $DATABASE_PATH." >&2
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
