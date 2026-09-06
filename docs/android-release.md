# Android distribution runbook

## Current boundary

Android implementation and native/cross-client E2E exist. They do not establish that a signed release has been delivered. No deployed API URL, linked EAS project ID or signing certificate is recorded in the repository as of this change. Do not invent these values or treat an example URL as a working service.

| Artifact | Purpose | Distribution |
| --- | --- | --- |
| Native E2E debug APK | Emulator + Metro certification | Test harness only |
| Mobile CI release AAB | Bundling, native release linking and shrinking | Compilation evidence only; placeholder API and development signing |
| EAS preview APK | Physical-device acceptance, no Metro | Managed signing and real HTTPS API required |
| EAS production AAB | Google Play upload | Managed upload key, production API and store setup required |

## Configure the actual environment

1. Deploy FastAPI/PostgreSQL behind the project's supported HTTPS edge configuration. Verify database migrations, mobile auth and sync on this environment. Android is an offline-capable client, not an independent replacement for the server. Initial authentication and server-derived analytics require the backend.
2. Authenticate the owner in EAS CLI and run `eas init` from `mobile/` to link an owner-controlled project. Commit the resulting public `extra.eas.projectId` metadata after verifying its ownership. The dynamic config preserves `extra.eas` from `app.json`. Never commit tokens or signing material.
3. Set `EXPO_PUBLIC_API_BASE_URL` in the EAS `preview` and `production` environments to the actual HTTPS backend base URL (without `/api/v2`, credentials, query or fragment). This is public bundled configuration, not a secret. Use a plain-text EAS variable so local config evaluation can read it. The profiles explicitly select their respective environment.
4. Configure remote Android signing credentials using `eas credentials --platform android`. Preserve the upload certificate fingerprint and recovery access in the owner's secure credential store. Reuse the correct application signing identity for updates; never replace a production key just to make a build pass.
5. Ensure `EXPO_PUBLIC_E2E_MODE` is absent. Export the matching HTTPS API URL locally when evaluating production config outside EAS.

Official references: [EAS configuration](https://docs.expo.dev/build/eas-json/), [EAS environment variables](https://docs.expo.dev/eas/environment-variables/), [EAS Build](https://docs.expo.dev/build/introduction/).

## Build and accept the preview APK

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

Record pass/fail per step, device model, Android version and build ID. Emulator certification cannot substitute for this release-variant/device evidence.

## Build the production AAB

After preview acceptance and production environment verification:

```bash
eas build --platform android --profile production
```

The production profile auto-increments the remotely managed Android version. Record the build ID, source SHA, versionCode, AAB SHA-256 and certificate. An AAB is uploaded to Google Play; it is not installed directly like an APK. Use a Play internal testing track for the store-delivered acceptance pass before production rollout.

Store publication additionally requires the owner's Play Console account/application, privacy policy URL, completed data-safety declaration, content rating, store listing and any account-specific testing requirements. Do not claim these are satisfied by repository tests. Submission and production rollout are separate deliberate actions; the commands above only build.

## Closure evidence

The signed-distribution roadmap item may be checked only when the actual APK/AAB build IDs, exact revision, signing identity and release acceptance results exist. If the backend, project access or signing setup is unavailable, leave it open and state the missing input. Never label the CI compilation artifact as a finished release.
