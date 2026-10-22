# @oimdb/persist-async-kv

Asynchronous key-value storage for [`@oimdb/persist`](../persist): an `IOIMPersistKeyValueStorage`
over any store with `multiGet`, `multiSet` and `multiRemove`, the three batch methods of React
Native's `AsyncStorage`. It plugs into the engine's `OIMPersistKeyValueBackend`, which supplies the
write batch, the serializer and the strategies.

```bash
npm install @oimdb/persist-async-kv @oimdb/persist @oimdb/core
```

## Exports

| export | what it is |
|---|---|
| `OIMPersistAsyncKVStorage` | `new OIMPersistAsyncKVStorage({ persistAsyncKVMultiStorage })` |
| `TOIMPersistAsyncKVStorageOptions` | `{ persistAsyncKVMultiStorage }` |
| `TOIMPersistAsyncKVMultiStorage` | `{ multiGet(storageKeys), multiSet(itemEntries), multiRemove(storageKeys) }`, each returning a promise |

A store with only `getItem` / `setItem` / `removeItem` needs no package: the engine's
`OIMPersistKeyValueStorageItemDriven({ persistKeyValueItemStorage })` accepts those methods,
synchronous or returning promises, and calls them once per key.

## Example

```ts
import { OIMDB, createOIMEntityService, createOIMEntityWriterInPlace } from '@oimdb/core';
import type { TOIMStoreKey } from '@oimdb/core';
import {
    OIMPersistCodecIdentity, OIMPersistEntityWriter, OIMPersistKeyValueBackend, OIMPersistKeyValueEntryStrategy,
    OIMPersistKeyValueWriteBatch, OIMPersistRecordSourceCollectionWriteDriven, OIMPersistResourceSnapshot,
    OIMPersistSchedulerMicrotaskDriven, OIMPersistor,
} from '@oimdb/persist';
import type { TOIMPersistRecords } from '@oimdb/persist';
import { OIMPersistAsyncKVStorage } from '@oimdb/persist-async-kv';
import type { TOIMPersistAsyncKVMultiStorage } from '@oimdb/persist-async-kv';

declare const persistAsyncKVMultiStorage: TOIMPersistAsyncKVMultiStorage;

type TNote = { id: string; text: string };
type TNotePersistRecords = TOIMPersistRecords<TOIMStoreKey, TNote>;

const db = new OIMDB();
const persistEntityWriter = new OIMPersistEntityWriter<TNote, TOIMStoreKey>({
    entityWriter: createOIMEntityWriterInPlace(),
});
const noteCollectionService = createOIMEntityService<TNote>(db, {
    keyOf: note => note.id,
    entityWriter: persistEntityWriter,
});
const noteEntityStoreSlot = noteCollectionService.createStoreSlot(db);

const persistor = new OIMPersistor<OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch>({
    persistBackend: new OIMPersistKeyValueBackend({
        persistKeyValueStorage: new OIMPersistAsyncKVStorage({ persistAsyncKVMultiStorage }),
    }),
    persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
});
persistor.addPersistResource(new OIMPersistResourceSnapshot({
    persistSnapshotSource: new OIMPersistRecordSourceCollectionWriteDriven({
        entityCollectionService: noteCollectionService,
        entityStoreSlot: noteEntityStoreSlot,
        persistEntityWriter,
    }),
    persistSnapshotStrategy: new OIMPersistKeyValueEntryStrategy<TNotePersistRecords>({ storageKey: 'notes' }),
    persistCodec: new OIMPersistCodecIdentity<TNotePersistRecords>(),
}));

await persistor.hydrate();
persistor.start();

noteCollectionService.slotContentService.upsertEntity(noteEntityStoreSlot, { id: 'n1', text: 'buy milk' });
await persistor.persist();
```

Pass the store itself as `persistAsyncKVMultiStorage`; in React Native that is the default export of
`@react-native-async-storage/async-storage`.

## What one drain costs

One drain is one write batch, and its commit makes at most three calls to the store:

- one `multiGet`, for the keys that have path writes or path deletions and no whole-value write in
  the batch (`OIMPersistKeyValuePathStrategy`), skipped when there are none;
- one `multiSet` with every written key, skipped when nothing is written;
- one `multiRemove` with every removed key, skipped when nothing is removed.

A hydrate reads each resource with one `multiGet` of its `storageKey`.

The strategies are snapshot strategies, so a collection is written whole: per drain, one walk of
every entity slot of the collection and one serialization of all of them under one key. There is
no key-value records strategy.

`multiSet` and `multiRemove` are two calls, so a commit that both writes and removes is not
atomic across them.

The engine (persistor, resources, sources, schedulers, codecs, the key-value backend and its
strategies) is [`@oimdb/persist`](../persist).
