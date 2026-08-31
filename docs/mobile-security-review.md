# Mobile Security Review

Status: Phase 5G implementation review for the Android-first Expo/React Native client.

## Security boundary

FastAPI/PostgreSQL remains the authoritative financial system. Android stores a local replica, queued user intent, conflict evidence and selected read-only server snapshots. The mobile application never receives backend database credentials, JWT signing secrets or LLM/provider API keys.

Authentication uses short-lived mobile-audience access tokens and rotating opaque refresh tokens. Credentials and the local database encryption key are stored in Expo SecureStore rather than SQLite.

## Threats and controls

### Device file extraction

Risk: an attacker obtains the application data directory or a copied SQLite database.

Controls:

- `expo-sqlite` is built with SQLCipher enabled;
- a 256-bit random database passphrase is generated with `expo-crypto` and stored only in SecureStore;
- the key is applied immediately after opening SQLite and before migrations or application queries;
- Android Auto Backup is disabled so encrypted database files are not restored without their Keystore-bound secrets;
- SQLite `secure_delete` is enabled;
- logout/account-boundary erasure truncates WAL and runs `VACUUM` after deleting account-scoped rows.

Residual risk: a fully compromised/unlocked device with code execution in the application context can access data while the application itself can decrypt it. SQLCipher is an at-rest control, not protection against a compromised runtime.

### Legacy plaintext replica

Risk: upgrading an existing development install leaves a plaintext financial replica behind or loses queued offline mutations.

Controls:

- Phase 5G uses a new encrypted database filename;
- when the encrypted database is empty, the client checks for the legacy schema;
- the legacy WAL is checkpointed before migration;
- Expo SQLite backup copies the complete logical database, including outbox/conflict/sync state, into the keyed destination connection;
- the legacy database is deleted only after a successful backup;
- normal schema migrations then run against the encrypted destination.

### Cross-account local leakage

Risk: one account sees a prior account's replica or cached analytics on a shared device.

Controls:

- the local account id is bound in SQLite;
- switching to a different account invokes the same full account-data erasure boundary before binding the new id;
- logout erases transactions, categories, budgets, outbox, conflicts, sync state and server-derived cache;
- remote account deletion/session revocation causes mobile session restoration to clear credentials and request the same local wipe.

### Background synchronization races

Risk: WorkManager and a foreground sync manipulate the same outbox concurrently.

Controls:

- both entry points use one SQLite-backed runtime lease;
- lease acquisition occurs inside an exclusive SQLite transaction;
- a second synchronizer skips instead of resetting another synchronizer's `sending` mutations;
- the lease has a bounded expiry for crash recovery;
- server mutation IDs remain idempotent, so a transport retry cannot duplicate a committed financial write.

Background execution is opportunistic. Foreground sync remains the correctness path because Android WorkManager scheduling is inexact and OS-controlled.

### Token theft/replay

Controls already present before Phase 5G:

- access and refresh tokens are never stored in SQLite;
- refresh tokens rotate and server-side replay detection revokes the mobile session;
- concurrent 401 responses share a single refresh operation;
- logout clears local credentials even when the network is unavailable;
- server-side account/session revocation invalidates subsequent mobile refresh.

### Build and signing secrets

Controls:

- `EXPO_PUBLIC_*` is treated as public build-time configuration only;
- no signing key, Expo token, Google service-account credential or provider secret is committed;
- `eas.json` defines preview APK and production AAB profiles without embedding credentials;
- EAS/Google Play credentials must live in their managed secret/credential stores;
- Mobile CI runs Expo dependency checks, Jest, strict TypeScript, ESLint, native prebuild, Gradle debug compilation and Android JS export.

## Release gates

Before a production Play release:

1. Mobile CI and repository Quality Gate must be green on the exact release SHA.
2. A production EAS AAB must build using managed signing credentials.
3. Android offline/reconnect/conflict flows must be exercised on an emulator or physical development build, not Expo Go (SQLCipher is not available in Expo Go).
4. Logout must be verified to remove account-scoped local rows and cached read models.
5. Remote account deletion/revocation must be verified to invalidate mobile credentials and clear local account data on the next session restore.
6. No `EXPO_PUBLIC_*` variable may contain credentials or secrets.
7. Store privacy/data-safety declarations must match actual local storage, analytics and network behavior.

## Deferred hardening

- device/emulator end-to-end automation for offline/reconnect/conflict flows;
- production AAB build evidence and Play internal-testing release;
- runtime crash/performance monitoring selection and privacy review;
- optional biometric application lock, if product requirements justify the additional UX and recovery complexity;
- iOS-specific background/security validation when iOS becomes a release target.
