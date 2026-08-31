# Smart Expense AI Mobile

Android-first React Native client for the Smart Expense AI multi-client platform.

## Current status

The mobile package includes the Expo/SQLite foundation, native authentication, offline-first synchronization, server-derived financial workspaces and the first Android production-hardening layer:

- Expo SDK 57 + Expo Router;
- strict TypeScript;
- Expo SQLite persistence with explicit migrations, foreign keys and WAL mode;
- SQLCipher-enabled native SQLite builds;
- a per-install 256-bit database key generated with `expo-crypto` and stored in Expo SecureStore;
- migration from the legacy plaintext SQLite file into the encrypted database without discarding pending outbox/conflict state;
- Android Auto Backup disabled for the financial application data boundary;
- `secure_delete`, WAL checkpoint/truncation and `VACUUM` on privacy-boundary wipes;
- durable `sync_outbox`, `sync_state` and `sync_conflicts` tables;
- exact decimal-string <-> integer-minor-unit money conversion through `shared/`;
- native access + rotating refresh authentication against FastAPI;
- Expo SecureStore for credentials/device identity/database key;
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
- protected Transactions, Categories and Budgets workspaces using the same SyncEngine;
- protected Dashboard, Financial Intelligence, Historical Analysis, Predictions, Suggestions and Financial Assistant workspaces consuming existing FastAPI contracts;
- shared TypeScript contracts for the server-derived v2 APIs;
- selected read-only server snapshots cached in SQLite for offline viewing with an explicit fetched timestamp;
- account-bound cache deletion on logout/account switch so cached analytics cannot cross user boundaries;
- Android WorkManager background synchronization through `expo-background-task`;
- one SQLite runtime lease shared by foreground sync, background sync and privacy wipes;
- EAS preview APK and production AAB build profiles without signing credentials in source control;
- Mobile CI native prebuild + Gradle debug compilation in addition to Jest, TypeScript, ESLint and Expo export.

The existing web authentication and business-rule contracts remain unchanged. PostgreSQL/FastAPI is still the financial authority; SQLite stores the encrypted local replica, pending user intent and explicitly read-only cached server snapshots.

## Run locally

Set the public mobile API endpoint before starting Expo. For the standard Android emulator, the host machine is available as `10.0.2.2`:

```bash
export EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8000
npm install --workspace=@smart-expense-ai/mobile --include-workspace-root=false
npm run mobile:android
```

`EXPO_PUBLIC_*` values are bundled into the application. Never put secrets, signing keys, provider keys or backend credentials in these variables.

The project targets Expo SDK 57 / React Native 0.86 and Node.js 22.13+.

SQLCipher is a native capability and is not available in Expo Go. Use an Android development/native build (`expo prebuild` + Gradle or EAS) when validating encrypted storage.

## Encrypted local storage

Phase 5G moves the application from the legacy plaintext file:

```text
smart-expense-ai.db
```

to:

```text
smart-expense-ai-secure-v1.db
```

The encrypted database passphrase is generated once as 32 random bytes and stored only in SecureStore. It is applied with `PRAGMA key` immediately after opening the SQLCipher connection and before schema inspection/migration.

Existing installs are migrated conservatively:

```text
legacy DB
   |
   | WAL checkpoint
   v
encrypted SQLCipher DB
   |
   | SQLite logical backup succeeds
   v
legacy DB deleted
```

The logical backup preserves the local replica, pending outbox operations, conflict evidence, sync cursor/state and server cache. The legacy file is deleted only after a successful copy.

Android Auto Backup is disabled so an encrypted database is not restored independently of the Keystore/SecureStore material required to open it.

## Synchronization sequence

A normal authenticated synchronization is:

```text
0. acquire the SQLite runtime sync lease
1. recover interrupted `sending` outbox rows
2. read queued mutations in durable sequence order
3. push one bounded batch with stable mutation IDs
4. persist applied/rejected/conflict outcomes atomically
5. bootstrap the local replica when no cursor exists
6. pull deltas from the stored opaque cursor
7. apply each page and its next cursor in one SQLite transaction
8. continue until `hasMore = false`
9. release the runtime lease
```

The client never parses or creates a sync cursor. It only persists the opaque server token.

If a transient request fails after the server committed but before the response reaches Android, the same mutation ID is retried. The backend `sync-v1` idempotency record therefore prevents duplicate financial writes.

Foreground and background execution share the same SQLite lease. A second synchronizer skips rather than resetting another run's `sending` mutations. Privacy-boundary wipes wait for the lease before deleting account data.

## Background synchronization

Android background synchronization uses `expo-background-task` / WorkManager with a requested minimum interval of 15 minutes.

The schedule is deliberately treated as opportunistic:

- Android decides the actual execution time;
- foreground sync remains the correctness path;
- background registration failure never blocks login or registration;
- logout unregisters the task when possible;
- a task with no stored mobile session exits successfully without touching financial state;
- foreground/background overlap is prevented by the shared SQLite lease.

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

## Category semantics

Android replicates both system and account-owned categories, but ownership remains server-authoritative.

