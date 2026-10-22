# @oimdb/persist

Storage-agnostic persistence engine for `@oimdb/core`. It keeps a collection, a bucket of a
collection, or a single entity mirrored in a storage backend, hydrates it back, and writes
every change through one write batch per drain.

The engine names the parts and wires them; a backend package supplies the storage:

| package | backend |
|---|---|
| `@oimdb/persist-memory` | `OIMPersistMemoryBackend`, plain `Map`s (tests, server-side fill) |
| `@oimdb/persist-json` | `OIMPersistJsonBackend`, the memory backend plus a JSON dump (SSR) |
| `@oimdb/persist-idb` | `OIMPersistIndexedDbBackend`, IndexedDB |
| `@oimdb/persist-localstorage` | `OIMPersistLocalStorageBackend`, web storage |
| `@oimdb/persist-async-kv` | `OIMPersistAsyncKVStorage`, any `multiGet` / `multiSet` / `multiRemove` store |

The key-value backend those last two build on, `OIMPersistKeyValueBackend`, ships in this
package.

```bash
npm install @oimdb/persist @oimdb/core
```

## A complete example

A collection, persisted entity by entity into the memory backend, autosaved on the microtask
after each write. The entity service is constructed with an `OIMPersistEntityWriter`, which is how
the source learns which entity slot was written.

```ts setup
import {
    OIMDB, OIMSlotContentBucketServiceSetDriven, createOIMBucketService, createOIMEntityService,
    createOIMEntityWriterInPlace, createOIMSingleEntityService,
} from '@oimdb/core';
import type { TOIMBucketSlotsSetStore, TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';
import {
    OIMPersistCodecIdentity, OIMPersistCodecVersioned, OIMPersistEntityWriter, OIMPersistKeyValueBackend,
    OIMPersistKeyValueEntryStrategy, OIMPersistKeyValueStorageItemDriven, OIMPersistKeyValueWriteBatch,
    OIMPersistRecordSourceBucketDriven, OIMPersistRecordSourceCollectionChangeDriven,
    OIMPersistRecordSourceCollectionWriteDriven, OIMPersistResourceRecords,
    OIMPersistResourceSnapshot, OIMPersistSchedulerFrameDriven, OIMPersistSchedulerMicrotaskDriven,
    OIMPersistSnapshotSourceSingleEntityDriven, OIMPersistor, oimReconcileByKey,
} from '@oimdb/persist';
import type { TOIMPersistVersionedShape } from '@oimdb/persist';
import { OIMPersistMemoryBackend, OIMPersistMemoryRecordsStrategy, OIMPersistMemoryWriteBatch } from '@oimdb/persist-memory';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;
type TSettings = { theme: 'light' | 'dark'; density: 'compact' | 'comfortable' };

const db = new OIMDB();

const persistEntityWriter = new OIMPersistEntityWriter<TCard, TOIMStoreKey>({
    entityWriter: createOIMEntityWriterInPlace(),
});
const cardCollectionService = createOIMEntityService<TCard>(db, {
    keyOf: card => card.id,
    entityWriter: persistEntityWriter,
});
const cardEntityStoreSlot = cardCollectionService.createStoreSlot(db);
const cardContentService = cardCollectionService.slotContentService;

const persistMemoryBackend = new OIMPersistMemoryBackend();
const persistor = new OIMPersistor<OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch>({
    persistBackend: persistMemoryBackend,
    persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
    onPersistError: (error, persistErrorContext) => {
        console.error(persistErrorContext.persistOperation, error);
    },
});
const cardPersistResourceRecords = persistor.addPersistResource(new OIMPersistResourceRecords({
    persistRecordSource: new OIMPersistRecordSourceCollectionWriteDriven({
        entityCollectionService: cardCollectionService,
        entityStoreSlot: cardEntityStoreSlot,
        persistEntityWriter,
    }),
    persistRecordsStrategy: new OIMPersistMemoryRecordsStrategy<TOIMStoreKey, TCard>({ storageKey: 'cards' }),
}));
```

