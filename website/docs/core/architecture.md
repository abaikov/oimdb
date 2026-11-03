---
sidebar_position: 11
description: The source layout of @oimdb/core by layer and domain, the slot and store-slot shapes, who mints and holds a slot, and where strategies are chosen.
---

# Architecture

This page is for reading or contributing to the source of `@oimdb/core`. Paths are
relative to `packages/core/src/`, and `index.ts` is the whole public surface: nothing
outside it is reachable from a consumer.

<InShort>

- The source has three layers, `engine/`, `facade/` and `factories/`, each split by domain.
- Services are stateless; state lives on slots and store slots. A collection type is a content service (the strategy, owning the slot owner) and a collection service over it; an instance is a store slot.
- A write stamps one slot and queues the effects filed on it; a computed is pulled when read; a flush refuses writes instead of draining.

</InShort>

## Source layout

| Layer | What lives there |
|---|---|
| `engine/<domain>/` | the stateless services and the data types of one domain, with that domain's own `constants/`, `interfaces/`, `types/` and `utils/` beside them |
| `facade/<domain>/` | the collection services and the content services they are assembled from |
| `factories/` | `OIMDB`, `OIMDefaults`, the defaults behind it, and the `create*` functions |

No class sits directly in `engine/` or `facade/`. `engine/bucket/` has two
subfolders of its own: `array/` and `commands/`.

| Domain | What it owns | Classes |
|---|---|---|
| `engine/channel` | the channel slot: clock, frame, effect queue, flush | `OIMChannelService`, `OIMChannelQueue`; `TOIMChannelSlot` |
| `engine/schedule` | the timer that wakes a flush | `OIMFlushSchedulerService` (abstract); `TOIMFlushSchedulerSlot` |
| `engine/error` | what a throw caught during a flush becomes | `OIMLogAndContinueErrorPolicy`, `OIMThrowAtOnceErrorPolicy` |
| `engine/slot` | identity, holds, emptiness, release, content-change listeners and their delivery | `OIMSlotOwner`, `OIMSlotOwnerService`, `OIMSlotContentChangeListenerService`, `OIMSlotContentChangeDeliveryService`, `OIMNoStoreSlotListener`; `TOIMSlot`, `TOIMStoreSlot` |
| `engine/store` | how slots are filed under a key | `OIMSlotMapStoreService`, `OIMSlotTreeStoreService`, `OIMSingleSlotStoreService` |
| `engine/key` | how a composite key is walked | `OIMKeyTreeWalk` (abstract), `OIMScalarKeyTreeWalk`, `OIMCompositeKeyTreeWalk` |
| `engine/bucket` | the member stores of a bucket, and the render script | `array/`: `TOIMBucketSlotsArrayStore`, `OIMBucketMemberSlotsArrayService`, `OIMBucketUniqueMemberSlotsArrayService`; `commands/`: `OIMNoBucketCommands`, `OIMWholeListBucketCommands`, `TOIMOrderedListCommand`, `getOIMOrderedListCommands` |
| `engine/entity` | entity slots and how a write lands on them | `OIMEntityContentService`, `OIMSlotEntityPresenceEmptinessPolicy`; `IOIMEntityWriter`, `TOIMEntitySlot` |
| `engine/column` | column slots, carried by an entity, bucket or computed slot | `OIMColumnSlotOwner` (abstract), `OIMPushColumnSlotOwner`, `OIMPullColumnSlotOwner`, `OIMColumnSlotOrdinalStoreService`; `TOIMColumnSlot`, `TOIMComputedColumnSlot` |
| `engine/computed` | derivations and effects | `OIMComputedValueService`, `OIMComputedSourcesService`, `OIMComputedContentService` (abstract), `OIMExplicitSourceComputedContentService`, `OIMSourceTrackingComputedContentService`, `OIMEffectService`, `OIMSourceTracker`, `OIMSourceList`; `TOIMComputedSlot`, `TOIMComputedStoreSlot`, `TOIMEffect` |
| `engine/index` | the per-index key cell on each slot, and an index's store slot | `OIMIndexKeysService` (abstract), `OIMAppendingIndexKeysService`, `OIMReclaimingIndexKeysService`; `TOIMIndexStoreSlot` |
| `engine/collector` | what releases a slot, and when | `OIMUnusedSlotCollectorService`, `OIMSlotWheel` (abstract) with `OIMSlotReleaseWheel` and `OIMSlotRefetchWheel`, and the `IOIMSlotReleasePolicy` implementations listed under [strategies](#where-a-strategy-is-picked-at-construction) |
| `facade/slot` | the read doors of a collection, keyed or single | `OIMColumnSlotService` (abstract), `OIMSlotCollectionService`, `OIMSingleSlotService` |
| `facade/bucket` | the bucket content services and the recorder | `OIMBucketContentService` (abstract), `OIMArrayBucketContentService` (abstract), `OIMPositionalArrayBucketContentService`, `OIMSetBucketContentService`, `OIMSortedArrayBucketContentService`, `OIMBucketCommands` |
| `facade/index` | the auto-index | `OIMSlotCollectionIndexService`, `OIMSlotCollectionSortedArrayIndexService` |
| `facade/computed` | the computed collections | `OIMComputedService`, `OIMSortedComputedService`, `OIMBucketMemoComputedService` |

`OIMFlushSchedulerService` is the base of the two things a timer fires: the channel and the release
collectors. Its state is a `TOIMFlushSchedulerSlot` (`timer`, `scheduledCallback`, `timerDisposer`): it holds
one timer and the one callback it handed that timer; a callback that is no longer the standing one (a wake
the host could not cancel) does nothing when it fires. The unused-slot collector has no timer of its own and
is flushed by the channel.

Every stateless service is reached through a static `INSTANCE` where it has no configuration
(`OIMChannelService.INSTANCE`, `OIMEffectService.INSTANCE`, `OIMSlotContentChangeListenerService.INSTANCE`, the
collector services, the release policies without a window). A service with configuration — a content
service, a collection service, a policy with a window — is built once by a factory and shared by every store
slot of its type.

## Collection types and store slots

A service holds no collection. A collection is a store slot:
`collectionService.createStoreSlot(db)` returns a `TOIMStoreSlot` carrying the keyed `store`, the channel
slot, that instance's content-change listeners and its column state, and every slot minted there carries it
back as `slot.storeSlot`. Only the services read `store`. The `storeSlotListener` of a service's `defaults` is told of every
store slot it creates.

A collection type is:

- **a content service** — `OIMEntityContentService`, a bucket content service, or a
  computed's content service (`OIMExplicitSourceComputedContentService` or
  `OIMSourceTrackingComputedContentService`, both over the abstract `OIMComputedContentService`). It is the strategy for what a slot holds: it creates the slots
  (`IOIMKeyedSlotCreator` / `IOIMSingleSlotCreator`), answers the slot owner and its column slots (`IOIMSlotContentService`:
  `isSlotEmpty(slot)`, `releaseSlotContent(slot)`, and the pure reads `peekColumnValue(slot, name)`,
  `peekColumnGroupValue(slot, names)`, `peekAnyColumnValue(slot)`) and has the writes
  (`IOIMSlotContentWriter`);
