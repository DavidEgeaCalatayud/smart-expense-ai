# Stable Android release preparation

This is the final repository-side gate between a physically accepted permanent Android build and a stable GitHub release such as `v1.0.0`.

It deliberately does **not** promote an RC or preview. A stable release must be rebuilt with a stable version (for example `1.0.0` rather than `1.0.0-rc.1`), signed with the permanent Android identity, and physically accepted again on those exact APK/AAB bytes.

## Preconditions

Before running this step, all of the following must already exist:

1. The exact source revision is on `main` and has passed the complete release-source certification.
2. `Signed Android distribution` produced `smart-expense-ai.apk`, `smart-expense-ai.aab` and `build-info.json` with the permanent certificate.
3. The APK/AAB version is stable semantic versioning with no prerelease suffix.
4. The exact permanent-signed bytes passed the complete physical-device matrix in `docs/android-money-device-acceptance.md`.
5. The completed raw acceptance JSON is stored privately by the owner.

The raw physical acceptance record may include device-specific information. It is evidence for the verifier, not a public release asset.

## Prepare the stable bundle

From the repository root:

```bash
python scripts/prepare-android-stable-release.py \
  --artifacts dist/android-distribution \
  --acceptance /secure/path/android-v1-acceptance.json \
  --output dist/android-stable-release \
  --tag v1.0.0
```

The command re-runs `verify-release-acceptance.py` against the original APK/AAB bytes. It then requires the tag to be a non-prerelease semantic version that exactly matches the version embedded in `build-info.json`.

The command rejects:

- `v1.0.0-rc.1` or any other prerelease tag;
- a build whose version still contains `-rc.N`;
- a stable tag that differs from the build version;
- preview/temporary signing identities;
- a package other than `com.davidegea.smartexpenseai`;
- APK/AAB bytes changed after physical acceptance;
- incomplete, emulator-only or mismatched physical acceptance;
- a non-empty output directory, avoiding accidental replacement/mixing of release assets.

## Public output

A successful run creates only:

- `smart-expense-ai.apk` — direct-install permanent-signed Android package;
- `smart-expense-ai.aab` — Play upload bundle;
- `build-info.json` — original permanent build identity;
- `SHA256SUMS` — hashes of the exact stable APK/AAB;
- `acceptance-proof.json` — sanitized proof that the exact bytes passed physical acceptance;
- `RELEASE_NOTES.md` — minimal release provenance note.

`acceptance-proof.json` contains the source SHA, package/version/versionCode, backend origin, signing certificate, artifact hashes, acceptance timestamp and SHA-256 of the private acceptance evidence. It intentionally omits the device model and the complete step-by-step acceptance matrix.

Do **not** copy the raw physical acceptance JSON into a public GitHub release.

## Publishing `v1.0.0`

Before creating the GitHub Release:

1. Confirm the stable tag does not already exist. Never move or overwrite an existing stable tag.
2. Confirm `acceptance-proof.json` identifies the same source revision and artifact hashes as `build-info.json` and `SHA256SUMS`.
3. Publish only the files from `dist/android-stable-release` that are intended to be public.
4. Target the exact accepted source commit.
5. Mark the GitHub Release as stable, not prerelease.

A GitHub stable release is still distinct from Google Play publication. Store rollout additionally requires Play Console ownership, internal/store-delivered testing, privacy/data-safety declarations and the applicable store review process.

Likewise, this Android release proof does not establish real password-recovery email delivery, independent real-data model accuracy, central monitoring, billing or other separately documented acceptance items.
