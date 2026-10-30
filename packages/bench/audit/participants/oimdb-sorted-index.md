---
participant: "oimdb-sorted-index"
version: "4.1.0"
auditedAt: "2026-10-25"
auditedBy: "claude-opus-5-5 (oimdb-4b; wirings re-read against adapters/oimdb.ts and packages/core/src after the 4.1.0 port; bench tests run, nothing measured)"
digest: "5ce47437b8ade25c"
verdict: "idiomatic"
summary: "The oimdb row with one strategy swapped: group order is a createOIMSlotCollectionSortedArrayIndexService over the group column with sortColumns rank then id (GROUP_ORDER_SORTED_AT_WRITE), so a view's page is read straight from the held bucket slot with getBucketMemberSlotCount and getBucketMemberSlotAt and its order effect has that bucket slot as a root slot; there is no sorted computed service. Only the window, per-group and read wirings take the strategy; the churn, relation and single wirings are the oimdb row's code under a second name."
wirings:
  bind:
    verdict: "idiomatic"
    note: "bindViews (oimdb.ts:417-545) is called with GROUP_ORDER_SORTED_AT_WRITE (oimdb.ts:177, 1212). It builds the OIMDB, an OIMEffectService, the entity service from createRowEntityService (106-107) with its createStoreSlot() and the group orders from createGroupOrdersSortedAtWrite (145-175): createOIMSlotCollectionSortedArrayIndexService on group with sortColumns BY_RANK_THEN_ID (152-158). A view holds one bucket slot through indexService.holdSlotByKey (164, makeView 315-339) and watches it with effectService.createEffect([bucketSlot], NO_SOURCE_COMPUTEDS, …) (172); resync (340-377) and refresh (378-) walk the page from the view's offset with getBucketMemberSlotCount and getBucketMemberSlotAt (169-170) and hold the rank+label column group of each visible row. The index wakes that bucket slot when membership changes or a member's sort column changes: OIMSlotCollectionSortedArrayIndexService.onBucketColumnsChanged repositions only when a sort column is among the changed ones (packages/core/src/index/OIMSlotCollectionSortedArrayIndexService.ts:42-48), and repositionBucketMemberSlot marks the bucket changed when the member was removed and re-added (bucket/OIMSlotContentSortedArrayBucketService.ts:49-58), which is every rank or id write of a member, whether or not its position moves. A label or note write does not touch the bucket. The writes are bindRowWrites (221-276), the oimdb row's: writeSlotContentByKey per row inside writeInBatch, label and note patches assign slot.entity and call markEntityChanged with the one column, setGroup and setRank are updateEntityColumn; frame is entityService.writeInBatch(entityStoreSlot, run) (266-268), settle is db.flush then paint (269-272). dispose (531-544) is OIMChannelService.dropChannelSlot and the adapter's arrays cleared. Not measured."
  bindPerGroup:
    verdict: "idiomatic"
    note: "The same body with fifty held buckets (oimdb.ts:1153-1154), so every write files into one of fifty sorted-array buckets and a rank write repositions the row in its own bucket; no sorted computed is maintained beside them."
  churn.row:
    verdict: "idiomatic"
    note: "The oimdb row's churn binding unchanged: oimdbAdapterWith passes no group-order strategy to it (oimdb.ts:1137), so bindChurnStore (656-764) builds one OIMDB and one entity collection with no index and no order, and this row times the same code as `oimdb`. holdChurnRows (710-718) resolves the slots once with getSlotByKey; one effectService.createEffect over the root slots per mount whose body reads row `from` (722-730, churnBody 692-694); disposeEffect on unmount (747-752). The duplication is disclosed here, not in the adapter's departure."
  churn.wide:
    verdict: "idiomatic"
    note: "One effect over `count` roots taken from sourcesOf (oimdb.ts:675-684, 722-730); the body reads the first root only, as the shared departure states (1157-1168). Same code as `oimdb`."
  churn.column:
    verdict: "idiomatic"
    note: "mountOnColumn (oimdb.ts:731-736) takes entityService.holdColumn(slot, 'label'), puts one effect on that column slot and gives the hold back at once with entityService.unholdColumn, so the effect keeps the column slot until unmount. Same code as `oimdb`."
  churn.chain:
    verdict: "idiomatic"
    note: "createChurnMounts (oimdb.ts:572-654): chain levels are slots of one createOIMComputedService<number, string> store slot with oimSameValueZeroGuard (579-594), keyed at * CHAIN_KEYS_PER_SUBSCRIBER + level; level 1's sources are the root slots and it derives chainLevelOf of their joined labels, each level above takes the slot below as its source computed. subscribeHead (622-641) holds the keys bottom up, puts one effect on the head and gives the holds back. The derivation is the library's computed service; the adapter walks nothing to find roots (churnChain B3). Same code as `oimdb`. Not run."
  churn.diamond:
    verdict: "idiomatic"
    note: "Left and right nodes over the one root slot and a join over both, as slots of a second createOIMComputedService store slot keyed at * DIAMOND_KEYS_PER_SUBSCRIBER + node (oimdb.ts:596-619), with one effect on the join through subscribeHead (622-641); the effect body counts every run (readChurn, 686-690) and nothing deduplicates it (churnDiamond B3). Same code as `oimdb`. Not run."
  reads.byKey:
    verdict: "idiomatic"
    note: "entityService.findSlotByKey(entityStoreSlot, key)?.entity per key inside readKeys, nothing resolved before the call (oimdb.ts:818-826). Every key the plan names is a stored row's id."
  reads.byWindow:
    verdict: "idiomatic"
    note: "bindReadViews (oimdb.ts:773-856) is called with the sorted-at-write strategy (1139-1141) and builds two sorted-array indexes through it (790-795): the group one with OIMSlotNeverReleasePolicy, the axis one with the default policy. scrollTo (830-835) only moves the offset and marks the view; the next settle's resync re-reads the page from the bucket with getBucketMemberSlotAt from the new offset. The ordering of rows appended since the last read is settled on that read: the bucket keeps an unsorted tail and getBucketMemberSlotAt orders it through sortBucketMemberSlots, by binary insertion for at most eight appended members and by a full sort above that (packages/core/src/bucket/array/OIMBucketMemberSlotsArrayService.ts:8, 114-141; bucket/OIMSlotContentSortedArrayBucketService.ts:26-31)."
  reads.byTwoAxes:
    verdict: "idiomatic"
    note: "A second sorted-array index whose keyOf answers OFF_THE_SECOND_AXIS for rows off the axis (oimdb.ts:767, 791-795), the composite-predicate form; view B holds group A's bucket in it (804). The library files and orders both indexes on a write."
  reads.bySwitch:
    verdict: "idiomatic"
    note: "switchGroup (oimdb.ts:837-847) holds the new group's bucket slot, disposes view A's order effect, gives the old bucket back with unholdGroupOrder, re-subscribes the order effect on the new bucket, sets offset 0 and marks; view B's effects are untouched. The new key is held before the old is given back, so a switch to the group already shown keeps its bucket. Not run."
  relations:
    verdict: "idiomatic"
    note: "bindRelationViews (oimdb.ts:862-1024) takes no group-order strategy, so this is the oimdb row's relation wiring: owners and rows in two entity collections on one channel, pair records in a third keyed by [ownerSlot, rowSlot] over OIMSlotTreeStoreService (869-874); holdRelation (941) holds the segments, mints the pair records untimed with writeSlotContentByKey and puts one effect on each touched owner and each pair record; writePair (986) composes a new key per call and descends. frame is run() (929-931)."
  single:
    verdict: "idiomatic"
    note: "bindSingleStore (oimdb.ts:1030-1111), not strategy-dependent: one createOIMSingleSlotService with an entity content service on one channel and two store slots, each held through holdSingleSlot and seeded with slotContentService.writeSlotContent (1036-1039), one effect each (1061-1072), writeSingle is updateEntityColumn on the value slot (1079-1081), delivery in settle after db.flush (1093-1103); dispose disposes the two effects and unholds the two slots (1104-1109)."
