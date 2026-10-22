---
sidebar_position: 3.2
title: 'Persist: backends'
description: The @oimdb/persist backends (IndexedDB, localStorage, an async key-value store, memory and JSON), the strategies each one takes, what one commit is on each, and how to build a backend of your own.
---

# Persist: backends

This page continues [Persist](/docs/packages/persist) with the storage side: the
five backends, the strategies each one takes, what one write batch commits on each,
and what a backend of your own owes.

<InShort>

- A backend creates write batches, and its strategies read from it and write into a batch.
- IndexedDB has a snapshot strategy and a records strategy; it is the backend that writes per-key deltas to durable storage.
- localStorage and an async key-value store share one key-value backend with an entry strategy and a path strategy; a collection there is a whole snapshot per write batch.
- Memory keeps what it was handed by reference; JSON is memory plus `dehydrate()` and `initialPersistJsonDump`, for server-side rendering.

</InShort>

```ts setup
import {
  OIMDB, createOIMEntityService, createOIMEntityWriterInPlace, createOIMSingleEntityService,
} from '@oimdb/core';
import type { TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';
import {
  OIMPersistCodecIdentity, OIMPersistEntityWriter, OIMPersistRecordSourceCollectionWriteDriven,
  OIMPersistResourceRecords, OIMPersistResourceSnapshot, OIMPersistSchedulerMicrotaskDriven,
  OIMPersistSnapshotSourceSingleEntityDriven, OIMPersistor,
} from '@oimdb/persist';
import type { TOIMPersistRecords } from '@oimdb/persist';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;
type TCardRecords = TOIMPersistRecords<TOIMStoreKey, TCard>;
type TSettings = { theme: string };

const db = new OIMDB();

const persistEntityWriter = new OIMPersistEntityWriter<TCard, TOIMStoreKey>({
  entityWriter: createOIMEntityWriterInPlace(),
});
const cardCollectionService = createOIMEntityService<TCard>(db, {
  keyOf: card => card.id,
  entityWriter: persistEntityWriter,
});
const cardEntityStoreSlot = cardCollectionService.createStoreSlot(db);

const settingsSingleEntityService = createOIMSingleEntityService<TSettings>(db);
const settingsEntityStoreSlot = settingsSingleEntityService.createStoreSlot(db);
settingsSingleEntityService.slotContentService.upsertEntity(settingsEntityStoreSlot, { theme: 'dark' });
```

## Choosing a backend

| package | backend | snapshot strategies | records strategy | one commit is |
|---|---|---|---|---|
| `@oimdb/persist-idb` | `OIMPersistIndexedDbBackend` | `OIMPersistIndexedDbSnapshotStrategy` | `OIMPersistIndexedDbRecordsStrategy` | one `readwrite` transaction over every table the batch touched |
| `@oimdb/persist-localstorage` | `OIMPersistLocalStorageBackend` | `OIMPersistKeyValueEntryStrategy`, `OIMPersistKeyValuePathStrategy` | none | one `setItem` per storage key the batch wrote, one `removeItem` per key it removed, plus one `getItem` per stored root a path strategy needs |
| `@oimdb/persist-async-kv` | `OIMPersistKeyValueBackend` over `OIMPersistAsyncKVStorage` | the same two | none | one `multiSet` and one `multiRemove`, plus one `multiGet` when a path strategy needs a stored root |
| `@oimdb/persist-memory` | `OIMPersistMemoryBackend` | `OIMPersistMemorySnapshotStrategy` | `OIMPersistMemoryRecordsStrategy` | the batch's changes applied in order, synchronously |
| `@oimdb/persist-json` | `OIMPersistJsonBackend` | the memory ones | the memory one | the same as memory |

The key-value strategies, the key-value backend and the item-driven storage live in
`@oimdb/persist` itself, because `@oimdb/persist-localstorage` and
`@oimdb/persist-async-kv` are the same backend over a synchronous and an awaitable
store.