```ts
await persistor.hydrate();
persistor.start();

cardContentService.upsertEntity(cardEntityStoreSlot, { id: 'c1', title: 'alpha' });
cardContentService.upsertEntity(cardEntityStoreSlot, { id: 'c2', title: 'beta' });

await Promise.resolve();
await persistor.whenIdle();
persistMemoryBackend.readRecords('cards');
```

Both writes land in one drain: the first one asks the scheduler for a drain, the second finds
it already scheduled, and the drain writes both entities in one write batch with one commit.
`whenIdle()` covers the work already queued when it is called; the microtask scheduler queues
the autosave on the microtask after the write, so the example lets one microtask pass first.

## What this package exports

| area | exports |
|---|---|
| persistor | `OIMPersistor`, `TOIMPersistorOptions`, `IOIMPersistBackend`, `IOIMPersistWriteBatch` |
| errors | `TOIMPersistErrorHandler`, `TOIMPersistErrorContext`, `TOIMPersistOperation`, `TOIMPersistErrorReport` (`{ error, persistErrorContext }`, one failure as `onPersistError` receives it or as it lands in the `AggregateError`) |
| resources | `OIMPersistResourceRecords`, `OIMPersistResourceSnapshot`, `IOIMPersistResource`, `TOIMPersistResourceRecordsOptions`, `TOIMPersistResourceSnapshotOptions` |
| sources | `OIMPersistRecordSourceCollectionWriteDriven`, `OIMPersistRecordSourceCollectionChangeDriven`, `TOIMPersistRecordSourceCollectionOptions`, `OIMPersistRecordSourceBucketDriven`, `OIMPersistSnapshotSourceSingleEntityDriven`, `OIMPersistEntityWriter`, `IOIMPersistSnapshotSource`, `IOIMPersistRecordSource`, `IOIMPersistSourceChangeMark`, `OIMPersistSourceChangeMarkSlotDriven`, `OIMPersistSourceChangeMarkSubscriptionDriven`, their option types, `TOIMPersistRecord`, `TOIMPersistRecords`, `TOIMPersistRecordsDelta` |
| strategies | `IOIMPersistSnapshotStrategy`, `IOIMPersistRecordsStrategy` |
| schedulers | `OIMPersistSchedulerMicrotaskDriven`, `OIMPersistSchedulerFrameDriven`, `TOIMPersistSchedulerFrameDrivenOptions`, `IOIMPersistScheduler` |
| codecs | `OIMPersistCodecIdentity`, `OIMPersistCodecVersioned`, `TOIMPersistCodecVersionedOptions`, `TOIMPersistVersionedShape`, `IOIMPersistCodec` |
| hydrate | `oimReconcileByKey`, `TOIMPersistHydrateReconcile` |
| key-value backend | `OIMPersistKeyValueBackend`, `OIMPersistKeyValueWriteBatch`, `OIMPersistKeyValueEntryStrategy`, `OIMPersistKeyValuePathStrategy`, `OIMPersistKeyValueStorageItemDriven`, `IOIMPersistKeyValueStorage`, `TOIMPersistKeyValueItemStorage`, `TOIMPersistKeyValueSerializer`, `OIM_PERSIST_KEY_VALUE_JSON_SERIALIZER`, their option types |

Every constructor takes one options object.

## The parts

- **`OIMPersistor`** owns one backend, one scheduler and a list of resources:
  `new OIMPersistor({ persistBackend, persistScheduler, onPersistError? })`.
- **A resource** is one thing being persisted: a source, a strategy that knows where it lives
  in the backend, and what to do on hydrate.
- **A source** reads and writes the in-memory side and reports changes.
- **A strategy** reads from the backend and writes into the backend's write batch.
- **A scheduler** decides when the reported changes become a drain.

## Two resource kinds

