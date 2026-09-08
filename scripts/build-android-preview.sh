#!/usr/bin/env bash
# One-off, separately identified preview. Never use this signing key for Play.
set -euo pipefail

[[ "${APP_ENV:-}" == preview && "${ANDROID_STANDALONE_PREVIEW:-}" == 1 ]]
[[ "${EXPO_PUBLIC_API_BASE_URL:-}" == https://smart-expense-free.onrender.com ]]
[[ "${EXPO_PUBLIC_E2E_MODE:-}" != 1 ]]

npm run prebuild:android --workspace=@smart-expense-ai/mobile
grep -q '^expo\.sqlite\.useSQLCipher=true$' mobile/android/gradle.properties

umask 077
preview_signing_dir="$(mktemp -d "${RUNNER_TEMP:-/tmp}/android-preview-signing.XXXXXX")"
trap 'rm -rf "$preview_signing_dir"; unset PREVIEW_STORE_PASSWORD PREVIEW_KEYSTORE_PATH' EXIT
export PREVIEW_STORE_PASSWORD="$(openssl rand -hex 32)"
export PREVIEW_KEYSTORE_PATH="$preview_signing_dir/preview.p12"
if [[ "${GITHUB_ACTIONS:-}" == true ]]; then
  echo "::add-mask::$PREVIEW_STORE_PASSWORD"
fi
keytool -genkeypair -noprompt -keystore "$PREVIEW_KEYSTORE_PATH" \
  -storetype PKCS12 -storepass:env PREVIEW_STORE_PASSWORD \
  -keypass:env PREVIEW_STORE_PASSWORD -alias standalone-preview \
  -keyalg RSA -keysize 3072 -validity 3650 \
  -dname 'CN=Smart Expense AI One-off Preview'

# Override Expo's generated debug signing configuration before AGP creates variants.
# Credentials stay in this process environment and are never written to the repo.
cat >> mobile/android/app/build.gradle <<'GRADLE'

android {
    signingConfigs {
        standalonePreview {
            storeFile file(System.getenv('PREVIEW_KEYSTORE_PATH'))
            storePassword System.getenv('PREVIEW_STORE_PASSWORD')
            keyAlias 'standalone-preview'
            keyPassword System.getenv('PREVIEW_STORE_PASSWORD')
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.standalonePreview
        }
    }
}
GRADLE

(
  cd mobile/android
  ./gradlew :app:assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a,x86_64
)

mkdir -p dist/android-preview
preview_build_tools="$(find "${ANDROID_HOME:?}/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n 1)"
# Sign the final artifact explicitly as well, independently of AGP's selected
# signing variant. apksigner replaces existing signer blocks, then verifies the
# final bytes against the certificate exported from this exact keystore below.
"$preview_build_tools/zipalign" -P 16 -f 4 \
  mobile/android/app/build/outputs/apk/release/app-release.apk \
  "$preview_signing_dir/aligned.apk"
"$preview_build_tools/apksigner" sign \
  --ks "$PREVIEW_KEYSTORE_PATH" --ks-key-alias standalone-preview \
  --ks-pass env:PREVIEW_STORE_PASSWORD --key-pass env:PREVIEW_STORE_PASSWORD \
  --out dist/android-preview/smart-expense-ai-preview.apk \
  "$preview_signing_dir/aligned.apk"
"$preview_build_tools/apksigner" verify --verbose --print-certs \
  dist/android-preview/smart-expense-ai-preview.apk | tee dist/android-preview/signature.txt
"$preview_build_tools/zipalign" -c -P 16 4 dist/android-preview/smart-expense-ai-preview.apk
keytool -exportcert -keystore "$PREVIEW_KEYSTORE_PATH" -storepass:env PREVIEW_STORE_PASSWORD \
  -alias standalone-preview -file "$preview_signing_dir/certificate.der"
export PREVIEW_CERT_SHA256="$(sha256sum "$preview_signing_dir/certificate.der" | cut -d ' ' -f 1)"
"$preview_build_tools/aapt" dump badging dist/android-preview/smart-expense-ai-preview.apk \
  > dist/android-preview/apk-metadata.txt
"$preview_build_tools/aapt" dump xmltree dist/android-preview/smart-expense-ai-preview.apk AndroidManifest.xml \
  > "$preview_signing_dir/manifest.txt"
export PREVIEW_MANIFEST_PATH="$preview_signing_dir/manifest.txt"
python scripts/verify-android-preview.py
(
  cd dist/android-preview
  sha256sum smart-expense-ai-preview.apk > smart-expense-ai-preview.apk.sha256
)