**There is no key-value records strategy.** Nothing keeps one storage key per
entity on `localStorage` or an async key-value store, so a collection there goes
into `OIMPersistResourceSnapshot` and every write batch that carries it rewrites
the whole collection, O(entities). For a large collection that changes a few
entities at a time, take IndexedDB with `OIMPersistResourceRecords`.

## IndexedDB

```ts
import {
  OIMPersistIndexedDbBackend, OIMPersistIndexedDbRecordsStrategy, OIMPersistIndexedDbSnapshotStrategy,
} from '@oimdb/persist-idb';

const persistor = new OIMPersistor({
  persistBackend: new OIMPersistIndexedDbBackend({ databaseName: 'app' }),
  persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
  onPersistError: (error, { persistOperation }) => console.error(persistOperation, error),
});
persistor.addPersistResource(new OIMPersistResourceRecords({
  persistRecordSource: new OIMPersistRecordSourceCollectionWriteDriven({
    entityCollectionService: cardCollectionService,
    entityStoreSlot: cardEntityStoreSlot,
    persistEntityWriter,
  }),
  persistRecordsStrategy: new OIMPersistIndexedDbRecordsStrategy<TOIMStoreKey, TCard>({ tableName: 'cards' }),
}));
persistor.addPersistResource(new OIMPersistResourceSnapshot({
  persistSnapshotSource: new OIMPersistSnapshotSourceSingleEntityDriven({
    channelMap: db,
    singleSlotService: settingsSingleEntityService,
    entityStoreSlot: settingsEntityStoreSlot,
  }),
  persistSnapshotStrategy: new OIMPersistIndexedDbSnapshotStrategy<TSettings>({ tableName: 'settings', primaryKey: 'current' }),
  persistCodec: new OIMPersistCodecIdentity<TSettings>(),
}));

await persistor.hydrate();
persistor.start();
```

`OIMPersistIndexedDbBackend` takes `databaseName`, an optional `databaseVersion`
and an optional `indexedDb` (an `IDBFactory`, for example `fake-indexeddb` in a
test). Without `indexedDb` it uses `globalThis.indexedDB`, and the constructor
throws where there is none.

- `OIMPersistIndexedDbRecordsStrategy({ tableName })` keeps one IndexedDB record per
  entity, under the entity's key. Autosave puts each changed entity and deletes
  each removed key: O(changed keys) per write batch. `persist()` clears the table
  and puts every entity, or, while the resource has unloaded keys, only puts every
  entity in memory and clears nothing. A hydrate reads the whole table with a cursor,
  O(entities). A `load` reads only its keys, through `readRecordsOfKeys`: one
  `readonly` transaction with one `get` per key, O(keys loaded); a key the table
  does not hold is left out.
- `OIMPersistIndexedDbSnapshotStrategy({ tableName, primaryKey })` keeps one value under
  one primary key. A plain-object primary key is stored as a string address built
  with its property names sorted, so the same object key matches whichever order
  its properties were written in.

Each commit opens the database, creates any object store the batch needs that does
not exist yet by reopening it at a higher version, runs one transaction over every
table the batch touched, and closes the database. The transaction is atomic: a
failed commit leaves nothing behind. A read opens the database as it is and never
creates an object store, so a table that was never written reads as nothing stored
and its hydrate applies nothing. An upgrade blocked by another open connection, for
example a second tab, is given up after a fixed wait, and the write fails with an
error that says so.

Values go through structured clone, so a value structured clone refuses fails the
write with a `DataCloneError`.

## localStorage