- **the slot owner** (`OIMSlotOwnerService`, an `OIMSlotOwner`) built with it — the holds, subscriptions,
  columns and release of every slot of that type, over its store service, release policy, slot stamp and
  column owner;
- **a collection service** over both — `OIMSlotCollectionService` (or `OIMSingleSlotService`), the read doors
  by key and the column doors. Its `slotContentService` is the content service.

The doors follow from that. A door that works on a whole collection takes the
store slot first: `getSlotByKey(storeSlot, key)`, `holdSlotByKey`, `peekSlotByKey`, `hasSlotContentByKey`,
`getSlots`, `getSlotCount`, `writeSlotContentByKey`, `writeInBatch` on the collection service. A door that
works on one slot takes only the slot, since the slot names its store slot: the content writes (`updateEntity`,
`addBucketMemberSlots`, …) and `slot.owner.releaseSlotIfUnheld(slot)`.

A single is the same content service with the key type `void`, built over
`OIMSingleSlotStoreService.INSTANCE`, under an `OIMSingleSlotService`. Its store is `{ slot }`
(`TOIMSingleSlotStore`, with `slot` `undefined` until one is minted), and its reads are
`getSingleSlot` / `holdSingleSlot` / `peekSingleSlot` / `hasSingleSlotContent`.

