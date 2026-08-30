# Mobile & Offline-First Architecture

## Status

This document defines the **Phase 5 design contract** for the Android-first Smart Expense AI client.

The mobile runtime is not implemented by this document alone. The web frontend and current FastAPI/PostgreSQL behavior remain unchanged until the mobile-specific implementation steps are introduced behind new endpoints and migrations.

## Goal

Evolve Smart Expense AI from a single web client into a multi-client financial platform:

```text
                     FastAPI
                        |
                  PostgreSQL
                 source of truth
                        |
              +---------+---------+
              |                   |
              v                   v
        React Web            React Native
        existing                 Expo
                                   |
                                   v
                                SQLite
                           local/offline cache
```

The server remains authoritative for financial rules, analytics, recurrence detection, anomaly policy, historical analysis, forecasting, category suggestions and Financial Assistant evidence.

The mobile client must not duplicate those algorithms.

## Repository target

```text
smart-expense-ai/
├── backend/
├── frontend/                 # existing React/Vite web client
├── mobile/                   # Android-first React Native + Expo client
├── shared/
│   ├── api-contracts/        # transport/sync contracts shared by clients
│   └── domain-types/         # transport-safe domain primitives
├── ai/
├── docs/
└── compose.yaml
```

`frontend/` remains independently buildable during the migration. Shared packages are introduced incrementally rather than moving all existing frontend types at once.

## Technology target

- React Native + Expo.
- Android first; keep the architecture portable to iOS.
- TypeScript.
- Expo SQLite for local persistence.
- FastAPI `/api/v2` as the remote API boundary.
- PostgreSQL remains the canonical persistent store.
- Secure device storage for authentication secrets.
- Development builds for production-like native capabilities; Expo Go is not the production target.

The initial mobile scaffold should target the current stable Expo SDK when implementation starts and pin compatible React/React Native versions through the Expo toolchain.

## Source-of-truth rules

### PostgreSQL is authoritative

SQLite is not a second independent financial database. It is a local replica/cache plus an offline mutation queue.

All server-owned invariants continue to be enforced by FastAPI/PostgreSQL, including:

- account ownership;
- category/type compatibility;
- budget uniqueness;
- exact monetary validation;
- recurring and anomaly rules;
- historical-analysis contracts;
- forecasts;
- category suggestion policy;
- Financial Assistant evidence grounding.

### SQLite is authoritative only for pending local intent

While offline, SQLite may contain a user mutation that has not reached the server yet. That intent remains local until the sync protocol accepts it.

The UI must distinguish at least:

- `synced`;
- `pending`;
- `conflict`;
- `failed`.

## Money contract

The backend API v2 continues to use exact decimal strings.

SQLite must never use `REAL` for money. Current two-decimal monetary values are persisted in integer minor units:

```text
"32.48" API decimal string
      <->
3248 SQLite minor units
```

Conversion between decimal strings and minor units must be exact and shared. No `parseFloat`, floating-point multiplication or binary-float business arithmetic is permitted.

## Syncable v1 entities

The first sync protocol is intentionally small:

- transactions;
- categories;
- budgets.

Derived data is not writable through sync-v1.

Financial findings, historical snapshots, upcoming payments, forecasts and Assistant responses remain server-derived/read-only resources. Mobile may cache their latest responses for UX purposes, but they are not part of the writable offline replica.

## Why timestamps are not the sync cursor

`updated_at` is useful metadata but is not a sufficient replication protocol:

- not every current entity has the same update metadata;
- hard deletes disappear and therefore cannot be discovered by a client later;
- retries require idempotency independently of time;
- device clocks are not trusted ordering authorities;
- equal timestamps and pagination boundaries create avoidable ambiguity.

sync-v1 therefore uses a server-owned change journal and an opaque cursor.

## Server-side sync primitives

The implementation phase should introduce server persistence equivalent to:

```text
sync_devices
├── id
├── user_id
├── device_id
├── created_at
└── last_seen_at

sync_mutations
├── user_id
├── device_id
├── mutation_id        UNIQUE in authenticated scope
├── entity_type
├── entity_id
├── result_status
├── resulting_version
└── processed_at

sync_changes
├── sequence           monotonic server sequence
├── scope_user_id      nullable only for explicitly global data
├── entity_type
├── entity_id
├── operation          upsert | delete
├── entity_version
├── payload/tombstone
└── changed_at
```

The exact physical schema may differ, but the behavioral contract must remain the same.

### Entity versions

Every syncable entity needs a server-owned monotonically increasing `sync_version`.