```ts
import { OIMPersistKeyValuePathStrategy } from '@oimdb/persist';
import { OIMPersistLocalStorageBackend } from '@oimdb/persist-localstorage';

const persistor = new OIMPersistor({
  persistBackend: new OIMPersistLocalStorageBackend(),
  persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
});
persistor.addPersistResource(new OIMPersistResourceSnapshot({
  persistSnapshotSource: new OIMPersistRecordSourceCollectionWriteDriven({
    entityCollectionService: cardCollectionService,
    entityStoreSlot: cardEntityStoreSlot,
    persistEntityWriter,
  }),
  persistSnapshotStrategy: new OIMPersistKeyValuePathStrategy<TCardRecords>({ storageKey: 'app', path: ['cards'] }),
  persistCodec: new OIMPersistCodecIdentity<TCardRecords>(),
}));
persistor.addPersistResource(new OIMPersistResourceSnapshot({
  persistSnapshotSource: new OIMPersistSnapshotSourceSingleEntityDriven({
    channelMap: db,
    singleSlotService: settingsSingleEntityService,
    entityStoreSlot: settingsEntityStoreSlot,
  }),
  persistSnapshotStrategy: new OIMPersistKeyValuePathStrategy<TSettings>({ storageKey: 'app', path: ['settings'] }),
  persistCodec: new OIMPersistCodecIdentity<TSettings>(),
}));
```

`OIMPersistLocalStorageBackend` takes an optional `persistKeyValueItemStorage`, a
`TOIMPersistKeyValueItemStorage` (any object with `getItem`, `setItem` and
`removeItem`; by default `globalThis.localStorage`, and the constructor throws
where there is none, such as on a server), and an optional
`persistKeyValueSerializer`. The default serializer is
`OIM_PERSIST_KEY_VALUE_JSON_SERIALIZER`, so a value JSON cannot represent, such as a
cycle or a `BigInt`, fails the write.

The two key-value strategies:

- `OIMPersistKeyValueEntryStrategy({ storageKey })` owns its key: the whole value
  under one storage key. A batch that writes it does not read what is stored there.
- `OIMPersistKeyValuePathStrategy({ storageKey, path })` writes the value at a
  nested `path` inside a root object that other resources may share, as both
  resources above share `app`. The batch reads each such root once, applies every
  path change aimed at it in order, and writes it once, so two resources in one
  root cost one read and one write per batch, not two of each. Every path segment
  is data: the path follows own properties only and defines each segment as an own
  property, so a `__proto__` segment is stored and read back as a key. An empty
  `path` is refused by the constructor, because the snapshot would replace the
  whole stored value; take the entry strategy for that.

A hydrate of a path strategy reads the whole root and walks the path.

## An async key-value store

```ts
import { OIMPersistKeyValueBackend, OIMPersistKeyValueEntryStrategy } from '@oimdb/persist';
import { OIMPersistAsyncKVStorage } from '@oimdb/persist-async-kv';
import type { TOIMPersistAsyncKVMultiStorage } from '@oimdb/persist-async-kv';

declare const persistAsyncKVMultiStorage: TOIMPersistAsyncKVMultiStorage;

const persistor = new OIMPersistor({
  persistBackend: new OIMPersistKeyValueBackend({
    persistKeyValueStorage: new OIMPersistAsyncKVStorage({ persistAsyncKVMultiStorage }),
  }),
  persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
});
persistor.addPersistResource(new OIMPersistResourceSnapshot({
  persistSnapshotSource: new OIMPersistRecordSourceCollectionWriteDriven({
    entityCollectionService: cardCollectionService,
    entityStoreSlot: cardEntityStoreSlot,
    persistEntityWriter,
  }),
  persistSnapshotStrategy: new OIMPersistKeyValueEntryStrategy<TCardRecords>({ storageKey: 'cards' }),
  persistCodec: new OIMPersistCodecIdentity<TCardRecords>(),
}));
```

`TOIMPersistAsyncKVMultiStorage` is `multiGet`, `multiSet` and `multiRemove`, the shape of
React Native's AsyncStorage. `@oimdb/persist-async-kv` ships only the storage
adapter, `OIMPersistAsyncKVStorage`; the backend and the strategies are the
key-value ones from `@oimdb/persist`, with the same semantics as on `localStorage`,
and the same optional `persistKeyValueSerializer` on `OIMPersistKeyValueBackend`.

