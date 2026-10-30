# @oimdb/persist-localstorage

Web storage backend for [`@oimdb/persist`](../persist). `OIMPersistLocalStorageKeyValueBackend` is the
engine's `OIMPersistKeyValueBackend` over `localStorage`, or over any object with synchronous
`getItem` / `setItem` / `removeItem`.

```bash
npm install @oimdb/persist-localstorage @oimdb/persist @oimdb/core
```

## Exports

| export | what it is |
|---|---|
| `OIMPersistLocalStorageKeyValueBackend` | `new OIMPersistLocalStorageKeyValueBackend({ persistKeyValueItemStorage?, persistKeyValueSerializer? })` |
| `TOIMPersistLocalStorageKeyValueBackendOptions` | `{ persistKeyValueItemStorage?, persistKeyValueSerializer? }` |

`persistKeyValueItemStorage` is a `TOIMPersistKeyValueItemStorage` from `@oimdb/persist`
(`{ getItem, setItem, removeItem }`). It defaults to `globalThis.localStorage`; the constructor throws when neither is
available, so on a server pass an in-memory object. `persistKeyValueSerializer` defaults to the
engine's `OIM_PERSIST_KEY_VALUE_JSON_SERIALIZER`.

The strategies come from `@oimdb/persist`:

| strategy | options | stored as |
|---|---|---|
| `OIMPersistKeyValueEntrySnapshotService` | `{ storageKey }` | the whole snapshot, serialized, under `storageKey` |
| `OIMPersistKeyValuePathSnapshotService` | `{ storageKey, path }` | the snapshot at `path` inside one object stored under `storageKey`; several resources can share that key. An empty `path` is refused by the constructor |

Both are snapshot strategies, so every resource here is an `OIMPersistSnapshotResource`.

## Example

A collection stored as one entry, and a single entity stored at a path of a shared key.

