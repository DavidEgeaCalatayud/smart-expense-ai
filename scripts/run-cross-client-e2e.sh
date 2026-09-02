#!/usr/bin/env bash
set -euo pipefail

MAESTRO_RESULTS="${RUNNER_TEMP:-/tmp}/maestro-results"
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

(
  cd frontend
  node e2e/cross-client-driver.mjs create-web "$e2e_email_b" "$e2e_password"
)
run_flow web-to-android mobile/.maestro/09-pull-web-transaction.yaml

run_flow android-to-web mobile/.maestro/10-create-and-sync-native-transaction.yaml
(
  cd frontend
  node e2e/cross-client-driver.mjs assert-native "$e2e_email_b" "$e2e_password"
)

echo 'Cross-client E2E invariants passed: browser create -> Android pull and Android create -> browser read.'
