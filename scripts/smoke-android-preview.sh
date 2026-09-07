#!/usr/bin/env bash
# Smoke-test the same signed release APK, with no Metro and no E2E diagnostics.
set -euo pipefail
preview_package='com.davidegea.smartexpenseai.preview'
preview_output='dist/android-preview'
adb install "$preview_output/smart-expense-ai-preview.apk"
adb reverse --remove-all
adb logcat -c
adb shell am start -W -n "$preview_package/.MainActivity"

for attempt in $(seq 1 30); do
  adb shell uiautomator dump /sdcard/preview-launch.xml >/dev/null 2>&1 || true
  adb pull /sdcard/preview-launch.xml "$preview_output/launch.xml" >/dev/null 2>&1 || true
  if [[ -f "$preview_output/launch.xml" ]] && \
    grep -Eqi '(text|content-desc)="Email"' "$preview_output/launch.xml" && \
    grep -Eqi '(text|content-desc)="Password"' "$preview_output/launch.xml"; then
    adb shell pidof "$preview_package"
    adb exec-out screencap -p > "$preview_output/launch.png"
    python - <<'PY'
import json
from pathlib import Path
path = Path('dist/android-preview/build-info.json')
info = json.loads(path.read_text())
info['emulatorSmoke'] = {'androidApi': 35, 'launchWithoutMetro': 'passed', 'loginForm': 'visible'}
path.write_text(json.dumps(info, indent=2) + '\n')
PY
    exit 0
  fi
  sleep 2
done
adb logcat -d -s AndroidRuntime ReactNativeJS > "$preview_output/launch-failure.log"
cat "$preview_output/launch-failure.log" >&2
echo 'Standalone preview did not reach the login form.' >&2
exit 1
