# Smart Expense AI Mobile

Android-first React Native client for the Smart Expense AI multi-client platform.

## Phase 5D status

The mobile package now includes the Expo/SQLite foundation plus native authentication:

- Expo SDK 57 + Expo Router;
- strict TypeScript;
- Expo SQLite persistence with explicit migrations, foreign keys and WAL mode;
- transaction/category/budget repository boundaries;
- durable `sync_outbox`, `sync_state` and `sync_conflicts` tables;
- exact decimal-string <-> integer-minor-unit money conversion through `shared/`;
- offline transaction creation that persists across app restarts;
- dedicated Android access + refresh authentication against FastAPI;
- short-lived Bearer access tokens with a separate mobile JWT audience;
- opaque rotating refresh tokens whose server-side representation is hashed;
- refresh replay detection and per-device mobile-session revocation;
- Expo SecureStore for access token, refresh token, device identity and cached account identity;
- protected Expo Router routes for sign-in/registration vs authenticated workspace;
- local account binding that prevents one authenticated account from inheriting another account's SQLite workspace;
- logout/invalid-session local financial-data wipe;
- mobile dependency/type/lint/test/Android-export CI validation.

The existing web authentication contract remains unchanged: the browser continues to use its HttpOnly session cookie. Mobile authentication is an additional native transport over the same backend users and `session_version` revocation model.

## Run locally

Set the public mobile API endpoint before starting Expo. For the standard Android emulator, the host machine is available as `10.0.2.2`:

```bash
export EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8000
npm install --workspace=@smart-expense-ai/mobile --include-workspace-root=false
npm run mobile:android
```

`EXPO_PUBLIC_*` values are bundled into the application. Never put secrets, signing keys, provider keys or backend credentials in these variables.

The project targets Expo SDK 57 / React Native 0.86 and Node.js 22.13+.

## Local data model

SQLite stores financial amounts as integer minor units, never `REAL`.

Creating an expense performs one exclusive SQLite transaction:

1. validate and normalize exact money;
2. reuse or create the local custom category;
3. enqueue the category upsert when the category is new;
4. persist the transaction;
5. enqueue the transaction mutation.

If the app terminates after commit, both the entity and its outbox intent survive.

A local workspace is bound to an authenticated account ID in `sync_state`. If a different account authenticates, the previous account's local entities, outbox, conflicts and cursor state are cleared before the workspace is exposed.

## Authentication boundary

Web and Android intentionally use separate transports:

```text
Web     -> HttpOnly cookie -> web JWT audience
Android -> Bearer token   -> mobile JWT audience + mobile session id
                            + rotating opaque refresh token
```

Access and refresh tokens are stored only in Expo SecureStore. They are never persisted in SQLite. The backend stores only a SHA-256 digest of each refresh token, retains rotation lineage for replay detection and revokes a mobile session if a rotated token is replayed.

Password changes continue to increment `session_version`, invalidating both browser and mobile credentials. Account deletion cascades through mobile-session persistence.

Transient network/server failures do not erase the cached mobile identity, so the authenticated user can keep using local offline data. A definitive 401 that cannot be refreshed clears credentials and the local account workspace.

## Next: Phase 5E

The server `sync-v1` contract already exists, but this mobile package does **not** execute foreground push/pull yet. Phase 5E will wire the existing durable outbox and SQLite replica to:

- `/api/v2/sync/bootstrap`;
- `/api/v2/sync/push`;
- `/api/v2/sync/pull`;
- automatic access-token refresh during sync;
- bounded retry/backoff;
- atomic cursor advancement;
- explicit conflict state/resolution;
- web-create -> Android-pull and Android-offline-create -> server -> web tests.

## Production hardening still pending

The SQLite financial file is not claimed to be encrypted in Phase 5D. Production SQLCipher/native encrypted-database configuration remains a later hardening requirement because it changes the native build surface. Background synchronization is also deferred until foreground sync correctness is proven.

See `docs/mobile-offline-first.md` for the architecture contract.
