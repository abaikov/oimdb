# @oimdb/persist-idb

IndexedDB backend for [`@oimdb/persist`](../persist): durable, structured-clone storage that
survives reloads, with a records strategy that writes one table value per entity and a snapshot
strategy that writes one value per resource. Every drain commits in one IndexedDB transaction.

```bash
npm install @oimdb/persist-idb @oimdb/persist @oimdb/core
```

## Exports

| export | what it is |
|---|---|
| `OIMPersistIndexedDbBackend` | `new OIMPersistIndexedDbBackend({ databaseName, databaseVersion?, indexedDb? })` |
| `OIMPersistIndexedDbWriteBatch` | its write batch: queues `put`, `delete` and `clear` per table and runs them in one `readwrite` transaction on `commit()` |
| `OIMPersistIndexedDbRecordsStrategy` | records strategy, `new OIMPersistIndexedDbRecordsStrategy({ tableName })`: one table, one value per entity key |
| `OIMPersistIndexedDbSnapshotStrategy` | snapshot strategy, `new OIMPersistIndexedDbSnapshotStrategy({ tableName, primaryKey })`: one value at `primaryKey` |
| `TOIMPersistIndexedDbBackendOptions` | `{ databaseName, databaseVersion?, indexedDb? }` |
| `TOIMPersistIndexedDbRecordsStrategyOptions` | `{ tableName }` |
| `TOIMPersistIndexedDbSnapshotStrategyOptions` | `{ tableName, primaryKey }` |
| `TOIMPersistIndexedDbPrimaryKey` | an `IDBValidKey`, or a plain object |
| `TOIMPersistIndexedDbTableRecord` | `{ key, value }`, one value read back from a table |

`indexedDb` defaults to `globalThis.indexedDB`; the constructor throws when neither is available
(pass `fake-indexeddb` in a test). A table is an object store.

## Example

```ts
import { OIMDB, createOIMEntityService, createOIMEntityWriterInPlace } from '@oimdb/core';
import type { TOIMStoreKey } from '@oimdb/core';
import {
    OIMPersistEntityWriter, OIMPersistRecordSourceCollectionWriteDriven, OIMPersistResourceRecords,
    OIMPersistSchedulerMicrotaskDriven, OIMPersistor,
} from '@oimdb/persist';
import { OIMPersistIndexedDbBackend, OIMPersistIndexedDbRecordsStrategy, OIMPersistIndexedDbWriteBatch } from '@oimdb/persist-idb';

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

const persistor = new OIMPersistor<OIMPersistIndexedDbBackend, OIMPersistIndexedDbWriteBatch>({
    persistBackend: new OIMPersistIndexedDbBackend({ databaseName: 'app' }),
    persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
});
const userPersistResourceRecords = persistor.addPersistResource(new OIMPersistResourceRecords({
    persistRecordSource: new OIMPersistRecordSourceCollectionWriteDriven({
        entityCollectionService: userCollectionService,
        entityStoreSlot: userEntityStoreSlot,
        persistEntityWriter,
    }),
    persistRecordsStrategy: new OIMPersistIndexedDbRecordsStrategy<TOIMStoreKey, TUser>({ tableName: 'users' }),
}));

await persistor.hydrate();
persistor.start();

userCollectionService.slotContentService.upsertEntity(userEntityStoreSlot, { id: 'u1', name: 'Ada' });
userCollectionService.slotContentService.upsertEntity(userEntityStoreSlot, { id: 'u2', name: 'Grace' });
await persistor.persist();

await persistor.unload(userPersistResourceRecords, ['u2']);
await persistor.load(userPersistResourceRecords, ['u2']);
```

`unload` writes, in one write batch, whatever the resource still has pending and the current
value of `u2`, so an edit made while the persistor was stopped or the resource quarantined is
not lost; while `u2` still has an unwritten change after a commit (unload holds the entity slot while it writes and compares its revision stamp, which moves only on a real write, and checks the pending set and whether the slot was replaced), it writes another batch. Then it takes `u2` out of the entity store slot without
reporting it; the table keeps it, and `load` (or the next `hydrate()`) brings it back. Until then
(or a `clearPersisted()`), `persist()` on this resource puts every entity in memory, deletes only the
keys whose deletion the resource already heard, and does not clear the table, so `u2` stays
stored. Another
resource over the same entity store slot is not silenced: it sees the removal as a deletion and deletes
`u2` from its own storage.

`load` runs after the pending writes and reads only `u2`, through
`OIMPersistIndexedDbRecordsStrategy.readRecordsOfKeys`. It puts the stored value back into the
entity store slot without writing it back, unless `u2` holds a value in memory or has a change the resource
has not written yet, so a write or a heard deletion made during the read is not overwritten. `u2`
then stops counting as unloaded, and once no key is, `persist()` clears the table again.

A deletion made while the persistor is stopped is not heard. While a key is unloaded `persist()`
does not write it, and once that entity's slot is released `unload` cannot write it either: it
comes back on the next `hydrate()`. Call `persist()` while started, and with no key unloaded, to
make a deletion the resource never heard durable.

## What a drain does in the database

- **Autosave** writes the delta: one `put` per upserted key and one `delete` per deleted key, for
  the entity slots written since the last drain.
- **`persist()`** writes the whole resource: one `clear` of the table, then one `put` per entity;
  while the resource has unloaded keys, one `put` per entity in memory, one `delete` per deletion
  the resource already heard, and no `clear`.
- **`clearPersisted()`** queues one `clear` per records table and one `delete` per snapshot value.
- Every change of one batch, across every table it touches, runs in one `readwrite` transaction, so
  the batch commits or fails as a whole.
- A commit with at least one change opens the database, and closes it when the transaction ends; a
  commit with none does nothing. A table the batch needs
  and the database lacks is created first by a version upgrade; when another connection upgrades the
  database first, the upgrade is attempted again, up to five attempts. An upgrade blocked by another
  open connection for five seconds rejects the commit.
- A read (`hydrate`) opens the database without upgrading it. A table that does not exist reads as
  `undefined`, so nothing is applied; it is not created by reading.
- **`load`** reads through `readTableValues(tableName, primaryKeys)`: one `readonly` transaction with
  one `get` per key, and the database closed afterwards. A key the table does not hold, or a table
  that does not exist, is left out of the records.

## Keys

A table value is stored with an out-of-line key: the entity key of a records strategy, or the
`primaryKey` of a snapshot strategy. An `IDBValidKey` is used as it is. A plain-object key is encoded
as a string, `oimdb:object:` followed by its JSON with property names sorted, so two objects with
the same properties in a different order address the same value. A records strategy reads such a key
back as that string, not as the object, on `hydrate`; `load` hands each record back under the key it
was given.

## Limits

- `clearPersisted()` empties a records table and keeps it, so the next hydrate reads an empty list of
  records and applies it: the collection source then deletes every entity in memory that the empty
  list does not name, which is all of them. Hydrate a cleared resource with a
  `persistHydrateReconcile`, or do not hydrate it.
- A value that structured clone refuses (a function, a symbol) fails the
  transaction. The engine retries each resource of the batch alone, and three consecutive autosave
  failures quarantine the resource.

The engine (persistor, resources, sources, schedulers, codecs, reconcile) is
[`@oimdb/persist`](../persist).
