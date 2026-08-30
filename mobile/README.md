# Smart Expense AI Mobile

Android-first React Native + Expo client for Smart Expense AI.

## Current status

**Phase 5A: architecture and synchronization contract only.**

No financial screens are implemented yet. This is intentional: the offline replication contract is defined before UI work so that mobile does not become a second, incompatible financial implementation.

See [`../docs/mobile-offline-first.md`](../docs/mobile-offline-first.md).

## Target architecture

```text
React Native + Expo
        |
    Repository
     /      \
SQLite    FastAPI
           |
       PostgreSQL
```

PostgreSQL/FastAPI remains the financial source of truth. SQLite is a local cache/replica and durable offline outbox.

## Target stack

- Expo SDK 57 baseline when scaffolding begins.
- React Native 0.86.
- React 19.2.x.
- TypeScript.
- Expo Router.
- Expo SQLite.
- Expo SecureStore for small authentication secrets.
- Android first; architecture kept portable to iOS.

Dependency versions must be installed/pinned through the Expo toolchain during Phase 5B rather than guessed into this foundation commit.

## Non-goals

The mobile client will not reimplement server-owned financial intelligence, historical analysis, forecasting, classifier inference or Financial Assistant logic.

## Next implementation step

Phase 5B will scaffold the runnable Expo application, add SQLite migrations/repositories and wire mobile CI without changing the existing web client.
