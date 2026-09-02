#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ID='com.davidegea.smartexpenseai'
DATABASE_NAME='smart-expense-ai-secure.db'
DATABASE_PATH="files/SQLite/$DATABASE_NAME"
LEGACY_DATABASE_NAME='smart-expense-ai.db'
LEGACY_DATABASE_PATH="files/SQLite/$LEGACY_DATABASE_NAME"
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
JOBSCHEDULER_LOG="${RUNNER_TEMP:-/tmp}/mobile-e2e-jobscheduler.txt"
LEGACY_FIXTURE="${RUNNER_TEMP:-/tmp}/smart-expense-ai-legacy-fixture.db"
SERVER_HELPER='scripts/mobile-e2e-server-helper.py'

mkdir -p "$MAESTRO_RESULTS"
export MAESTRO_CLI_NO_ANALYTICS=1

e2e_email_a="mobile-e2e-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-a@example.com"
e2e_email_b="mobile-e2e-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-b@example.com"
e2e_password='mobile-e2e-password-123'
plaintext_header='53514c69746520666f726d6174203300'

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

server_helper() {
  python "$SERVER_HELPER" \
    --email "$e2e_email_a" \
    --password "$e2e_password" \
    "$@"
}

read_database_header() {
  local path="$1"
  { adb exec-out run-as "$PACKAGE_ID" cat "$path" | head -c 16 | od -An -tx1 | tr -d ' \n'; } || true
}

