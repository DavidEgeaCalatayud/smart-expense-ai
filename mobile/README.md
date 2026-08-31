# Smart Expense AI Mobile

Android-first React Native client for the Smart Expense AI multi-client platform.

## Current status

The mobile package includes the Expo/SQLite foundation, native authentication, foreground synchronization, offline-first transaction/category/budget workspaces, server-derived financial workspaces and the Phase 5G native hardening layer:

- Expo SDK 57 + Expo Router;
- strict TypeScript;
- SQLCipher-backed Expo SQLite with explicit migrations, foreign keys and WAL mode;
- a 256-bit random SQLCipher key held in Expo SecureStore, never SQLite or `EXPO_PUBLIC_*`;
- fail-closed SQLCipher verification before schema access;
- one-time migration from the legacy plaintext SQLite file through `sqlcipher_export()`;
- durable `sync_outbox`, `sync_state` and `sync_conflicts` tables;
- exact decimal-string <-> integer-minor-unit money conversion through `shared/`;
- native access + rotating refresh authentication against FastAPI;
- Expo SecureStore for credentials/device identity;
- `/api/v2/sync/push`, `/pull` and `/bootstrap` integration;
- one-at-a-time refresh coordination so concurrent 401 responses cannot rotate the same refresh token twice;
- ordered durable outbox push with idempotent mutation IDs;
- bounded transient retry/backoff for network, 429 and 5xx failures;
- permanent server rejections retained as `failed` instead of retried forever;
- bootstrap and cursor-based delta pull;
- SQLite change-page + cursor advancement in the same exclusive transaction;
- interrupted `sending` mutations recovered back to `queued` after process termination;
- local-first create/edit/delete transaction behavior;
- local-first custom-category create/rename/archive/restore behavior with system categories read-only;
- local-first monthly overall/per-expense-category budgets with exact integer minor units;
- explicit `synced`, `pending`, `failed` and `conflict` state in the UI;
- durable conflict evidence with explicit `Use server` and safe `Retry mine` resolution;
- protected Transactions, Categories and Budgets workspaces using the same foreground SyncEngine;
- protected Dashboard, Financial Intelligence, Historical Analysis, Predictions, Suggestions and Financial Assistant workspaces consuming existing FastAPI contracts;
- selected read-only server snapshots cached in SQLite for offline viewing with an explicit fetched timestamp;
- account-bound cache/workspace deletion on logout/account switch;
- terminal refresh invalidation that records a one-shot local-wipe requirement for the next foreground launch;
- best-effort Android WorkManager background synchronization reusing the exact foreground SyncEngine;
- Android Auto Backup disabled;
- production cleartext traffic disabled and production runtime API URLs restricted to HTTPS;
- EAS preview APK and production AAB profiles without committed signing credentials.

FastAPI/PostgreSQL remains the financial authority. SQLite stores the local replica, pending user intent and explicitly read-only cached server snapshots.

## Native Android development

SQLCipher is a native dependency and is intentionally not supported through Expo Go. Use a native Android build.

For the standard Android emulator, the host machine is available as `10.0.2.2`:

```bash
export EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8000
export APP_ENV=development
npm install --workspace=@smart-expense-ai/mobile --include-workspace-root=false
npm run mobile:android
```

`npm run mobile:android` now uses `expo run:android`, so the generated Android project includes SQLCipher and background-task native modules.

`EXPO_PUBLIC_*` values are bundled into the application. Never put secrets, signing keys, provider keys or backend credentials in these variables. A production build must provide an HTTPS `EXPO_PUBLIC_API_BASE_URL`; the runtime rejects plain HTTP outside development.

The project targets Expo SDK 57 / React Native 0.86 and Node.js 22.13+.

## Foreground sync sequence

A normal authenticated foreground synchronization is:

```text
1. recover interrupted `sending` outbox rows
2. read queued mutations in durable sequence order
3. push one bounded batch with stable mutation IDs
4. persist applied/rejected/conflict outcomes atomically
5. bootstrap the local replica when no cursor exists
6. pull deltas from the stored opaque cursor
7. apply each page and its next cursor in one SQLite transaction
8. continue until `hasMore = false`
```

The client never parses or creates a sync cursor. It only persists the opaque server token.

If a transient request fails after the server committed but before the response reaches Android, the same mutation ID is retried. The backend `sync-v1` idempotency record therefore prevents duplicate financial writes.

## Local transaction semantics

SQLite stores financial amounts as integer minor units, never `REAL`.

Creating an expense performs one exclusive SQLite transaction:

1. validate and normalize exact money;
2. reuse or create the local custom category;
3. enqueue the category upsert when the category is new;
4. persist the transaction;
5. enqueue the transaction mutation.