| | `OIMPersistResourceRecords` | `OIMPersistResourceSnapshot` |
|---|---|---|
| options | `{ persistRecordSource, persistRecordsStrategy, persistHydrateReconcile? }` | `{ persistSnapshotSource, persistSnapshotStrategy, persistCodec, persistHydrateReconcile? }` |
| source | a record source (collection or bucket) | any snapshot source (collection, bucket or single entity) |
| strategy | records strategy: `OIMPersistMemoryRecordsStrategy`, `OIMPersistIndexedDbRecordsStrategy` | snapshot strategy: `OIMPersistMemorySnapshotStrategy`, `OIMPersistIndexedDbSnapshotStrategy`, `OIMPersistKeyValueEntryStrategy`, `OIMPersistKeyValuePathStrategy` |
| autosave writes | the delta: one upsert or one deletion per entity slot written since the last drain | the whole snapshot, read from the source and encoded |
| codec | none | required (`OIMPersistCodecIdentity` when nothing transforms) |
| `unload` | yes | no |
| `load` | yes | no |

Pick the records resource whenever the backend has a records strategy: its autosave costs one
entry per written entity slot, however large the collection. Pick the snapshot resource for a
single entity, for a key-value backend (it has no records strategy), or when a versioned codec
has to migrate what is stored. A record source is also a snapshot source whose snapshot is
`TOIMPersistRecords` (`{ records: { key, entity }[] }`), so a collection or a bucket goes into
either kind.

A records resource keeps its dirty state as a set of entity slots, and holds each of them from
the change report until the write that saves it commits; a failed write keeps the hold, and
`unload` of the key, `removePersistResource`, quarantine or `destroy()` give it back. A slot
written several times between drains is one entry. At the drain each slot becomes an upsert of `{ key, entity }` when
it holds an entity and is not released, and a deletion of its key otherwise; when a key has both
(a released slot and a live slot minted again for the same key), the upsert wins.

## The sources, and the scheduler for each

| source | options | reports | pair with |
|---|---|---|---|
| `OIMPersistRecordSourceCollectionWriteDriven` | `{ entityCollectionService, entityStoreSlot, persistEntityWriter }` (`TOIMPersistRecordSourceCollectionOptions`) | synchronously, from the writer on every write that changed the entity | `OIMPersistSchedulerMicrotaskDriven` |
| `OIMPersistRecordSourceCollectionChangeDriven` | the same `TOIMPersistRecordSourceCollectionOptions` | synchronously, from the writer and from the store slot's content-change listener | `OIMPersistSchedulerMicrotaskDriven` |
| `OIMPersistRecordSourceBucketDriven` | `{ channelMap, entityCollectionService, entityStoreSlot, slotContentBucketService, bucketSlot }` | from effects, when the channel runs its frame | `OIMPersistSchedulerFrameDriven` |
| `OIMPersistSnapshotSourceSingleEntityDriven` | `{ channelMap, singleSlotService, entityStoreSlot }`, over a single entity service from `createOIMSingleEntityService` and its store slot | from an effect, when the channel runs its frame | `OIMPersistSchedulerFrameDriven` |

**Collection.** The whole collection: every entity slot of the store slot that holds an entity.
The entity service must be constructed with the `OIMPersistEntityWriter` as its `entityWriter`;
`new OIMPersistEntityWriter({ entityWriter })` wraps the writer that really writes and reports the
slot of every fill, put, patch, column patch, column delete and clear that changed something.
The writer does not see an in-place edit announced with the service's
`markEntityChanged(entitySlot, changedColumns?)`, so which collection source to take is a
choice made at construction:

| collection source | in-place edit announced with `markEntityChanged` | cost on the collection while a resource listens | pick it when |
|---|---|---|---|
| `OIMPersistRecordSourceCollectionWriteDriven` | not persisted | none: every write stays on the core fast path | every change goes through the upsert, update and delete doors |
| `OIMPersistRecordSourceCollectionChangeDriven` | persisted: it adds a content-change listener of every column to the store slot while subscribed | **every** write to that store slot leaves the core fast path, not only `markEntityChanged`: one subframe opened and closed, the changed-column bookkeeping and the listener loop per write | the application edits entities in place |

