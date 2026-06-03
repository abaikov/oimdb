---
sidebar_position: 2
---

# Persist

`@oimdb/persist` creates persistence resources for OIMDB collections, objects, and manual indexes.

## Roles

- **Persistor**: owns storage config and a resource registry.
- **Resource**: pairs a source with a strategy.
- **Strategy**: backend-specific read/write/clear. Locations (`storageKey`, `tableName`, `bucketName`) live here.

## Memory

```ts
import { createMemoryPersistor } from '@oimdb/persist';

const persistor = createMemoryPersistor({});

persistor.collection(users).records({ bucketName: 'users' });

await persistor.hydrate();
persistor.start();
```

## LocalStorage One-Key Example

```ts
import { createLocalStoragePersistor } from '@oimdb/persist';

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
import { createIndexedDbPersistor } from '@oimdb/persist';

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

## Cleanup

```ts
persistor.stop();
persistor.destroy();
```

`removeResource(resource)` stops a resource and removes it from the registry. It does not delete persisted data. Use `persistor.clearPersisted()` to delete stored data.
