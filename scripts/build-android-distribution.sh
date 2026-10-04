#!/usr/bin/env bash
# Owner-controlled permanent key only. This workflow never generates or rotates it.
set -euo pipefail
[[ "${APP_ENV:-}" == production && "${EXPO_PUBLIC_E2E_MODE:-}" != 1 ]]
[[ "${ANDROID_STANDALONE_PREVIEW:-}" != 1 ]]
for name in ANDROID_KEYSTORE_BASE64 ANDROID_STORE_PASSWORD ANDROID_KEY_PASSWORD ANDROID_KEY_ALIAS ANDROID_CERT_SHA256; do
  if [[ -z "${!name:-}" ]]; then echo "Missing required signing setting: $name" >&2; exit 1; fi
done
umask 077
signing_dir="$(mktemp -d "${RUNNER_TEMP:-/tmp}/android-distribution.XXXXXX")"
trap 'rm -rf "$signing_dir"; unset ANDROID_KEYSTORE_PATH ANDROID_KEYSTORE_BASE64 ANDROID_STORE_PASSWORD ANDROID_KEY_PASSWORD' EXIT
export ANDROID_KEYSTORE_PATH="$signing_dir/release.keystore"
printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 --decode > "$ANDROID_KEYSTORE_PATH"
unset ANDROID_KEYSTORE_BASE64
keytool -exportcert -keystore "$ANDROID_KEYSTORE_PATH" -storepass:env ANDROID_STORE_PASSWORD \
  -alias "$ANDROID_KEY_ALIAS" -file "$signing_dir/certificate.der"
actual_certificate="$(sha256sum "$signing_dir/certificate.der" | cut -d ' ' -f 1)"
expected_certificate="$(printf '%s' "$ANDROID_CERT_SHA256" | tr -d ':' | tr '[:upper:]' '[:lower:]')"
[[ "$expected_certificate" =~ ^[0-9a-f]{64}$ && "$actual_certificate" == "$expected_certificate" ]] || {
  echo 'Signing identity does not match the registered certificate.' >&2; exit 1;
}
export ANDROID_CERT_SHA256="$expected_certificate"
npm run prebuild:android --workspace=@smart-expense-ai/mobile
grep -q '^expo\.sqlite\.useSQLCipher=true$' mobile/android/gradle.properties
cat >> mobile/android/app/build.gradle <<'GRADLE'

android {
    signingConfigs {
        ownerRelease {
            storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))
            storePassword System.getenv('ANDROID_STORE_PASSWORD')
            keyAlias System.getenv('ANDROID_KEY_ALIAS')
            keyPassword System.getenv('ANDROID_KEY_PASSWORD')
        }
    }
    buildTypes {
        release { signingConfig signingConfigs.ownerRelease }
    }
}
GRADLE
(
  cd mobile/android
  ./gradlew :app:assembleRelease :app:bundleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a,x86_64
)
mkdir -p dist/android-distribution
cp mobile/android/app/build/outputs/apk/release/app-release.apk dist/android-distribution/smart-expense-ai.apk
cp mobile/android/app/build/outputs/bundle/release/app-release.aab dist/android-distribution/smart-expense-ai.aab
build_tools="$(find "${ANDROID_HOME:?}/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n 1)"
"$build_tools/apksigner" verify --verbose --print-certs dist/android-distribution/smart-expense-ai.apk \
  > dist/android-distribution/apk-signature.txt
"$build_tools/zipalign" -c -P 16 4 dist/android-distribution/smart-expense-ai.apk
"$build_tools/aapt" dump badging dist/android-distribution/smart-expense-ai.apk > dist/android-distribution/apk-metadata.txt
"$build_tools/aapt" dump xmltree dist/android-distribution/smart-expense-ai.apk AndroidManifest.xml \
  > dist/android-distribution/apk-manifest.txt
# Self-signed Android certificates have no CA trust chain. Strict exit 4 is
# expected for that case; unsigned entries (16) and other errors are rejected.
set +e
jarsigner -verify -verbose -certs -strict dist/android-distribution/smart-expense-ai.aab \
  > dist/android-distribution/aab-signature.txt 2>&1
jar_status=$?
set -e
[[ "$jar_status" == 0 || "$jar_status" == 4 ]]
grep -q 'jar verified' dist/android-distribution/aab-signature.txt
if grep -Eqi 'unsigned entries|has expired|not yet valid|disabled algorithm' dist/android-distribution/aab-signature.txt; then
  echo 'AAB signature validation failed.' >&2; exit 1
fi
keytool -printcert -jarfile dist/android-distribution/smart-expense-ai.aab > dist/android-distribution/aab-certificate.txt
python scripts/verify-android-distribution.py
(
  cd dist/android-distribution
  sha256sum smart-expense-ai.apk smart-expense-ai.aab > SHA256SUMS
)