| Class | File | Parts and doors |
|---|---|---|
| `OIMSlotCollectionService` | `slot/OIMSlotCollectionService.ts` | abstract; public `slotContentService`, the keyed reads; the column doors, inherited from `OIMColumnSlotService`; a protected store-slot builder its subclasses expose |
| `OIMSingleSlotService` | `slot/OIMSingleSlotService.ts` | the same for a single: the single reads and the column doors |
| `OIMEntityContentService` | `entity/OIMEntityContentService.ts` | `keyOf`; every entity write door |
| `OIMBucketContentService` | `bucket/OIMBucketContentService.ts` | abstract; the member writes and reads every bucket strategy has; protected `addSlot`, `removeSlot`, `removeSlots`, `reconcileSlots`, `drainSlots` each strategy implements |
| `OIMSetBucketContentService` | `bucket/OIMSetBucketContentService.ts` | no positional doors |
| `OIMPositionalArrayBucketContentService` | `bucket/OIMPositionalArrayBucketContentService.ts` | two positional reads (from `OIMArrayBucketContentService`) and five positional writes |
| `OIMSortedArrayBucketContentService` | `bucket/OIMSortedArrayBucketContentService.ts` | the buckets an `OIMSlotCollectionSortedArrayIndexService` keeps sorted; `repositionBucketMemberSlot` |
| `OIMBucketCommands` | `bucket/OIMBucketCommands.ts` | records the frame's render script onto a bucket slot |
| `OIMSlotCollectionIndexService` | `index/OIMSlotCollectionIndexService.ts` | a collection service of buckets whose `slotContentService` is typed to the reads; `createIndexStoreSlot(sourceStoreSlot)` returns a `TOIMIndexStoreSlot` and registers a content-change listener on the source entity store slot, which files each entity into a bucket by its derived key; `disposeIndexStoreSlot` takes it back; `getEntitiesByKey`, `getSlotsByKeys`, `holdSlotsByKeys`, the bucket column doors |
| `OIMComputedService` | `computed/OIMComputedService.ts` | extends `OIMSlotCollectionService` with the pull column owner and its own `createStoreAggregate`. `createStoreSlot(channelMap, derive?, createSources?)` needs both functions, from the store slot or from the service options |
| `OIMSortedComputedService` | `computed/OIMSortedComputedService.ts` | extends `OIMSlotCollectionService` with the pull column owner and its own `createStoreAggregate`; `createSortedStoreSlot(indexStoreSlot)` gives, per key, that index bucket's entity slots sorted |
| `OIMBucketMemoComputedService` | `computed/OIMBucketMemoComputedService.ts` | extends `OIMSlotCollectionService` with the pull column owner and its own `createStoreAggregate`; `createBucketMemoStoreSlot(bucketStoreSlot)` gives, per key, a bucket's member slots as an array |

## `factories/`

| Export | File | What it builds |
|---|---|---|
| `OIMDB` | `db/OIMDB.ts` | the clock, the collector slot and the default channel slot over them; `flush()` flushes the default channel slot |
| `OIMDefaults` | `db/OIMDefaults.ts` | the optional dependencies a factory takes as `defaults`; `OIMDefaults.INSTANCE` sets none |
| `OIMDefaultValue` | `db/OIMDefaultValue.ts` | one built-in default, such as `OIM_DEFAULT_ENTITY_WRITER`: `getValue()` builds it once |
| `createOIMEntityContentService` | `entity/createOIMEntityContentService.ts` | an entity content service, with `entityWriter` and `slotEmptinessPolicy` from the options or the defaults |
| `createOIMSlotCollectionService` | `slot/createOIMSlotCollectionService.ts` | a collection service over a content service |
| `createOIMSingleSlotService` | `slot/createOIMSingleSlotService.ts` | a single slot service over a content service |
| `createOIMSlotCollectionIndexService` | `index/createOIMSlotCollectionIndexService.ts` | an index over an entity collection service; array-driven buckets without commands unless you pass `slotContentService` |
| `createOIMSlotCollectionIndexService` | `index/createOIMSlotCollectionIndexService.ts` | an index whose buckets are filed by a chain of values in a tree-driven store |
| `createOIMSlotCollectionSortedArrayIndexService` | `index/createOIMSlotCollectionSortedArrayIndexService.ts` | an index whose buckets are kept sorted by `sortColumns` |
| `createOIMComputedService` | `computed/createOIMComputedService.ts` | an `OIMComputedService`; no db |
| `createOIMSortedComputedService` | `computed/createOIMSortedComputedService.ts` | an `OIMSortedComputedService` over an index service, sorted by `sortColumns` or `comparator`; no db |
| `createOIMSortedCollectionSingleSlotStoreAggregate` | `computed/createOIMSortedCollectionSingleSlotStoreAggregate.ts` | a single-slot aggregate of a computed over a collection's list and its list column slots: the whole collection sorted, no index |
| `createOIMBucketMemoComputedService` | `computed/createOIMBucketMemoComputedService.ts` | an `OIMBucketMemoComputedService` over a bucket collection service; no db |
| `createOIMInPlaceEntityWriter` | `entity/createOIMInPlaceEntityWriter.ts` | the writer that mutates `slot.entity` |
| `createOIMReplacingEntityWriter` | `entity/createOIMReplacingEntityWriter.ts` | the writer that puts a new object on `slot.entity` |

The option types of these functions are in `factories/types/`.

One channel per database; for isolation, a separate `OIMDB`. A write wakes every effect on the
slots it moved at its own channel's flush, whichever channel those effects belong to, so a second
channel on the same clock isolates neither time nor state. A separate `new OIMDB()` has its own
clock, collectors and channel.

