# Mobile Production Hardening v1

## Scope

Phase 5G hardens the Android client without changing the core multi-client authority model:

- FastAPI/PostgreSQL remains the financial source of truth;
- foreground `sync-v1` remains the correctness path;
- background execution is optional/best-effort;
- access/refresh credentials and the local database key remain outside SQLite;
- production Android builds must not permit cleartext API traffic or OS cloud backup of the financial database.

## SQLCipher local database

The hardened Android client uses the Expo SQLite SQLCipher native build option. This requires a native development/preview/production build; Expo Go is intentionally unsupported for the hardened database.

At startup the application:

1. loads or generates a 32-byte random database key;
2. stores that key in Expo SecureStore with `WHEN_UNLOCKED_THIS_DEVICE_ONLY` accessibility;
3. applies `PRAGMA key` before any schema access;
4. verifies `PRAGMA cipher_version` and fails closed if SQLCipher is unavailable;
5. forces a schema-page read before running application migrations;
6. migrates the old plaintext beta database, when present, using SQLCipher `sqlcipher_export()`;
7. preserves the prior SQLite `user_version` during that migration;
8. deletes the plaintext predecessor only after the encrypted export succeeds;
9. runs the normal versioned application migrations and verifies SQLCipher again.

The database key is never committed, never placed in `EXPO_PUBLIC_*`, never stored in SQLite and never sent to FastAPI.

## Account/session privacy boundary

The mobile client maintains one local account boundary per installation.

- switching account IDs wipes transactions, categories, budgets, outbox, conflicts, sync state and read-only server cache before the new account ID is bound;
- explicit logout clears credentials and the account-local SQLite workspace;
- a terminal mobile-refresh 401 clears credentials and stores a one-shot `local-wipe-required` marker in SecureStore;
- the next foreground startup consumes that marker and wipes SQLite before another session can use the workspace;
- Android Auto Backup is disabled for the application.

This marker covers headless/background invalidation where the React authentication provider is not mounted at the time the session is revoked.

## Network policy

`EXPO_PUBLIC_API_BASE_URL` is public application configuration, not a secret.

- development/debug builds may use `http://10.0.2.2:8000` for the Android emulator;
- non-development application runtime rejects non-HTTPS API URLs;
- `APP_ENV=production` generates Android native configuration with `usesCleartextTraffic=false`;
- EAS production is explicitly assigned `APP_ENV=production`;
- signing keys, provider/API secrets and backend credentials must never be stored in `EXPO_PUBLIC_*` or committed files.

## Background synchronization

The background task reuses the exact same `runForegroundSync()` implementation used by the visible application. There is no second synchronization algorithm.

The Android task:

- is defined in global module scope before Expo Router starts;
- uses Expo BackgroundTask/TaskManager (Android WorkManager);
- is registered only while a mobile user session exists;
- requests a 60-minute minimum interval;
- opens and verifies the SQLCipher database before accessing financial data;
- applies the existing account boundary before sync;
- performs no financial/token payload logging;
- returns success/failure to the scheduler and never claims exact execution timing.

Android may delay, restrict or skip background work. The application therefore cannot depend on background execution for correctness: every normal foreground sync remains sufficient to recover interrupted outbox rows, push mutations, bootstrap and pull deltas.

## Android build/release strategy

The repository contains two EAS profiles:

- `preview`: internal APK for device testing;
- `production`: auto-incremented Android App Bundle (AAB) for store distribution.

Release signing credentials are intentionally not stored in Git. They are expected to be managed by EAS/Google Play or another secure release-secret mechanism.

Mobile CI must continue to validate the JavaScript/TypeScript chain and now also:

1. run Expo prebuild with `APP_ENV=production`;
2. inspect the generated manifest for `allowBackup=false` and `usesCleartextTraffic=false`;
3. verify that the generated native Android project contains SQLCipher integration;
4. compile a native Android debug APK with Java 17.

This native build proves that the selected Expo modules/config plugins link together. It does not, by itself, prove runtime database encryption/migration or WorkManager scheduling on a device.

## Deliberately pending device E2E

A required emulator/device E2E should still prove:

- encrypted database opens and survives process restart;
- legacy plaintext -> SQLCipher migration preserves data and removes the plaintext file;
- offline transaction creation survives process termination;
- reconnect pushes the durable mutation and receives authoritative state;
- stale web/mobile edits surface an explicit conflict;
- account switching/logging out removes the previous local account data;
- the background task can be triggered in a development build without becoming a correctness dependency.

Until that E2E is part of the required gate, Phase 5G's device-E2E roadmap item remains open.

## iOS portability

The domain/sync/auth contracts remain platform-neutral. SQLCipher configuration and background scheduling are isolated at the mobile platform/runtime boundary so a future iOS client can reuse shared contracts, repositories and foreground synchronization without changing FastAPI/PostgreSQL semantics.