## Memory

```ts
import { OIMPersistMemoryBackend, OIMPersistMemoryRecordsStrategy } from '@oimdb/persist-memory';

const persistMemoryBackend = new OIMPersistMemoryBackend();
const persistor = new OIMPersistor({
  persistBackend: persistMemoryBackend,
  persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
});
persistor.addPersistResource(new OIMPersistResourceRecords({
  persistRecordSource: new OIMPersistRecordSourceCollectionWriteDriven({
    entityCollectionService: cardCollectionService,
    entityStoreSlot: cardEntityStoreSlot,
    persistEntityWriter,
  }),
  persistRecordsStrategy: new OIMPersistMemoryRecordsStrategy<TOIMStoreKey, TCard>({ storageKey: 'cards' }),
}));

cardCollectionService.slotContentService.upsertEntity(cardEntityStoreSlot, { id: 'c1', title: 'one' });
await persistor.persist();
const storedPersistRecords = persistMemoryBackend.readRecords('cards');
```

`OIMPersistMemoryBackend` keeps a snapshot value per storage key
(`OIMPersistMemorySnapshotStrategy({ storageKey })`) and a map of entities per storage key
(`OIMPersistMemoryRecordsStrategy({ storageKey })`), and `readSnapshotValue` and
`readRecords` read them back. A `load` goes through `readRecordsOfKeys`, which
looks each key up in the storage key's map and copies nothing else. It is the
backend for tests, and the base of the JSON backend.

**It keeps the values it was handed by reference.** Nothing is copied or
serialized: a stored entity is the very object the entity slot holds, and with the
in-place writer a later write to that entity changes the stored value before any
write batch has run. A test that needs what was written at one moment copies it at
that moment.

## JSON, for server-side rendering

`OIMPersistJsonBackend` is the memory backend plus a way out and a way in:
`dehydrate()` returns a `TOIMPersistJsonDump`
(`{ snapshotValues, recordsByStorageKey }`), and `initialPersistJsonDump` hands
the same shape back at construction. It takes the memory strategies.

On the server, a persistor needs no `start()`: `persist()` writes every resource
once.

```ts
import { OIMPersistMemoryRecordsStrategy } from '@oimdb/persist-memory';
import { OIMPersistJsonBackend } from '@oimdb/persist-json';

const persistJsonBackend = new OIMPersistJsonBackend();
const persistor = new OIMPersistor({
  persistBackend: persistJsonBackend,
  persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
});
persistor.addPersistResource(new OIMPersistResourceRecords({
  persistRecordSource: new OIMPersistRecordSourceCollectionWriteDriven({
    entityCollectionService: cardCollectionService,
    entityStoreSlot: cardEntityStoreSlot,
    persistEntityWriter,
  }),
  persistRecordsStrategy: new OIMPersistMemoryRecordsStrategy<TOIMStoreKey, TCard>({ storageKey: 'cards' }),
}));

cardCollectionService.slotContentService.upsertEntity(cardEntityStoreSlot, { id: 'c1', title: 'one' });
await persistor.persist();
const jsonPersistDumpText = JSON.stringify(persistJsonBackend.dehydrate());
```

On the client, the same resources over a backend built from the dump:

```ts
import { OIMPersistMemoryRecordsStrategy } from '@oimdb/persist-memory';
import { OIMPersistJsonBackend } from '@oimdb/persist-json';
import type { TOIMPersistJsonDump } from '@oimdb/persist-json';

declare const jsonPersistDumpText: string;

const persistor = new OIMPersistor({
  persistBackend: new OIMPersistJsonBackend({
    initialPersistJsonDump: JSON.parse(jsonPersistDumpText) as TOIMPersistJsonDump,
  }),
  persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
});
persistor.addPersistResource(new OIMPersistResourceRecords({
  persistRecordSource: new OIMPersistRecordSourceCollectionWriteDriven({
    entityCollectionService: cardCollectionService,
    entityStoreSlot: cardEntityStoreSlot,
    persistEntityWriter,
  }),
  persistRecordsStrategy: new OIMPersistMemoryRecordsStrategy<TOIMStoreKey, TCard>({ storageKey: 'cards' }),
}));

await persistor.hydrate();
```

