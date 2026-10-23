---
sidebar_position: 3
description: How @oimdb/persist mirrors collections, buckets and single entities to storage through a persistor, two kinds of resource, four sources, strategies and a scheduler, and how hydration reads them back.
---

# Persist

`@oimdb/persist` is the storage-agnostic persistence **engine**: the persistor,
the two kinds of resource, the four sources, the schedulers, the codecs and the
hydrate reconciler. Concrete storage (IndexedDB, `localStorage`, an async
key-value store, memory, a JSON dump) ships as backend packages that plug into the
same two interfaces, `IOIMPersistBackend` and `IOIMPersistWriteBatch`. To fill a
collection for server-side rendering with the core alone, see
[Server-side rendering](/docs/guides/ssr).

<InShort>

- An `OIMPersistor` takes a backend, a scheduler and an optional error handler, and holds resources.
- A resource pairs one source with one strategy: `OIMPersistResourceRecords` writes per-key deltas, `OIMPersistResourceSnapshot` writes one whole value through a codec.
- A source is a whole collection (write-driven or change-driven), the members of one bucket (flush-driven) or a single entity.
- Every flush builds one write batch and commits it once.
- `hydrate()` reads every resource back and replaces the source, or merges through `persistHydrateReconcile`.

</InShort>

```bash
npm install @oimdb/persist @oimdb/persist-idb @oimdb/core
```

Every example on this page starts from these declarations. The entity collection is
built over an `OIMPersistEntityWriter`, which is what lets a collection source
learn what changed:

```ts setup
import {
  OIMDB, OIMSlotContentBucketServiceSetDriven,
  createOIMBucketService, createOIMEntityService, createOIMEntityWriterInPlace, createOIMSingleEntityService,
} from '@oimdb/core';
import type { TOIMBucketSlotsSetStore, TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';
import {
  OIMPersistCodecIdentity, OIMPersistEntityWriter, OIMPersistRecordSourceBucketDriven,
  OIMPersistRecordSourceCollectionChangeDriven, OIMPersistRecordSourceCollectionWriteDriven,
  OIMPersistResourceRecords, OIMPersistResourceSnapshot, OIMPersistSchedulerFrameDriven, OIMPersistSchedulerMicrotaskDriven, OIMPersistSnapshotSourceSingleEntityDriven,
  OIMPersistor,
} from '@oimdb/persist';
import type { TOIMPersistRecords } from '@oimdb/persist';
import { OIMPersistMemoryBackend, OIMPersistMemoryRecordsStrategy, OIMPersistMemorySnapshotStrategy } from '@oimdb/persist-memory';

type TCard = { id: string; title: string; draft?: boolean };
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

const deckBucketService = createOIMBucketService<
  TCardSlot, TOIMStoreKey, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
>(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>() });
const deckBucketStoreSlot = deckBucketService.createStoreSlot(db);
const keptBucketSlot = deckBucketService.holdSlotByKey(deckBucketStoreSlot, 'kept');

const settingsSingleEntityService = createOIMSingleEntityService<TSettings>(db);
const settingsEntityStoreSlot = settingsSingleEntityService.createStoreSlot(db);
settingsSingleEntityService.slotContentService.upsertEntity(settingsEntityStoreSlot, { theme: 'dark' });
```

Save the whole collection to `localStorage` and load it on start:

```ts
import { OIMPersistKeyValueEntryStrategy } from '@oimdb/persist';
import { OIMPersistLocalStorageBackend } from '@oimdb/persist-localstorage';

const persistor = new OIMPersistor({
  persistBackend: new OIMPersistLocalStorageBackend(),
  persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
  onPersistError: (error, { persistOperation }) => console.error(persistOperation, error),
});
persistor.addPersistResource(new OIMPersistResourceSnapshot({
  persistSnapshotSource: new OIMPersistRecordSourceCollectionWriteDriven({
    entityCollectionService: cardCollectionService,
    entityStoreSlot: cardEntityStoreSlot,
    persistEntityWriter,
  }),
  persistSnapshotStrategy: new OIMPersistKeyValueEntryStrategy<TCardRecords>({ storageKey: 'app:cards' }),
  persistCodec: new OIMPersistCodecIdentity<TCardRecords>(),
}));

await persistor.hydrate();
persistor.start();

cardCollectionService.slotContentService.upsertEntity(cardEntityStoreSlot, { id: 'c1', title: 'Ace' });
```

