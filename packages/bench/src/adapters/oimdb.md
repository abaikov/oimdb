# What the adapter keeps by hand

Companion to `packages/bench/src/adapters/oimdb.ts`. The row's admission and departure statements are printed by the
suite itself; see `packages/bench/PARTICIPANTS.md`.

## Which group orders are held

The group order is a strategy chosen when the participant is built: `oimdbAdapterWith` (oimdb.ts:1132) hands one
`TGroupOrderStrategy` to every binding that keeps group orders. This row's strategy, `GROUP_ORDER_SORTED_AT_READ`
(oimdb.ts:121), builds one `createOIMComputedServiceSorted` service over a `createOIMIndexServiceSetDriven` index service
keyed by `group`, with `BY_RANK_THEN_ID` as its sort columns; the index store slot is `indexService.createStoreSlot(entityStoreSlot)`
and the sorted store slot is `sortedComputedService.createSortedStoreSlot(indexStoreSlot)`. A held group order is a
`TOIMComputedSlot` from `sortedComputedService.holdSlotByKey(sortedComputedStoreSlot, group)`, read with
`sortedComputedService.computedValueService.getValueForSlot(slot)`. The window bindings hold the slot of
every group a view watches (`createWindowViews.makeView`, :322-345); `switchGroup` holds the new group's slot before it
gives the old one back (:842-852), so a switch to the group already shown never lets its slot go. `groupOrderOf` (:184)
holds a group nobody watches and gives it straight back.

Every view subscribes to the group order and not to the index's bucket, so a write that leaves the sorted list as it was
stops at the computed and wakes nothing. A read view pages by indexing the settled list from its offset. When the order
moves, `resync` (:347) keeps the column-group holds of the entities still on its page, gives back the ones that left and
holds the ones that arrived; the window and read bindings share this one implementation, the window binding at offset 0.

## Patches

`patchLabel`, `patchNote` (:248-261) and their pinned twins (:523-538) assign the column on `slot.entity` and call
`entityService.markEntityChanged(slot, [column])`. The only guard is `slot.entity === undefined`, because the assignment needs an
entity; there is no equality check, since `markEntityChanged` has none and `types.ts` forbids an adapter supplying one.

## Chain and diamond

`createChurnMounts` (:580) builds two `createOIMComputedService<number, string>` services, each with its own
`createStoreSlot()`: the chain levels and the diamond nodes, each keyed by subscriber and level — `at * CHAIN_KEYS_PER_SUBSCRIBER + level` and
`at * DIAMOND_KEYS_PER_SUBSCRIBER + node`. A level's `createSources` takes the subscriber's root slots or the slot of the
level below; its `derive` reads the text `harness/derivations.ts` names for that level from the sources the slot holds, so
a level that did not run changes what is delivered. `subscribeHead` (:628-646) holds every key from the bottom up, puts
one `effectService.createEffect` on the head and gives the holds back, so what keeps a mount filed is the effect's
subscription on the head and each level's hold on its sources. Disposing the effect is the whole unmount: the head is
released and each release gives back the level below. The root-slot arrays are built once per `(from, count)` and shared
by every mount.

## Column holds

`pin` (:496-522) holds two column slots per pinned entity with `entityService.slotContentOwner.holdColumn`; nothing gives them back, the channel
drop in `dispose` ends them. A churn column mount (:735-741) holds the column, subscribes, and gives its hold back at
once, so the effect's subscription is what keeps the column slot; the last unmount of a cycle releases it and the next
cycle's first mount mints it again — what an application pays that releases what it took.

## Teardown

Every binding with entity collections (`bindViews` :539, `bindChurnStore` :758, `bindReadViews` :855,
`bindRelationViews` :1024) disposes with one `channel.dropEverythingUnchecked()` and clears its own arrays and flags.
After the drop `OIMChannel.flush` and `requestFlush` return at once and the scheduled effects are discarded, so no effect
body runs again and `settle` paints nothing: the tearDown proof frame's write reaches no consumer. The single binding
(:1120) disposes its two effects, unholds its two single slots and keeps its channel.

## Frames

The window and read bindings run a frame inside `channel.openSubframe()` / `channel.closeSubframe()` (`bindRowWrites`,
oimdb.ts:269-276). A bucket join or leave files its tail — the bucket's channel write, emptiness and release check — to the
close of the outermost span, so a frame pays it once per bucket instead of once per call. In this harness that changes the
cost only of frames that move rows between buckets through several calls (`mixedFrame`'s write, remove and group moves);
a frame of label patches files no bucket tail and pays two calls for the span.

## oimdb-sorted-index

The same file and the same bindings (`oimdbSortedIndexAdapter`); the one difference is the group-order strategy handed
to `oimdbAdapterWith`. `GROUP_ORDER_SORTED_AT_WRITE` (oimdb.ts:182, built by `createGroupOrdersSortedAtWrite` at :151)
builds a `createOIMIndexServiceSortedArrayDriven` keyed by `group` with `sortColumns: BY_RANK_THEN_ID`, so every bucket is kept
in rank-then-id order at the write and there is no sorted computed service. A held group order is the index's
bucket slot (`indexService.holdSlotByKey(indexStoreSlot, group)`, given back with `slot.owner.unholdSlot(slot)`); a view reads its page with
`getBucketMemberSlotCount` and `getBucketMemberSlotAt` from its offset. The view's order effect has that bucket slot as a
ROOT slot, not a source computed; the index writes it when membership changes or a member's rank or id changes, and a
label or note write does not. The read binding builds two such indexes, the group and the second axis.

## Figures that are not this file's to carry forward

`OIMEntityCollection` prices `update` through the identity at 45 ns against 71 for `updateByKey`, each measured against its own
floor in `packages/bench/measurements/2026-08-20-price/write`. Those readings are from before the rewrite and are not
re-attributed to the current shape; nor is anything else recorded under `packages/bench/measurements/` from before it a
like-for-like continuation of what the file now measures.