```ts
const inPlaceCardPersistRecordSource = new OIMPersistRecordSourceCollectionChangeDriven({
    entityCollectionService: cardCollectionService,
    entityStoreSlot: cardEntityStoreSlot,
    persistEntityWriter,
});
```

An entity removed for any reason, a slot release policy included, reaches the backend as a
deletion. Starting the resource reports nothing: content that existed before `start()` is
written by `persist()` or by its next write.

**Bucket.** The entities one bucket holds. The source watches the bucket slot with one effect and
every member entity slot with one effect each. An entity that leaves the bucket is deleted from
the backend and stays in the entity store slot. The first subscription reports every member,
so `start()` writes the bucket's current members on the first drain, except members still
holding the value a hydrate restored. That exemption lasts only while the member holds that
value: the first different value the source sees ends it, so an edit and a later revert in
another frame are both written.

```ts
const cardBucketService = createOIMBucketService<
    TCardSlot, TOIMStoreKey, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
>(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>() });
const cardBucketStoreSlot = cardBucketService.createStoreSlot(db);
const inboxBucketSlot = cardBucketService.holdSlotByKey(cardBucketStoreSlot, 'inbox');
const inboxPersistRecordSource = new OIMPersistRecordSourceBucketDriven({
    channelMap: db,
    entityCollectionService: cardCollectionService,
    entityStoreSlot: cardEntityStoreSlot,
    slotContentBucketService: cardBucketService.slotContentService,
    bucketSlot: inboxBucketSlot,
});
```

**Single entity.** The snapshot is the entity itself, so it goes into a snapshot resource. The
single entity is a single entity service from `createOIMSingleEntityService`, and the
store slot its `createStoreSlot(db)` returns; the entity is written with `upsertEntity`. Its first
subscription reports the current value unless it is the value a hydrate restored, with the same
exemption rule as the bucket source. `readSnapshot` throws while no entity has been upserted
or restored, so write the entity (or hydrate) before the persistor reads it.

```ts
const settingsSingleEntityService = createOIMSingleEntityService<TSettings>(db);
const settingsEntityStoreSlot = settingsSingleEntityService.createStoreSlot(db);
const settingsContentService = settingsSingleEntityService.slotContentService;
settingsContentService.upsertEntity(settingsEntityStoreSlot, { theme: 'light', density: 'compact' });
const itemByStorageKey = new Map<string, string>();
const persistKeyValueBackend = new OIMPersistKeyValueBackend({
    persistKeyValueStorage: new OIMPersistKeyValueStorageItemDriven({
        persistKeyValueItemStorage: {
            getItem: storageKey => itemByStorageKey.get(storageKey) ?? null,
            setItem: (storageKey, item) => { itemByStorageKey.set(storageKey, item); },
            removeItem: storageKey => { itemByStorageKey.delete(storageKey); },
        },
    }),
});
const settingsPersistor = new OIMPersistor<OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch>({
    persistBackend: persistKeyValueBackend,
    persistScheduler: new OIMPersistSchedulerFrameDriven({ channelSlot: db.defaultChannelSlot }),
});
settingsPersistor.addPersistResource(new OIMPersistResourceSnapshot({
    persistSnapshotSource: new OIMPersistSnapshotSourceSingleEntityDriven({
        channelMap: db,
        singleSlotService: settingsSingleEntityService,
        entityStoreSlot: settingsEntityStoreSlot,
    }),
    persistSnapshotStrategy: new OIMPersistKeyValueEntryStrategy<TSettings>({ storageKey: 'settings' }),
    persistCodec: new OIMPersistCodecIdentity<TSettings>(),
}));
await settingsPersistor.hydrate();
settingsPersistor.start();

settingsContentService.updateEntity(settingsSingleEntityService.getSingleSlot(settingsEntityStoreSlot), { theme: 'dark' });
db.flush();
await settingsPersistor.whenIdle();
```

The frame scheduler drains right after the channel's frame, inside `db.flush()`, so the
autosave is already queued when `whenIdle()` is called.

### The schedulers

`OIMPersistSchedulerMicrotaskDriven` takes no options. A drain request queues one microtask; the
requests that follow before it runs are absorbed by it; `stop()` makes a queued microtask do
nothing.

