# Android Native E2E v1

## Purpose

This gate closes the largest remaining confidence gap after Android production hardening: it executes the generated native application on a real Android emulator instead of stopping at JavaScript tests, Expo export, prebuild or Gradle compilation.

The required pull-request gate is deliberately self-contained. It starts a disposable PostgreSQL 16 service and the real FastAPI application on the GitHub Actions runner, builds the SQLCipher-enabled Android debug APK, starts Metro, launches an Android emulator and drives the installed application with a pinned Maestro CLI.

No production database, signing key, provider credential or deployed environment is required.

## Network topology

The Android emulator reaches the runner-hosted FastAPI process through Android's host alias:

- FastAPI: `http://10.0.2.2:8000`
- Metro: host port `8081`, forwarded to the emulator with `adb reverse`
- PostgreSQL: runner-local only; it is never exposed to the application

The APK is generated with the non-production Android transport policy so emulator HTTP is permitted. Production builds continue to require HTTPS and `usesCleartextTraffic=false` through the existing Mobile CI gate.

## Required invariants

The native suite proves the following end to end:

1. **Plaintext-to-SQLCipher migration** — a real legacy Expo-SQLite fixture is installed in the application sandbox, migrated on device, verified at schema v2 and removed after successful conversion.
2. **SQLCipher at rest** — after migration and normal database initialization, the on-device encrypted database header must not equal the standard plaintext SQLite header (`SQLite format 3`).
3. **Native authentication** — a clean workspace registers a real mobile session against FastAPI/PostgreSQL and enters the protected workspace.
4. **Offline durability** — with FastAPI stopped, creating a transaction leaves a durable `Pending sync` row.
5. **Process-death recovery** — Android force-stops the process and a subsequent launch still shows the transaction and pending state.
6. **Reconnect convergence** — FastAPI is restarted and an explicit foreground sync pushes the durable outbox mutation until the row becomes `Synced`.
7. **Deterministic stale-version conflict** — an independent legitimate mobile session advances the server row, the device edits from the stale local base, surfaces `stale_version`, and exercises the conflict-resolution UI.
8. **Native WorkManager execution** — another durable offline mutation is created, the registered Android JobScheduler/WorkManager job is discovered and forced while the app remains backgrounded, and server-side verification proves the worker—not a foreground `Sync now` action—pushed it.
9. **Account isolation** — signing out and registering a second account produces an empty local transaction workspace; data and conflict residue from the first account are not visible.

The suite uses the existing application UI and the existing `runForegroundSync()` correctness path. The background task invokes that same synchronization path; it does not add a test-only synchronization algorithm.

## Supply-chain pinning

The gate pins:

- the GitHub Actions checkout, Node, Python, Java and artifact actions by immutable commit SHA;
- `ReactiveCircus/android-emulator-runner` by immutable commit SHA corresponding to v2.38.0;
- Maestro CLI 2.7.0 by release URL **and** the published ZIP SHA-256 digest before extraction.

A compromised or unexpectedly replaced Maestro archive therefore fails before execution.

## Diagnostics

On failure GitHub Actions uploads:

- FastAPI log;
- Metro log;
- JobScheduler diagnostics;
- Android prewarm launch, logcat, activity, adb-reverse and UI diagnostics;
- Maestro test output.

The workflow has an explicit 55-minute job timeout so a deadlocked emulator/Gradle process cannot consume an unbounded runner.

## Merge gate

The scenarios above are part of the harness, but the pull request must not be merged merely because they exist in source. The final Android Native E2E run for the merge candidate must be green and its log must show that every scenario executed through the final success marker.