- create -> version `1`;
- accepted update -> version increments;
- stale update -> conflict;
- delete -> journal tombstone records the final version.

Versions are not generated by the device.

## Push protocol

Target endpoint:

```text
POST /api/v2/sync/push
```

A request contains:

- protocol version;
- device ID;
- bounded list of mutations;
- no user ID.

Authenticated user scope must always come from the server session/token, never from a mobile-supplied user identifier.

Each mutation contains:

- globally unique `mutationId` generated on-device;
- entity type;
- entity ID;
- operation;
- `baseVersion` observed by the client, or `null` for a create;
- exact payload for an upsert;
- client timestamp for diagnostics only.

### Idempotency

Re-sending the same `mutationId` must never apply the financial mutation twice.

The server stores the previous outcome and returns it again.

This protects retries caused by:

- connection loss after server commit but before response delivery;
- app termination;
- background retry;
- duplicate user taps that collapse onto the same queued mutation.

## Pull protocol

Target endpoint:

```text
GET /api/v2/sync/pull?cursor=<opaque>&limit=<bounded>
```

The response contains visible changes after the supplied cursor:

- upsert payloads;
- delete tombstones;
- entity versions;
- a new opaque cursor;
- `hasMore`.

The cursor is opaque to the client. Mobile stores it but never parses or manufactures it.

### Bootstrap

A fresh installation needs a bounded bootstrap path that creates a consistent local replica and establishes a starting cursor.

The implementation may use a dedicated paginated snapshot endpoint or a bootstrap mode in `/sync/pull`, but it must guarantee that changes committed during bootstrap are not lost between the snapshot and the first delta pull.

If journal retention eventually makes a cursor unusable, the server should return a typed `sync_cursor_expired` error and require a safe re-bootstrap rather than silently skipping history.

## Conflict policy

sync-v1 must not use silent client-wins or blind last-write-wins.

Default policy:

1. Client sends `baseVersion`.
2. Server compares it with the current entity version.
3. Matching version -> mutation may be applied.
4. Different version -> mutation returns `conflict` without overwriting server data.
5. Response includes the current server version and safe current representation required for resolution.

The mobile UI can then offer an explicit resolution flow.

### Delete behavior

Deleting an already deleted entity is idempotently successful when the authenticated scope and mutation history make that safe.

A stale delete against a newer server version must become a conflict rather than deleting unseen changes.

## Client-generated IDs

Offline create must not depend on a server round trip.

Mobile therefore generates UUID entity IDs before queueing creates. The sync endpoint accepts those IDs only inside authenticated ownership rules.

This allows local relationships such as a new custom category followed by a new transaction using that category to exist before connectivity returns.

## Local SQLite target

Initial local storage should contain tables equivalent to:

```text
transactions
categories
budgets

sync_outbox
sync_state
sync_conflicts
```

Every replicated entity stores at least:

- entity ID;
- local financial fields;
- server sync version;
- local sync status;
- local updated metadata needed for UX.

`sync_outbox` stores durable pending mutations, including mutation ID and base version.

`sync_state` stores account/device sync metadata, including the last opaque cursor.

`sync_conflicts` stores unresolved conflicts without destroying the user's local intent.

## Local transaction rules

SQLite initialization should enable:

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
```

Application input must use bound parameters/prepared statements. User-controlled values must not be concatenated into raw SQL.

Database migrations must be explicit and versioned. Destructive reset is acceptable only for developer tooling, never as the normal production migration strategy.

## Local encryption and secrets

Financial cache and authentication secrets are different concerns.

- Access/refresh credentials belong in platform secure storage, not ordinary SQLite or AsyncStorage.
- Production financial SQLite should be encrypted at rest when the selected native build configuration supports it.
- SQLCipher evaluation belongs before production distribution because enabling it changes native build requirements.
- Logout and account deletion must wipe user-scoped local financial data, outbox entries, conflicts, cursors and credentials.

No provider API keys, backend secrets or LLM keys may be shipped in the app.

## Mobile authentication boundary

The existing browser session cookie remains the web contract.

Mobile should receive a mobile-appropriate short-lived credential transport, for example:

```text
access token  -> short lifetime
refresh token -> rotation/revocation policy
```

The mobile transport must reuse the same backend user/session-version authorization model rather than creating a second account system.

Requirements before implementation:

- bearer/mobile tokens cannot weaken the web cookie flow;
- refresh tokens are revocable and rotated;
- refresh replay is detected or safely invalidated;
- password change/account deletion revoke mobile sessions;
- tokens are never logged;
- user ID is derived from the validated credential server-side.

## Repository layer

Mobile screens must depend on repositories/use-cases rather than directly choosing SQLite or HTTP.

```text
React Native UI
      |
      v
