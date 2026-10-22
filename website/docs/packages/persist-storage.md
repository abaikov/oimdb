---
sidebar_position: 3.1
title: 'Persist: failures, schemas and releases'
description: How @oimdb/persist builds one write batch per flush, orders its storage work, keeps and quarantines failed writes, migrates stored schemas, how a release differs from an unload, and how load brings unloaded keys back.
---

# Persist: failures, schemas and releases

This page continues [Persist](/docs/packages/persist) with what happens between
memory and the backend once a persistor is running: what a release and an
`unload` take out of memory, how `load` brings unloaded keys back, the write batch
and the one ordered chain every piece
of storage work runs on, what a failed write leaves behind, and how a stored value
migrates across schema versions.

<InShort>

- A release is a deletion, and `unload` is the other door; `load` brings unloaded keys back.
- Every flush builds one write batch and commits it once; every piece of storage work runs on one ordered chain.
- A failed autosave keeps its change; a whole-batch failure is retried resource by resource to find the culprit.
- Three consecutive autosave failures quarantine a resource, and a successful `persist()` lifts it.
- `OIMPersistCodecVersioned` migrates a stored snapshot across schema versions.

</InShort>

```ts setup
import {
  OIMDB, OIMSlotContentBucketServiceSetDriven,
  createOIMBucketService, createOIMEntityService, createOIMEntityWriterInPlace, createOIMSingleEntityService,
} from '@oimdb/core';
import type { TOIMBucketSlotsSetStore, TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';
import {
  OIMPersistCodecIdentity, OIMPersistEntityWriter, OIMPersistRecordSourceBucketDriven,
  OIMPersistRecordSourceCollectionWriteDriven, OIMPersistResourceRecords, OIMPersistResourceSnapshot,
  OIMPersistSchedulerFrameDriven, OIMPersistSchedulerMicrotaskDriven, OIMPersistSnapshotSourceSingleEntityDriven,
  OIMPersistor,
} from '@oimdb/persist';
import { OIMPersistMemoryBackend, OIMPersistMemoryRecordsStrategy, OIMPersistMemorySnapshotStrategy } from '@oimdb/persist-memory';

type TCard = { id: string; title: string; draft?: boolean };
type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;
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

const deckBucketService = createOIMBucketService<
  TCardSlot, TOIMStoreKey, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
>(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>() });
const deckBucketStoreSlot = deckBucketService.createStoreSlot(db);
const keptBucketSlot = deckBucketService.holdSlotByKey(deckBucketStoreSlot, 'kept');

const settingsSingleEntityService = createOIMSingleEntityService<TSettings>(db);
const settingsEntityStoreSlot = settingsSingleEntityService.createStoreSlot(db);
settingsSingleEntityService.slotContentService.upsertEntity(settingsEntityStoreSlot, { theme: 'dark' });
```

## A release is a deletion; `unload` is the other door

A persist here is a **mirror**: what is on the backend is what is in memory. When
a release policy takes an entity of a collection persisted through a collection
source out of memory, the
release goes through the writer's `clearEntity`, `OIMPersistEntityWriter` reports
the slot like any other write, and the next write batch deletes the key. A snapshot
resource takes no reference of its own on that source, so a persisted entity is collected
on the same schedule as one that is not. An `OIMPersistResourceRecords` holds every entity
slot it has pending, from the change report until the write that saves it commits; a failed
write keeps the hold, and `unload` of the key, `removePersistResource`, quarantine or
`persistor.destroy()` give it back.

A bucket source is the opposite case: a mirrored entity is a member of the bucket
and has a subscriber, so it is not collected while it is mirrored.

Only the caller knows whether a removal from memory was meant as a deletion, so
nothing automatic guesses. Taking entities out of memory while the backend
**keeps** them is a separate door you drive by hand:
`persistor.unload(persistResourceRecords, keys)`.

```ts
const persistor = new OIMPersistor({
  persistBackend: new OIMPersistMemoryBackend(),
  persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
});
const persistResourceRecords = persistor.addPersistResource(new OIMPersistResourceRecords({
  persistRecordSource: new OIMPersistRecordSourceCollectionWriteDriven({
    entityCollectionService: cardCollectionService,
    entityStoreSlot: cardEntityStoreSlot,
    persistEntityWriter,
  }),
  persistRecordsStrategy: new OIMPersistMemoryRecordsStrategy<TOIMStoreKey, TCard>({ storageKey: 'cards' }),
}));
persistor.start();

cardCollectionService.slotContentService.upsertEntity(cardEntityStoreSlot, { id: 'c1', title: 'one' });
await persistor.unload(persistResourceRecords, ['c1']);
await persistor.hydrate();
```