improvements: []
---

## Version

`oimdbSortedIndexAdapter.version` is `4.1.0`, set once for both oimdb rows by
`oimdbAdapterWith` (`adapters/oimdb.ts:1116`). The adapter imports the built
working tree, `../../../core/dist/index.js` (`oimdb.ts:1-22`); the departure,
shared with `oimdb` (`OIMDB_DEPARTURE`, `oimdb.ts:1157-1168`), says the working tree is
ahead of the published 4.0.1. The core behaviour cited below was read in `packages/core/src`, not
in `dist`; that `dist` was built from that source was not checked.

## What differs from the oimdb row

One argument: `oimdbAdapterWith(…, GROUP_ORDER_SORTED_AT_WRITE)` (`oimdb.ts:1194-1212`)
where `oimdb` passes `GROUP_ORDER_SORTED_AT_READ` (`oimdb.ts:112-144`, 1192). Both
strategies answer the same `TGroupOrders` shape (`oimdb.ts:68-76`), so
`createWindowViews`, `bindViews` and `bindReadViews` are the same code for both rows
and differ only in what a group order is:

| | `oimdb` | `oimdb-sorted-index` |
|---|---|---|
| index | `createOIMSlotCollectionIndexService` with `OIMSlotContentSetBucketService` on group (114-122) | `createOIMSlotCollectionSortedArrayIndexService` on group, `sortColumns` rank then id (152-158) |
| order | `createOIMSortedComputedService` over the index service, `sortColumns` rank then id (124-128) | the bucket itself |
| held order | a computed slot from the sorted computed service (132) | the index's bucket slot (164) |
| page read | `computedValueService.getValueForSlot` then array index (136-138) | `getBucketMemberSlotCount`, `getBucketMemberSlotAt` (169-170) |
| order effect | the computed slot as a source computed (139-140) | the bucket slot as a root slot (172) |

