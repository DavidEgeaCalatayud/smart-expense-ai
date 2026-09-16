# Android distribution runbook

## Current boundary

The HTTPS backend is deployed at `https://smart-expense-free.onrender.com`, backed by Neon PostgreSQL. PR #103 records the live API, authentication, synchronization, deletion and redeployment-persistence checks. A linked EAS project and permanent Android signing identity are still pending. Native/cross-client E2E alone does not establish that an official signed release has been delivered.

| Artifact | Purpose | Distribution |
| --- | --- | --- |
| Native E2E debug APK | Emulator + Metro certification | Test harness only |
| Mobile CI release AAB | Bundling, native release linking and shrinking | Compilation evidence only; placeholder API and development signing |
| Standalone preview APK | Direct installation against the live Render backend | Separate `.preview` package, one-off signing key; not for Play |
| EAS preview APK | Physical-device acceptance, no Metro | Managed signing and real HTTPS API required |
| EAS production AAB | Google Play upload | Managed upload key, production API and store setup required |

## Direct-install preview without an EAS account

The `Installable Android preview` workflow builds a release APK containing its JavaScript, both ARM64 and x86_64 native libraries, SQLCipher, and the live HTTPS backend URL. It verifies the actual APK signature and manifest, and launches that same signed APK in an Android 35 emulator without Metro before publishing a download.

Run the workflow manually to retain a seven-day Actions artifact, or push to an intentional `android-preview/…` branch to create a durable GitHub **prerelease** with the APK, SHA-256 and public build metadata. Only that branch prefix publishes downloads; ordinary development and main pushes do not. Standard hosted runners in this public repository are used; this adds no hosting service or paid EAS build.

If emulator infrastructure interrupts acceptance after a successful build, `Verify retained Android preview` can recheck the retained APK without recompiling or changing its signing identity. Run it with the original run ID, or push a branch named `android-preview-retest/<original-run-id>` to publish after successful acceptance. The original APK artifact expires after one day. The workflow validates its source workflow, repository, application source, hash, certificate and manifest before repeating the emulator check. Release metadata preserves both build and acceptance revisions. The smoke test dismisses only the known Pixel Launcher system ANR; application errors still fail acceptance.

This is a one-off testing edition named **Smart Expense AI Preview**, package `com.davidegea.smartexpenseai.preview`. Its random signing key is destroyed at the end of the build; no private signing material is published. Subsequent previews cannot update it in place and require reinstalling. **Synchronize pending offline data before uninstalling.** The permanent Play package remains `com.davidegea.smartexpenseai`. Both clients use the same server account, so synchronized data is available after logging in to the future official app.

Download `smart-expense-ai-preview.apk` on an ARM64 Android device, open it, and allow installation from that downloader if Android asks. This APK does not require Expo Go. Physical-device acceptance, durable update signing and Play Console publication remain separate pending steps. Do not upload this preview or the Mobile CI compilation artifact to Play.

## Configure the actual environment

The managed hosting proposal, account requirements and store submission sequence are in [production-deployment.md](production-deployment.md).

1. Deploy FastAPI/PostgreSQL behind the project's supported HTTPS edge configuration. Verify database migrations, mobile auth and sync on this environment. Android is an offline-capable client, not an independent replacement for the server. Initial authentication and server-derived analytics require the backend.
2. Authenticate the owner in EAS CLI and run `eas init` from `mobile/` to link an owner-controlled project. Commit the resulting public `extra.eas.projectId` metadata after verifying its ownership. The dynamic config preserves `extra.eas` from `app.json`. Never commit tokens or signing material.
3. Set `EXPO_PUBLIC_API_BASE_URL` in the EAS `preview` and `production` environments to the actual HTTPS backend base URL (without `/api/v2`, credentials, query or fragment). This is public bundled configuration, not a secret. Use a plain-text EAS variable so local config evaluation can read it. The profiles explicitly select their respective environment.
4. Configure remote Android signing credentials using `eas credentials --platform android`. Preserve the upload certificate fingerprint and recovery access in the owner's secure credential store. Reuse the correct application signing identity for updates; never replace a production key just to make a build pass.
5. Ensure `EXPO_PUBLIC_E2E_MODE` is absent. Export the matching HTTPS API URL locally when evaluating production config outside EAS.

