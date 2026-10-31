---
participant: "oimdb-sorted-index"
version: "4.1.0"
auditedAt: "2026-10-25"
auditedBy: "claude-opus-5-5 (oimdb-4b; wirings re-read against adapters/oimdb.ts and packages/core/src after the 4.1.0 port; bench tests run, nothing measured)"
digest: "5ce47437b8ade25c"
verdict: "idiomatic"
summary: "The oimdb row with one strategy swapped: group order is a createOIMSlotCollectionSortedArrayIndexService over the group column with sortColumns rank then id (GROUP_ORDER_SORTED_AT_WRITE), so a view's page is read straight from the held bucket slot with getBucketMemberSlotCount and getBucketMemberSlotAt, and the view's source-tracking window effect has that bucket slot as a tracked source; there is no sorted computed service. Only the window, per-group and read wirings take the strategy; the churn, relation and single wirings are the oimdb row's code under a second name."
wirings:
  bind:
    verdict: "idiomatic"
    note: "bindViews (oimdb.ts:370-500) is called with GROUP_ORDER_SORTED_AT_WRITE (oimdb.ts:171, 1152). It builds the OIMDB, takes OIMEffectService.INSTANCE, the entity service from createRowEntityService (105-106) with its createStoreSlot(db) and the group orders from createGroupOrdersSortedAtWrite (142-169): createOIMSlotCollectionSortedArrayIndexService on group with sortColumns BY_RANK_THEN_ID (148-155). A view holds one bucket slot through indexService.holdSlotByKey (160, makeView 306-365) and its one createSourceTrackingEffect (watchWindow, 314-327) walks the page from the view's offset slot with bucketSlot.getBucketMemberSlotCount and getBucketMemberSlotAt (165-166), reading each visible entity with slot.readEntity(renderedColumns), the rank+label column group, 321-323). getBucketMemberSlotCount reports the read of the bucket slot to its owner (packages/core/src/bucket/OIMBucketSlot.ts:81-84), so the bucket slot is a tracked source. The index wakes that bucket slot when membership changes or a member's sort column changes: OIMSlotCollectionSortedArrayIndexService.onBucketColumnsChanged repositions only when a sort column is among the changed ones (packages/core/src/index/OIMSlotCollectionSortedArrayIndexService.ts:42-48), and repositionBucketMemberSlot marks the bucket changed when the member was removed and re-added (bucket/OIMSortedArrayBucketContentService.ts:49-57), which is every rank or id write of a member, whether or not its position moves. A label or note write does not touch the bucket. The writes are bindRowWrites (215-270), the oimdb row's: writeSlotContentByKey per row inside writeInBatch, label and note patches assign slot.entity and call markEntityChanged with the one column, setGroup and setRank are updateEntityColumn; frame is entityService.writeInBatch(entityStoreSlot, run) (260-262), settle is db.flush then paint (263-266). dispose (486-499) is OIMChannelService.dropChannelSlot and the adapter's arrays cleared. Not measured."
  bindPerGroup:
    verdict: "idiomatic"
    note: "The same body with fifty held buckets (oimdb.ts:1093-1094), so every write files into one of fifty sorted-array buckets and a rank write repositions the row in its own bucket; no sorted computed is maintained beside them."
  churn.row:
    verdict: "idiomatic"
    note: "The oimdb row's churn binding unchanged: oimdbAdapterWith passes no group-order strategy to it (oimdb.ts:1077), so bindChurnStore (611-716) builds one OIMDB and one entity collection with no index and no order, and this row times the same code as `oimdb`. holdChurnRows (665-673) resolves the slots once with getSlotByKey; one effectService.createEffect over the root slots per mount whose body reads row `from` (677-682, churnBody 647-649); disposeEffect on unmount (699-705). The duplication is disclosed here, not in the adapter's departure."
  churn.wide:
    verdict: "idiomatic"
    note: "One effect over `count` roots taken from sourcesOf (oimdb.ts:630-639, 677-682); the body reads the first root only, as the shared departure states (1097-1108). Same code as `oimdb`."
  churn.column:
    verdict: "idiomatic"
    note: "mountOnColumn (oimdb.ts:683-689) takes entityService.columnSlotService.holdColumn(slot, 'label'), puts one effect on that column slot and gives the hold back at once with entityService.columnSlotService.unholdColumn, so the effect keeps the column slot until unmount. Same code as `oimdb`."
  churn.chain:
    verdict: "idiomatic"
    note: "createChurnMounts (oimdb.ts:527-609): chain levels are slots of one createOIMComputedService<number, string> store slot with oimSameValueZeroGuard (534-549), keyed at * CHAIN_KEYS_PER_SUBSCRIBER + level; level 1's sources are the root slots and it derives chainLevelOf of their joined labels, each level above takes the slot below as its source computed. subscribeHead (577-597) holds the keys bottom up, puts one effect on the head and gives the holds back. The derivation is the library's computed service; the adapter walks nothing to find roots (churnChain B3). Same code as `oimdb`. Not run."
  churn.diamond:
    verdict: "idiomatic"
    note: "Left and right nodes over the one root slot and a join over both, as slots of a second createOIMComputedService store slot keyed at * DIAMOND_KEYS_PER_SUBSCRIBER + node (oimdb.ts:551-575), with one effect on the join through subscribeHead (577-597); the effect body counts every run (readChurn, 641-645) and nothing deduplicates it (churnDiamond B3). Same code as `oimdb`. Not run."
  reads.byKey:
    verdict: "idiomatic"
    note: "entityService.findSlotByKey(entityStoreSlot, key)?.entity per key inside readKeys, nothing resolved before the call (oimdb.ts:769-777). Every key the plan names is a stored row's id."
  reads.byWindow:
    verdict: "idiomatic"
    note: "bindReadViews (oimdb.ts:725-796) is called with the sorted-at-write strategy (1079-1081) and builds two sorted-array indexes through it (741-745): the group one with OIMSlotNeverReleasePolicy, the axis one with the default policy. scrollTo (781-783) writes the view's offset slot with updateEntityColumn (349-351); the next settle's flush re-runs the window effect, which re-reads the page from the bucket with getBucketMemberSlotAt from the new offset. The ordering of rows appended since the last read is settled on that read: the bucket keeps an unsorted tail and getBucketMemberSlotAt orders it through sortBucketMemberSlots, by binary insertion for at most eight appended members and by a full sort above that (packages/core/src/bucket/array/OIMBucketMemberSlotsArrayService.ts:8, 114-141; bucket/OIMSortedArrayBucketContentService.ts:35-40)."
  reads.byTwoAxes:
    verdict: "idiomatic"
    note: "A second sorted-array index whose keyOf answers OFF_THE_SECOND_AXIS for rows off the axis (oimdb.ts:719, 742-745), the composite-predicate form; view B holds group A's bucket in it (755). The library files and orders both indexes on a write."
  reads.bySwitch:
    verdict: "idiomatic"
    note: "switchGroup (oimdb.ts:785-787, 352-359) holds the new group's bucket slot, disposes view A's window effect, gives the old bucket back with unholdGroupOrder, writes offset 0 to the view's offset slot and creates a new window effect over the new bucket; view B's effect is untouched. The new key is held before the old is given back, so a switch to the group already shown keeps its bucket. Not run."
  relations:
    verdict: "idiomatic"
    note: "bindRelationViews (oimdb.ts:802-964) takes no group-order strategy, so this is the oimdb row's relation wiring: owners and rows in two entity collections on one channel, pair records in a third keyed by [ownerSlot, rowSlot] over OIMSlotTreeStoreService (813-814); holdRelation (881) holds the segments, mints the pair records untimed with writeSlotContentByKey and puts one effect on each touched owner and each pair record; writePair (926) composes a new key per call and descends. frame is run() (869-871)."
  single:
    verdict: "idiomatic"
    note: "bindSingleStore (oimdb.ts:970-1051), not strategy-dependent: one createOIMSingleSlotService with an entity content service on one channel and two store slots, each held through holdSingleSlot and seeded with slotContentService.writeSlotContent (976-979), one effect each (1000-1013), writeSingle is updateEntityColumn on the value slot (1019-1021), delivery in settle after db.flush (1033-1043); dispose disposes the two effects and unholds the two slots (1044-1049)."