`OIMDefaults` is an instance: `new OIMDefaults({ entityWriter, slotReleasePolicy, … })`, passed as
`defaults` to each factory that should use it. A field it leaves unset falls back to the built-in
`OIMDefaultValue` of that field, built on first use.

## A slot

`slot/types/TOIMSlot.ts` is the shape every slot carries: `effects`,
`effectEdges`, `changedAtRevision`, `changedAtEpoch`, `holdCount`,
`releaseDueAfterWriteMs`, `releaseDueAfterIdleMs`, `releaseDueAfterUnholdMs`,
`slotFlags`, `columnSlotStore` (the column slots it carries, `undefined` while
none), `storeSlot` (the store slot it is filed in, `undefined` for a column slot),
`owner`, and `data`, the consumer's cache (`unknown[] | undefined`; the core never reads or writes it, and
clearing, removing or releasing the slot does not reset it). Every field but `data` is `readonly`; only `TOIMEditable<TSlot>` strips
that, so code that writes a field has to name itself.

| Type | What it adds |
|---|---|
| `TOIMKeyedSlot` | `key` |
| `TOIMIndexableSlot` | keyed, plus `indexKeys`, the engine's per-index cells |
| `TOIMEntitySlot` | indexable, plus `entity` |
| `TOIMBucketSlot` | indexable, plus the member reads and writes as methods; `commands` and `isWholeListRecorded` (this frame's render script); `commandsStartedAtRevision` and `commandsStartedAtEpoch` (the clock the script started at, so a script older than the frame is cleared before anything is recorded into it) |
| `TOIMComputedSlot` | indexable, plus `value`, `sourceSlots`, `sourceComputeds`, `rootSlots`, `ranAtRevision`/`ranAtEpoch`, `checkedAtRevision`/`checkedAtEpoch`, `isDeriving`; its `owner` is the slot owner of the collection that minted it |
| `TOIMColumnSlot` | `carrierSlot`, the entity or bucket slot it hangs off, and a `string` key |
| `TOIMComputedColumnSlot` | a `TOIMComputedSlot` keyed by a column name whose only source is the carrier computed; its value is that field of the carrier's value |

A store slot is not a slot. `TOIMStoreSlot` has no owner, hold count or effects:
it carries `store`, `channelSlot`, the content-change listeners with the columns each reads, the per-index positions, the batch depth and the queues that hold content
changes until the outermost batch closes, and `slotService`, the service that created it. `TOIMComputedStoreSlot` adds `derive` and `createSources`;
`TOIMIndexStoreSlot` adds `sourceStoreSlot`, the listener it registered there, its `indexKeysPosition` and
`isDisposed`. What a store slot's own listener on a source reads (an index's, the collection list's) is
`slotContentChangeListenerReadColumns`, on every `TOIMStoreSlot`. The channel slot `TOIMChannelSlot` carries the clock, the frame, the effect queue, the
after-frame and after-flush handlers and the collector slot.

## Object shapes

V8 gives every object a hidden class (a *map*) and reads a field at a fixed
offset when every object reaching a site shares one. It drops an object to
dictionary mode, where every read is a hash lookup, when the object is grown
property by property past a small count, when it is built from an object literal
with about a thousand keys, or when any property is `delete`d. Nothing the engine
allocates goes through any of these.

- Each slot kind is one object literal in one function, with every field present
  at birth: `createOIMEntitySlot`, `createOIMBucketSlot`, `createOIMComputedSlot`
  (which `OIMPullColumnSlotOwner` also uses for a computed's column slot), and
  the column slot literal in `OIMPushColumnSlotOwner`. A field that has no value
  yet holds `undefined` or `-1`. Nothing adds a field to a slot later or deletes one.
- An index's cell on a slot is a position in `indexKeys`, so a tenth index adds no
  property to any slot.
- Holds, unholds, effects attaching and detaching, a move between buckets, a
  release deadline written into `releaseDueAfterUnholdMs`, and a patch all leave a
  slot on the map its literal gave it.
- Three shapes reach the channel's write door, one below V8's polymorphic ceiling of
  four, and four reach `holdSlot` (the three plus the computed slot). A single's slot
  comes from the same literal as a keyed one and adds no shape.
- Neither entity writer deletes a column or builds an entity key by key. A column a
  PUT drops, or `deleteColumns` takes away, is written `undefined` and its key
  stays. `createOIMInPlaceEntityWriter` writes into the stored object;
  `createOIMReplacingEntityWriter` writes into a spread copy (`copyOIMEntity`),
  which keeps the source's map. The guarded walk arms (`guardOIMEntityColumnsPut`,
  `guardOIMEntityColumnsPatch`, `guardOIMEntityColumnPatch`) skip an own `__proto__` key. A
  column holding `undefined` counts as absent: it reads `undefined`, a later write
  that leaves it out does not report it again, and taking the entity away does not
  wake its readers.

An entity handed in with a few hundred fields is already in dictionary mode when
`JSON.parse` or a literal produces it, and so is its copy. That case is outside
the engine's reach.

## Lifetime

### Who mints

| Door | What keeps the slot |
|---|---|
| `getSlotByKey(storeSlot, key)`, `getSingleSlot(storeSlot)` | the unused-slot collector, which holds the new slot and gives the hold back at the next flush |
| `holdSlotByKey(storeSlot, key)`, `holdSingleSlot(storeSlot)` | the caller's hold |
| `writeSlotContentByKey(storeSlot, key, entity)` | the content; a value that lands empty, or a write under a zero window on a slot nobody subscribes to, is held by the unused-slot collector until it flushes |
| `getColumnSlot(slot, columnName)`, `getAnyColumnSlot`, `getColumnGroupSlot`; `holdColumnSlot`, `holdAnyColumnSlot`, `holdColumnGroupSlot` | a column slot under its carrier, minted by the column owner and kept by the unused-slot collector or by the caller's hold |

The getters and holds mint through the content service's `createSlot` (`createSingleSlot` for a single),
then the slot owner files the slot; `OIMSingleSlotStoreService` files a single as the store's `slot`. A first value asks the release
policy's `onSlotIdle` only when the policy schedules releases on write and the slot goes from empty to filled
with no effect filed on it, so a slot minted empty is on no release clock. `writeSlotContentByKey` creates the slot,
writes the content and only then files it, so a refused write leaves nothing filed.

`peekSlotByKey(storeSlot, key)` is the lookup that does not mint; `hasSlotContentByKey` is built on the
same store lookup, so neither mints the entity it was asked about.
The one by-key write is the whole-value `writeSlotContentByKey`.

### Who holds

`OIMSlotOwner` is the only writer of `holdCount`: `holdSlot` raises it,
`unholdSlot` lowers it (`slot/OIMSlotOwner.ts`).

| Holder | Takes the hold in | Gives it back in |
|---|---|---|
| an effect, on every root slot and computed source it is filed on | `OIMEffectService.INSTANCE.createEffect`, through `owner.subscribeToSlot` | `disposeEffect` |
| the unused-slot collector, on what a getter minted | `OIMUnusedSlotCollectorService.INSTANCE.holdSlotUntilFlush` | its `flush`, which the channel's flush calls in a `finally` |
| a bucket, on every member that arrived | the bucket content service's writes (`writeSlotContent`, `addBucketMemberSlots`, …) | the member departing, or the bucket's content being released |
| a computed's owner, on a computed's `sourceSlots` and `sourceComputeds` | the computed content service's `createSlot` | its `releaseSlotContent` |
| the caller | `holdSlotByKey`, `holdSingleSlot`, `holdColumnSlot` | `owner.unholdSlot(slot)`, or `unholdColumnSlot(columnSlot)` for a column |

### When a slot goes

`OIMSlotOwnerService.releaseSlotIfUnheld(slot)` is the one body every collection type runs, reached through
the slot owner that is each of its slots' `owner`. It returns having done nothing unless all of these hold:

1. the RELEASED flag is not set in `slotFlags`, and the slot is not queued in an open batch (a batch
   releases its queued slots through this same guard once it has delivered);
2. the slot is empty, or the release policy releases written slots;
3. `slot.holdCount === 0`;
4. `slot.owner === this`, so only the owner that filed the slot can release it;
5. `slot.columnSlotStore` is `undefined`, so a watched column keeps its carrier;
6. the policy agrees: `isEmptySlotReleasable(slot)` for an empty slot,
   `isSlotReleasable(slot)` for a filled one. A policy with a finite deadline that
   answers `false` has already filed the slot into its release queue.

With no policy injected, entity and bucket collections use
`OIMSlotAtEmptyReleasePolicy`, which releases empty slots and never a filled one;
computed collections use `OIMSlotAtUnholdReleasePolicy`.
`OIMSlotNeverReleasePolicy` refuses even an empty slot.

A slot that passes all of this is released at once, inside a flush too: nothing holds it, so nothing hears it.
The release lets the content service release the content, marks the slot empty, cancels any
queued release, unfiles the slot from its store slot's store (for a single, `store.slot` becomes
`undefined`) and sets the RELEASED flag.