The steps run in this order:

1. Every other resource with a pending change is queued for an autosave on the
   chain, ahead of the unload; the unloading resource's own pending change waits
   for the unload's batch.
2. When the unload's turn comes, one write batch of its own carries what that
   resource still has pending **and** the current value of every unloaded key, read
   through `IOIMPersistRecordSource.readRecordsDelta(findEntitySlotsByKeys(keys))`. So an edit no
   flush had reached yet is not lost, and neither is an edit the resource never
   heard: one made while the persistor was stopped, or while the resource was
   quarantined. A key whose slot still exists but holds no value is written as a
   deletion.
3. The unload holds the keys' entity slots while it writes. After each commit it
   compares their revision stamps (a slot's stamp moves only on a real write),
   and it also checks the resource's pending set and whether a key's slot was
   replaced. While any of those moved it writes another batch of the same shape,
   so an edit made during any commit reaches the backend before anything leaves
   memory. On a bucket source that includes an edit the channel has not flushed
   yet, which the resource has not heard but the stamp comparison sees.
4. The keys leave the source with the resource's reports switched off, so the
   removal is not written by this resource. A collection source deletes each key
   from its entity store slot. A bucket source deletes each key from the **entity
   store slot**. That deletion does not take the entity out of the bucket: the
   bucket keeps the slot as a member until the bucket is refiled. For every key
   that is a member of the bucket at unload time, whether or not the persistor
   is listening, the source remembers the deletion as restored, the same
   exemption a hydrate installs, so its own watch does not write it.

While any key of a records resource is unloaded, `persist()` writes that
resource's in-memory records as **upserts over the stored table** instead of
replacing it, plus the deletions the resource already heard (its pending
deletions), so the unloaded records stay on the backend. A deletion the resource
never heard is not written in that mode. `hydrate()` and
`clearPersisted()` end that mode: after either, memory and the backend agree
again and `persist()` replaces the table as before. A `load` of every unloaded
key ends it too.

:::warning[A deletion the resource did not hear is not made durable]

A deletion made while the persistor is stopped, or while the resource is
quarantined, is not heard. While any key of the resource is unloaded, `persist()`
writes no deletion it did not hear. `unload` writes it only while the entity's
slot still exists; once the slot was released, `unload` finds no slot for the
key. Otherwise the record comes back on the next `hydrate`. Call `persist()`
while started, and with no key unloaded, to make a deletion the resource never
heard durable.

:::

:::warning[An unload is a deletion to every other resource]

Step 4 deletes the keys from the entity store slot, and only the unloading
resource is silenced. Any other resource whose source is over the same entity
store slot, for example a collection resource beside a bucket resource, hears
an ordinary deletion, and its next autosave deletes the keys from **its**
storage. Unload only keys that no other resource persists.

:::

If any of those writes fails, the promise rejects, the keys stay in memory, and the
change stays pending on the resource for its next autosave or a `persist()`. That
failure reaches the caller through the rejection only; `onPersistError` does not
receive it.

The way back is `load` for the keys, or `hydrate` for everything. `unload` takes an
`OIMPersistResourceRecords` only: a snapshot resource has no entity of its own to
let go of.

Deciding when to unload and when to load (on a screen change, on idle, on a read
miss) is the application's job, or an orchestrator's. Persist offers the two doors
and makes no such decision itself.

## Loading keys back

`persistor.load(persistResourceRecords, keys)` is the pair of `unload`: it reads
only those keys from the backend and puts the stored entities back into memory.

```ts
const persistor = new OIMPersistor({
  persistBackend: new OIMPersistMemoryBackend(),
  persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
});
const persistResourceRecords = persistor.addPersistResource(new OIMPersistResourceRecords({
  persistRecordSource: new OIMPersistRecordSourceCollectionWriteDriven({
    entityCollectionService: cardCollectionService,
    entityStoreSlot: cardEntityStoreSlot,
    persistEntityWriter,
  }),
  persistRecordsStrategy: new OIMPersistMemoryRecordsStrategy<TOIMStoreKey, TCard>({ storageKey: 'cards' }),
}));
persistor.start();

cardCollectionService.slotContentService.upsertEntity(cardEntityStoreSlot, { id: 'c1', title: 'one' });
await persistor.unload(persistResourceRecords, ['c1']);
await persistor.load(persistResourceRecords, ['c1']);
```

1. Every resource with a pending change is queued for an autosave on the chain,
   and the load runs after those writes.
2. The strategy reads the keys through
   `IOIMPersistRecordsStrategy.readRecordsOfKeys(persistBackend, keys)`, and a key
   the backend does not hold is left out. On IndexedDB that is one `readonly`
   transaction with one `get` per key; on memory, a lookup of each key in the
   stored `Map`, with no copy of the other entities.
3. A key that holds a value in memory, or has a change the resource has not
   written yet (pending or in a write batch being committed), is skipped. So
   neither a write nor a heard deletion made while the read was in flight is
   overwritten by the stored value.
4. The remaining entities go into the source through
   `IOIMPersistRecordSource.loadRecords(persistRecords)` with the resource's
   reports switched off, so they are not written back. A collection source
   upserts them into its entity store slot. A bucket source upserts them into the entity
   store slot, adds the slots back to the bucket
   (`slotContentBucketService.addBucketMemberSlots(bucketSlot, …)`) and remembers them as restored,
   the same exemption a hydrate installs.
5. The keys stop counting as unloaded. Once no key of the resource is unloaded,
   `persist()` replaces the stored table again.

Like `unload`, only the loading resource is silenced: another resource whose
source is over the same entity store slot hears the upserts as ordinary writes.
`load` takes an `OIMPersistResourceRecords` only. A key-value backend has no
records strategy, so its snapshot resource has no `load`; `hydrate` reads it
whole. A failed read rejects the promise `load` returned.

## One write batch per flush

A backend creates write batches (`IOIMPersistBackend.createWriteBatch`), and a
strategy writes into a batch, never into the backend. Every operation that writes
builds **one** batch for all the resources it covers and commits it once
(`IOIMPersistWriteBatch.commit`):

- an autosave drain: every resource with a pending change, each writing its delta
  or its snapshot;
- `persist()`: every registered resource, each written whole;
- `clearPersisted()`: every registered resource, each deleted;
- `unload`: the one resource, its pending change and the current values of the
  unloaded keys, repeated in batches of the same shape until those keys have no
  unwritten change.

What one commit is depends on the backend: one IndexedDB transaction over every
table the batch touched; one read of the shared roots a path strategy merges into,
then one write per storage key, then one removal per storage key, on a key-value
backend; the batch's changes applied in order, on memory. See
[Persist: backends](/docs/packages/persist-backends).

## One ordered chain of storage work

Autosave drains, `persist()`, `hydrate()`, `clearPersisted()`, `unload()` and `load()` all
run on one chain per persistor, in the order they were asked for, one at a time.
The chain guarantees order and nothing else. It is not a lock over the backend (a
second persistor, or another tab, is still free to write), and it does not freeze
the data. A snapshot or a delta is read when the queued work **runs**, so a write
that waited its turn carries the state as of then.

Two consequences a caller can see:

- **Nothing runs synchronously.** `persist()` is queued on the chain, so not even
  the first line of a strategy's write runs inline. That holds even for a backend
  whose commit is a plain assignment, such as memory or JSON, so reading the
  backend right after `void persistor.persist()` reads the state as of before the
  persist. Await it.
- **`whenIdle()`** resolves once everything queued at the moment of the call has
  finished. It never rejects: a failure belongs to the operation that produced it
  (the promise `persist()` returned, or `onPersistError`). It is the only way to
  await an autosave, which has no caller of its own, but only once that autosave
  is on the chain. On `OIMPersistSchedulerFrameDriven` the drain runs right after
  the frame, so the flush below puts it on the chain synchronously. On
  `OIMPersistSchedulerMicrotaskDriven` the drain runs on a microtask, so let a
  microtask pass before calling `whenIdle()`.

```ts
const persistor = new OIMPersistor({
  persistBackend: new OIMPersistMemoryBackend(),
  persistScheduler: new OIMPersistSchedulerFrameDriven({ channelSlot: db.defaultChannelSlot }),
});
persistor.addPersistResource(new OIMPersistResourceRecords({
  persistRecordSource: new OIMPersistRecordSourceBucketDriven({
    channelMap: db,
    entityCollectionService: cardCollectionService,
    entityStoreSlot: cardEntityStoreSlot,
    slotContentBucketService: deckBucketService.slotContentService,
    bucketSlot: keptBucketSlot,
  }),
  persistRecordsStrategy: new OIMPersistMemoryRecordsStrategy<TOIMStoreKey, TCard>({ storageKey: 'kept-cards' }),
}));

persistor.start();
const cardSlot = cardCollectionService.slotContentService.upsertEntity(cardEntityStoreSlot, { id: 'c3', title: 'gamma' });
deckBucketService.slotContentService.writeBucketMemberSlots(keptBucketSlot, [cardSlot]);
db.flush();
await persistor.whenIdle();
```

**What `start()` writes.** It subscribes every resource that is not quarantined
and starts the scheduler; it writes nothing inline. A resource whose subscribe
throws does not stop the others: every resource is tried, and each failure is
reported to `onPersistError` with `persistOperation: 'start'`, or, with no
handler, all of them are thrown from `start()` as one `AggregateError`.
A resource whose start failed stays registered but unsubscribed, so autosave
does not write it, until `stop()` and `start()` again.
`addPersistResource` on a started persistor starts the resource before
registering it, and registers it only if that start succeeded; a failed start is
thrown from `addPersistResource` itself and the resource is not registered.

What reaches the backend afterwards is what the sources report. A bucket or
single-entity source reports its current value when the resource subscribes,
except what a hydrate restored, so the first drain after `start()` writes it. A
collection source reports nothing at subscribe time, only the writes made after
`start()`. To write everything, call `persist()`.

## What a failed write leaves behind

**On the autosave path**, a resource whose write failed keeps its change: the
entity slots it was writing go back into its pending set (a records resource), or
it stays marked as having a pending write (a snapshot resource), and the persistor
marks it dirty again. A quota error, a closed database or a serialization failure
delays the change instead of destroying it. There is no retry timer: the retained
change goes out with the next drain, which the next reported change requests, or
with a manual `persist()`.

**A manual `persist()` keeps its failed change too.** It writes every registered
resource whole, and a resource whose write failed keeps its pending change. While
autosave is on, the resource is marked dirty again, so catching the rejection and
carrying on does not lose the change. A `persist()` failure does not count toward
quarantine.

When `onPersistError` is set, every failure on those paths is reported to it with
`persistOperation: 'persist'`, every time it fails, so a backend that keeps failing
keeps saying so. The one exception is the autosave failure that quarantines a
resource, which is reported once as `'quarantine'` instead, see below. `TOIMPersistErrorContext` is what `onPersistError` receives beside
the error: the `persistResource` it concerns and the `persistOperation`, one of
`'start'`, `'persist'`, `'hydrate'`, `'clear'` and `'quarantine'` (`TOIMPersistOperation`);
a failed `unload` rejects the promise it returned instead. Branch on
`persistOperation`, never on the error's runtime type: the error is whatever the
backend threw. `TOIMPersistErrorReport` is the pair `{ error, persistErrorContext }`, the shape of one failure as `onPersistError` receives it and as it sits in the `AggregateError` thrown without a handler.

With no `onPersistError`, `start()` throws, and an awaited `persist()`, `hydrate()`
or `clearPersisted()` rejects, with one `AggregateError` that carries every failure of
that call on `error.errors` and names the first in its message. This happens after
the retention, not instead of it. An autosave failure below quarantine has no
caller to reject, so with no handler it is silently retained: the change is kept
and nothing is said.

**`hydrate()` sweeps to the end.** Every resource is read and applied, and what
could not be hydrated is reported after the loop with
`persistOperation: 'hydrate'`. Reporting from inside the loop would, with no handler, throw and leave
the application half-hydrated, decided by registration order.

### One bad value does not take the batch with it

A batch is all-or-nothing at the commit, so a failed commit says only that *the
batch* failed, not which resource spoiled it. When a batch of more than one
resource fails, the persistor writes each resource **alone**, in a write batch of
its own, through the same backend. The resources that are not the problem get
written; the failure is left holding the one that is.

The retry runs only after a batch has already failed, so the healthy path does not
pay for it. It is also what makes the quarantine below safe: without it, one
unserializable value would quarantine every resource that shared a write with it.

What a failed commit left on the backend before it threw depends on the backend:
an IndexedDB transaction leaves nothing; a key-value batch serializes every value
before it writes any, but an item-by-item store
(`OIMPersistKeyValueStorageItemDriven`) that fails part-way leaves the items it
already wrote.

### A failure that repeats: the resource is quarantined

Keeping a failed change is a bet that the failure ends: a quota that gets freed, a
database that was momentarily blocked. The bet is lost when the failure is a
property of the data, such as a cycle, a `BigInt`, a throwing `toJSON` or a value
structured clone refuses. Then every drain rebuilds the same write, nothing is ever
written, and with no handler nothing is said either.

So a resource whose autosave write fails **three consecutive times** is quarantined:

- its retained change is **dropped**;
- it stops listening to its source, so it collects no changes and costs nothing
  per flush, and a later `start()` of the persistor skips it;
- the quarantine is **reported once**, through `onPersistError` with
  `persistOperation: 'quarantine'` and the last write error. With no handler it
  goes to `console.error`. This is the one autosave failure that is never silent;
- **`persist()` ignores the quarantine.** It writes every resource and tells its
  caller either way, and a write that succeeds lifts the quarantine: the count is
  forgotten and, while the persistor is started, the resource listens again. Fix
  the value, `await persistor.persist()`, and autosave resumes.

What is counted is attempts, not time: three drains that were going to run anyway.
Any successful write of the resource resets the count, whichever operation
committed it: an autosave, `persist()`, `clearPersisted()` or `unload`. So a
backend that fails every other drain is never quarantined, and a
`clearPersisted()` or an `unload` that succeeds on a quarantined resource lifts
the quarantine the same way `persist()` does. `removePersistResource` forgets the count.

### `clearPersisted()`

`clearPersisted()` deletes every resource from the backend in one write batch, with
the same per-resource retry when the batch fails, and reports what could not be
cleared with `persistOperation: 'clear'`. A failed wipe and a failed write are not
interchangeable to a handler (one left data behind, the other failed to save any),
so they do not share a name.

It erases storage, not memory, and it does not stop autosave. The next change
writes that change only (a records resource) or the whole value (a snapshot
resource). Call `stop()` first if storage should stay empty.

## Versioned schemas

A stored value outlives the code that wrote it. On a snapshot resource the codec
is where the stored shape and the in-memory shape may differ, so the strategy keeps
writing bytes and the source keeps reading entities, and neither learns about the
other's history.

```ts
import { OIMPersistCodecVersioned } from '@oimdb/persist';
import type { TOIMPersistVersionedShape } from '@oimdb/persist';

const persistResourceSnapshot = new OIMPersistResourceSnapshot({
  persistSnapshotSource: new OIMPersistSnapshotSourceSingleEntityDriven({
    channelMap: db,
    singleSlotService: settingsSingleEntityService,
    entityStoreSlot: settingsEntityStoreSlot,
  }),
  persistSnapshotStrategy: new OIMPersistMemorySnapshotStrategy<TOIMPersistVersionedShape>({ storageKey: 'settings' }),
  persistCodec: new OIMPersistCodecVersioned({
    version: 2,
    migrations: {
      2: data => ({ theme: (data as { dark?: boolean }).dark === false ? 'light' : 'dark' }),
    },
    persistCodec: new OIMPersistCodecIdentity<TSettings>(),
  }),
});
```

`OIMPersistCodecVersioned` takes `version`, `migrations` and an inner
`persistCodec`, all required. It writes `{ version, data }`
(`TOIMPersistVersionedShape`), where `data` is what the inner codec encoded. On
read, every migration keyed **above** the stored version and **at or below** the
current one runs, in ascending order, and the inner codec decodes the result. A
migration is keyed by the version it produces: `2` turns a version-1 payload into a
version-2 one. A migration keyed above `version` never runs.

The stored value has to be that wrapper. A value written without the versioned
codec has no `version` field, so no migration runs and its `data` is missing; put
the versioned codec on a resource from its first write.

A stored version **above** the codec's own `version` is refused: `decode` throws,
nothing is decoded, and the hydrate reports the error with
`persistOperation: 'hydrate'`. A value written by newer code is never read as if
it were the current shape.

The strategy's snapshot type is the wrapper, which is why the strategy above is an
`OIMPersistMemorySnapshotStrategy<TOIMPersistVersionedShape>`. A collection or a bucket in
a snapshot resource is versioned the same way, over its `TOIMPersistRecords`.

A codec applies to `OIMPersistResourceSnapshot` only. `OIMPersistResourceRecords`
has no codec: a records strategy stores each entity as handed over, and a schema
change there is the strategy's own business. Any object with `encode` and `decode`
is an `IOIMPersistCodec`; the identity and the versioned codec are the shipped ones.

## Where to next

<DocCards>
<DocCard to="/docs/packages/persist" title="Persist">The persistor, resources, sources, schedulers and hydration.</DocCard>
<DocCard to="/docs/packages/persist-backends" title="Persist: backends">IndexedDB, localStorage, async key-value, memory and JSON, and building a backend.</DocCard>
</DocCards>