`OIMPersistSchedulerFrameDriven({ channel })` subscribes to `channel.subscribeAfterEachFrame`
while started and drains after a frame only when a drain was requested since the last one. It
never asks the channel for a frame: it drains only after a frame the channel runs anyway.

The pairing in the table is a rule. A write to an entity slot that nobody holds causes no frame
(`OIMChannel.writeWithoutFlushCheck` returns at once when the slot's `holdCount` is `0`), so a
collection source on the frame scheduler can report changes that no frame ever
drains: pair it with the microtask scheduler. The bucket and single-entity sources report from
effects, which cause the frames they run in: pair them with the frame scheduler. A persistor has
one scheduler, so resources that need different schedulers go into two persistors.

A scheduler serves one persistor: both shipped schedulers throw when a second persistor attaches
to them. A custom scheduler implements `IOIMPersistScheduler`: `attachDrain(drain)` (called once,
from the persistor's constructor), `start()`, `stop()`, `requestDrain()`.

## The persistor's lifecycle

| call | what it does |
|---|---|
| `addPersistResource(persistResource)` | registers it and returns it; on a started persistor it starts the resource first and registers it only if that start succeeded, and a failed start is thrown from `addPersistResource` |
| `removePersistResource(persistResource)` | stops it and drops its pending write |
| `start()` / `stop()` | subscribe and unsubscribe every resource and the scheduler, skipping quarantined resources; pending writes survive `stop()`. A resource whose subscribe throws does not stop the others; each failure goes to `onPersistError` with `persistOperation: 'start'`, or, with no handler, all of them are thrown as one `AggregateError`. A resource whose start failed stays registered and unsubscribed, with no autosave, until `stop()` and `start()` again. A bucket or single-entity source reports its current value at subscribe time, so the first drain writes it; a collection source reports nothing then |
| `destroy()` | `stop()`, then forgets every resource |
| `hydrate()` | reads every resource from the backend and writes it into its source |
| `persist()` | writes every resource in full, started or not, in one write batch; a records resource with unloaded keys writes its in-memory records as upserts over the stored table instead of replacing it, plus the deletions it already heard |
| `clearPersisted()` | deletes every resource's stored data, in one write batch; memory is untouched |
| `unload(persistResourceRecords, keys)` | writes the keys' current values plus the pending write in one write batch, repeated until the keys have no unwritten change (unload holds the keys' entity slots while it writes and compares their revision stamps, a slot's stamp moving only on a real write; it also checks the resource's pending set and whether a key's slot was replaced); then takes the keys out of memory and leaves them in the backend |
| `load(persistResourceRecords, keys)` | the pair of `unload`: queued after the pending writes, reads only those keys from the backend (`readRecordsOfKeys`) and puts the stored entities back without writing them back; skips a key that holds a value in memory or has a change the resource has not written yet; the keys stop counting as unloaded |
| `whenIdle()` | resolves when the work queued at the moment of the call has settled; never rejects |

Every call above that returns a promise, and every autosave, runs on one ordered chain, one at a
time, in the order requested. A snapshot is read when its work runs, not when it was queued.

The recommended order is: add the resources, `await persistor.hydrate()`, then
`persistor.start()`.

## One write batch per drain

A drain takes every dirty resource that has a pending write, creates one write batch from the
backend (`createWriteBatch()`), lets each resource write into it, and commits it once
(`commit()`). `persist()` and `clearPersisted()` do the same for every registered resource.

**When the whole batch fails**, every resource in it puts its in-flight change back, and the
persistor writes each resource again in a batch of its own, so the healthy resources commit and
the failure names the resource that caused it. A failed batch of N resources therefore costs 1 + N
commits.

**A failed autosave is kept.** A records resource puts the failed entity slots back into its dirty
set; a snapshot resource marks itself pending again. The resource stays dirty and is written by
the next drain, which happens on the next drain request (a change in any resource), a
`persist()` or an `unload`. There is no retry timer.

**Three consecutive autosave failures quarantine a resource.** It stops listening to its source,
its pending write is dropped, and the quarantine is reported once with
`persistOperation: 'quarantine'` (to `console.error` when there is no `onPersistError`). A
successful `persist()` of that resource lifts the quarantine and, on a started persistor, starts
it again; `start()` skips a quarantined resource. Any successful write resets the count, whichever
operation committed it: an autosave, `persist()`, `clearPersisted()` or `unload`.

**Errors.** With `onPersistError`, every failure is handed over as
`(error, { persistResource, persistOperation })` and the promise resolves; a failed autosave below
quarantine is reported with `'persist'`. `TOIMPersistOperation` is
`'start' | 'persist' | 'hydrate' | 'clear' | 'quarantine'`. Without a handler, `start()`,
`hydrate()`, `persist()` and `clearPersisted()` attempt every resource first and then throw
(`start()`) or reject with one `AggregateError` carrying every failure on `errors`; an autosave failure below quarantine, which has no caller, is silently
retained, and the quarantine logs to the console. `unload` reports through its own promise.

## Hydrate

`hydrate()` reads each resource through its strategy. A strategy answers `undefined` when the
backend holds nothing, and then nothing is applied. Anything else, an empty list of records
included, is applied: a snapshot resource decodes it through its codec, and either kind passes it
through `persistHydrateReconcile` when one is set, then writes the result into the source.
Hydrate's own writes are not reported back as changes, so `start()` after `hydrate()` writes
nothing back.

What applying means depends on the source. A collection source upserts every record and then
deletes every entity the records do not name, so the store slot becomes exactly the stored
content. The bucket source upserts every record into the entity store slot and sets the bucket's
members to exactly the restored entities. The single-entity source writes the stored entity.

**The refusal.** If the source changes while the backend read is in flight and the resource has no
`persistHydrateReconcile`, hydrate throws instead of applying: applying would revert that change.
The source keeps its newer state and the error goes through the `'hydrate'` path. Before the read
the resource calls the source's `markSourceChanges()`, which returns an
`IOIMPersistSourceChangeMark`: slot revision stamps for the single-entity and bucket sources
(`OIMPersistSourceChangeMarkSlotDriven`), a flag set by the source's own report for the collection
sources (`OIMPersistSourceChangeMarkSubscriptionDriven`). A change made during the read is seen even
when no frame runs, and the guard runs whether or not the persistor is started.

**The reconcile** merges the stored content onto what is in memory. `oimReconcileByKey` builds one
for records: `resolveEntity(currentEntity, incomingEntity, key)` is called for every stored key and
returns the entity to keep, or `undefined` to drop it; keys only in memory are kept.

```ts
type TAnsweredCard = { id: string; title: string; answer?: string };
const answeredCardReconcile = oimReconcileByKey<TOIMStoreKey, TAnsweredCard>(
    (currentEntity, incomingEntity) => currentEntity === undefined
        ? incomingEntity
        : { ...currentEntity, answer: incomingEntity.answer },
);
```

Pass it as `persistHydrateReconcile` on either resource kind over a record source.

## unload, load and clearPersisted

```ts
persistor.start();
cardContentService.upsertEntity(cardEntityStoreSlot, { id: 'c1', title: 'alpha' });

await persistor.unload(cardPersistResourceRecords, ['c1']);
await persistor.load(cardPersistResourceRecords, ['c1']);
```

`await persistor.unload(cardPersistResourceRecords, ['c1'])` first writes, in one write batch, the
resource's pending change and the current value of every unloaded key
(`readRecordsDelta(findEntitySlotsByKeys(keys))`), so an edit no drain had reached, or one made while the persistor
was stopped or the resource quarantined, is saved rather than lost. After each commit it
compares the keys' entity slots, which unload holds while it writes, by their revision stamps (a
slot's stamp moves only on a real write); it also checks the resource's pending set and whether a
key's slot was replaced, and writes another batch of the same shape while any of those moved, so an
edit made during any commit reaches the backend; on the bucket source that includes an edit the channel has not
flushed yet. Then it removes the keys from the source without this resource reporting it. The
backend keeps them; `load` brings those keys back, and `hydrate()` brings back everything. A failed write rejects the unload and
leaves the keys in memory. Deleting an entity does not take it out of a bucket: the bucket keeps
the slot as a member until it is refiled. The bucket source remembers an unloaded key's deletion
as restored, so its own watch does not write it, for every key that is a member of the bucket at
unload time, whether or not the persistor is listening.

While any key of a records resource is unloaded, `persist()` writes the in-memory records as
upserts over the stored table instead of replacing it, plus the deletions the resource already
heard (its pending deletions), so the unloaded records stay on the backend. A deletion it never
heard is not written in that mode. `hydrate()` and `clearPersisted()` end that mode, and so does a
`load` of every unloaded key.

`await persistor.load(cardPersistResourceRecords, ['c1'])` is the pair of `unload`. It runs on the
chain after the pending writes, reads only those keys through the strategy's
`readRecordsOfKeys(persistBackend, keys)` (IndexedDB: one `readonly` transaction with one `get` per
key; memory: a lookup of each key in the stored map), and hands what the backend holds to the
source's `loadRecords(persistRecords)` with this resource's reports switched off, so the loaded
entities are not written back. It skips every key that holds a value in memory or has a change the
resource has not written yet (pending or in a commit), so neither a write nor a heard deletion made
during the read is overwritten. A collection source upserts the entities into the store slot; the
bucket source upserts them into the entity store slot, adds the slots back to the bucket
(`slotContentBucketService.addBucketMemberSlots(bucketSlot, …)`) and remembers them as restored. The keys stop
counting as unloaded, so once none is, `persist()` replaces the stored table again. Another
resource over the same entity store slot is not silenced and hears the upserts as writes. A key-value
backend has no records strategy, so a snapshot resource has no `load`. A failed read rejects the
promise `load` returned.

When to unload and when to load (on a screen change, on idle, on a read miss) is the application's
decision, or an orchestrator's; persist offers the two doors and decides neither.

**Limit:** every record source deletes the unloaded keys from the entity store slot, the bucket
source included. Any other resource over the same entity store slot is not silenced: it reports
the keys as deletions, and its next autosave deletes them from its own storage.

**Limit:** a deletion made while the persistor is stopped, or the resource quarantined, is not
heard. While any key of the resource is unloaded, `persist()` writes no deletion it did not hear,
and `unload` writes it only while the entity's slot still exists (once the slot was released it
finds no slot for the key); otherwise the record comes back on the next `hydrate()`. Call
`persist()` while started, and with no key unloaded, to make a deletion the resource never heard
durable.

`clearPersisted()` asks every resource's strategy to delete its stored data inside one write batch.

## Codecs

A snapshot resource encodes on every write and decodes on hydrate through `persistCodec`.

- `new OIMPersistCodecIdentity<TSnapshot>()` passes the snapshot through.
- `new OIMPersistCodecVersioned({ version, migrations, persistCodec })` stores
  `{ version, data }`, where `data` is the inner `persistCodec`'s encoding. On decode it runs, in
  ascending order, every migration whose key is above the stored version and at most `version`,
  then decodes with the inner codec. A migration's key is the version it produces. A stored
  version above `version` is refused: `decode` throws and nothing is applied.

```ts
const settingsPersistCodec = new OIMPersistCodecVersioned<TSettings, TSettings>({
    version: 2,
    migrations: { 2: data => ({ density: 'comfortable', ...(data as object) }) },
    persistCodec: new OIMPersistCodecIdentity<TSettings>(),
});
const settingsPersistStrategy = new OIMPersistKeyValueEntryStrategy<TOIMPersistVersionedShape>({ storageKey: 'settings' });
```

A records resource has no codec: it stores entities as the source holds them.

## The key-value backend

`new OIMPersistKeyValueBackend({ persistKeyValueStorage, persistKeyValueSerializer? })` stores
serialized strings under string keys. `persistKeyValueStorage` is an `IOIMPersistKeyValueStorage`
(`readItems`, `writeItems`, `removeItems`); `OIMPersistKeyValueStorageItemDriven({ persistKeyValueItemStorage })`
adapts any `getItem` / `setItem` / `removeItem` object, synchronous or returning promises, with one
call per key. The serializer defaults to `OIM_PERSIST_KEY_VALUE_JSON_SERIALIZER`.

| strategy | options | stored as |
|---|---|---|
| `OIMPersistKeyValueEntryStrategy` | `{ storageKey }` | the whole snapshot under `storageKey` |
| `OIMPersistKeyValuePathStrategy` | `{ storageKey, path }` | the snapshot at `path` inside an object stored under `storageKey`, which several resources can share; an empty `path` is refused by the constructor |

Its write batch commits with at most one `readItems` (for the keys that have path writes and no
whole-value write in the batch), one `writeItems` and one `removeItems`. Path segments are read and
written as own properties, so a stored `__proto__` is data.

## Writing a backend, a strategy or a source

- A backend implements `IOIMPersistBackend<TWriteBatch>` (`createWriteBatch()`), and its batch
  implements `IOIMPersistWriteBatch` (`commit(): Promise<void>`). A batch collects changes and
  applies them in `commit`; `OIMPersistWriteBatchChanges` is the list to keep them in, and
  `oimWritePersistRecordsDelta` walks a records delta as upserts, then deletions.
- A snapshot strategy implements `readSnapshot(persistBackend)`, `writeSnapshot(writeBatch, snapshot)`
  and `deleteSnapshot(writeBatch)`; a records strategy implements `readRecords(persistBackend)`,
  `readRecordsOfKeys(persistBackend, keys)`, `writeRecords(writeBatch, persistRecords)`,
  `writeRecordsDelta(writeBatch, persistRecordsDelta)` and `deleteRecords(writeBatch)`. A read resolves
  `undefined` only when nothing is stored; `readRecordsOfKeys` resolves the records of the keys the
  backend holds and leaves out the rest.
- A source implements `IOIMPersistSnapshotSource` (`readSnapshot`, `writeSnapshot`,
  `subscribeSnapshotChanged`, `markSourceChanges`) or `IOIMPersistRecordSource`, which adds
  `subscribeEntitySlotChanged`, `readRecordsDelta(entitySlots)`, `findEntitySlotsByKeys(keys)`, `markEntitySlotChanges(entitySlots)`,
  `loadRecords(persistRecords)` and `unloadKeys(keys)`. `markSourceChanges()` returns an `IOIMPersistSourceChangeMark`
  (`isSourceChangedSinceMark()`, `dispose()`); build it with
  `new OIMPersistSourceChangeMarkSlotDriven({ slots })` or
  `new OIMPersistSourceChangeMarkSubscriptionDriven({ subscribeSourceChanged })`. A source may be
  subscribed more than once, each subscription with its own disposer.

## Limits

- **No key-value records strategy.** Over `OIMPersistKeyValueBackend` a collection or a bucket goes
  through `OIMPersistResourceSnapshot`, so every autosave walks every entity slot of the source and
  serializes the whole snapshot under one key.
- **A bucket membership change walks the bucket.** The bucket source re-reads every member and every
  watched slot on each change of the bucket slot, and keeps one effect per member.
- **The memory and JSON backends keep values by reference.** With the in-place writer, the stored
  entity is the live entity object, so a later in-place write moves the stored value before any
  commit. Use `createOIMEntityWriterReplacing()` with a copying insert strategy where the stored value
  must stay what was committed.
- **A key-value commit is not atomic across keys.** `writeItems` and `removeItems` are separate
  calls, and the item-driven storage calls `setItem` once per key.
- **One backend per persistor.** Two backends take two persistors, each with its own scheduler.

## Reference

The full API, written for code-generating assistants, is in **`llms.txt`**, which ships inside this
package: read it beside this README in the installed package, or
[on GitHub](https://github.com/abaikov/oimdb/blob/master/llms.txt).
