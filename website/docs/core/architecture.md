---
sidebar_position: 11
description: The source layout of @oimdb/core by layer and domain, the slot and store-slot shapes, who mints and holds a slot, and where strategies are chosen.
---

# Architecture

This page describes `@oimdb/core` as its source stands. Paths are relative to
`packages/core/src/` unless they start with `tests/`, and `index.ts` is the whole
public surface: nothing outside it is reachable from a consumer.

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
| `engine/error` | what a throw caught during a flush becomes | `OIMErrorPolicyLogAndContinue`, `OIMErrorPolicyThrowAtOnce` |
| `engine/slot` | identity, holds, emptiness, release, content-change listeners and their delivery | `OIMSlotOwner`, `OIMSlotOwnerService`, `OIMContentChangeListenerService`, `OIMContentChangeDeliveryService`, `OIMStoreSlotListenerNone`; `TOIMSlot`, `TOIMStoreSlot` |
| `engine/store` | how slots are filed under a key | `OIMSlotStoreServiceMapDriven`, `OIMSlotStoreServiceTreeDriven`, `OIMSlotStoreServiceSingleSlotDriven` |
| `engine/key` | how a composite key is walked | `OIMKeyTreeWalk` (abstract), `OIMKeyTreeWalkScalar`, `OIMKeyTreeWalkComposite` |
| `engine/bucket` | how an array bucket remembers a mention, and the render script | `array/`: `OIMBucketArrayMembershipNonUnique`, `OIMBucketArrayMembershipUnique`; `commands/`: `OIMBucketCommandsNone`, `TOIMOrderedListCommand`, `oimOrderedListCommandsOfTransition` |
| `engine/entity` | entity slots and how a write lands on them | `OIMSlotContentEntityService`, `OIMSlotEmptinessByEntityPresence`; `IOIMEntityWriter`, `TOIMEntitySlot` |
| `engine/column` | column slots, carried by an entity, bucket or computed slot | `OIMColumnOwner` (abstract), `OIMColumnOwnerPushDriven`, `OIMColumnOwnerPullDriven`, `OIMColumnSlotStoreServiceOrdinalDriven`; `TOIMColumnSlot`, `TOIMComputedColumnSlot` |
| `engine/computed` | derivations and effects | `OIMComputedValueService`, `OIMComputedSourcesService`, `OIMSlotContentComputedStrategy`, `OIMEffectService`, `OIMEffectSourceTracker`, `OIMEffectSourceList`; `TOIMComputedSlot`, `TOIMComputedStoreSlot`, `TOIMEffect` |
| `engine/index` | the per-index key cell on each slot, and an index's store slot | `OIMIndexKeysService` (abstract), `OIMIndexKeysServiceAppending`, `OIMIndexKeysServiceReclaiming`; `TOIMIndexStoreSlot` |
| `engine/collector` | what releases a slot, and when | `OIMUnusedSlotCollectorService`, `OIMReleaseSlotCollectorService` (abstract) with `OIMReleaseSlotCollectorServiceAfterWrite`, `OIMReleaseSlotCollectorServiceAfterIdle`, `OIMReleaseSlotCollectorServiceAfterUnhold`, `OIMReleaseSlotQueueService`, and the `IOIMSlotReleasePolicy` implementations listed under [strategies](#where-a-strategy-is-picked-at-construction) |
| `facade/slot` | the read doors of a collection, keyed or single | `OIMSlotColumnService` (abstract), `OIMSlotCollectionService`, `OIMSingleSlotService` |
| `facade/bucket` | the bucket content services and the recorder | `OIMSlotContentBucketService` (abstract), `OIMSlotContentBucketServiceArrayBased` (abstract), `OIMSlotContentBucketServiceArrayDriven`, `OIMSlotContentBucketServiceSetDriven`, `OIMSlotContentBucketServiceSortedArrayDriven`, `OIMBucketCommands` |
| `facade/index` | the auto-index | `OIMIndexService`, `OIMIndexServiceSortedArrayDriven` |
| `facade/computed` | the computed collections | `OIMComputedService`, `OIMComputedServiceSorted`, `OIMComputedServiceBucketMemo` |

`OIMFlushSchedulerService` is the base of the two things a timer fires: the channel and the release
collectors. Its state is a `TOIMFlushSchedulerSlot` (`timer`, `scheduledCallback`, `timerDisposer`): it holds
one timer and the one callback it handed that timer; a callback that is no longer the standing one (a wake
the host could not cancel) does nothing when it fires. The unused-slot collector has no timer of its own and
is flushed by the channel.

Every stateless service is reached through a static `INSTANCE` where it has no configuration
(`OIMChannelService.INSTANCE`, `OIMEffectService.INSTANCE`, `OIMContentChangeListenerService.INSTANCE`, the
collector services, the release policies without a window). A service with configuration — a content
service, a collection service, a policy with a window — is built once by a factory and shared by every store
slot of its type.

## Collection types and store slots

A service holds no collection. A collection is a store slot:
`collectionService.createStoreSlot(db)` returns a `TOIMStoreSlot` carrying the keyed `store`, the channel
slot, that instance's content-change listeners and its column state, and every slot minted there carries it
back as `slot.storeSlot`. Only the services read `store`. `OIMDefaults.STORE_SLOT_LISTENER` is told of every
store slot created.

A collection type is:

- **a content service** — `OIMSlotContentEntityService`, one of the `OIMSlotContentBucketService*`, or a
  computed's `OIMComputedValueService` with `OIMSlotContentComputedStrategy`. It is the strategy for what a
  slot holds: it gives the slot owner an `IOIMSlotContentStrategy` (`createSlot(key, storeSlot, owner)`,
  `isSlotEmpty(slot)`, `releaseSlotContent(slot, owner)`, `hasReference(slot)`) and has the writes;
- **the slot owner** (`OIMSlotOwnerService`, an `OIMSlotOwner`) built with it — the holds, subscriptions,
  columns and release of every slot of that type, over its store service, release policy, slot stamp and
  column owner;
- **a collection service** over both — `OIMSlotCollectionService` (or `OIMSingleSlotService`), the read doors
  by key and the column doors. Its `slotContentService` is the content service.

The doors follow from that. A door that works on a whole collection takes the
store slot first: `getSlotByKey(storeSlot, key)`, `holdSlotByKey`, `findSlotByKey`, `hasSlotContentByKey`,
`getSlots`, `getSlotCount` on the collection service; `upsertEntity`, `insertEntity`, `insertEntities`,
`fillEntities`, `clearAllEntities`, `deleteEntities` on the entity content service. A door that works on one
slot takes only the slot, since the slot names its store slot: the content writes (`updateEntity`,
`addBucketMemberSlots`, …) and `slot.owner.releaseSlotIfUnheld(slot)`.

A single is the same content service with the key type `void`, built over
`OIMSlotStoreServiceSingleSlotDriven.INSTANCE`, under an `OIMSingleSlotService`. Its store is `{ slot }`
(`TOIMSingleSlotStore`, with `slot` `undefined` until one is minted), and its reads are
`getSingleSlot` / `holdSingleSlot` / `findSingleSlot` / `hasSingleSlotContent`.

| Class | File | Parts and doors |
|---|---|---|
| `OIMSlotCollectionService` | `facade/slot/OIMSlotCollectionService.ts` | public `slotContentService`; `createStoreSlot(channelMap)`, `createStoreSlotFrom(sourceStoreSlot)`, the keyed reads; the column doors, inherited from `OIMSlotColumnService` |
| `OIMSingleSlotService` | `facade/slot/OIMSingleSlotService.ts` | the same for a single: the single reads and the column doors |
| `OIMSlotContentEntityService` | `engine/entity/OIMSlotContentEntityService.ts` | `keyOf`, `slotOwner`, `slotStoreService`; every entity write door and `findEntityByKey` |
| `OIMSlotContentBucketService` | `facade/bucket/OIMSlotContentBucketService.ts` | abstract; the member writes and reads every bucket strategy has; protected `addSlot`, `removeSlot`, `removeSlots`, `reconcileSlots`, `drainSlots` each strategy implements |
| `OIMSlotContentBucketServiceSetDriven` | `facade/bucket/OIMSlotContentBucketServiceSetDriven.ts` | no positional doors |
| `OIMSlotContentBucketServiceArrayDriven` | `facade/bucket/OIMSlotContentBucketServiceArrayDriven.ts` | two positional reads (from `OIMSlotContentBucketServiceArrayBased`) and five positional writes |
| `OIMSlotContentBucketServiceSortedArrayDriven` | `facade/bucket/OIMSlotContentBucketServiceSortedArrayDriven.ts` | the buckets an `OIMIndexServiceSortedArrayDriven` keeps sorted; `repositionBucketMemberSlot` |
| `OIMBucketCommands` | `facade/bucket/OIMBucketCommands.ts` | records the frame's render script onto a bucket slot |
| `OIMIndexService` | `facade/index/OIMIndexService.ts` | a collection service of buckets whose `slotContentService` is typed to the reads; `createIndexStoreSlot(sourceStoreSlot)` returns a `TOIMIndexStoreSlot` and registers a content-change listener on the source entity store slot, which files each entity into a bucket by its derived key; `disposeIndexStoreSlot` takes it back; `getEntitiesByKey`, `getSlotsByKeys`, `holdSlotsByKeys`, the bucket column doors |
| `OIMComputedService` | `facade/computed/OIMComputedService.ts` | public `computedCollectionService`. `createComputedStoreSlot(channelMap, derive?, createSources?)` needs both functions, from the store slot or from the service options |
| `OIMComputedServiceSorted` | `facade/computed/OIMComputedServiceSorted.ts` | `computedCollectionService`; `createSortedStoreSlot(indexStoreSlot)` gives, per key, that index bucket's entity slots sorted |
| `OIMComputedServiceBucketMemo` | `facade/computed/OIMComputedServiceBucketMemo.ts` | `computedCollectionService`; `createBucketMemoStoreSlot(bucketStoreSlot)` gives, per key, a bucket's member slots as an array |

## `factories/`

| Export | File | What it builds |
|---|---|---|
| `OIMDB` | `factories/OIMDB.ts` | the clock, the collector slot and the default channel slot over them, plus the `entityWriter`, `slotStamp`, `slotReleasePolicy` and `indexKeysService` it was handed, which the `create*` functions read; `flush()` flushes the default channel slot |
| `OIMDefaults` | `factories/OIMDefaults.ts` | the lazily built default of each optional dependency |
| `OIMDefaultValue` | `factories/defaults/OIMDefaultValue.ts` | one such default: `getValue()` builds it once, `setValue` refuses after that |
| `createOIMSlotContentEntityService` | `factories/createOIMSlotContentEntityService.ts` | an entity content service and its slot owner; Map store unless you pass `slotStoreService` |
| `createOIMSlotCollectionService` | `factories/createOIMSlotCollectionService.ts` | a collection service over a content service |
| `createOIMSingleSlotService` | `factories/createOIMSingleSlotService.ts` | a single slot service over a content service |
| `createOIMEntityService` / `createOIMSingleEntityService` | `factories/createOIMEntityService.ts` / `createOIMSingleEntityService.ts` | convenience wrappers: the two calls above for a keyed or single entity collection |
| `createOIMBucketService` / `createOIMSingleBucketService` | `factories/createOIMBucketService.ts` / `createOIMSingleBucketService.ts` | a bucket collection over a bucket content service, array-driven with an `OIMBucketCommands` unless you pass `slotContentService` |
| `createOIMIndexService` | `factories/createOIMIndexService.ts` | an index over an entity collection service; array-driven buckets without commands unless you pass `slotContentService` |
| `createOIMIndexServiceByCompositeKey` | `factories/createOIMIndexServiceByCompositeKey.ts` | an index whose buckets are filed by a chain of values in a tree-driven store |
| `createOIMIndexServiceSortedArrayDriven` | `factories/createOIMIndexServiceSortedArrayDriven.ts` | an index whose buckets are kept sorted by `sortColumns` |
| `createOIMComputedService` | `factories/createOIMComputedService.ts` | an `OIMComputedService`; no db |
| `createOIMComputedServiceSorted` | `factories/createOIMComputedServiceSorted.ts` | an `OIMComputedServiceSorted` over an index service, sorted by `sortColumns` or `comparator`; no db |
| `createOIMComputedServiceBucketMemo` | `factories/createOIMComputedServiceBucketMemo.ts` | an `OIMComputedServiceBucketMemo` over a bucket collection service; no db |
| `createOIMEntityWriterInPlace` | `factories/createOIMEntityWriterInPlace.ts` | the writer that mutates `slot.entity` |
| `createOIMEntityWriterReplacing` | `factories/createOIMEntityWriterReplacing.ts` | the writer that puts a new object on `slot.entity` |

The option types of these functions are in `factories/types/`.

`OIMDefaults` is static and lazy. Once an entry's `getValue` has handed something
out, its `setValue` throws rather than leave two implementations live in one
process, so set defaults at startup or not at all.

## A slot

`engine/slot/types/TOIMSlot.ts` is the shape every slot carries: `effects`,
`effectEdges`, `changedAtRevision`, `changedAtEpoch`, `holdCount`,
`releaseDueAfterWriteMs`, `releaseDueAfterIdleMs`, `releaseDueAfterUnholdMs`,
`slotFlags`, `columnSlotStore` (the column slots it carries, `undefined` while
none), `storeSlot` (the store slot it is filed in, `undefined` for a column slot)
and `owner`. Every field is `readonly`; only `TOIMSlotEditable<TSlot>` strips
that, so code that writes a field has to name itself.

| Type | What it adds |
|---|---|
| `TOIMKeyedSlot` | `key` |
| `TOIMIndexableSlot` | keyed, plus `indexKeys`, the engine's per-index cells |
| `TOIMEntitySlot` | indexable, plus `entity` and `data` (the consumer's; clearing or removing the slot does not reset it) |
| `TOIMBucketSlot` | indexable, plus `bucketSlotsStore` (the members); `commands` and `isWholeListRecorded` (this frame's render script); `commandsStartedAtRevision` and `commandsStartedAtEpoch` (the clock the script started at, so a script older than the frame is cleared before anything is recorded into it); `wasEmptyBeforeChange` and `isChangedAgainInSubframe` |
| `TOIMComputedSlot` | indexable, plus `computedValueService`, `value`, `sourceSlots`, `sourceComputeds`, `allRootSlots`, `ranAtRevision`/`ranAtEpoch`, `checkedAtRevision`/`checkedAtEpoch`, `isDeriving`; its `owner` is the slot owner of the collection that minted it |
| `TOIMColumnSlot` | `carrierSlot`, the entity or bucket slot it hangs off, and a `string` key |
| `TOIMComputedColumnSlot` | a `TOIMComputedSlot` keyed by a column name whose only source is the carrier computed; its value is that field of the carrier's value |

A store slot is not a slot. `TOIMStoreSlot` has no owner, hold count or effects:
it carries `store`, `channelSlot`, the content-change listeners with the columns each reads, the column
reader counts and column groups, the per-index positions, and the queues that hold content changes and
bucket member changes until a subframe closes. `TOIMComputedStoreSlot` adds `derive` and `createSources`;
`TOIMIndexStoreSlot` adds `sourceStoreSlot`, the listener it registered there, its `indexKeysPosition` and
`isDisposed`. The channel slot `TOIMChannelSlot` carries the clock, the frame, the effect queue, the
subframe counters, the after-frame and after-flush handlers and the collector slot.

## Object shapes

V8 gives every object a hidden class (a *map*) and reads a field at a fixed
offset when every object reaching a site shares one. It drops an object to
dictionary mode, where every read is a hash lookup, when the object is grown
property by property past a small count, when it is built from an object literal
with about a thousand keys, or when any property is `delete`d. Nothing the engine
allocates goes through any of these.

- Each slot kind is one object literal in one function, with every field present
  at birth: `createOIMEntitySlot`, `createOIMBucketSlot`, `createOIMComputedSlot`
  (which `OIMColumnOwnerPullDriven` also uses for a computed's column slot), and
  the column slot literal in `OIMColumnOwnerPushDriven`. A field that has no value
  yet holds `undefined` or `-1`. Nothing adds a field to a slot later or deletes one.
- An index's cell on a slot is a position in `indexKeys`, so a tenth index adds no
  property to any slot.
- Holds, unholds, effects attaching and detaching, a move between buckets, a
  release deadline written into `releaseDueAfterUnholdMs`, and a patch all leave a
  slot on the map its literal gave it.
- `tests/how-many-shapes-reach-the-write-door.test.ts` counts the shapes reaching
  the channel's write door at three, one below V8's polymorphic ceiling of four, and
  `holdSlot` at four (the three plus the computed slot). A single's slot comes from
  the same literal as a keyed one and adds no shape.
- Neither entity writer deletes a column or builds an entity key by key. A column a
  PUT drops, or `deleteColumns` takes away, is written `undefined` and its key
  stays. `createOIMEntityWriterInPlace` writes into the stored object;
  `createOIMEntityWriterReplacing` writes into a spread copy (`oimCopyEntity`),
  which keeps the source's map. The guarded walk arms (`oimPutEntityColumnsGuarded`,
  `oimPatchEntityColumnsGuarded`, `oimPatchEntityColumnGuarded`) skip an own `__proto__` key. A
  column holding `undefined` counts as absent: it reads `undefined`, a later write
  that leaves it out does not report it again, and taking the entity away does not
  wake its readers.

`tests/what-v8-keeps-on-fast-properties.test.ts` checks this through V8's own
natives ("is this object on fast properties", "do these two share a map"): every
slot kind after a full scenario, under no release policy and under one that writes
a deadline, and an entity under each writer after a column leaves, after one is
added, after a column delete, and at forty columns.

An entity handed in with a few hundred fields is already in dictionary mode when
`JSON.parse` or a literal produces it, and so is its copy. That case is outside
the engine's reach.

## Lifetime

### Who mints

| Door | What keeps the slot |
|---|---|
| `getSlotByKey(storeSlot, key)`, `getSingleSlot(storeSlot)` | the unused-slot collector, which holds the new slot and gives the hold back at the next flush |
| `holdSlotByKey(storeSlot, key)`, `holdSingleSlot(storeSlot)` | the caller's hold |
| `insertEntity(storeSlot, key, entity)`, and `upsertEntity`, `upsertEntities` | the content; an entity that lands empty is held by the unused-slot collector until the flush |
| `insertEntities(storeSlot, entities)`, `fillEntities(storeSlot, keys, entities)` | the content at every position; a key that is taken or named twice throws and rolls back only what that call filed, and `fillEntities` refuses outright if the store slot already holds anything |
| `getColumn(slot, columnName)`, `getAnyColumn`; `holdColumn`, `holdAnyColumn`, `holdColumnGroup` | a column slot under its carrier, minted by the column owner and kept by the unused-slot collector or by the caller's hold |

The getters and holds mint through the slot owner: `createSlot` (the content strategy's), then file the
slot. For a single the path is the same with the key `undefined`, and
`OIMSlotStoreServiceSingleSlotDriven` files the slot as the store's `slot`. A first value asks the release
policy's `onSlotIdle` only when the policy schedules releases on write and the slot goes from empty to filled
with no effect filed on it, so a slot minted empty is on no release clock. `insertEntity` creates the slot,
writes the content and only then files it, so a refused write leaves nothing filed.

`findSlotByKey(storeSlot, key)` is the lookup that does not mint; `findEntityByKey` and
`hasSlotContentByKey` are built on the same store lookup, so neither mints the entity it was asked about.
There are no by-key write doors.

### Who holds

`OIMSlotOwner` is the only writer of `holdCount`: `holdSlot` raises it,
`unholdSlot` lowers it (`engine/slot/OIMSlotOwner.ts`).

| Holder | Takes the hold in | Gives it back in |
|---|---|---|
| an effect, on every root slot and computed source it is filed on | `OIMEffectService.INSTANCE.createEffect`, through `owner.subscribeToSlot` | `disposeEffect` |
| the unused-slot collector, on what a getter minted and on a slot whose release must wait for the flush | `OIMUnusedSlotCollectorService.INSTANCE.holdSlotUntilFlush` | its `flush`, which the channel's flush calls in a `finally` |
| a bucket, on every member that arrived | the bucket content service's writes (`writeBucketMemberSlots`, `addBucketMemberSlots`, …) | the member departing, or the bucket's content being released |
| a computed's owner, on a computed's `sourceSlots` and `sourceComputeds` | the computed content strategy's `createSlot` | its `releaseSlotContent` |
| the caller | `holdSlotByKey`, `holdSingleSlot`, `holdColumn` | `owner.unholdSlot(slot)`, or `unholdColumn(columnSlot)` for a column |

### When a slot goes

`OIMSlotOwnerService.releaseSlotIfUnheld(slot)` is the one body every collection type runs, reached through
the slot owner that is each of its slots' `owner`. It returns having done nothing unless all of these hold:

1. the RELEASED flag is not set in `slotFlags`;
2. the slot is empty, or the release policy releases written slots;
3. `slot.holdCount === 0`;
4. `slot.owner === this`, so only the owner that filed the slot can release it;
5. `slot.columnSlotStore` is `undefined`, so a watched column keeps its carrier;
6. the content strategy's `hasReference(slot)` is false;
7. the policy agrees: `isEmptySlotReleasable(slot)` for an empty slot,
   `isSlotReleasable(slot)` for a filled one. A policy with a finite deadline that
   answers `false` has already filed the slot into its release queue.

With no policy injected, entity and bucket collections use
`OIMSlotReleasePolicyAtEmpty`, which releases empty slots and never a filled one;
computed collections use `OIMSlotReleasePolicyAtUnhold`.
`OIMSlotReleasePolicyNever` refuses even an empty slot.

A filled slot that passes all of this while the channel refuses writes is handed
to the unused-slot collector and tried again when it gives the hold back.
Otherwise the release lets the content strategy release the content, marks the slot empty, cancels any
queued release, unfiles the slot from its store slot's store (for a single, `store.slot` becomes
`undefined`) and sets the RELEASED flag.

Nothing calls this as a command. These ask: the writes and clears of each content service,
`OIMSlotOwner.unholdSlot` when the count reaches zero (which covers an effect
unsubscribing and the unused-slot collector giving back), `onSlotIdle` when the
last effect leaves and the policy says so, and the release queue at a deadline. A door asked to
work with a released slot throws by name (`oimAssertSlotNotReleased`, reached
from `holdSlot` and from every content write through `assertWritable`).

A column slot has its own rule, in `OIMColumnOwner.releaseSlotIfUnheld`: it goes
when nothing holds it. Removing the carrier's last column sets
`carrierSlot.columnSlotStore` back to `undefined` and then calls
`carrierSlot.owner.releaseSlotIfUnheld(carrierSlot)`.

### The collectors

| Service | What it releases |
|---|---|
| `OIMUnusedSlotCollectorService` | gives back the holds it took (see above) at its `flush`. `open`, `close` and `run(collectorSlot, body)` nest a scope that defers the give-back |
| `OIMReleaseSlotCollectorServiceAfterWrite` | slots whose `releaseDueAfterWriteMs` has passed |
| `OIMReleaseSlotCollectorServiceAfterIdle` | slots whose `releaseDueAfterIdleMs` has passed |
| `OIMReleaseSlotCollectorServiceAfterUnhold` | slots whose `releaseDueAfterUnholdMs` has passed |
| `OIMReleaseSlotQueueService` | the structure under all three: slots bucketed into slices of `OIM_SLICE_LENGTH_MS` (1024 ms), re-queued if their deadline moved |

The three release collectors are one abstract class, `OIMReleaseSlotCollectorService`, over
`getReleaseDueMs`; each subclass reads its own marker. Their state is one release collector slot each, on
the db's `collectorSlot`. Each runs on the db's timer and hands a throw from a timed release to the db's
error policy.

## Reactivity

### A write

`OIMChannelService.INSTANCE.write(channelSlot, slot)` checks `assertNotFlushing` and calls
`writeWithoutFlushCheck`. The content services call `writeWithoutFlushCheck` directly, after their own
`assertWritable`. The door:

1. returns at once when `slot.holdCount` is 0, since no effect is filed on, and no
   computed reads, a slot nobody holds;
2. advances `clock.revision`. An epoch holds `OIM_REVISIONS_PER_EPOCH` (2^30)
   revisions, `0` through `2^30 − 1`, so the counter stays a small integer under
   V8 pointer compression; the write after the last one starts `clock.epoch + 1`
   at `0`;
3. if the slot was not already changed since the frame opened
   (`isChangedInCurrentFrame`), queues each effect in `slot.effects`, skipping one
   already queued. An effect is queued at most once per frame, and a second write to the same slot in the
   frame queues nothing;
4. stamps `changedAtRevision` and `changedAtEpoch` on the slot;
5. asks the scheduler for a flush when it queued an effect, or when
   after-each-frame handlers or queued effects are waiting. Inside an open subframe
   the request waits for the outermost `closeSubframe`. With no `channelScheduler`
   nothing is asked, and the frame runs when `flush()` is called.

The entity content service's write path marks each changed column that has a column slot
filed (`markColumnsChanged` on its `OIMColumnOwnerPushDriven`), then writes the entity
slot, and then hands the slot to the content-change listeners of
`slot.storeSlot`, such as an index. A bucket content service writes the bucket slot the
same way. Nothing writes a computed slot or a store slot to the channel, so no
write announces "something in this collection changed"; an index keyed on a
constant gives that.

`openSubframe(channelSlot)` and `closeSubframe(channelSlot)` nest around a compound write. The content
services open a content subframe (which opens a channel subframe) around a batch (`upsertEntities`,
`deleteEntities`) and around a write that has column slots or content-change listeners to tell, and deliver
the queued content changes when the outermost closes. The frame cannot run until the outermost subframe
closes, and `flush()` throws while one is open.

### Subscribing: the graph is folded once

An effect is a plain `TOIMEffect` object. `createEffect` drops duplicate computed sources and folds them,
with the direct source slots, down to root slots once (`oimMergeRootSlots`). Each computed caches its own
fold as `allRootSlots` (`oimGetAllRootSlots`), so a computed shared by many effects is
folded once. The effect is then filed on every root and on every computed source
through `owner.subscribeToSlot`, which takes a hold on each; the slot's owner is
the only writer of `effects` and `effectEdges`. `disposeEffect(effect)` gives all
of it back. A root reached only through a computed is filed and held like any
other.

A write never walks the graph. It reaches only the effects filed on the slot it
stamped, and no computed in between is touched, marked or queued.

An effect is stamped at birth with the channel slot's clock, so it hears only what
moves after it. A body may return a function, which is kept as the cleanup and
run before the next body and on dispose. `runEffect` runs a body unconditionally;
`createEffectImmediate` uses it to deliver a first value.

With source tracking (`createEffectWithSourceTracking`), the body
reads through an `OIMEffectSourceTracker` (`readSourceSlot`,
`readSourceComputedValue`) and runs once at creation. The folding and
re-subscribing happen again only when the set of sources a run read differs from
the set the last run read.

### Reading a computed

A computed is pulled. `getValueForSlot(slot)` on its `computedValueService`
returns at once if the slot was already checked at the current revision.
Otherwise it refreshes the computed's own computed sources, compares each
source's revision with the computed's last run (`oimHasSourceChangedSinceLastRun`),
and derives again only if one moved. The new value goes through `sameValueGuard`
(`Object.is` unless the service is given another): an equal value is not
published, and the computed's change stamp does not move. That is one comparison
per source on the read, made only when something reads the computed.

Signal libraries do the opposite: each write marks every dependent below the
written signal dirty, so the write pays for the depth and width of the graph
under it. Here the write pays for one slot, and the read pays one comparison per
source.

### The flush

`OIMChannelService.INSTANCE.flush(channelSlot)` throws inside a running frame or while a subframe is open,
and returns having done nothing when called from the tail of a flush
(`onBeforeFlush` or an after-each-frame handler). Otherwise:

1. If there is nothing to run (no queued effect, no after-each-frame handler, no
   `onBeforeFlush`), it moves the frame's opening clock to now and skips to step 6.
2. It cancels the scheduled wake and calls `onBeforeFlush`.
3. It marks the frame running and reads the queue's length once. Nothing can join
   the queue while the frame runs: writes are refused, and an effect created or
   re-subscribed during the frame is not queued.
4. For each queued effect it skips one whose run `disposeEffect` cancelled. An
   effect a write queued, that reads no computed and has not run since the frame
   opened, runs directly through `runEffect`: the write that queued it landed after
   its last run, so asking its sources again could only say yes. Every other effect
   goes through `runEffectIfSourcesChanged`, which refreshes its computed sources
   (`oimRefreshSourceComputeds`) and runs the body only if a source moved after
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
`createEffectImmediate` or with source tracking, which run it once at creation.

Every throw from `onBeforeFlush`, an effect, a handler or the unused-slot
collector goes to the db's `errorPolicy` as it happens. The default,
`OIMErrorPolicyLogAndContinue`, logs it and continues with the next item;
`OIMErrorPolicyThrowAtOnce` throws it out of `flush()`.

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
| how a write lands | `createOIMEntityWriterInPlace` / `createOIMEntityWriterReplacing` | `entityWriter` on the entity factory's options, or on `OIMDB`'s |
| how an inserted entity is stored | `oimInsertEntityWithoutCopy` / `oimInsertEntityWithCopy` / `oimInsertEntityWithSanitizedCopy` | `entityInsertStrategy` on the writer's options |
| how a whole-entity put walks | `oimPutEntityColumns` / `oimPutEntityColumnsGuarded` | `putEntityColumns` on the writer's options |
| what shape a bucket keeps | `OIMSlotContentBucketServiceSetDriven` / `OIMSlotContentBucketServiceArrayDriven` / `OIMSlotContentBucketServiceSortedArrayDriven` | `slotContentService` on the bucket or index factory; the positional doors exist only on the array-driven one |
| whether an ordered list records a slot twice | `OIMBucketArrayMembershipNonUnique` / `OIMBucketArrayMembershipUnique` | `bucketArrayMembership` on `OIMSlotContentBucketServiceArrayDriven`'s options |
| whether a bucket records a render script | `OIMBucketCommands` / `OIMBucketCommandsNone` | `bucketCommands` on the bucket content service's options |
| who decides a bucket's members | a bucket collection (the caller) / an index (the entity's own column values) | which factory you call |
| whether and when a slot is released | `OIMSlotReleasePolicyAfterWrite` / `OIMSlotReleasePolicyAfterIdle` / `OIMSlotReleasePolicyAfterUnhold` / `OIMSlotReleasePolicyAtUnhold` / `OIMSlotReleasePolicyAtEmpty` / `OIMSlotReleasePolicyNever` / `OIMSlotReleasePolicyEarliest` | `slotReleasePolicy` on the factory's options, or on `OIMDB`'s for entity, bucket and index collections |
| how a key is filed | `OIMSlotStoreServiceMapDriven` / `OIMSlotStoreServiceTreeDriven` / `OIMSlotStoreServiceSingleSlotDriven` (the `void` key of a single) | `slotStoreService`, `bucketSlotStoreService` or `computedSlotStoreService` on the factory's options |
| how a key chain is walked | `OIMKeyTreeWalkScalar` / `OIMKeyTreeWalkComposite` | `OIMSlotStoreServiceTreeDriven`'s constructor |
| how an index's cell positions are reused | `OIMIndexKeysServiceAppending` / `OIMIndexKeysServiceReclaiming` | `indexKeysService` on `OIMDB`'s options |
| what counts as empty | any `IOIMSlotEmptiness` | `slotEmptiness` on the entity factory's options, or `OIMDefaults.ENTITY_SLOT_EMPTINESS` |
| when a frame runs | manual `flush()` / a `channelScheduler` | `OIMDB`'s options |
| what a throw in a flush does | `OIMErrorPolicyLogAndContinue` / `OIMErrorPolicyThrowAtOnce` | `errorPolicy` on `OIMDB`'s options |
| how an effect finds its sources | declared lists / an `OIMEffectSourceTracker` | `createEffect` / `createEffectWithSourceTracking` |

## Where to next

<DocCards>
<DocCard to="/docs/core/model" title="The model">Slots, doors and frames as a consumer meets them.</DocCard>
<DocCard to="/docs/core/collections" title="Collections and identities">Stores and keys.</DocCard>
<DocCard to="/docs/core/writing" title="Writing">The write API.</DocCard>
<DocCard to="/docs/core/reading-subscribing" title="Reading and subscribing">Effects and columns.</DocCard>
<DocCard to="/docs/core/channel" title="The channel: frames and subframes">Channels and their frame rules.</DocCard>
<DocCard to="/docs/core/lifecycle" title="Slot lifecycle">Minting, holding and release in practice.</DocCard>
<DocCard to="/docs/core/indexes" title="Buckets">Bucket content services and positions.</DocCard>
<DocCard to="/docs/core/oimindex" title="Indexes">The auto-index.</DocCard>
<DocCard to="/docs/core/computed-effects" title="The compute graph">Computed slots and chains.</DocCard>
</DocCards>