Await `persist()` before `dehydrate()`: the persist is queued on the persistor's
chain, and `dehydrate()` reads the backend synchronously. Like memory, the JSON
backend keeps values by reference, so `dehydrate()` hands back the stored objects
themselves; `JSON.stringify` is the moment they are copied. To fill a collection for
the first render without a persistor at all, see
[Server-side rendering](/docs/guides/ssr).

## Building a backend

A backend is three things:

- a write batch, `IOIMPersistWriteBatch`: whatever methods its strategies write
  through, and `commit(): Promise<void>`, called once per batch. `OIMPersistWriteBatchChanges`
  keeps the deferred changes until `commit`, and `oimWritePersistRecordsDelta` walks a records
  delta as upserts, then deletions;
- the backend, `IOIMPersistBackend<TWriteBatch>`: `createWriteBatch()`, plus
  whatever its strategies read through;
- strategies: `IOIMPersistSnapshotStrategy` (`readSnapshot`, `writeSnapshot`,
  `deleteSnapshot`), and, for a backend that can store one value per key,
  `IOIMPersistRecordsStrategy` (`readRecords`, `readRecordsOfKeys`, `writeRecords`,
  `writeRecordsDelta`, `deleteRecords`). `readRecordsOfKeys(persistBackend, keys)`
  serves `load`: it reads only those keys and resolves the records the backend
  holds, leaving out a key it does not. Both are typed by the backend and its write
  batch, so a strategy compiles only on a persistor of that backend or of one
  derived from it.