Nothing calls this as a command. These ask: the writes and clears of each content service,
`OIMSlotOwner.unholdSlot` when the count reaches zero (which covers an effect
unsubscribing and the unused-slot collector giving back), the policy's `onSlotIdle`, which
`OIMSlotOwnerService.onSlotLastUnsubscribed` asks when the last effect leaves, when the policy says so, and the release queue at a deadline. A door asked to
work with a released slot throws by name (`assertOIMSlotNotReleased`, reached
from `holdSlot` and from every content write through `assertWritable`).

A column slot has its own rule, in `OIMColumnSlotOwner.releaseSlotIfUnheld`: it goes
when nothing holds it. Removing the carrier's last column sets
`carrierSlot.columnSlotStore` back to `undefined` and then calls
`carrierSlot.owner.releaseSlotIfUnheld(carrierSlot)`.

### The collectors

| Service | What it releases |
|---|---|
| `OIMUnusedSlotCollectorService` | gives back the holds it took (see above) at its `flush`. `open`, `close` and `run(collectorSlot, body)` nest a scope that defers the give-back |
| `collectorSlot.afterWriteSlotReleaseWheel` | slots whose `releaseDueAfterWriteMs` has passed |
| `collectorSlot.afterIdleSlotReleaseWheel` | slots whose `releaseDueAfterIdleMs` has passed |
| `collectorSlot.afterUnholdSlotReleaseWheel` | slots whose `releaseDueAfterUnholdMs` has passed |