- system categories are visible and read-only;
- account-owned categories can be created and renamed offline;
- active-name uniqueness uses the same canonical whitespace/case-insensitive local key before sync;
- category mutations retain the last observed `server_version` and participate in normal stale-version conflict handling;
- a category with locally referenced transactions cannot be archived implicitly: Android requires those relationships to be resolved/reassigned first rather than silently moving financial records;
- restoring a category checks the local visible-name conflict before the mutation enters the outbox.

If a transaction is created against a brand-new offline category, the durable outbox preserves category-before-transaction mutation order.

## Budget semantics

Budgets remain server-authoritative definitions replicated into SQLite.

- SQLite stores `limit_minor INTEGER`, never floating-point money;
- the local UI uses `YYYY-MM`, while `sync-v1` receives the required `YYYY-MM-01` first-of-month date;
- budget limits must be positive before a mutation is persisted;
- only active expense categories can be targeted;
- local creation rejects duplicate `(month, category)` or `(month, overall)` scope before sync;
- unsynchronized create/update operations compact into the existing queued upsert;
- deleting an unsynchronized budget cancels the local create; deleting a synchronized budget queues a versioned tombstone.

Budget progress (`spentAmount`, remaining amount, percent used, days remaining and over-budget policy) is deliberately not reimplemented in Android. Those values remain server-derived product logic.

## Server-derived workspaces

The following Android workspaces call the existing authenticated FastAPI contracts instead of reproducing backend algorithms:

- **Dashboard** — exact v2 summary and six-month spending history;
- **Financial Intelligence** — persisted `rules-v2` summary/findings plus server scan and review actions;
- **Historical Analysis** — latest/run `historical-v2.2` snapshots, trends, recurring profiles, outliers and category shifts;
- **Predictions** — `recurring-calendar-v1` upcoming payments and `spending-forecast-v1` deterministic baselines/backtest evidence;
- **Category Suggestions** — explicit advisory preview using user history or `tfidf-logreg-v1`; no transaction is changed automatically;
- **Financial Assistant** — stateless evidence-grounded `/api/v2/assistant/query`; no local conversation history and no provider credentials in the app.

Dashboard, Intelligence, Historical Analysis and Predictions may retain the latest successful response in `server_cache` solely for read-only offline presentation. Cached views always expose their fetch timestamp. A cached fallback cannot initiate server-only Intelligence/Historical mutations.

The cache is not part of `sync-v1`, does not participate in conflict resolution and is never a source of truth. Fresh server responses replace it. Logout/account switching deletes it together with the rest of the account-local SQLite workspace.

Financial Assistant answers are deliberately not cached because v1 remains stateless/no-memory. Category suggestion previews are also transient and advisory.

## Conflict policy

The mobile client never silently overwrites a stale server value.

A conflict stores:

- local mutation payload;
- server version;
- server payload or tombstone;
- conflict reason.

The UI exposes:

- `Use server` for all conflicts;
- `Retry mine` only for safe `stale_version` conflicts where a current server version and local payload both exist.

`server_deleted` and ownership/visibility conflicts do not offer an unsafe automatic local overwrite. Cross-account category/budget integration tests additionally require that an attempted mutation never returns another account's server payload or version.

## Authentication and privacy boundary

Web and Android intentionally use separate transports:

```text
Web     -> HttpOnly cookie -> web JWT audience
Android -> Bearer token   -> mobile JWT audience + mobile session id
                            + rotating opaque refresh token
```

Access and refresh tokens are stored only in Expo SecureStore. They are never persisted in SQLite. The backend stores only a SHA-256 digest of each refresh token, retains rotation lineage for replay detection and revokes a mobile session if a rotated token is replayed.

The generic mobile API client performs at most one refresh/retry after a 401 and coordinates simultaneous refresh demand through one in-flight promise. This prevents two foreground requests from replaying the same one-time refresh token.

A logout, account switch or confirmed remote revocation uses the same privacy wipe. The operation waits for any active sync lease, deletes all account-scoped SQLite state, truncates WAL and vacuums the database before the next account is bound.

## Android build and release

Continuous Native Generation remains the source-of-truth workflow: generated `mobile/android/` and `mobile/ios/` directories are not committed.

Mobile CI generates Android from `app.json` and compiles a debug APK with Gradle. This catches native config-plugin or SQLCipher integration errors that a JavaScript-only Expo export would miss.

`mobile/eas.json` provides:

- `preview`: internal-distribution APK;
- `production`: signed production AAB profile with automatic build-number increment.

Signing keys, Expo access tokens and Google Play service-account credentials must never be committed. Production signing should be managed through EAS/Play credential stores.

## Remaining production evidence

Phase 5G code hardening is not equivalent to a Play production release. Still required before claiming production readiness:

- automated Android emulator/device E2E for offline create -> process restart -> reconnect -> push/pull -> web visibility;
- emulator/device conflict-resolution and account-switch isolation tests;
- runtime verification of the plaintext-to-SQLCipher upgrade path on a native Android build;
- a real production EAS AAB built with managed signing credentials;
- Play internal-testing installation/update evidence;
- final Play Data safety/privacy declarations;
- runtime crash/performance monitoring selection and privacy review.

See `docs/mobile-offline-first.md`, `docs/mobile-auth-v1.md` and `docs/mobile-security-review.md` for the architecture and security contracts.
