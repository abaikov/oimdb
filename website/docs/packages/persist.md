---
sidebar_position: 2
---

# Persist

`@oimdb/persist` is the storage-agnostic persistence **engine** for OIMDB collections, objects, and manual indexes. It contains the engine only — the persistor lifecycle, resources, source adapters, and the versioned codec. The concrete **backends ship as separate packages**, so you only bundle the storage you actually use:

| Package | Storage |
|---|---|
| `@oimdb/persist-memory` | in-memory `Map` (tests, SSR, server-side fill) |
| `@oimdb/persist-localstorage` | `localStorage` |
| `@oimdb/persist-idb` | IndexedDB |
| `@oimdb/persist-json` | plain JSON dump — SSR dehydrate/hydrate transport |
| `@oimdb/persist-async-kv` | async key-value — React Native AsyncStorage, Cordova native storage |

Each backend exposes a `create<Backend>Persistor()` factory plus the builder sugar (`.collection(c)`, `.object(o)`, `.setIndex(i)`, …). The persistor instance API below is identical across backends — only the import of the factory changes. Install the engine plus the backend(s) you need:

```bash
npm install @oimdb/persist @oimdb/persist-localstorage @oimdb/core
# or @oimdb/persist-memory / @oimdb/persist-idb
```

## Roles

- **Persistor**: owns storage config and a resource registry.
- **Resource**: pairs a source with a strategy.
- **Strategy**: backend-specific read/write/clear. Locations (`storageKey`, `tableName`, `bucketName`) live here.

## Memory

```ts
import { createMemoryPersistor } from '@oimdb/persist-memory';

const persistor = createMemoryPersistor({});

persistor.collection(users).records({ bucketName: 'users' });

await persistor.hydrate();
persistor.start();
```

## LocalStorage One-Key Example

```ts
import { createLocalStoragePersistor } from '@oimdb/persist-localstorage';

const persistor = createLocalStoragePersistor({});

persistor.collection(users).entry({ storageKey: 'app:users' });

await persistor.hydrate();
persistor.start();
```

## LocalStorage Nested Path Example

```ts
persistor.collection(users).path({
  storageKey: 'app',
  path: ['collections', 'users'],
});

persistor.object(settings).path({
  storageKey: 'app',
  path: ['settings'],
});
```

Multiple resources on the same root key are merged in one read and one write per flush.

## IndexedDB Table And Row Example

```ts
import { createIndexedDbPersistor } from '@oimdb/persist-idb';

const persistor = createIndexedDbPersistor({
  databaseName: 'app-db',
});

persistor.collection(users).entry({
  tableName: 'entities',
  primaryKey: { entityType: 'users' },
});
```

## IndexedDB Records Example

```ts
persistor.collection(users).records({ tableName: 'users' });
```

## Objects And Indexes

```ts
persistor.object(settings).entry({ tableName: 'entities', primaryKey: { entityType: 'settings' } });

persistor.setIndex(usersByRole).entry({ tableName: 'indexes', primaryKey: { index: 'usersByRole' } });
persistor.arrayIndex(recentItems).entry({ tableName: 'indexes', primaryKey: { index: 'recentItems' } });
persistor.orderedArrayIndex(queue).entry({ tableName: 'indexes', primaryKey: { index: 'queue' } });
```

Manual indexes persist keys and primary keys only, not entity values.

## Custom Strategy

```ts
persistor.collection(users).using({
  async read(p) {
    return p.storage.entries.get('entities:users') as
      | { records: Array<{ pk: string; value: User }> }
      | undefined;
  },
  async write(p, snapshot) {
    p.storage.entries.set('entities:users', snapshot);
  },
  async clear(p) {
    p.storage.entries.delete('entities:users');
  },
});
```

## Codec

```ts
persistor.collection(users).entry(
  { storageKey: 'app:users' },
  {
    encode(snapshot) {
      return snapshot.records.map(r => r.value);
    },
    decode(stored: User[]) {
      return { records: stored.map(value => ({ pk: value.id, value })) };
    },
  }
);
```

## Autosave And Queue

Without a queue each source change triggers an immediate write. With a queue all dirty resources are flushed once per `AFTER_FLUSH` — one render cycle, one write. For IndexedDB that means one transaction across all stores.

```ts
import { OIMEventQueue } from '@oimdb/core';

const persistor = createIndexedDbPersistor({
  databaseName: 'app-db',
  queue, // from OIMEventQueue or OIMReactiveCollection
});

persistor.collection(users).records({ tableName: 'users' });
persistor.setIndex(usersByRole).entry({ tableName: 'indexes', primaryKey: 'usersByRole' });

await persistor.hydrate();
persistor.start();
```

## JSON Backend (SSR transport)

`@oimdb/persist-json` stores everything as a single plain, JSON-serializable
object keyed by `storageKey`, so the whole registered state can be dehydrated to a
string on the server and seeded back on the client. `createJsonPersistor({ initial })`
takes the inlined blob, and `persistor.dehydrate()` returns the JSON-serializable
dump.

```ts
import { createJsonPersistor } from '@oimdb/persist-json';

// Server: fill, persist, dump.
const persistor = createJsonPersistor();
persistor.collection(questions).entry({ storageKey: 'questions' });
await persistor.persist();
const json = JSON.stringify(persistor.dehydrate());

// Client: seed from the blob, then hydrate.
const client = createJsonPersistor({ initial: window.__OIM__ });
client.collection(questions).entry({ storageKey: 'questions' });
await client.hydrate();
```

See the [Server-Side Rendering guide](/docs/guides/ssr) for the full server +
client flow and merging an SSR pre-state with a durable local cache.

## Hydration Merge Hook (`onHydrate` + `byPk`)

By default `hydrate()` **replaces** whatever the collection holds with the stored
snapshot — the last hydrate wins (this is the original, backward-compatible
behavior). When two sources feed the same collection — for example an SSR pre-state
plus a durable local cache — you can reconcile the incoming hydrate against the
current contents instead via `.onHydrate(reconcile)`:

```ts
import { byPk } from '@oimdb/persist';

persistor
  .collection(questions)
  .entry({ storageKey: 'questions' })
  .onHydrate(
    byPk((question, answer) =>
      question ? { ...question, answer: answer.answer } : answer
    )
  );
```

`reconcile(current, incoming) => snapshot` receives the whole collection snapshot:
`current` is what the collection holds **now** (e.g. the SSR pre-state), `incoming`
is what **this** `hydrate()` brings (e.g. the IndexedDB data). `byPk(...)` lifts a
per-entity resolver `(current, incoming, pk) => entity | undefined` to a
collection-level reconcile — it walks the union of primary keys and calls your
resolver for each. The exported type is `TOIMPersistHydrateReconcile`.

This is the foundation of the SSR + durable-cache flow. See the
[Server-Side Rendering guide](/docs/guides/ssr) for the full recipe.

## Cleanup

```ts
persistor.stop();
persistor.destroy();
```

`removeResource(resource)` stops a resource and removes it from the registry. It does not delete persisted data. Use `persistor.clearPersisted()` to delete stored data.