The three release wheels are one class, `OIMSlotReleaseWheel`, built with the marker each reads and the
bit of `slotFlags` that says a slot is on it. A db creates none of them up front: the first timed policy
that needs one creates it through `mintOIMAfterWriteSlotReleaseWheel(collectorSlot)` and its after-idle and after-unhold twins. Each is an `OIMSlotWheel`: slots bucketed into slices of
`OIM_SLICE_LENGTH_MS` (1024 ms), re-filed if their deadline moved, with the slices, the timer and the clock
inside the object. Each runs on the db's timer and hands a throw from a timed release to the db's error
policy. `OIMSlotRefetchWheel` is the same wheel for refetching: created by whoever needs it on a db, whose timer,
clock and error policy it takes, with no marker on the slot, handing its listener every unreleased slot that came due.

## Reactivity

### A write

`OIMChannelService.INSTANCE.write(channelSlot, slot)` checks `assertNotFlushing` and calls
`writeWithoutFlushCheck`. The content services call `writeWithoutFlushCheck` directly, after their own
`assertWritable`. The door:

1. returns at once when `slot.holdCount` is 0, since no effect is filed on, and no
   computed reads, a slot nobody holds;
2. advances `clock.revision`. An epoch holds `OIM_REVISIONS_PER_EPOCH` (2^30)
   revisions, `0` through `2^30 − 1`, so the counter stays a small integer under
   V8 pointer compression; the write after the last one starts the next epoch
   at `0`. The epoch is an int32 that wraps past `2^31 − 1`, and two readings are
   compared by `(epoch − sinceEpoch) | 0`, so the order holds across the wrap;
3. if the slot was not already changed since the frame opened
   (`isChangedInCurrentFrame`), queues each effect in `slot.effects`, skipping one
   already queued and one subscribed through a column group (those are woken by
   `wakeColumnFilteredSubscribers` with the changed columns). An effect is queued at most once per frame, and a
   second write to the same slot in the frame queues nothing;
4. stamps `changedAtRevision` and `changedAtEpoch` on the slot;
5. asks the scheduler for a flush when step 3 ran — the slot had effects and was first written this frame,
   even if every effect was a column-group one and none was queued — or, when no flush is requested yet,
   when after-each-frame handlers or queued effects are waiting. With no `channelScheduler`
   nothing is asked, and the frame runs when `flush()` is called.

The entity content service's write path marks each changed column that has a column slot
filed (`markColumnsChanged` on its `OIMPushColumnSlotOwner`), then writes the entity
slot, and then hands the slot to the content-change listeners of
`slot.storeSlot`, such as an index. A bucket content service writes the bucket slot the
same way. Nothing writes a computed slot or a store slot to the channel, so no
write announces "something in this collection changed"; an index keyed on a
constant gives that.

A batch on a writable collection (`openBatch` / `closeBatch` / `writeInBatch` on `OIMWritableSlotCollectionService`:
an entity or a hand-made bucket collection) counts its depth on the store slot.
While it is open, the content changes are queued on the store slot instead of handed to the listeners, and
the outermost `closeBatch` delivers them in one call. The channel does not know about batches: a flush
inside a batch runs as usual.

### Subscribing: the graph is folded once

An effect is a plain `TOIMEffect` object. `createEffect` drops duplicate computed sources and folds them,
with the direct source slots, down to root slots once (`mergeOIMRootSlots`). Each computed caches its own
fold as `rootSlots` (`getOIMRootSlots`), so a computed shared by many effects is
folded once. A computed whose only source is one computed has no fold of its own: it hands on its
source's, so it follows that source when the source re-tracks. The effect is then filed on every root and on every computed source
through `owner.subscribeToSlot`, which takes a hold on each; the slot's owner is
the only writer of `effects` and `effectEdges`. `disposeEffect(effect)` gives all
of it back. A root reached only through a computed is filed and held like any
other.