Repository
  |       |
  v       v
SQLite   FastAPI
  |
Outbox/sync engine
```

For replicated entities, normal reads should be local-first. Network synchronization updates SQLite and the UI observes local state.

## Synchronization order

A normal foreground sync cycle should be conceptually:

```text
1. load durable outbox
2. push pending mutations
3. persist push outcomes/conflicts atomically
4. pull server changes from stored cursor
5. apply one pull page in a SQLite transaction
6. persist new cursor in the same transaction
7. continue while hasMore
```

Never persist the new cursor before the corresponding changes are durably applied.

## Retry policy

Transient failures may retry with bounded exponential backoff and jitter.

Do not retry indefinitely for typed permanent failures such as validation errors or authorization failures.

A 401/expired mobile session should pause financial sync until authentication is refreshed or re-established.

## Background work

Background sync is a later sub-phase, after deterministic foreground sync is correct and tested.

The app must remain correct if background execution never occurs. Background work is an optimization, not the only path to consistency.

## Server-derived features on mobile

The first mobile release should consume existing server authority for:

- dashboard analytics;
- Financial Intelligence findings;
- historical analysis;
- upcoming recurring payments;
- spending forecast;
- category suggestions;
- Financial Assistant.

These features may require connectivity in v1. Their latest successful response may be cached for read-only display where useful.

## Explicit non-goals for sync-v1

- Reimplementing `rules-v2` in TypeScript.
- Reimplementing `historical-v2.2` in TypeScript.
- Running the Python category classifier in the app.
- Running forecasting models in the app.
- Offline Financial Assistant inference.
- Multi-master server databases.
- Peer-to-peer device synchronization.
- Automatic silent merge of conflicting financial writes.
- Moving PostgreSQL business invariants into SQLite.

## Testing contract

Before sync-v1 can be considered complete, automated coverage should prove at least:

### Shared/domain

- exact decimal <-> minor-unit conversion;
- malformed/unsafe monetary inputs are rejected;
- sync discriminated unions remain exhaustive.

### Backend integration

- cross-account sync isolation;
- mutation idempotency;
- stale-version conflict behavior;
- delete tombstones;
- cursor pagination without gaps/duplicates;
- bootstrap/delta handoff;
- category ownership restrictions;
- Decimal money remains exact;
- password/session revocation affects mobile credentials.

### Mobile

- SQLite migrations;
- create/edit/delete while offline;
- process death with durable outbox;
- reconnect and sync;
- retry after response loss without duplicate mutation;
- conflicting edits from web/mobile;
- logout data wipe;
- account switch data isolation.

### End-to-end

At minimum:

```text
web create -> Android pull
Android offline create -> reconnect -> server -> web
web edit + stale Android edit -> explicit conflict
Android delete -> web observes deletion
```

## Delivery sequence

### Phase 5A - Foundation and contract

- Define the multi-client boundaries.
- Define exact money sharing primitives.
- Define sync-v1 transport types.
- Define journal, idempotency, tombstone and conflict semantics.
- Keep existing web behavior unchanged.

### Phase 5B - Expo + SQLite foundation

- Scaffold the Android-first Expo application.
- Add local SQLite migrations and repositories.
- Add encrypted/secure credential storage strategy.
- Add mobile unit/type/lint/build CI.

### Phase 5C - Backend synchronization

- Add sync versions/journal/mutation deduplication.
- Add mobile authentication transport.
- Implement push/pull/bootstrap endpoints.
- Add backend integration and concurrency tests.

### Phase 5D - Offline transaction vertical slice

- Login.
- Transaction list/detail/form.
- Offline create/edit/delete.
- Durable outbox.
- Reconnect synchronization.
- Conflict UI.

### Phase 5E - Categories and budgets

- Replicate custom/system categories.
- Offline category lifecycle where server rules allow it.
- Replicate budgets and exact progress inputs.

### Phase 5F - Server-derived financial workspaces

- Dashboard.
- Financial Intelligence.
- Historical Analysis.
- Predictions/upcoming payments.
- Category suggestions.
- Financial Assistant.

### Phase 5G - Production mobile hardening

- SQLCipher/native encrypted database decision and implementation.
- Background synchronization.
- Deep-link/session lifecycle review.
- Android release signing/EAS build pipeline.
- Mobile security review.
- Device/account data wipe tests.
- Android release artifact.

## Acceptance principle

The mobile phase is successful when Smart Expense AI has **one financial domain authority and two independent clients**, not when the same financial rules exist twice.
