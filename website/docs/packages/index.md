---
sidebar_position: 1
---

# Packages

OIMDB is split into focused npm packages. The core package owns the collection model and reactive primitives; integration packages add React, Redux, async stores, and persistence.

## @oimdb/core

The foundational reactive collections, indexing, and event processing library.

```bash
npm install @oimdb/core
```

**Includes:**

- `createOIMCollectionKit` — DX facade: `{ queue, collection, indexFactory, select }`
- `OIMReactiveCollection` — reactive entity store with canonical slots
- `OIMCollectionIndexFactory` — creates derived, manual, and ordered indexes bound to a collection
- `OIMCollectionSelectors` — reactive selector facade (`byPk`, `entitiesBySetIndexKey`, …)
- `OIMReactiveObject` — reactive key-value store for settings, flags, and single values
- `OIMEffect` — runs a side effect when dependencies change
- `OIMComputed` — derives a value from dependencies, notifies on change
- `OIMComputeRuntime` — schedules effects and computeds within the queue flush cycle
- `OIMCollectionChangedFields` — field-level change tracking on top of a collection
- `OIMCollectionOrderedListCommandStream` — ordered list with incremental commands (insert/remove/move/set)
- `OIMEventQueue` + `OIMEventQueueSchedulerFactory` — configurable event batching and delivery