A write never walks the graph. It reaches only the effects filed on the slot it
stamped, and no computed in between is touched, marked or queued.

An effect is stamped at birth with the channel slot's clock, so it hears only what
moves after it. A body may return a function, which is kept as the cleanup and
run before the next body and on dispose. `runEffect` runs a body unconditionally;
`createAndRunEffect` uses it to deliver a first value.

With source tracking (`createSourceTrackingEffect`), the body runs once at creation and
every read of `slot.entity`, `slot.getEntity(columnGroup)`, `computed.value` or a bucket slot's
membership is filed: the read goes through the slot's owner to the tracker of the body running
now (`OIMSourceTracker`, internal to the engine). That active tracker has one writer,
`swapOIMActiveSourceTracker` (internal): a tracked run sets its tracker through it, a computed refresh sets
none so its own reads are not filed on the reader, and each puts the outer tracker back when it ends. The folding and
re-subscribing happen again only when the set of sources a run read differs from
the set the last run read.

### Reading a computed

A computed is pulled. Reading `computedSlot.value` (the value service's `getValueForSlot`)
returns at once if the slot was already checked at the current revision.
Otherwise it refreshes the computed's own computed sources, compares each
source's revision with the computed's last run (`hasOIMSourceChangedSinceLastRun`),
and derives again only if one moved. The new value goes through `sameValueGuard`
(`Object.is` unless the service is given another): an equal value is not
published, and the computed's change stamp does not move. That is one comparison
per source on the read, made only when something reads the computed.

Signal libraries do the opposite: each write marks every dependent below the
written signal dirty, so the write pays for the depth and width of the graph
under it. Here the write pays for one slot, and the read pays one comparison per
source.

### The flush

`OIMChannelService.INSTANCE.flush(channelSlot)` throws inside a running frame,
and returns having done nothing when called from the tail of a flush
(`onBeforeFlush` or an after-each-frame handler). Otherwise:

1. If there is nothing to run (no queued effect, no after-each-frame handler, no
   `onBeforeFlush`), it moves the frame's opening clock to now and skips to step 6.
2. It cancels the scheduled wake and calls `onBeforeFlush`.
3. It marks the frame running and reads the queue's length once. Nothing can join
   the queue while the frame runs: writes are refused, and an effect created or
   re-subscribed during the frame is not queued.
4. For each queued effect it calls `runScheduledEffect` through the effect's `IOIMEffectService`
   (`effect.effectService`); the rest of this step is what `OIMEffectService.runScheduledEffect` does
   internally. It skips one whose run `disposeEffect` cancelled. An
   effect a write queued, that reads no computed and has not run since the frame
   opened, runs directly through `runEffect`: the write that queued it landed after
   its last run, so asking its sources again could only say yes. Every other effect
   goes through `runEffectIfSourcesChanged`, which refreshes its computed sources
   (`refreshOIMSourceComputeds`) and runs the body only if a source moved after
   the effect last ran. That covers an effect with a computed source, which may
   re-derive to the same value, and an effect queued on speculation: one created while writes of an open
   batch were pending, or re-subscribed by source tracking to a source already written in that batch.
5. It marks the frame done, sets the frame's opening clock to now (so
   `isChangedInCurrentFrame` answers for the next frame), and calls the
   after-each-frame handlers (`subscribeAfterEachFrame`).
6. In a `finally`, it lowers the flushing flag, flushes the unused-slot collector
   and calls the after-each-flush handlers (`subscribeAfterEachFlush`).

An effect created inside a running frame is never queued. Its body first runs on
a later write to one of its sources, unless it was created with
`createAndRunEffect` or with source tracking, which run it once at creation.

Every throw from `onBeforeFlush`, an effect, a handler or the unused-slot
collector goes to the db's `errorPolicy` as it happens. The default,
`OIMLogAndContinueErrorPolicy`, logs it and continues with the next item;
`OIMThrowAtOnceErrorPolicy` throws it out of `flush()`.

### Why a flush does not drain

`isRefusingWrites` is up from `onBeforeFlush` through the last after-each-frame
handler, and `assertNotFlushing` refuses any write in that span. The
after-each-flush handlers run after it is lowered. Signal libraries instead let an
effect write and run whatever that write wakes in the same pass, until nothing is
left. oimdb does not, on purpose:

- A drain is where recomputation loops and endless cycles come from. An effect that
  writes a source another effect reads, which writes back, runs until a pass limit
  throws, or forever. A refused write turns that into an error at the line that
  wrote.