Editing an unsynchronized transaction updates the existing queued upsert rather than adding a second create. Editing a synchronized transaction creates a new upsert whose `baseVersion` is the last observed server version.

Deleting an unsynchronized transaction cancels the local create. Deleting a synchronized transaction removes it locally and queues a versioned server tombstone mutation.

## Category and budget semantics

Android replicates both system and account-owned categories, but ownership remains server-authoritative.

- system categories are visible and read-only;
- account-owned categories can be created and renamed offline;
- active-name uniqueness uses the same canonical whitespace/case-insensitive local key before sync;
- category mutations retain the last observed `server_version` and participate in stale-version conflict handling;
- a category with locally referenced transactions cannot be archived implicitly;
- restoring a category checks the local visible-name conflict before entering the outbox.

Budgets remain server-authoritative definitions replicated into SQLite.

- SQLite stores `limit_minor INTEGER`, never floating-point money;
- local `YYYY-MM` is converted to the required `YYYY-MM-01` sync contract;
- budget limits must be positive before persistence;
- only active expense categories can be targeted;
- duplicate month/scope budgets are rejected locally before sync;
- unsynchronized changes compact into their existing queued upsert.

Budget progress remains server-derived product logic.

## Server-derived workspaces

The following Android workspaces call existing authenticated FastAPI contracts rather than reproducing backend algorithms:

- **Dashboard** — exact v2 summary and six-month spending history;
- **Financial Intelligence** — persisted `rules-v2` summary/findings plus server scan and review actions;
- **Historical Analysis** — latest/run `historical-v2.2` snapshots;
- **Predictions** — `recurring-calendar-v1` and `spending-forecast-v1`;
- **Category Suggestions** — advisory user-history/`tfidf-logreg-v1` preview;
- **Financial Assistant** — stateless evidence-grounded `/api/v2/assistant/query`.

Dashboard, Intelligence, Historical Analysis and Predictions may retain the latest successful response in `server_cache` solely for read-only offline presentation. Financial Assistant answers and category suggestion previews remain transient.

## SQLCipher and local privacy

The hardened database is `smart-expense-ai-secure.db`. On first hardened launch, the app can migrate the former `smart-expense-ai.db` plaintext file into SQLCipher without treating a wipe as a migration strategy.

The initialization order is deliberately fail-closed:

```text
SecureStore key
   -> PRAGMA key
   -> PRAGMA cipher_version
   -> encrypted page read
   -> legacy sqlcipher_export (if required)
   -> versioned migrations
   -> final SQLCipher verification
```

If SQLCipher is absent, initialization fails rather than opening the financial workspace as plaintext.

Account switching wipes the previous account-local database rows before binding the new account. Explicit logout also clears the local financial workspace. A terminal refresh/session failure occurring in a headless background task records a secure one-shot wipe marker so the next foreground launch clears local account data before another session is accepted.

## Background synchronization

Background sync is a convenience, never a correctness dependency.

- task definition loads before Expo Router;
- Android WorkManager is requested with a 60-minute minimum interval;
- Android may delay, restrict or omit executions;
- the task opens and verifies SQLCipher, applies the account boundary and invokes the same `runForegroundSync()` implementation;
- no token or financial payload is written to background-task logs;
- registration exists only while a mobile user session exists.

A user returning to the app can always recover through foreground sync even if background execution never ran.

## Android build and release

`mobile/eas.json` defines:

- `preview`: internal APK;
- `production`: auto-incremented Android App Bundle (AAB).

`APP_ENV=production` generates Android configuration with `usesCleartextTraffic=false`. `android.allowBackup=false` prevents the application database from entering Android Auto Backup.

Signing material is deliberately absent from the repository. Production signing should be managed by EAS/Google Play or another secure release credential store.

Mobile CI continues to run Expo dependency validation, Jest, strict TypeScript, ESLint and Android export. Phase 5G additionally generates the Android project in production mode, asserts the native backup/transport policy, verifies SQLCipher integration and compiles a native debug APK with Java 17.

## Remaining device-level validation

The native build gate proves that the hardening modules link and compile, but it does not substitute for an emulator/device runtime test. Still pending as an explicit quality-gate item:

- prove SQLCipher opens and survives process restart;
- prove plaintext-to-encrypted migration with real files;
- prove offline/reconnect/conflict flows on Android;
- prove local data wipe on account switch/logout;
- exercise the background task in a development build.

See `docs/mobile-offline-first.md`, `docs/mobile-auth-v1.md` and `docs/mobile-production-hardening-v1.md` for the architecture and security contracts.
