# Changelog

All notable changes to `@oimdb/core` are recorded here. This file starts at 4.0.0; releases
before it were not changelogged.

## 4.0.0 — unreleased

A ground-up rewrite, not an incremental version: **nothing from the 3.x public API survives
unchanged.** There is no port table. The exported surface is `src/index.ts`, enumerated in the
README's export reference, and [the documentation](https://oimdb.org/docs/) describes it as it
is rather than as a diff. `npm install @oimdb/core` does not give you this engine until 4.0.0 is
published.

### The two changes everything else follows from

- **Key-addressed → identity-addressed.** 3.x looked a key up on every operation. 4.0 resolves a
  key to a slot once (`getSlotByKey`, `holdSlotByKey`) and works through that slot afterwards.
  `updateEntity` takes a slot; `updateEntityByKey` / `deleteEntityByKey` say the lookup in their
  names.
- **A god-object runtime → an operation lives on its subject.** Writes and reads are methods on
  the collection that owns the slot; delivery is `OIMChannel`'s; `OIMDB` is a root that builds
  collections with its defaults and drives `flush()`.

### What the engine is made of

- **Slots and their owners.** Every observable thing is a slot — an entity, a column, a bucket, a
  computed — and only its owner mutates it. `OIMSlotAggregate` is the base every collection
  extends; `OIMSlotReleaseOwner` decides when an unheld slot goes, through an injected
  `IOIMSlotReleasePolicy` (`AtEmpty` by default, plus `AtUnhold`, `AfterUnhold`, `AfterWrite`,
  `AfterIdle`, `Never` and `Earliest`).
- **Entities.** `OIMEntityCollection` (silent) and `OIMChannelledEntityCollection` (wakes the
  channel), `OIMSingleEntity` for one record. The writer is a fork chosen at construction:
  `createOIMEntityWriterInPlace` or `createOIMEntityWriterReplacing`, each taking
  `copyingWriterStrategy` (default) or `asHandedWriterStrategy`.
- **Columns.** `OIMColumnOwner` owns column slots on any aggregate, so an effect can wait on one
  column of one entity (`holdColumn`, `channel.effectOnColumn`).
- **Buckets and indexes.** `OIMBucketCollection` holds slots the caller files;
  `OIMIndex` files an entity collection's slots by `keyOf`. How a bucket holds its slots is a fork:
  `OIMBucketSlotsServiceSetDriven` or `OIMBucketSlotsServiceArrayDriven`. Positional edits record
  a command script through `OIMBucketCommands`.
- **Computeds.** A computed is a `TOIMComputedSlot` created and read only by its owner —
  `OIMSingleComputed` or `OIMComputedCollection` — over named sources. It is pulled: a read
  refreshes it against the channel clock. `OIMComputedCollectionSorted` is the shipped order over
  an index, re-sorted only when a member's sort column changes.
- **Delivery.** `OIMChannel` coalesces a frame's writes and runs each `OIMEffect` once per frame
  over its root slots and source computeds; `subscribeAfterEachFrame`, `subscribeAfterEachFlush`
  and `subscribeOnceAfterFrame` run after it. Errors go through an `IOIMErrorPolicy`.
- **Keys.** A composite key is a chain descended one segment at a time
  (`OIMSlotStoreServiceTreeDriven` with `OIMScalarKeyTreeWalk` or `OIMCompositeKeyTreeWalk`), so
  nothing is encoded.

### Removed from 3.x

- Event queues, scheduler classes and event-type enums. The channel's `channelScheduler` option,
  `(flush) => void`, replaces them.
- A class per delivery timing and per carrier shape. One effect type replaces them.
- Dozens of concrete index classes, and a store class per collection × index × backing structure.
- Encoded composite-key tuples and their codecs (`ctk`).
- APIs returning raw key arrays, and "holes" in by-key results. A missing entity is
  `slot.entity === undefined` on a resolved slot.
- The entity-updater factory family.
- The free bucket-lookup functions `bucketOf`, `findBucket`, `findBuckets`, `allBucketsOf`,
  `bucketsByKeyOf`.

### Behaviour worth knowing before porting

- **The frame is the unit, not the write.** An effect standing when the frame flushes is woken
  once for everything that moved in that frame.
- **A write that changes nothing wakes nobody.**
- **Reads hand back the live container, never a copy**, so a loop over a bucket's slots must not
  write to the collection it is walking.
- **A slot nobody holds and nothing fills is released** by its owner's release policy; hold what
  you resolve for as long as you read it.

### Companion packages

- `@oimdb/react`: `useOIMValue`, `useOIMEntity`, `useOIMField`, `useOIMBucketSlots`,
  `useOIMBucketSlotsByKey`, `useOIMSlotsByKeys`, with `OIMChannelProvider` / `useOIMChannel`.
- `@oimdb/persist`: `OIMPersistor` and `OIMPersistResource` over `createBucketSourceAdapter`,
  `createCollectionSourceAdapter` and `createSingleEntitySourceAdapter`.
- `@oimdb/exodra`: `exoBinding`, `exoSource`, `exoCombine`, `exoFollowKey`, `exoRows`,
  `exoDerivedList`, `exoPositionalList`.
- `@oimdb/async`: deprecated outright, exports nothing.
