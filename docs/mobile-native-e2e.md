# Android Native E2E v1

## Purpose

This gate executes the generated native application on a real Android emulator instead of stopping at JavaScript tests, Expo export, prebuild or Gradle compilation. It also provides the repository's combined browser + native-device proof that the existing web and Android clients converge through the same FastAPI/PostgreSQL authority.

The required pull-request gate is deliberately self-contained. It starts a disposable PostgreSQL 16 service and the real FastAPI application on the GitHub Actions runner, builds the SQLCipher-enabled Android debug APK, starts Metro and the real Vite frontend, installs Playwright Chromium, launches an Android emulator and drives the installed application with a pinned Maestro CLI.

No production database, signing key, provider credential or deployed environment is required.

## Network topology

The Android emulator reaches runner-hosted services through Android's host alias:

- FastAPI: `http://10.0.2.2:8000`
- Metro: host port `8081`, forwarded to the emulator with `adb reverse`
- Vite frontend: `http://localhost:5173` on the runner for Playwright Chromium
- PostgreSQL: runner-local only; it is never exposed to the application

Before the native harness starts, a versioned Bash precondition verifies that the emulator can reach FastAPI and Metro. The APK is generated with the non-production Android transport policy so emulator HTTP is permitted. Production builds continue to require HTTPS and `usesCleartextTraffic=false` through the existing Mobile CI gate.

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

After those native invariants pass, the same job continues with the combined cross-client scenarios:

10. **Browser create -> Android pull** — Playwright logs into the real web UI with the second account, creates `Web Bridge Coffee`, and Android uses the normal `Sync now` path to pull and render the exact transaction as `Synced`.
11. **Android offline create -> durable restart -> server** — FastAPI is stopped before Android creates `Native Bridge Coffee`; the row must remain `Pending sync`, Android is force-stopped, FastAPI is restarted, and a host-side check proves PostgreSQL still does not contain the transaction before Android relaunches. The durable SQLCipher outbox then converges it to `Synced`, followed by an independent server-side presence check.
12. **Server -> browser read** — Chromium returns to the real Transactions workspace and must render `Native Bridge Coffee` with the exact `€34.56` amount after Android convergence.

The suite uses the existing application UI and the existing `runForegroundSync()` correctness path. The background task invokes that same synchronization path; it does not add a test-only synchronization algorithm. The browser bridge also uses the real frontend forms and authenticated browser session rather than writing fixtures directly to PostgreSQL.

## Success markers

The native 00→08 harness must emit:

`Android native E2E invariants passed: SQLCipher migration, durable offline restart, reconnect sync, stale-version resolution, WorkManager background sync and account isolation.`

The 09→11 cross-client harness must subsequently emit:

`Cross-client E2E invariants passed: browser create -> Android pull and Android offline create -> server -> browser read.`

A green workflow without both markers is not sufficient evidence for this gate.

## Supply-chain pinning

The gate pins:

- the GitHub Actions checkout, Node, Python, Java and artifact actions by immutable commit SHA;
- `ReactiveCircus/android-emulator-runner` by immutable commit SHA corresponding to v2.38.0;
- Maestro CLI 2.7.0 by release URL **and** the published ZIP SHA-256 digest before extraction;
- frontend dependencies through `npm ci` and the committed lockfile before installing the matching Playwright Chromium build.

A compromised or unexpectedly replaced Maestro archive therefore fails before execution.

## Diagnostics

On failure GitHub Actions uploads:

- FastAPI log;
- Metro log;
- Vite frontend log;
- JobScheduler diagnostics;
- Android prewarm launch, logcat, activity, adb-reverse and UI diagnostics;
- Maestro test output.

The workflow has an explicit 65-minute job timeout so a deadlocked emulator/Gradle process cannot consume an unbounded runner.

## Certified evidence

Android Native E2E run #51 certified the combined implementation candidate `8b1f66e5c888a2a5e47a9da6eed7c5b944569158`. The log executed flows 00→11, emitted both success markers, proved `Native Bridge Coffee` absent from PostgreSQL before Android relaunch, proved it present after Android synchronization, and finally observed the exact transaction from Chromium.

## Merge gate

The scenarios above are part of the harness, but a pull request must not be merged merely because they exist in source. The implementation candidate must have a green Android Native E2E run whose log shows every native and cross-client scenario through both final success markers. Documentation-only commits after that certification may rely on the certified implementation SHA only when a commit comparison proves no executable gate/product path changed; the merge-to-main push must then execute the path-applicable gate again as the final integrated proof.