`localStorage` holds one string per key, so this resource writes the whole
collection under `app:cards` on every write batch. For a collection that writes
only the entities that changed, use IndexedDB with `OIMPersistResourceRecords`,
see [Records: per-key deltas](#records-per-key-deltas).

## Pages in this section

- [Persist: failures, schemas and releases](/docs/packages/persist-storage): a
  release versus an `unload`, the `load` that brings unloaded keys back, the one
  ordered chain of storage work, what a failed
  write leaves behind, quarantine, and versioned schemas.
- [Persist: backends](/docs/packages/persist-backends): IndexedDB, `localStorage`,
  an async key-value store, memory and JSON, their strategies, and how to build a
  backend of your own.

## When to take it, and when not

Take it when state has to **outlive the process** and keep up with the runtime
on its own: a whole collection, a hand-decided subset of one, or a standalone
entity that is written to a backend as it changes and read back on the next start.

Do not take it for:

- **A one-shot transfer**, such as a server dump handed to a client or a test
  fixture. That is a read and a write with nothing to keep up with, and the core
  does it alone. See [Server-side rendering](/docs/guides/ssr).
- **Mirroring into another in-memory store.** The target is not storage. See
  [Redux Adapter](/docs/packages/redux-adapter).

## The parts

| part | what it is | shipped |
|---|---|---|
| **persistor** | the resources of one backend, one scheduler, one ordered chain of storage work, the error policy | `OIMPersistor` |
| **resource** | one source paired with one strategy | `OIMPersistResourceRecords`, `OIMPersistResourceSnapshot` |
| **source** | how the engine reads, writes and watches one thing in memory | `OIMPersistRecordSourceCollectionWriteDriven`, `OIMPersistRecordSourceCollectionChangeDriven`, `OIMPersistRecordSourceBucketDriven`, `OIMPersistSnapshotSourceSingleEntityDriven` |
| **strategy** | where one resource lives on its backend, and how it is read, written and deleted there | per backend, see [Persist: backends](/docs/packages/persist-backends) |
| **backend** | the storage itself; reads go to it directly, writes go into a write batch it creates | one per backend package |
| **scheduler** | when the changes the resources collected become a write batch | `OIMPersistSchedulerMicrotaskDriven`, `OIMPersistSchedulerFrameDriven` |
| **codec** | how a snapshot resource's value is encoded on the way out and decoded on the way in | `OIMPersistCodecIdentity`, `OIMPersistCodecVersioned` |

The persistor takes one options object, `TOIMPersistorOptions`: `persistBackend`
and `persistScheduler` are required, `onPersistError` is optional. Both resources
take one options object as well. `addPersistResource` hands the resource back, so
it can be kept from the same expression.

A persistor is typed by its backend and that backend's write batch, and a
strategy is typed by the same pair, so a strategy of one backend does not compile
on a persistor of an unrelated one.

## Choosing a source, a resource and a scheduler

Each choice is made once, at construction, and nothing on the write path branches
on it.

| source | what it persists | learns a change from | pair with | resource kinds |
|---|---|---|---|---|
| `OIMPersistRecordSourceCollectionWriteDriven` | every entity of an entity store slot that holds a value | the `OIMPersistEntityWriter` the entity collection was built with, inside the write; no channel | `OIMPersistSchedulerMicrotaskDriven` | records or snapshot |
| `OIMPersistRecordSourceCollectionChangeDriven` | every entity of an entity store slot that holds a value | the same writer, plus a content-change listener on the store slot, both inside the write; no channel | `OIMPersistSchedulerMicrotaskDriven` | records or snapshot |
| `OIMPersistRecordSourceBucketDriven` | the member slots of one bucket, which you write | effects on the bucket and on each member, run at the frame | `OIMPersistSchedulerFrameDriven` | records or snapshot |
| `OIMPersistSnapshotSourceSingleEntityDriven` | the single slot of a single entity service | an effect on its entity slot, run at the frame | `OIMPersistSchedulerFrameDriven` | snapshot only |

What one flush costs, by resource kind:

| resource | strategy it takes | what one write batch carries |
|---|---|---|
| `OIMPersistResourceRecords` | a records strategy: `OIMPersistIndexedDbRecordsStrategy`, `OIMPersistMemoryRecordsStrategy` | the changed entities only: one upsert or one deletion per changed key, O(changed keys) |
| `OIMPersistResourceSnapshot` | a snapshot strategy: `OIMPersistIndexedDbSnapshotStrategy`, `OIMPersistKeyValueEntryStrategy`, `OIMPersistKeyValuePathStrategy`, `OIMPersistMemorySnapshotStrategy` | the whole value: for a collection or a bucket, every entity it holds, O(entities) |

The two collection-shaped sources are also snapshot sources, whose snapshot is a
`TOIMPersistRecords` (`{ records: { key, entity }[] }`). So a collection or a bucket
can go into either resource. A single entity has no key axis and goes into
`OIMPersistResourceSnapshot` only.

There is **no key-value records strategy** that keeps one storage key per entity.
On `localStorage` or an async key-value store a collection is a snapshot resource,
and every write batch that carries it rewrites the whole collection.

**The scheduler rule.** `OIMPersistSchedulerFrameDriven` drains after a frame
the channel runs; it never asks the channel for a frame itself. A write to a slot
nobody holds causes no frame, and the slots of a collection persisted through a collection source
are usually held by nobody. So:

- pair either collection source with `OIMPersistSchedulerMicrotaskDriven`;
- pair `OIMPersistRecordSourceBucketDriven` and
  `OIMPersistSnapshotSourceSingleEntityDriven` with
  `OIMPersistSchedulerFrameDriven`: their effects subscribe to the slots they
  watch, so a write to them causes the frame that delivers their report.

A persistor has one scheduler. When one persistor holds both a collection
source and a bucket or a single entity, take
`OIMPersistSchedulerMicrotaskDriven`: the effect-driven reports arrive during the
frame and the drain follows on a microtask, and the collection's reports are
drained without waiting for a frame that may never come.

## Sources

### A whole collection, driven by the write

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
```

`OIMPersistEntityWriter` is an `IOIMEntityWriter` that wraps another one (here
the in-place writer, see [The two writers](/docs/core/writing#the-two-writers))
and calls every listener given to `subscribeEntitySlotWritten` with the entity
slot it just wrote. `putEntity`, `patchEntity` and `patchColumn` report only when
they changed a column, `deleteColumns` only when it deleted one, and `fillEntity`
and `clearEntity` always report. With no listener the report is one size check.

The entity content service reports to the channel and the writer reports to persistence,
and neither wraps the other. Build the entity collection with
`entityWriter: persistEntityWriter` and hand the same writer to the source. The writer belongs to the
collection type, not to one store slot, so the source keeps only the writes whose `entitySlot.storeSlot` is the
store slot it was given.

The writer does not see an edit made to an entity object in place and then
announced with `slotContentService.markEntityChanged(entitySlot, changedColumns?)`.
Whether such an edit is persisted is a choice of source, made at construction.
Both take the same options object, `TOIMPersistRecordSourceCollectionOptions`
(`{ entityCollectionService, entityStoreSlot, persistEntityWriter }`). The collection service is anything with
`getSlots`, `findSlotByKey` and a `slotContentService` with `upsertEntities`, `deleteEntity` and `deleteEntities`
(`TOIMPersistEntityCollectionService`):

| collection source | what it hears | an in-place edit announced with `markEntityChanged` | cost on the store slot while a resource listens | pick it when |
|---|---|---|---|---|
| `OIMPersistRecordSourceCollectionWriteDriven` | the `OIMPersistEntityWriter` only | **not persisted** | none: every write stays on the core fast path; the writer adds one listener loop per write that changed the entity | every change goes through the upsert, update and delete doors |
| `OIMPersistRecordSourceCollectionChangeDriven` | the writer, plus a content-change listener (`OIMContentChangeListenerService.INSTANCE.addContentChangeListener(entityStoreSlot, …)`, of every column) while subscribed | persisted like a write through the writer | **every** write to that store slot leaves the core fast path, not only `markEntityChanged`: one subframe opened and closed, the changed-column bookkeeping, and the content-change listener loop per write | the application edits entities in place |

The change-driven source gives the listener back when its subscription ends, so
the store slot returns to the fast path when no resource listens.

```ts
const changeDrivenPersistor = new OIMPersistor({
  persistBackend: new OIMPersistMemoryBackend(),
  persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
});
changeDrivenPersistor.addPersistResource(new OIMPersistResourceRecords({
  persistRecordSource: new OIMPersistRecordSourceCollectionChangeDriven({
    entityCollectionService: cardCollectionService,
    entityStoreSlot: cardEntityStoreSlot,
    persistEntityWriter,
  }),
  persistRecordsStrategy: new OIMPersistMemoryRecordsStrategy<TOIMStoreKey, TCard>({ storageKey: 'cards' }),
}));
changeDrivenPersistor.start();
```

Neither source needs a channel. What each persists is every entity that holds a
value. Two consequences:

- **`start()` reports nothing that is already there.** A collection source
  reports nothing when the resource subscribes; it hears writes made after that.
  An entity written before `start()` is on the backend only if a hydrate restored
  it from there, a later write touches it, or `persist()` writes everything.
- **A release is a deletion.** When a release policy takes an entity out of
  memory, the release goes through the writer's `clearEntity`, the source reports
  the slot, and the next write batch deletes the key. See
  [A release is a deletion](/docs/packages/persist-storage#a-release-is-a-deletion-unload-is-the-other-door).

### The members of a bucket, driven by the flush

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

const cardSlot = cardCollectionService.slotContentService.upsertEntity(cardEntityStoreSlot, { id: 'c1', title: 'Ace' });
deckBucketService.slotContentService.writeBucketMemberSlots(keptBucketSlot, [cardSlot]);
db.flush();
await persistor.whenIdle();
```

The source watches with effects: one on the bucket slot, and one on each member
slot. Both run at the frame, so this source is flush-driven, and the frame
scheduler writes once per frame that reported something.

- **A member's own write** wakes that member's effect, which reports one slot:
  O(1) per member per flush.
- **A membership change** wakes the bucket's effect, which walks the whole member
  list to find arrivals and the watched slots to find departures: O(members) per
  flush in which the membership changed, however few members moved.
- **Mounting** walks the whole bucket once and reports every member, except one
  that still holds the value a hydrate restored into it. So the first drain after
  `start()` writes the bucket's current members.

The bucket's members are the filter, and you write them. There is no separate
"exclude from persistence" setting: an entity that should not be persisted is an
entity you do not put in the bucket. Nothing moves an entity out of the bucket for
you when one of its columns changes; compute the list and write it again.

Hold the bucket for as long as you persist it. The source does not resolve the
bucket; whoever resolved the key with `bucketCollectionService.holdSlotByKey(bucketStoreSlot, key)` keeps
that hold and decides when the bucket goes.

An entity mirrored through a bucket is a member of that bucket and has a
subscriber, so a release policy does not collect it while it is mirrored.

### A single entity

```ts
const persistor = new OIMPersistor({
  persistBackend: new OIMPersistMemoryBackend(),
  persistScheduler: new OIMPersistSchedulerFrameDriven({ channelSlot: db.defaultChannelSlot }),
});
persistor.addPersistResource(new OIMPersistResourceSnapshot({
  persistSnapshotSource: new OIMPersistSnapshotSourceSingleEntityDriven({
    channelMap: db,
    singleSlotService: settingsSingleEntityService,
    entityStoreSlot: settingsEntityStoreSlot,
  }),
  persistSnapshotStrategy: new OIMPersistMemorySnapshotStrategy<TSettings>({ storageKey: 'settings' }),
  persistCodec: new OIMPersistCodecIdentity<TSettings>(),
}));
```

The snapshot is the entity itself, read with `singleSlotService.findSingleSlot(entityStoreSlot)?.entity`;
reading it before the entity was ever upserted throws, so give the single its first value with
`upsertEntity` before the persistor reads it. A hydrate writes it back through
`singleSlotService.slotContentService.upsertEntity(entityStoreSlot, entity)`, a whole-value write, so a column
deleted before the snapshot was taken does not come back on load. When the resource subscribes, the
source reports the current value unless it is the value a hydrate restored, so
the first drain after `start()` writes it.

## Resources

### Records: per-key deltas

`OIMPersistResourceRecords` takes `persistRecordSource`, `persistRecordsStrategy`
and an optional `persistHydrateReconcile`. It keeps the changes it has not
written yet as a set of **entity slots**, not keys. When a write batch is built,
each slot is read directly: a slot that holds a value and is not released becomes
an upsert, any other becomes a deletion of its key. A key that was released and
minted again before the batch was built is written once, as an upsert of the live
slot.

A records resource has no codec. A records strategy stores each entity as it is
handed over, so a stored format that differs from the in-memory one is the
strategy's own business.

`persist()` writes a records resource whole, through the strategy's
`writeRecords`; autosave writes the delta, through `writeRecordsDelta`. While any
key of the resource is unloaded, `persist()` hands every in-memory record to
`writeRecordsDelta` as an upsert instead, together with the deletions the
resource has pending, so the unloaded records stay stored. A deletion the
resource never heard is not written in that mode.

### Snapshot: one value, through a codec

`OIMPersistResourceSnapshot` takes `persistSnapshotSource`,
`persistSnapshotStrategy`, `persistCodec` and an optional
`persistHydrateReconcile`. Any change marks the resource dirty, and the write
batch carries `persistCodec.encode(source.readSnapshot())`, read when the write
runs. `OIMPersistCodecIdentity` writes the snapshot as it is;
`OIMPersistCodecVersioned` wraps it with a schema version and migrates on read,
see [Versioned schemas](/docs/packages/persist-storage#versioned-schemas).

## Schedulers

`persistScheduler` is required and has no default: the right one depends on the sources, as
[the scheduler rule](#choosing-a-source-a-resource-and-a-scheduler) says.

- `OIMPersistSchedulerMicrotaskDriven` drains on the first microtask after the
  first dirty report, and coalesces every report before it into that one drain.
  `stop()` cancels a drain already scheduled, and a report made while stopped
  schedules nothing.
- `OIMPersistSchedulerFrameDriven({ channelSlot })` subscribes with
  `OIMChannelService.INSTANCE.subscribeAfterEachFrame(channelSlot, …)` and drains after a frame only when a resource asked
  for a drain since the last one. A frame that reported nothing costs one flag
  check. It does not ask the channel for a frame, so it suits the bucket and
  single-entity sources, whose effects cause frames, and not the collection
  sources, see [the scheduler rule](#choosing-a-source-a-resource-and-a-scheduler).

A scheduler serves one persistor and refuses a second by name. To write your own,
implement `IOIMPersistScheduler`:

- `attachDrain(drain)` is called once, from the persistor's constructor.
- `start()` and `stop()` are the lifetime. `start()` is called again on every
  `addPersistResource` of a started persistor.
- `requestDrain()` is one dirty report. It takes no argument.

A scheduler the package does not ship, with one drain per quiet period:

```ts
import type { IOIMPersistScheduler } from '@oimdb/persist';

class DebouncedPersistScheduler implements IOIMPersistScheduler {
  private drain: (() => void) | undefined = undefined;
  private timer: ReturnType<typeof setTimeout> | undefined = undefined;
  private readonly quietMs: number;

  public constructor(options: { quietMs: number }) {
    this.quietMs = options.quietMs;
  }

  public attachDrain(drain: () => void): void {
    if (this.drain !== undefined && this.drain !== drain) throw new Error('one persistor per scheduler');
    this.drain = drain;
  }

  public start(): void {}

  public stop(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  public requestDrain(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.drain?.();
    }, this.quietMs);
  }
}

const debouncedPersistor = new OIMPersistor({
  persistBackend: new OIMPersistMemoryBackend(),
  persistScheduler: new DebouncedPersistScheduler({ quietMs: 500 }),
});
```

The quiet period has a cost: the changes wait in memory for it, so a tab closed
inside it loses them.

## Hydration

```ts
const persistor = new OIMPersistor({
  persistBackend: new OIMPersistMemoryBackend(),
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
persistor.start();
```

`hydrate()` reads every resource through its strategy, one resource at a time,
and applies what it read to the source. Hydrate before `start()`.

**What a hydrate applies.** Without a reconciler the stored value **replaces**
the source:

- an entity store slot becomes exactly the stored records: an entity the records do not
  name is deleted from it;
- a bucket's member list becomes exactly the stored records, upserted into the
  entity store slot; an entity that leaves the list stays in the store slot;
- a single entity is written with the stored value.

So a stored value narrower than what memory holds evicts. A server pre-state, a
second hydrate, or a reconciler that dropped an entity replaces instead of adding.

**Nothing stored is not the same as stored empty.** A strategy whose read returns
`undefined` says the backend holds nothing there, and `hydrate` applies nothing.
`{ records: [] }` is a value somebody stored, and it is applied: the collection or
the bucket comes back empty. Every shipped strategy keeps the two apart: the
memory backend returns `undefined` for a storage key never written, the key-value
backend for a key with no item, and IndexedDB for a table that does not exist.
A read never creates an object store.

**A hydrate is not written straight back out.** The collection sources report
inside the write, and the resource writes the source with its own reports
switched off. The bucket and single-entity sources report from effects that run
later, at the frame, so they remember the value they restored, key by key, and a
wake is not written while the entity still holds that value. The first time a
different value is seen, the memo for that key is gone: the edit is written, and
a later revert to the restored value, in another frame, is written too.

### Merging instead of replacing

Pass `persistHydrateReconcile` to merge what was read (`incomingSnapshot`) onto
what the source holds at apply time (`currentSnapshot`). For a collection or a
bucket, `oimReconcileByKey` lifts a per-entity resolver to the whole set of
records:

```ts
import { oimReconcileByKey } from '@oimdb/persist';

const persistResourceRecords = new OIMPersistResourceRecords({
  persistRecordSource: new OIMPersistRecordSourceCollectionWriteDriven({
    entityCollectionService: cardCollectionService,
    entityStoreSlot: cardEntityStoreSlot,
    persistEntityWriter,
  }),
  persistRecordsStrategy: new OIMPersistMemoryRecordsStrategy<TOIMStoreKey, TCard>({ storageKey: 'cards' }),
  persistHydrateReconcile: oimReconcileByKey<TOIMStoreKey, TCard>(
    (currentEntity, incomingEntity) => currentEntity === undefined ? incomingEntity : { ...incomingEntity, ...currentEntity },
  ),
});
```

`oimReconcileByKey` walks the union of keys, current ones first, and calls the
resolver only for a key the incoming records carry. A key only the current side
holds keeps its current entity and the resolver is not asked. A resolver that
returns `undefined` drops that key from the result, which on a collection deletes
the entity. On a snapshot resource the reconciler runs after the codec decoded the
stored value.

### A hydrate will not clobber a concurrent change

A strategy's read is asynchronous, and the application keeps running while it is
in flight. A change made to the source during the read would be reverted by
applying the older stored value on top of it.

So before the stored read starts, the resource asks its source for a change mark,
`IOIMPersistSnapshotSource.markSourceChanges()`, which returns an
`IOIMPersistSourceChangeMark`. When the read is back the resource asks the mark
`isSourceChangedSinceMark()`, and disposes it either way. If the source changed
and the read returned a value:

- a resource with `persistHydrateReconcile` merges, and the concurrent change is
  part of `currentSnapshot`;
- a resource without one **refuses**: nothing is applied, the source keeps the
  newer state, and the error is reported with `persistOperation: 'hydrate'`.

Each shipped source makes its mark from state it already has:

| source | change mark | what it compares |
|---|---|---|
| `OIMPersistSnapshotSourceSingleEntityDriven` | `OIMPersistSourceChangeMarkSlotDriven` over the entity slot | the slot's revision stamps (`changedAtRevision`, `changedAtEpoch`) taken at the mark |
| `OIMPersistRecordSourceBucketDriven` | `OIMPersistSourceChangeMarkSlotDriven` over the bucket slot and every member slot | the same stamps on each of those slots |
| `OIMPersistRecordSourceCollectionWriteDriven` | `OIMPersistSourceChangeMarkSubscriptionDriven` over its own change subscription | a flag the subscription sets on the first report after the mark |
| `OIMPersistRecordSourceCollectionChangeDriven` | `OIMPersistSourceChangeMarkSubscriptionDriven` over its own change subscription, which holds the content-change listener for as long as the mark lives | the same flag, set also by an in-place edit announced with `markEntityChanged` |

A change made during the read is seen even when no frame runs before the read is back. The
mark works whether or not the persistor is started, and never reports a mount as a change.

A source of your own implements `markSourceChanges()` too. Both shipped marks are
exported for it: `new OIMPersistSourceChangeMarkSlotDriven({ slots })` when the
source's state lives in slots, and
`new OIMPersistSourceChangeMarkSubscriptionDriven({ subscribeSourceChanged })`
when the source can only report changes through a subscription it opens for the
mark and closes on `dispose()`.

`hydrate()` sweeps to the end: a resource that fails or refuses does not stop the
ones after it. The failures are reported afterwards, see
[What a failed write leaves behind](/docs/packages/persist-storage#what-a-failed-write-leaves-behind).

## Lifecycle

| Call | What it does |
|---|---|
| `addPersistResource(persistResource)` | Register a resource and hand it back. On a started persistor it starts the resource first and registers it only if that start succeeded; a start that throws is thrown from `addPersistResource` and the resource stays unregistered |
| `removePersistResource(persistResource)` | Unregister and stop it; drops its pending write and its failure count |
| `start()` / `stop()` | Subscribe and unsubscribe every resource, and start and stop the scheduler; `start()` skips a quarantined resource. A resource whose subscribe throws does not stop the others: each failure goes to `onPersistError` with `persistOperation: 'start'`, or, with no handler, all of them are thrown as one `AggregateError` after every resource was tried. A resource whose start failed stays registered and unsubscribed, with no autosave, until `stop()` and `start()` again. A bucket or single-entity source reports its current value when its resource subscribes, so the first drain after `start()` writes it (except a value a hydrate restored); a collection source reports nothing at subscribe time |
| `hydrate()` | Read every resource and apply it, one at a time, always to the end; ends the upsert-only mode an `unload` put a records resource in |
| `persist()` | Write every resource whole in one write batch, quarantined ones included; a resource whose write succeeds leaves quarantine. A records resource with unloaded keys writes its in-memory records as upserts over the stored table instead of replacing it, plus the deletions it already heard; a deletion it never heard is not written then |
| `unload(persistResourceRecords, keys)` | Write the current values of the keys, plus what that resource has pending, repeating until the keys have no unwritten change (so an edit made during the write is not lost); then take the keys out of memory and leave them on the backend. See [the limit on deletions](/docs/packages/persist-storage#a-release-is-a-deletion-unload-is-the-other-door) |
| `load(persistResourceRecords, keys)` | The pair of `unload`. Queued after the pending writes, it reads only those keys from the backend through the strategy's `readRecordsOfKeys` and puts the stored entities back into the source with the resource's reports switched off, so they are not written back. A key that holds a value in memory, or has a change the resource has not written yet, is skipped, so a write or a heard deletion made during the read is not overwritten. The keys stop counting as unloaded: once none is, `persist()` replaces the table again. See [Loading keys back](/docs/packages/persist-storage#loading-keys-back) |
| `clearPersisted()` | Delete every resource from the backend in one write batch; memory is not touched; ends the upsert-only mode an `unload` put a records resource in |
| `whenIdle()` | Resolve once everything queued so far has finished; never rejects |
| `destroy()` | Stop, then forget every resource, pending write and failure count |

`hydrate`, `persist`, `unload`, `load`, `clearPersisted` and every autosave run on one
ordered chain, see [One ordered chain of storage work](/docs/packages/persist-storage#one-ordered-chain-of-storage-work).

## See also

<DocCards>
<DocCard to="/docs/packages/persist-storage" title="Persist: failures, schemas and releases">The write batch, the ordered chain, retention and quarantine of failed writes, unload and load, and versioned codecs.</DocCard>
<DocCard to="/docs/packages/persist-backends" title="Persist: backends">IndexedDB, localStorage, async key-value, memory and JSON, and building a backend.</DocCard>
<DocCard to="/docs/guides/ssr" title="Server-side rendering">Seeding a collection before the first client render with the core alone.</DocCard>
<DocCard to="/docs/packages/redux-adapter" title="Redux Adapter">Mirroring a collection into a Redux store instead of storage.</DocCard>
</DocCards>