- A drain makes the queue a moving target. The frame would have to re-open its
  clock on every pass, re-check what each pass changed, and count passes. Without
  it the queue is filled before the frame and read once.
- A source recomputed during a flush is an application doing a computed's job by
  hand. A value that follows from other values is a computed, pulled when read
  after every write of the frame has landed, so the channel stops such a write at
  the line that made it. Write from outside the flush (an event handler, a fetch
  callback, a timer), or derive with a computed.

What an effect does is read the store and act outside it: render, persist, send.

## Where a strategy is picked at construction

Each fork ships every strategy, injected once; no flag is read on a hot path.

| Fork | Strategies | Chosen at |
|---|---|---|
| how a write lands | `createOIMInPlaceEntityWriter` / `createOIMReplacingEntityWriter` | `entityWriter` on the entity factory's options, or on `OIMDB`'s |
| how an inserted entity is stored | `insertOIMEntityWithoutCopy` / `insertOIMEntityWithCopy` / `insertOIMEntityWithSanitizedCopy` | `entityInserter` on the writer's options |
| how a whole-entity put walks | `putOIMEntityColumns` / `guardOIMEntityColumnsPut` | `putEntityColumns` on the writer's options |
| what shape a bucket keeps | `OIMSetBucketContentService` / `OIMPositionalArrayBucketContentService` / `OIMSortedArrayBucketContentService` | `slotContentService` on the bucket or index factory; the positional doors exist only on the array-driven one |
| whether an ordered list records a slot twice | `OIMPositionalArrayBucketContentService` / `OIMBucketUniqueMemberSlotsArrayService` | `slotContentService` on the bucket factory |
| whether a bucket records a render script | `OIMBucketCommands` / `OIMNoBucketCommands` | `bucketCommands` on the bucket content service's options |
| who decides a bucket's members | a bucket collection (the caller) / an index (the entity's own column values) | which factory you call |
| whether and when a slot is released | `OIMSlotAfterWriteReleasePolicy` / `OIMSlotAfterIdleReleasePolicy` / `OIMSlotAfterUnholdReleasePolicy` / `OIMSlotAtUnholdReleasePolicy` / `OIMSlotAtEmptyReleasePolicy` / `OIMSlotNeverReleasePolicy` / `OIMSlotEarliestReleasePolicy` | `slotReleasePolicy` on the factory's options, or on `OIMDB`'s for entity, bucket and index collections |
| how a key is filed | `OIMSlotMapStoreService` / `OIMSlotTreeStoreService` (an `IOIMSlotStoreService`); a single files its one slot in `OIMSingleSlotStoreService`, an `IOIMSlotFilingService` the single services pick themselves | `slotStoreService`, `bucketSlotStoreService` or `slotStoreService` on the factory's options |
| how a key chain is walked | `OIMScalarKeyTreeWalk` / `OIMCompositeKeyTreeWalk` | `OIMSlotTreeStoreService`'s constructor |
| how an index's cell positions are reused | `OIMAppendingIndexKeysService` / `OIMReclaimingIndexKeysService` | `indexKeysService` on `OIMDB`'s options |
| what counts as empty | any `IOIMSlotEmptinessPolicy` | `slotEmptinessPolicy` on the entity factory's options, or `defaults.entitySlotEmptinessPolicy` |
| when a frame runs | manual `flush()` / a `channelScheduler` | `OIMDB`'s options |
| what a throw in a flush does | `OIMLogAndContinueErrorPolicy` / `OIMThrowAtOnceErrorPolicy` | `errorPolicy` on `OIMDB`'s options |
| how an effect finds its sources | declared lists / an `OIMSourceTracker` | `createEffect` / `createSourceTrackingEffect` |

## Where to next

<DocCards>
<DocCard to="/docs/core/model" title="The model">Slots, doors and frames as a consumer meets them.</DocCard>
<DocCard to="/docs/core/collections" title="Collections and identities">Stores and keys.</DocCard>
<DocCard to="/docs/core/writing" title="Writing">The write API.</DocCard>
<DocCard to="/docs/core/reading-subscribing" title="Reading and subscribing">Effects and columns.</DocCard>
<DocCard to="/docs/core/channel" title="The channel: frames and batches">Channels and their frame rules.</DocCard>
<DocCard to="/docs/core/lifecycle" title="Slot lifecycle">Minting, holding and release in practice.</DocCard>
<DocCard to="/docs/core/indexes" title="Buckets">Bucket content services and positions.</DocCard>
<DocCard to="/docs/core/oimindex" title="Indexes">The auto-index.</DocCard>
<DocCard to="/docs/core/computed-effects" title="The compute graph">Computed slots and chains.</DocCard>
</DocCards>
