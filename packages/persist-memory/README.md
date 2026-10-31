# @oimdb/persist-memory

In-memory backend for [`@oimdb/persist`](../persist). It keeps snapshots and records in plain
`Map`s, with no I/O. Useful for tests (assert what was persisted), for server-side filling before
a dump (see [`@oimdb/persist-json`](../persist-json), which builds on it), and as the reference
implementation of a backend.

```bash
npm install @oimdb/persist-memory @oimdb/persist @oimdb/core
```

## Exports

| export | what it is |
|---|---|
| `OIMPersistMemoryBackend` | the backend; `new OIMPersistMemoryBackend()` takes no options |
| `OIMPersistMemoryWriteBatch` | its write batch: queues every change and applies them in order on `commit()` |
| `OIMPersistMemoryRecordsService` | records strategy, `new OIMPersistMemoryRecordsService({ storageKey })`: one `Map` of key to entity per `storageKey` |
| `OIMPersistMemorySnapshotService` | snapshot strategy, `new OIMPersistMemorySnapshotService({ storageKey })`: one value per `storageKey` |
| `TOIMPersistMemoryServiceOptions` | `{ storageKey }`, the options of both strategies |

Snapshot values and records live in two separate maps, so a snapshot and a records resource can use
the same `storageKey` without meeting.

The backend's read methods, `readSnapshotValue(storageKey)` and `readRecords(storageKey)`, are how a
test asserts what was committed. `readRecords` answers `undefined` for a `storageKey` that holds
no records, and the records strategy passes that on, so a hydrate over an empty backend applies
nothing.

`readRecordsOfKeys(storageKey, keys)` is the read behind `persistor.load(persistRecordsResource, keys)`:
it looks each key up in the `storageKey`'s map and answers the records of the keys the map holds,
leaving out the rest, with no copy of the other entities. A `storageKey` that holds no records
answers an empty list.

## Example

```ts
import { OIMDB, createOIMInPlaceEntityWriter, createOIMSlotContentEntityService, createOIMSlotCollectionService } from '@oimdb/core';
import type { TOIMStoreKey } from '@oimdb/core';
import {
    OIMPersistEntityWriter, OIMPersistCollectionWriteRecordSource, OIMPersistRecordsResource,
    OIMPersistMicrotaskScheduler, OIMPersistor,
} from '@oimdb/persist';
import { OIMPersistMemoryBackend, OIMPersistMemoryRecordsService, OIMPersistMemoryWriteBatch } from '@oimdb/persist-memory';

type TUser = { id: string; name: string };

const db = new OIMDB();
const persistEntityWriter = new OIMPersistEntityWriter<TUser, TOIMStoreKey>({
    entityWriter: createOIMInPlaceEntityWriter(),
});
const userCollectionService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TUser>({ entityWriter: persistEntityWriter }) });
const userEntityStoreSlot = userCollectionService.createStoreSlot(db);

const persistMemoryBackend = new OIMPersistMemoryBackend();
const persistor = new OIMPersistor<OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch>({
    persistBackend: persistMemoryBackend,
    persistScheduler: new OIMPersistMicrotaskScheduler(),
});
persistor.addPersistResource(new OIMPersistRecordsResource({
    persistRecordSource: new OIMPersistCollectionWriteRecordSource({
        entityCollectionService: userCollectionService,
        entityStoreSlot: userEntityStoreSlot,
        persistEntityWriter,
    }),
    persistRecordsService: new OIMPersistMemoryRecordsService<TOIMStoreKey, TUser>({ storageKey: 'users' }),
}));

await persistor.hydrate();
persistor.start();

userCollectionService.writeSlotContentByKey(userEntityStoreSlot, 'u1', { id: 'u1', name: 'Ada' });
await persistor.persist();

persistMemoryBackend.readRecords('users');
```

Autosave writes a delta into the records map: one `set` per upserted key and one `delete` per
deleted key. `persist()` replaces the map for that `storageKey` with the full records; while the resource has
unloaded keys it sets every in-memory record into the map instead and removes nothing.
`clearPersisted()` deletes it, so the next hydrate applies nothing.

## Values are kept by reference

The backend stores the entity objects and snapshot values it is handed; it copies nothing. With
`createOIMInPlaceEntityWriter()` the stored entity is the live entity object, so an in-place write
changes what the backend holds before any commit: reading the backend shows the live value whether
or not a drain has written it yet. Where a
test must see exactly what was committed, build the entity service over
`createOIMReplacingEntityWriter()` with a copying insert strategy, or encode a snapshot resource
through a codec that copies.

The engine (persistor, resources, sources, schedulers, codecs) is
[`@oimdb/persist`](../persist).
