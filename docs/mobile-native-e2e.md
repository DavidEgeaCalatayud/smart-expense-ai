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

The first native suite proves the following end to end:

1. **Native authentication** — a clean install registers a real mobile session against FastAPI/PostgreSQL and enters the protected workspace.
2. **SQLCipher at rest** — after database initialization, the on-device database header must not equal the standard plaintext SQLite header (`SQLite format 3`).
3. **Offline durability** — with FastAPI stopped, creating a transaction leaves a durable `Pending sync` row.
4. **Process-death recovery** — Android force-stops the process and a subsequent launch still shows the transaction and pending state.
5. **Reconnect convergence** — FastAPI is restarted and an explicit foreground sync pushes the durable outbox mutation until the row becomes `Synced`.
6. **Account isolation** — signing out and registering a second account produces an empty local transaction workspace; data from the first account is not visible.

The suite uses the existing application UI and the existing `runForegroundSync()` correctness path. It does not add a test-only synchronization algorithm.

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
- Maestro test output.

The workflow has an explicit 55-minute job timeout so a deadlocked emulator/Gradle process cannot consume an unbounded runner.

## Deliberately remaining native scenarios

This first gate does not yet claim all device-only hardening cases. Follow-up coverage should add:

- plaintext legacy database fixture -> SQLCipher migration with row-level preservation verification and plaintext-file removal;
- a deterministic stale-version web/mobile race that surfaces the explicit conflict UI and exercises `Use server` / `Retry mine`;
- explicit triggering/inspection of the registered Android WorkManager background task while preserving foreground sync as the correctness path.

These scenarios build on the same emulator harness rather than creating a second mobile test architecture.