improvements: []
---

## Version

`oimdbSortedIndexAdapter.version` is `4.1.0`, set once for both oimdb rows by
`oimdbAdapterWith` (`adapters/oimdb.ts:1061`). The adapter imports the built
working tree, `../../../core/dist/index.js` (`oimdb.ts:1-23`); the departure,
shared with `oimdb` (`OIMDB_DEPARTURE`, `oimdb.ts:1097-1108`), says the working tree is
ahead of the published 4.0.1. The core behaviour cited below was read in `packages/core/src`, not
in `dist`; that `dist` was built from that source was not checked.

## What differs from the oimdb row

One argument: `oimdbAdapterWith(…, GROUP_ORDER_SORTED_AT_WRITE)` (`oimdb.ts:1134-1152`)
where `oimdb` passes `GROUP_ORDER_SORTED_AT_READ` (`oimdb.ts:111-140`, 1132). Both
strategies answer the same `TGroupOrders` shape (`oimdb.ts:69-75`), so
`createWindowViews`, `bindViews` and `bindReadViews` are the same code for both rows
and differ only in what a group order is:

| | `oimdb` | `oimdb-sorted-index` |
|---|---|---|
| index | `createOIMSlotCollectionIndexService` with `OIMSetBucketContentService` on group (113-121) | `createOIMSlotCollectionSortedArrayIndexService` on group, `sortColumns` rank then id (148-155) |
| order | `createOIMSortedComputedService` over the index service, `sortColumns` rank then id (123-127) | the bucket itself |
| held order | a computed slot from the sorted computed service (131) | the index's bucket slot (160) |
| page read | `groupOrder.value` then array index (135-137) | `getBucketMemberSlotCount`, `getBucketMemberSlotAt` (165-166) |
| order effect | the computed slot, tracked as a source computed through `value` (135; `packages/core/src/computed/OIMComputedSlot.ts:93-97`) | the bucket slot, tracked as a source slot through `getBucketMemberSlotCount` (165; `packages/core/src/bucket/OIMBucketSlot.ts:81-84`) |