assert_encrypted_database_header() {
  local header
  header="$(read_database_header "$DATABASE_PATH")"
  if [[ -z "$header" ]]; then
    echo "Could not read the encrypted database header through run-as at $DATABASE_PATH." >&2
    print_database_file_diagnostics
    return 1
  fi
  if [[ "$header" == "$plaintext_header" ]]; then
    echo 'The hardened mobile database still has a plaintext SQLite header.' >&2
    return 1
  fi
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
      header="$(read_database_header "$path")"
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

wait_for_login_ui() {
  # The React Native host can report Metro reachable and start loadJSBundleFromMetro several
  # seconds before Expo emits a bundle progress line. UI readiness is the integration invariant;
  # Metro text is diagnostic only. Do not relaunch a healthy process while it is still loading.
  for attempt in $(seq 1 120); do
    if ! adb shell pidof "$PACKAGE_ID" >/dev/null 2>&1; then
      echo 'Android process exited before React initialization completed.' >&2
      return 1
    fi

    if adb shell uiautomator dump "$PREWARM_UI_DUMP" > /dev/null 2>&1 \
      && adb shell cat "$PREWARM_UI_DUMP" 2>/dev/null | grep 'Welcome back' > /dev/null; then
      adb shell rm -f "$PREWARM_UI_DUMP" || true
      return 0
    fi

    if adb logcat -d -t 400 2>/dev/null | grep 'file is not a database' > /dev/null; then
      echo 'SQLCipher failed before the Android prewarm reached the login screen.' >&2
      return 1
    fi
    sleep 1
  done
  return 1
}

prewarm_android_bundle() {
  : > "$PREWARM_LAUNCH_LOG"
  adb logcat -c || true

  if ! launch_android_app 'launch-1'; then
    echo 'The Android activity launch failed.' >&2
    capture_prewarm_diagnostics
    print_database_file_diagnostics
    return 1
  fi

  if ! wait_for_login_ui; then
    echo 'Android app did not finish native/React initialization during E2E prewarm.' >&2
    tail -n 200 "$METRO_LOG" >&2 || true
    capture_prewarm_diagnostics
    print_database_file_diagnostics
    return 1
  fi

  # Reaching the unauthenticated UI proves the full key -> migration -> encryption verification
  # chain completed. Force-stop so the following Maestro flow also proves that the persisted
  # SecureStore key reopens the encrypted database after process death.
  adb shell am force-stop "$PACKAGE_ID"
}

install_legacy_fixture() {
  python scripts/create-mobile-legacy-fixture.py "$LEGACY_FIXTURE"
  adb shell run-as "$PACKAGE_ID" mkdir -p files/SQLite
  adb exec-in run-as "$PACKAGE_ID" sh -c "cat > '$LEGACY_DATABASE_PATH'" < "$LEGACY_FIXTURE"
  if ! adb shell run-as "$PACKAGE_ID" test -f "$LEGACY_DATABASE_PATH" >/dev/null 2>&1; then
    echo 'Could not install the plaintext legacy SQLite fixture inside the app sandbox.' >&2
    return 1
  fi
}

assert_legacy_plaintext_removed() {
  if adb shell run-as "$PACKAGE_ID" test -f "$LEGACY_DATABASE_PATH" >/dev/null 2>&1; then
    echo 'Legacy plaintext SQLite file still exists after the SQLCipher migration.' >&2
    print_database_file_diagnostics
    return 1
  fi
}

find_workmanager_job_id() {
  adb shell dumpsys jobscheduler > "$JOBSCHEDULER_LOG"
  local context
  context="$(grep -B 10 -A 10 -F "$PACKAGE_ID/androidx.work.impl.background.systemjob.SystemJobService" "$JOBSCHEDULER_LOG" || true)"
  if [[ -z "$context" ]]; then
    echo 'No WorkManager SystemJobService registration was found for the authenticated app.' >&2
    return 1
  fi

  local job_id
  # Android identifies app UIDs as values such as u0a123, so the JobScheduler header is commonly
  # "JOB #u0a123/42" rather than "JOB #u0/42". Parse the numeric job id after the slash only.
  job_id="$(grep -Eo 'JOB #[^/[:space:]]+/[0-9]+' <<<"$context" | head -n 1 | sed 's#^.*/##' || true)"
  if [[ -z "$job_id" ]]; then
    echo 'WorkManager registration exists but its JobScheduler ID could not be parsed.' >&2
    cat "$JOBSCHEDULER_LOG" >&2 || true
    return 1
  fi
  printf '%s\n' "$job_id"
}

adb wait-for-device
adb reverse tcp:8081 tcp:8081 >/dev/null
adb install -r "$APK_PATH"

# 0. Exercise a real plaintext Expo-SQLite -> SQLCipher migration before any account is bound.
adb shell pm clear "$PACKAGE_ID" > /dev/null
adb reverse tcp:8081 tcp:8081 >/dev/null
install_legacy_fixture
prewarm_android_bundle
run_flow legacy-migration mobile/.maestro/00-legacy-migration.yaml
assert_legacy_plaintext_removed
assert_encrypted_database_header

# Reset the migration probe. The remaining scenarios intentionally start from a clean workspace.
adb shell pm clear "$PACKAGE_ID" > /dev/null
adb reverse tcp:8081 tcp:8081 >/dev/null
prewarm_android_bundle

# 1. Real FastAPI registration creates account A and the initial account boundary.
run_flow register mobile/.maestro/01-register.yaml
assert_encrypted_database_header

# 2. Take the API offline and persist a mutation locally.
stop_backend
run_flow create-offline mobile/.maestro/02-create-offline.yaml

# 3. Simulate process death; the encrypted local row and pending outbox must survive.
adb shell am force-stop "$PACKAGE_ID"
run_flow restart-offline mobile/.maestro/03-verify-offline-restart.yaml

# 4. Reconnect to the real backend and converge the retained mutation.
start_backend
run_flow reconnect-sync mobile/.maestro/04-reconnect-sync.yaml

# 5. Advance the same server transaction through an independent legitimate mobile session. The app
# retains V1 locally, edits from that stale base, receives stale_version and resolves with server V2.
server_helper mutate --from-merchant 'Offline Coffee' --to-merchant 'Server Coffee'
run_flow stale-version-conflict mobile/.maestro/05-stale-version-conflict.yaml

# 6. Create another durable mutation while offline; this one must be pushed by the actual Android
# WorkManager/JobScheduler execution, not by the foreground Sync now path.
stop_backend
run_flow create-background-offline mobile/.maestro/06-create-background-offline.yaml
adb shell input keyevent 3
sleep 2
job_id="$(find_workmanager_job_id)"
echo "Forcing WorkManager JobScheduler job $job_id."

# Keep the app in the background. Start FastAPI only after the JobScheduler registration has been
# observed, prove the row is absent server-side, then force the registered native worker.
start_backend
server_helper assert-absent --merchant 'Background Worker Coffee'
adb shell cmd jobscheduler run -f "$PACKAGE_ID" "$job_id"
server_helper wait-present --merchant 'Background Worker Coffee' --timeout-seconds 90

# Prevent a foreground sync from manufacturing the final local status. With FastAPI offline again,
# the following launch can show Synced only if the background worker already updated SQLCipher.
stop_backend
run_flow verify-background-sync mobile/.maestro/07-verify-background-sync.yaml

# 7. Explicit logout and a second account must clear all account-A data and conflict residue.
start_backend
run_flow account-isolation mobile/.maestro/08-account-isolation.yaml

assert_encrypted_database_header
echo 'Android native E2E invariants passed: SQLCipher migration, durable offline restart, reconnect sync, stale-version resolution, WorkManager background sync and account isolation.'
