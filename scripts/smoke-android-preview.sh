#!/usr/bin/env bash
# Smoke-test the same signed release APK, with no Metro and no E2E diagnostics.
set -euo pipefail
preview_package='com.davidegea.smartexpenseai.preview'
preview_output='dist/android-preview'
adb install "$preview_output/smart-expense-ai-preview.apk"
adb reverse --remove-all
adb logcat -c
adb shell input keyevent KEYCODE_WAKEUP
adb shell input keyevent 82
adb shell wm dismiss-keyguard || true
adb shell am start -W -a android.intent.action.MAIN \
  -c android.intent.category.LAUNCHER -n "$preview_package/.MainActivity"

capture_failure() {
  adb exec-out screencap -p > "$preview_output/launch-failure.png" || true
  adb logcat -d -s AndroidRuntime ReactNativeJS > "$preview_output/launch-failure.log" || true
  cat "$preview_output/launch-failure.log" >&2
}
trap 'capture_failure' ERR

for attempt in $(seq 1 30); do
  if ! adb shell pidof "$preview_package" >/dev/null; then
    echo 'The preview application process exited.' >&2
    capture_failure
    exit 1
  fi
  rm -f "$preview_output/launch.xml"
  adb shell uiautomator dump /sdcard/preview-launch.xml >/dev/null 2>&1 || true
  adb pull /sdcard/preview-launch.xml "$preview_output/launch.xml" >/dev/null 2>&1 || true
  # A fresh Google APIs emulator can show a Pixel Launcher ANR over the app.
  # Dismiss only that unrelated system dialog; never dismiss an app failure.
  if [[ -f "$preview_output/launch.xml" ]] && \
    grep -q "Pixel Launcher isn't responding" "$preview_output/launch.xml"; then
    close_coordinates="$(python - "$preview_output/launch.xml" <<'PY'
import re
import sys
from xml.etree import ElementTree as ET
for node in ET.parse(sys.argv[1]).iter('node'):
    if node.get('resource-id') == 'android:id/aerr_close':
        left, top, right, bottom = map(int, re.findall(r'\d+', node.get('bounds', '')))
        print((left + right) // 2, (top + bottom) // 2)
        break
PY
    )"
    if [[ "$close_coordinates" =~ ^[0-9]+\ [0-9]+$ ]]; then
      read -r close_x close_y <<< "$close_coordinates"
      echo 'Closing the unrelated Pixel Launcher ANR.'
      adb shell input tap "$close_x" "$close_y"
      sleep 1
      continue
    fi
  fi
  if [[ -f "$preview_output/launch.xml" ]] && \
    grep -Eq "isn't responding|Unable to load script" "$preview_output/launch.xml"; then
    echo 'An application error obscured the login form.' >&2
    capture_failure
    exit 1
  fi
  if [[ -f "$preview_output/launch.xml" ]] && \
    grep -q 'Welcome back' "$preview_output/launch.xml" && \
    grep -Eqi '(text|content-desc)="Email"' "$preview_output/launch.xml" && \
    grep -Eqi '(text|content-desc)="Password"' "$preview_output/launch.xml"; then
    adb shell pidof "$preview_package"
    adb exec-out screencap -p > "$preview_output/launch.png"
    python - <<'PY'
import json
import os
from pathlib import Path
path = Path('dist/android-preview/build-info.json')
info = json.loads(path.read_text())
info['emulatorSmoke'] = {'androidApi': 35, 'launchWithoutMetro': 'passed', 'loginForm': 'visible'}
info['acceptanceSourceSha'] = os.environ['GITHUB_SHA']
info['acceptanceWorkflowRun'] = os.environ['GITHUB_RUN_ID']
path.write_text(json.dumps(info, indent=2) + '\n')
PY
    exit 0
  fi
  sleep 2
done
capture_failure
echo 'Standalone preview did not reach the login form.' >&2
exit 1