## Public exports only

`createOIMSlotCollectionSortedArrayIndexService` is imported from the package root (`oimdb.ts:2`);
`holdSlotByKey` and `slotContentService.getBucketMemberSlotAt` are public members of the returned
`OIMSlotCollectionSortedArrayIndexService`, `getBucketMemberSlotCount` and `owner.unholdSlot` of the
bucket slot it holds
(`packages/core/src/index/OIMSlotCollectionSortedArrayIndexService.ts`,
`bucket/OIMArrayBucketContentService.ts:75-87`, `bucket/OIMBucketSlot.ts:81-84`, `slot/OIMSlotOwner.ts:15`). No adapter code reports a sort move: the
index repositions the row when a write changes `rank` or `id`.

## What the index does on a write

- **Filing.** The index reads `keyOf` on a write that changes `group` and moves
  the row between buckets; a new member is appended to the bucket's array
  (`OIMArrayBucketContentService.addSlot`, `bucket/OIMArrayBucketContentService.ts:26`,
  `OIMBucketMemberSlotsArrayService.appendBucketMemberSlot`, `bucket/array/OIMBucketMemberSlotsArrayService.ts:22-25`).
- **Reposition.** A write that changes a sort column removes the member
  (`indexOf` plus `splice`, `OIMBucketMemberSlotsArrayService.ts:36-43`) and appends it again
  (`OIMSortedArrayBucketContentService.repositionBucketMemberSlot`,
  `bucket/OIMSortedArrayBucketContentService.ts:49-57`), then marks the bucket slot changed.
- **Order on read.** The appended tail is ordered on the next read of that bucket
  (`sortBucketMemberSlots`, `OIMBucketMemberSlotsArrayService.ts:114-141`), by binary insertion and two `splice`s per member up to eight
  members, by `Array.prototype.sort` over the whole bucket above eight. In this suite
  every `settle` that paints reads the bucket, so the ordering cost lands inside the
  same timed frame as the write.

## Same code as the oimdb row

`churn`, `relations` and `single` are built by functions that take no group-order
strategy (`oimdb.ts:1077`, `1083-1090`), so on those tables this row and `oimdb` run
identical code. `baseline-indexed` declines its churn wiring for that reason
(`adapters/baseline-array-indexed.ts:463-469`: two identical rows read as two
answers); this adapter does not, so the test that ties `declined` to the adapter
requires a real verdict on each, and they carry the `oimdb` card's.

## Not determined

- Nothing was run, linted or type-checked; no figure and no line count.
- Whether a rank write that leaves a member's position unchanged costs this row a
  redundant run of the window effect that `oimdb` does not pay depends on whether the sorted computed
  suppresses an unchanged order; that was not read.
- churnDiamond, churnChain, diamondFrameWrite and viewSwitch were read against the
  wiring, not executed.