Official references: [EAS configuration](https://docs.expo.dev/build/eas-json/), [EAS environment variables](https://docs.expo.dev/eas/environment-variables/), [EAS Build](https://docs.expo.dev/build/introduction/).

## Build and accept the preview APK

Version 0.4.0 adds Home, bottom navigation, rich transactions and filters, CSV import, account security, biometric lock, notifications and quick-add widget/shortcuts. It adds native authentication, notifications, screen capture protection, document and date pickers, so a new APK build is required; an earlier preview cannot acquire these changes through a web deployment. The package's local Android versionCode is 3; production EAS builds continue to manage their own incrementing version. Feature details and automated coverage are in [mobile-experience-v2.md](mobile-experience-v2.md).

For this version, also verify reconnect **without tapping Refresh**, a web-created transaction appearing when Android opens Transactions, authenticated CSV sharing on an entitled account, and the Premium restriction on a free account. Confirm cached month selections and pending-change indicators are accurate offline. These are acceptance requirements, not claims of completed physical-device testing.

From `mobile/`, after the exact source revision passes repository CI and Android Native E2E:

```bash
eas build --platform android --profile preview
```

Retain the EAS build ID, source SHA, API environment, application version/versionCode, APK SHA-256 and signing certificate fingerprint. Install the resulting APK on a physical Android device. It must launch without Metro or a development workstation.

Run this acceptance sequence against a disposable test account:

1. Register/login over HTTPS and verify initial synchronization.
2. Create, edit and delete offline transactions, categories and budgets. Force-stop/reopen before reconnecting; confirm pending data survives.
3. Reconnect and verify exact amounts and no duplicates in the web client.
4. Exercise an intentional stale edit and explicit conflict resolution.
5. View cached server workspaces offline and confirm their stale/cache labels. Confirm server-only actions recover on reconnect.
6. Background the application and verify eventual synchronization; Android battery scheduling may defer it, so foreground sync must still work.
7. Logout and switch accounts; verify previous financial data is absent. Exercise server-side session revocation and next-launch local cleanup.
8. Install a newer build signed with the same key over the previous build without uninstalling; verify encrypted data and pending outbox survive the upgrade.
9. With a disposable account, open Account and test account deletion. Cancellation, wrong password and offline failure must preserve the account. Successful deletion must revoke sessions, remove server records and clear local account data, including the pending outbox. Reopen the app and verify no previous records are visible.

Record pass/fail per step, device model, Android version and build ID. Emulator certification cannot substitute for this release-variant/device evidence.

For 0.4.0, also check fingerprint cancellation, locking after backgrounding, quick-add from a cold start, Android widget placement, notification permission and delivery with the device's battery restrictions, and real bank CSV selection/preview. These physical-device checks remain owner acceptance tasks.

## Build the production AAB

After preview acceptance and production environment verification:

```bash
eas build --platform android --profile production
```

The production profile auto-increments the remotely managed Android version. Record the build ID, source SHA, versionCode, AAB SHA-256 and certificate. An AAB is uploaded to Google Play; it is not installed directly like an APK. Use a Play internal testing track for the store-delivered acceptance pass before production rollout.

Store publication additionally requires the owner's Play Console account/application, privacy policy URL, completed data-safety declaration, content rating, store listing and any account-specific testing requirements. Do not claim these are satisfied by repository tests. Submission and production rollout are separate deliberate actions; the commands above only build. The `internal` and `production` submission profiles create draft releases for review; follow the exact-build-ID submission and Play promotion procedure in the deployment runbook.

## Closure evidence

The signed-distribution roadmap item may be checked only when the actual APK/AAB build IDs, exact revision, signing identity and release acceptance results exist. If the backend, project access or signing setup is unavailable, leave it open and state the missing input. Never label the CI compilation artifact as a finished release.