```ts
import { OIMDB, createOIMInPlaceEntityWriter, createOIMSlotContentEntityService, createOIMSlotCollectionService, createOIMSingleSlotService } from '@oimdb/core';
import type { TOIMStoreKey } from '@oimdb/core';
import {
    OIMPersistIdentityCodec, OIMPersistEntityWriter, OIMPersistKeyValueEntrySnapshotService, OIMPersistKeyValuePathSnapshotService,
    OIMPersistKeyValueWriteBatch, OIMPersistCollectionWriteRecordSource, OIMPersistSnapshotResource,
    OIMPersistFrameScheduler, OIMPersistMicrotaskScheduler, OIMPersistSingleEntitySnapshotSource,
    OIMPersistor,
} from '@oimdb/persist';
import type { TOIMPersistRecords } from '@oimdb/persist';
import { OIMPersistLocalStorageKeyValueBackend } from '@oimdb/persist-localstorage';

type TTodo = { id: string; title: string; done: boolean };
type TTodoPersistRecords = TOIMPersistRecords<TOIMStoreKey, TTodo>;
type TSettings = { theme: 'light' | 'dark' };

const db = new OIMDB();
const persistEntityWriter = new OIMPersistEntityWriter<TTodo, TOIMStoreKey>({
    entityWriter: createOIMInPlaceEntityWriter(),
});
const todoCollectionService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TTodo>(db, { entityWriter: persistEntityWriter }) });
const todoEntityStoreSlot = todoCollectionService.createStoreSlot(db);
const settingsSingleEntityService = createOIMSingleSlotService(db, { slotContentService: createOIMSlotContentEntityService<TSettings>(db) });
const settingsEntityStoreSlot = settingsSingleEntityService.createStoreSlot(db);
settingsSingleEntityService.writeSingleSlotContent(settingsEntityStoreSlot, { theme: 'light' });

const persistLocalStorageKeyValueBackend = new OIMPersistLocalStorageKeyValueBackend();

const todoPersistor = new OIMPersistor<OIMPersistLocalStorageKeyValueBackend, OIMPersistKeyValueWriteBatch>({
    persistBackend: persistLocalStorageKeyValueBackend,
    persistScheduler: new OIMPersistMicrotaskScheduler(),
});
todoPersistor.addPersistResource(new OIMPersistSnapshotResource({
    persistSnapshotSource: new OIMPersistCollectionWriteRecordSource({
        entityCollectionService: todoCollectionService,
        entityStoreSlot: todoEntityStoreSlot,
        persistEntityWriter,
    }),
    persistSnapshotService: new OIMPersistKeyValueEntrySnapshotService<TTodoPersistRecords>({ storageKey: 'todos' }),
    persistCodec: new OIMPersistIdentityCodec<TTodoPersistRecords>(),
}));

const settingsPersistor = new OIMPersistor<OIMPersistLocalStorageKeyValueBackend, OIMPersistKeyValueWriteBatch>({
    persistBackend: persistLocalStorageKeyValueBackend,
    persistScheduler: new OIMPersistFrameScheduler({ channelSlot: db.defaultChannelSlot }),
});
settingsPersistor.addPersistResource(new OIMPersistSnapshotResource({
    persistSnapshotSource: new OIMPersistSingleEntitySnapshotSource({
        channelMap: db,
        singleSlotService: settingsSingleEntityService,
        entityStoreSlot: settingsEntityStoreSlot,
    }),
    persistSnapshotService: new OIMPersistKeyValuePathSnapshotService<TSettings>({ storageKey: 'app', path: ['settings'] }),
    persistCodec: new OIMPersistIdentityCodec<TSettings>(),
}));

await todoPersistor.hydrate();
await settingsPersistor.hydrate();
todoPersistor.start();
settingsPersistor.start();

todoCollectionService.writeSlotContentByKey(todoEntityStoreSlot, 't1', { id: 't1', title: 'write the docs', done: false });
await todoPersistor.persist();

settingsSingleEntityService.slotContentService.updateEntity(
    settingsSingleEntityService.getSingleSlot(settingsEntityStoreSlot), { theme: 'dark' },
);
db.flush();
await settingsPersistor.whenIdle();
```

Each source has the scheduler it needs, so the two resources take two persistors over one backend.
The collection reports from its writer at the write, and a write to an entity slot nobody holds
causes no frame, so its persistor drains on a microtask. The single entity reports from an effect
inside the channel's frame, which `db.flush()` runs here, and the frame scheduler drains right
after it. Starting reports the single entity's current value once unless hydrate restored it, so
with nothing stored the first drain of `settingsPersistor` writes `app`. The single entity gets its
first value from `writeSlotContentByKey`, before the persistor reads it: its source's `readSnapshot` throws
while no entity has been upserted or restored.

## What one drain costs

Each drain is one write batch. Its commit:

- reads the stored object once for every `storageKey` that has path writes or path deletions and no
  whole-value write in the batch, with one `getItem` per such key;
- applies every path write onto that object, in order, so two resources sharing `storageKey: 'app'`
  cost one read and one write of `app`;
- serializes every value it writes before calling `setItem`, then calls `setItem` once per written
  key and `removeItem` once per removed key.

A resource over a collection writes its whole snapshot: per drain, one walk of every entity slot in
the collection and one serialization of all of them. There is no key-value records strategy; for
per-entity writes use [`@oimdb/persist-idb`](../persist-idb).

## Failures

A value the serializer refuses (a cycle, a `BigInt`) throws inside the commit, before any `setItem`
of that batch. The engine then writes each resource of the batch alone, so the others are stored,
and three consecutive autosave failures of the same resource quarantine it (see
[`@oimdb/persist`](../persist)). A `setItem` that throws after an earlier `setItem` of the same commit
succeeded leaves that earlier key written: web storage has no transaction.

The engine (persistor, resources, sources, schedulers, codecs, the key-value backend) is
[`@oimdb/persist`](../persist).
