# @oimdb/persist-integration-tests

Private cross-package integration tests (SSR end-to-end, multi-backend) for the
`@oimdb/persist` family. Not published.

These tests exercise real behavior that per-package unit tests can't:

- the full SSR data cycle across packages (server `dehydrate()` → JSON string →
  client `hydrate()` → durable cache merged on top via `onHydrate(byPk(...))`);
- that an SSR render and a client React `hydrateRoot` of the same dehydrated
  state produce matching markup (no hydration mismatch).

Run with `npm test` and type-check with `npm run type-check`.
