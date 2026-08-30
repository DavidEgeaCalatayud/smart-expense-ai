# Shared client contracts

`shared/` contains platform-neutral contracts that may be consumed by both the web and mobile clients.

It is intentionally small. Existing frontend types are **not** bulk-moved here in one migration because that would create unnecessary web regression risk.

## Boundaries

```text
shared/
├── api-contracts/   # transport and synchronization shapes
└── domain-types/    # platform-neutral exact domain primitives
```

Shared code must not depend on:

- React DOM;
- React Native;
- browser globals;
- Expo APIs;
- SQLite;
- Node-only APIs;
- backend Python implementation details.

Shared code may define exact transport/domain primitives that both clients need to interpret identically.

The first shared contracts are `sync-v1` and exact decimal/minor-unit money conversion.
