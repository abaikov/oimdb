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

- `createOIMCollectionContext` — DX facade: `{ queue, collection, indexFactory, select }`
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
- `useSelectEntitiesByIndexKeySetBased` / `ArrayBased` — index subscriptions
- Key-scoped hooks for efficient re-renders

[Source on GitHub](https://github.com/abaikov/oimdb/tree/main/packages/react) · [npm](https://www.npmjs.com/package/@oimdb/react)

## @oimdb/redux-adapter

Production-ready Redux adapter for gradual migration or hybrid usage.

```bash
npm install @oimdb/redux-adapter @oimdb/core redux
```

**Includes:**

- Two-way synchronization between OIMDB and Redux
- Automatic flushing middleware after Redux actions
- Flexible state mappers for any Redux shape
- Optimized diffing for large datasets

[Source on GitHub](https://github.com/abaikov/oimdb/tree/main/packages/redux-adapter) · [npm](https://www.npmjs.com/package/@oimdb/redux-adapter)

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

Storage-specific persistence resources for OIMDB collections, objects, and manual indexes.

```bash
npm install @oimdb/persist @oimdb/core
```

**Includes:**

- Storage-specific persistors for memory, `localStorage`, and IndexedDB
- Resource factories for collections, objects, set indexes, array indexes, and ordered indexes
- Backend-native strategies such as `storageKey`, `path`, `tableName`, and `primaryKey`
- Lifecycle helpers: `hydrate`, `persist`, `start`, `stop`, `addResource`, and `removeResource`

[Persist Guide](/docs/packages/persist) · [Source on GitHub](https://github.com/abaikov/oimdb/tree/main/packages/persist) · [npm](https://www.npmjs.com/package/@oimdb/persist)

## @oimdb/snapshot-manager

Snapshot persistence utilities for saving and restoring OIMDB state.

```bash
npm install @oimdb/snapshot-manager @oimdb/core
```

[Source on GitHub](https://github.com/abaikov/oimdb/tree/main/packages/snapshot-manager) · [npm](https://www.npmjs.com/package/@oimdb/snapshot-manager)