A read goes to the backend directly and returns `undefined` for nothing stored. A
write goes into the batch and reaches storage only at `commit`. A batch that throws
from `commit` is read as "every resource in this batch failed", and the persistor
retries each resource alone, see
[One bad value does not take the batch with it](/docs/packages/persist-storage#one-bad-value-does-not-take-the-batch-with-it).

A backend over a `Map`, with a snapshot strategy:

```ts
import type { IOIMPersistBackend, IOIMPersistSnapshotStrategy, IOIMPersistWriteBatch } from '@oimdb/persist';

class MapPersistWriteBatch implements IOIMPersistWriteBatch {
  private readonly valueByStorageKey: Map<string, unknown>;
  private readonly changes: (() => void)[] = [];

  public constructor(options: { valueByStorageKey: Map<string, unknown> }) {
    this.valueByStorageKey = options.valueByStorageKey;
  }

  public writeValue(storageKey: string, value: unknown): void {
    this.changes.push(() => { this.valueByStorageKey.set(storageKey, structuredClone(value)); });
  }

  public deleteValue(storageKey: string): void {
    this.changes.push(() => { this.valueByStorageKey.delete(storageKey); });
  }

  public async commit(): Promise<void> {
    for (const change of this.changes) change();
  }
}

class MapPersistBackend implements IOIMPersistBackend<MapPersistWriteBatch> {
  public readonly valueByStorageKey = new Map<string, unknown>();

  public createWriteBatch(): MapPersistWriteBatch {
    return new MapPersistWriteBatch({ valueByStorageKey: this.valueByStorageKey });
  }
}

class MapPersistSnapshotStrategy<TSnapshot>
implements IOIMPersistSnapshotStrategy<MapPersistBackend, MapPersistWriteBatch, TSnapshot> {
  private readonly storageKey: string;

  public constructor(options: { storageKey: string }) {
    this.storageKey = options.storageKey;
  }

  public async readSnapshot(mapPersistBackend: MapPersistBackend): Promise<TSnapshot | undefined> {
    return mapPersistBackend.valueByStorageKey.get(this.storageKey) as TSnapshot | undefined;
  }

  public writeSnapshot(mapPersistWriteBatch: MapPersistWriteBatch, snapshot: TSnapshot): void {
    mapPersistWriteBatch.writeValue(this.storageKey, snapshot);
  }

  public deleteSnapshot(mapPersistWriteBatch: MapPersistWriteBatch): void {
    mapPersistWriteBatch.deleteValue(this.storageKey);
  }
}

const persistor = new OIMPersistor({
  persistBackend: new MapPersistBackend(),
  persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
});
persistor.addPersistResource(new OIMPersistResourceSnapshot({
  persistSnapshotSource: new OIMPersistSnapshotSourceSingleEntityDriven({
    channelMap: db,
    singleSlotService: settingsSingleEntityService,
    entityStoreSlot: settingsEntityStoreSlot,
  }),
  persistSnapshotStrategy: new MapPersistSnapshotStrategy<TSettings>({ storageKey: 'settings' }),
  persistCodec: new OIMPersistCodecIdentity<TSettings>(),
}));
```

Keep "nothing stored" and "stored empty" apart in a read: a read that creates its
storage (a table, a file) can no longer tell them apart by the time it returns.

### A key-value store of your own

For a store that holds one string per key, write no backend: hand the store to
`OIMPersistKeyValueBackend` and use the entry and path strategies.

- A store with `getItem`, `setItem` and `removeItem`, each returning a value or a
  promise (`TOIMPersistKeyValueItemStorage`), goes through
  `OIMPersistKeyValueStorageItemDriven`, which calls them one key at a time.
- A store that can read, write and remove many keys in one call implements
  `IOIMPersistKeyValueStorage` (`readItems`, `writeItems`, `removeItems`) itself,
  as `OIMPersistAsyncKVStorage` does.

```ts
import {
  OIMPersistKeyValueBackend, OIMPersistKeyValueEntryStrategy, OIMPersistKeyValueStorageItemDriven,
} from '@oimdb/persist';
import type { TOIMPersistKeyValueItemStorage } from '@oimdb/persist';

const itemByStorageKey = new Map<string, string>();
const persistKeyValueItemStorage: TOIMPersistKeyValueItemStorage = {
  getItem: storageKey => itemByStorageKey.get(storageKey) ?? null,
  setItem: (storageKey, item) => { itemByStorageKey.set(storageKey, item); },
  removeItem: storageKey => { itemByStorageKey.delete(storageKey); },
};

const persistor = new OIMPersistor({
  persistBackend: new OIMPersistKeyValueBackend({
    persistKeyValueStorage: new OIMPersistKeyValueStorageItemDriven({ persistKeyValueItemStorage }),
  }),
  persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
});
persistor.addPersistResource(new OIMPersistResourceSnapshot({
  persistSnapshotSource: new OIMPersistRecordSourceCollectionWriteDriven({
    entityCollectionService: cardCollectionService,
    entityStoreSlot: cardEntityStoreSlot,
    persistEntityWriter,
  }),
  persistSnapshotStrategy: new OIMPersistKeyValueEntryStrategy<TCardRecords>({ storageKey: 'cards' }),
  persistCodec: new OIMPersistCodecIdentity<TCardRecords>(),
}));
```

The key-value write batch serializes every value it will write before it writes
any, then writes, then removes. An item-by-item store that fails part-way leaves
the items it already wrote; a store whose `writeItems` is atomic does not.

## Where to next

<DocCards>
<DocCard to="/docs/packages/persist" title="Persist">The persistor, resources, sources, schedulers and hydration.</DocCard>
<DocCard to="/docs/packages/persist-storage" title="Persist: failures, schemas and releases">The write batch, the ordered chain, retention and quarantine of failed writes, and versioned codecs.</DocCard>
</DocCards>
