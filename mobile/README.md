# Smart Expense AI Mobile

Android-first React Native client for the Smart Expense AI multi-client platform.

## Phase 5B status

This package is now a runnable Expo SDK 57 application with:

- Expo Router;
- strict TypeScript;
- Expo SQLite persistence;
- explicit schema migrations;
- `PRAGMA foreign_keys = ON`;
- SQLite WAL journal mode;
- transaction/category/budget repository boundaries;
- durable `sync_outbox`, `sync_state` and `sync_conflicts` tables;
- Expo SecureStore credential/device boundaries;
- an offline transaction vertical slice that persists across app restarts;
- exact decimal-string <-> integer-minor-unit money conversion through `shared/`;
- mobile dependency/type/lint/test/Android-export CI validation.

The mobile application does **not** synchronize with FastAPI yet. Queued mutations are intentionally durable but remain local until Phase 5C implements the authenticated server journal and sync endpoints.

## Run locally

From the repository root:

```bash
npm install --workspace=@smart-expense-ai/mobile --include-workspace-root=false
npm run mobile:android
```

The project targets Expo SDK 57 / React Native 0.86 and Node.js 22.13+.

## Local data model

SQLite stores financial amounts as integer minor units, never `REAL`.

Creating an expense from the current foundation screen performs one exclusive SQLite transaction:

1. validate and normalize exact money;
2. reuse or create the local custom category;
3. enqueue the category upsert when the category is new;
4. persist the transaction;
5. enqueue the transaction mutation.

If the app terminates after commit, both the entity and its outbox intent survive.

## Security boundary

Access and refresh tokens are reserved for Expo SecureStore. They are not stored in SQLite.

The SQLite file is not claimed to be encrypted in Phase 5B. Production SQLCipher/native encrypted-database configuration remains a Phase 5G hardening requirement because it changes the native build surface.

## Not implemented yet

- backend sync push/pull;
- bootstrap/cursor handling;
- mobile access/refresh authentication;
- conflict-resolution UI;
- background synchronization;
- server-derived workspaces.

See `docs/mobile-offline-first.md` and `ROADMAP.md` for the versioned architecture and remaining phases.
