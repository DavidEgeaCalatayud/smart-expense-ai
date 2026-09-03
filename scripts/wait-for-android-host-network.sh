#!/usr/bin/env bash
set -euo pipefail

network_ready=0
for attempt in $(seq 1 60); do
  if adb shell 'toybox nc -z -w 2 10.0.2.2 8000' >/dev/null 2>&1 \
    && adb shell 'toybox nc -z -w 2 10.0.2.2 8081' >/dev/null 2>&1; then
    network_ready=1
    break
  fi
  sleep 1
done

if [[ "$network_ready" != '1' ]]; then
  echo 'Android emulator could not reach FastAPI and Metro through 10.0.2.2.' >&2
  adb shell ip route >&2 || true
  adb shell getprop sys.boot_completed >&2 || true
  exit 1
fi

echo 'Android emulator host networking is ready: 10.0.2.2:8000 and :8081 reachable.'