[Core Model](/docs/core/model) · [Indexes and Selectors](/docs/core/indexes-selectors) · [Source on GitHub](https://github.com/abaikov/oimdb/tree/main/packages/core) · [npm](https://www.npmjs.com/package/@oimdb/core)

## @oimdb/react

React hooks and context helpers built on `useSyncExternalStore`.

```bash
npm install @oimdb/react @oimdb/core
```

**Includes:**

- `OIMCollectionsProvider` — React context for collections
- `useOIMCollectionsContext` — typed collection access
- `useSelectEntityByPk`, `useSelectEntitiesByIndexKeySetBased` / `ArrayBased` — key-scoped hooks, re-render only on relevant changes
- `useSelectValueByObjectKey` — watch `OIMReactiveObject` keys

[React Guide](/docs/packages/react) · [Source on GitHub](https://github.com/abaikov/oimdb/tree/main/packages/react) · [npm](https://www.npmjs.com/package/@oimdb/react)

## @oimdb/redux-adapter

Production-ready Redux adapter for gradual migration or hybrid usage.

```bash
npm install @oimdb/redux-adapter @oimdb/core redux
```

**Includes:**

- `OIMDBReduxAdapter` — creates Redux reducers backed by OIMDB collections and indexes
- Middleware for auto-flushing queue after each Redux action
- Child reducers for two-way sync: Redux actions → OIMDB writes
- Custom state mappers for any Redux shape

[Redux Adapter Guide](/docs/packages/redux-adapter) · [Source on GitHub](https://github.com/abaikov/oimdb/tree/main/packages/redux-adapter) · [npm](https://www.npmjs.com/package/@oimdb/redux-adapter)

## @oimdb/async

Async collections and indexes for IndexedDB, remote APIs, and other async stores.

```bash
npm install @oimdb/async @oimdb/core
```

**Includes:**

- `OIMCollectionAsync` / `OIMReactiveCollectionAsync`
- `OIMPkIndexManualAsync` / `OIMReactivePkIndexManualAsync`
- No in-memory cache — operations go directly to the async store

[Source on GitHub](https://github.com/abaikov/oimdb/tree/main/packages/async) · [npm](https://www.npmjs.com/package/@oimdb/async)

## @oimdb/persist

Storage-agnostic persistence **engine** for OIMDB collections, objects, and manual indexes. The concrete storage backends ship as separate packages — install the engine plus the backend(s) you need.

```bash
npm install @oimdb/persist @oimdb/persist-localstorage @oimdb/core
```

**Includes:**

- `OIMPersistor` and `OIMPersistResource` — persistor lifecycle and resource binding
- Source adapters (`createCollectionSourceAdapter`, `createObjectSourceAdapter`, `createSetIndexSourceAdapter`, …)
- `createVersionedCodec` — versioned codec for schema migrations
- `byPk` and the resource `.onHydrate(reconcile)` hook — merge a later hydrate (e.g. a durable cache) onto current state instead of replacing it (`TOIMPersistHydrateReconcile`)
- `TOIM…` types and `IOIMAnyPersistResource`
- Lifecycle helpers: `hydrate`, `persist`, `start`, `stop`, `addResource`, and `removeResource`

[Persist Guide](/docs/packages/persist) · [Source on GitHub](https://github.com/abaikov/oimdb/tree/main/packages/persist) · [npm](https://www.npmjs.com/package/@oimdb/persist)

## @oimdb/persist-memory

In-memory `Map` backend for the persist engine. Ideal for tests, SSR, and server-side fill.

```bash
npm install @oimdb/persist @oimdb/persist-memory @oimdb/core
```

**Includes:**

- `createMemoryPersistor` — persistor backed by an in-memory `Map`

[Persist Guide](/docs/packages/persist) · [Source on GitHub](https://github.com/abaikov/oimdb/tree/main/packages/persist-memory) · [npm](https://www.npmjs.com/package/@oimdb/persist-memory)

## @oimdb/persist-localstorage

`localStorage` backend for the persist engine.

```bash
npm install @oimdb/persist @oimdb/persist-localstorage @oimdb/core
```

**Includes:**

- `createLocalStoragePersistor` — persistor backed by `localStorage`

[Persist Guide](/docs/packages/persist) · [Source on GitHub](https://github.com/abaikov/oimdb/tree/main/packages/persist-localstorage) · [npm](https://www.npmjs.com/package/@oimdb/persist-localstorage)

## @oimdb/persist-idb

IndexedDB backend for the persist engine.

```bash
npm install @oimdb/persist @oimdb/persist-idb @oimdb/core
```

**Includes:**

- `createIndexedDbPersistor` — persistor backed by IndexedDB

[Persist Guide](/docs/packages/persist) · [Source on GitHub](https://github.com/abaikov/oimdb/tree/main/packages/persist-idb) · [npm](https://www.npmjs.com/package/@oimdb/persist-idb)

## @oimdb/persist-json

JSON-dump backend for the persist engine — the SSR dehydrate/hydrate transport. Storage is a single plain JSON-serializable object, so the whole registered state can be `JSON.stringify`-ed on the server and seeded back on the client.

```bash
npm install @oimdb/persist @oimdb/persist-json @oimdb/core
```

**Includes:**

- `createJsonPersistor({ initial? })` — persistor backed by a plain JSON object; `initial` seeds it from an SSR blob
- `persistor.dehydrate()` — returns the JSON-serializable dump of everything persisted

[Persist Guide](/docs/packages/persist) · [SSR Guide](/docs/guides/ssr) · [Source on GitHub](https://github.com/abaikov/oimdb/tree/main/packages/persist-json) · [npm](https://www.npmjs.com/package/@oimdb/persist-json)

## @oimdb/persist-async-kv

Async key-value backend for the persist engine — the async twin of `@oimdb/persist-localstorage`. Serializes snapshots to strings and stores them through any object implementing the small async `TOIMAsyncKVLike` interface. Built for **React Native** (`AsyncStorage` drops in directly) and **Cordova native storage** (via a thin adapter); Cordova webviews can also just use `@oimdb/persist-localstorage` or `@oimdb/persist-idb`.

```bash
npm install @oimdb/persist @oimdb/persist-async-kv @oimdb/core
```

**Includes:**

- `createAsyncKVPersistor({ storage })` — persistor backed by any `TOIMAsyncKVLike` storage; `storage` is required (no global default), with optional `serialize` / `deserialize` codec
- `TOIMAsyncKVLike` — the async key-value interface; `@react-native-async-storage/async-storage` satisfies it directly, including `multiGet` / `multiSet` batch writes

[Persist Guide](/docs/packages/persist) · [Source on GitHub](https://github.com/abaikov/oimdb/tree/main/packages/persist-async-kv) · [npm](https://www.npmjs.com/package/@oimdb/persist-async-kv)

## @oimdb/snapshot-manager

Tracks which entities changed across multiple collections and returns a consolidated snapshot on demand. Use for server sync, undo/redo, or change auditing.

```bash
npm install @oimdb/snapshot-manager @oimdb/core
```

**Includes:**

- `OIMSnapshotManager` — accumulates changed PKs, delivers them via `takeSnapshot()`
- Bypasses queue coalescing — tracks every raw write, collapses to final entity state

[Snapshot Manager Guide](/docs/packages/snapshot-manager) · [Source on GitHub](https://github.com/abaikov/oimdb/tree/main/packages/snapshot-manager) · [npm](https://www.npmjs.com/package/@oimdb/snapshot-manager)
