# @oimdb/persist-integration-tests

Private cross-package integration tests for the `@oimdb/persist` family. Not published.

They cover what a single package's tests cannot:

- the full SSR cycle across packages: the server persists into an `OIMPersistJsonBackend` and
  dumps `dehydrate()` as JSON text; the client builds an `OIMPersistJsonBackend` from that dump with
  `initialPersistJsonDump`, hydrates, and then hydrates a durable `OIMPersistIndexedDbBackend` on top
  with `persistHydrateReconcile: oimReconcileByKey(...)`;
- that a server render and a client React `hydrateRoot` of the same hydrated state produce the same
  markup.

The tests run under jsdom with `fake-indexeddb`, against the packages' sources. Run them with
`npm test` and type-check them with `npm run type-check`.
