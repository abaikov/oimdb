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
| `OIMPersistMemoryRecordsStrategy` | records strategy, `new OIMPersistMemoryRecordsStrategy({ storageKey })`: one `Map` of key to entity per `storageKey` |
| `OIMPersistMemorySnapshotStrategy` | snapshot strategy, `new OIMPersistMemorySnapshotStrategy({ storageKey })`: one value per `storageKey` |
| `TOIMPersistMemoryStrategyOptions` | `{ storageKey }`, the options of both strategies |

Snapshot values and records live in two separate maps, so a snapshot and a records resource can use
the same `storageKey` without meeting.

The backend's read methods, `readSnapshotValue(storageKey)` and `readRecords(storageKey)`, are how a
test asserts what was committed. `readRecords` answers `undefined` for a `storageKey` that holds
no records, and the records strategy passes that on, so a hydrate over an empty backend applies
nothing.

`readRecordsOfKeys(storageKey, keys)` is the read behind `persistor.load(persistResourceRecords, keys)`:
it looks each key up in the `storageKey`'s map and answers the records of the keys the map holds,
leaving out the rest, with no copy of the other entities. A `storageKey` that holds no records
answers an empty list.

## Example

```ts
import { OIMDB, createOIMEntityService, createOIMEntityWriterInPlace } from '@oimdb/core';
import type { TOIMStoreKey } from '@oimdb/core';
import {
    OIMPersistEntityWriter, OIMPersistRecordSourceCollectionWriteDriven, OIMPersistResourceRecords,
    OIMPersistSchedulerMicrotaskDriven, OIMPersistor,
} from '@oimdb/persist';
import { OIMPersistMemoryBackend, OIMPersistMemoryRecordsStrategy, OIMPersistMemoryWriteBatch } from '@oimdb/persist-memory';

type TUser = { id: string; name: string };

const db = new OIMDB();
const persistEntityWriter = new OIMPersistEntityWriter<TUser, TOIMStoreKey>({
    entityWriter: createOIMEntityWriterInPlace(),
});
const userCollectionService = createOIMEntityService<TUser>(db, {
    keyOf: user => user.id,
    entityWriter: persistEntityWriter,
});
const userEntityStoreSlot = userCollectionService.createStoreSlot(db);

const persistMemoryBackend = new OIMPersistMemoryBackend();
const persistor = new OIMPersistor<OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch>({
    persistBackend: persistMemoryBackend,
    persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
});
persistor.addPersistResource(new OIMPersistResourceRecords({
    persistRecordSource: new OIMPersistRecordSourceCollectionWriteDriven({
        entityCollectionService: userCollectionService,
        entityStoreSlot: userEntityStoreSlot,
        persistEntityWriter,
    }),
    persistRecordsStrategy: new OIMPersistMemoryRecordsStrategy<TOIMStoreKey, TUser>({ storageKey: 'users' }),
}));

await persistor.hydrate();
persistor.start();

userCollectionService.slotContentService.upsertEntity(userEntityStoreSlot, { id: 'u1', name: 'Ada' });
await persistor.persist();

persistMemoryBackend.readRecords('users');
```

Autosave writes a delta into the records map: one `set` per upserted key and one `delete` per
deleted key. `persist()` replaces the map for that `storageKey` with the full records; while the resource has
unloaded keys it sets every in-memory record into the map instead and removes nothing.
`clearPersisted()` deletes it, so the next hydrate applies nothing.

## Values are kept by reference

The backend stores the entity objects and snapshot values it is handed; it copies nothing. With
`createOIMEntityWriterInPlace()` the stored entity is the live entity object, so an in-place write
changes what the backend holds before any commit: reading the backend shows the live value whether
or not a drain has written it yet. Where a
test must see exactly what was committed, build the entity service over
`createOIMEntityWriterReplacing()` with a copying insert strategy, or encode a snapshot resource
through a codec that copies.

The engine (persistor, resources, sources, schedulers, codecs) is
[`@oimdb/persist`](../persist).
