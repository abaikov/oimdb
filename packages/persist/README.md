# @oimdb/persist

Persistence resources for OIMDB collections, objects, and manual indexes.

## For AI Assistants

If you are an AI assistant, read the full OIMDB API reference before writing any persistence code — strategy types, codec shape, and error handling patterns are not obvious from types alone:

```
node_modules/@oimdb/core/llms.txt
```

CDN fallback: `https://cdn.jsdelivr.net/npm/@oimdb/core/llms.txt`

## Installation

```bash
npm install @oimdb/persist @oimdb/core
```

## Mental Model

- **Persistor** — owns storage config and a registry of resources. Calls `hydrate`, `persist`, `start`, `stop`.
- **Resource** — pairs a source (collection, object, index) with a strategy (where and how to store it).
- **Strategy** — backend-specific read/write/clear logic. Locations live here, not on the persistor.

## Memory

```ts
import { createMemoryPersistor } from '@oimdb/persist';

const persistor = createMemoryPersistor({});

persistor.collection(users).records({ bucketName: 'users' });

await persistor.hydrate();
persistor.start();
```

Share storage between two persistor instances by passing `storage: persistor.storage`.

## LocalStorage: One Key

```ts
import { OIMCollection } from '@oimdb/core';
import { createLocalStoragePersistor } from '@oimdb/persist';

const persistor = createLocalStoragePersistor({});

persistor.collection(users).entry({ storageKey: 'app:users' });

await persistor.hydrate();
persistor.start();
```

## LocalStorage: Path Inside One Key

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

Multiple resources sharing the same root key are merged in one read and one write per flush.

## IndexedDB: One Row With JSON

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

## IndexedDB: One Row Per Entity

```ts
persistor.collection(users).records({ tableName: 'users' });
```

## Objects And Indexes

```ts
persistor.object(settings).entry({
    tableName: 'entities',
    primaryKey: { entityType: 'settings' },
});

persistor.setIndex(usersByRole).entry({
    tableName: 'indexes',
    primaryKey: { index: 'usersByRole' },
});

persistor.arrayIndex(recentItems).entry({
    tableName: 'indexes',
    primaryKey: { index: 'recentItems' },
});

persistor.orderedArrayIndex(queue).entry({
    tableName: 'indexes',
    primaryKey: { index: 'queue' },
});
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

Without a queue each source change triggers an immediate write. With a queue all dirty resources are flushed once after each `AFTER_FLUSH` — all mutations from one render cycle become one write. For IndexedDB that means one transaction across all stores.

```ts
import { OIMEventQueue } from '@oimdb/core';
import { createIndexedDbPersistor } from '@oimdb/persist';

const queue = new OIMEventQueue(); // or get from OIMReactiveCollection

const persistor = createIndexedDbPersistor({
    databaseName: 'app-db',
    queue,
});

persistor.collection(users).records({ tableName: 'users' });
persistor.setIndex(usersByRole).entry({ tableName: 'indexes', primaryKey: 'usersByRole' });

await persistor.hydrate();
persistor.start();
```

## Resource Registry

```ts
const resource = persistor.collection(users).records({ tableName: 'users' });

persistor.removeResource(resource);
```

`removeResource` stops the resource but does not delete persisted data. Use `persistor.clearPersisted()` to delete stored data.

## Notes

- There is no mandatory global version or manifest in the base API.
- Migrations can be added later as explicit resource/group behavior.
- `@oimdb/persist` is durable persistence, not a partial cold-cache/query orchestrator.