## Public exports only

`createOIMSlotCollectionSortedArrayIndexService` is imported from the package root (`oimdb.ts:1`);
`holdSlotByKey`, `getBucketMemberSlotCount`, `getBucketMemberSlotAt` and
`owner.unholdSlot` are public members of the returned `OIMSlotCollectionSortedArrayIndexService`
(`packages/core/src/index/OIMSlotCollectionSortedArrayIndexService.ts`,
`bucket/OIMSlotContentArrayBucketService.ts:75-88`, `slot/OIMSlotCollectionService.ts:93`). No adapter code reports a sort move: the
index repositions the row when a write changes `rank` or `id`.

## What the index does on a write

- **Filing.** The index reads `keyOf` on a write that changes `group` and moves
  the row between buckets; a new member is appended to the bucket's array
  (`OIMSlotContentArrayBucketService.addSlot`, `bucket/OIMSlotContentArrayBucketService.ts:26`,
  `OIMBucketMemberSlotsArrayService.appendBucketMemberSlot`, `bucket/array/OIMBucketMemberSlotsArrayService.ts:22-25`).
- **Reposition.** A write that changes a sort column removes the member
  (`indexOf` plus `splice`, `OIMBucketMemberSlotsArrayService.ts:36-43`) and appends it again
  (`OIMSlotContentSortedArrayBucketService.repositionBucketMemberSlot`,
  `bucket/OIMSlotContentSortedArrayBucketService.ts:40-48`), then marks the bucket slot changed.
- **Order on read.** The appended tail is ordered on the next read of that bucket
  (`sortBucketMemberSlots`, `OIMBucketMemberSlotsArrayService.ts:114-141`), by binary insertion and two `splice`s per member up to eight
  members, by `Array.prototype.sort` over the whole bucket above eight. In this suite
  every `settle` that paints reads the bucket, so the ordering cost lands inside the
  same timed frame as the write.

## Same code as the oimdb row

`churn`, `relations` and `single` are built by functions that take no group-order
strategy (`oimdb.ts:1137`, `1142-1150`), so on those tables this row and `oimdb` run
identical code. `baseline-indexed` declines its churn wiring for that reason
(`adapters/baseline-array-indexed.ts:463-469`: two identical rows read as two
answers); this adapter does not, so the test that ties `declined` to the adapter
requires a real verdict on each, and they carry the `oimdb` card's.

## Not determined

- Nothing was run, linted or type-checked; no figure and no line count.
- Whether a rank write that leaves a member's position unchanged costs this row a
  redundant `resync` that `oimdb` does not pay depends on whether the sorted computed
  suppresses an unchanged order; that was not read.
- churnDiamond, churnChain, diamondFrameWrite and viewSwitch were read against the
  wiring, not executed.
