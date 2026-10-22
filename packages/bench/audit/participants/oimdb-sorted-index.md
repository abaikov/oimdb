---
participant: "oimdb-sorted-index"
version: "4.0.0"
auditedAt: "2026-10-21"
auditedBy: "claude-opus-5-5 (read against adapters/oimdb.ts and packages/core/src 2026-10-21; nothing run)"
digest: "b49d5c7fa6f7eee6"
verdict: "idiomatic"
summary: "The oimdb row with one strategy swapped: group order is a createOIMIndexServiceSortedArrayDriven over the group column with sortColumns rank then id (GROUP_ORDER_SORTED_AT_WRITE), so a view's page is read straight from the held bucket slot with getBucketMemberSlotCount and getBucketMemberSlotAt and its order effect has that bucket slot as a root slot; there is no sorted computed service. Only the window, per-group and read wirings take the strategy; the churn, relation and single wirings are the oimdb row's code under a second name."
wirings:
  bind:
    verdict: "idiomatic"
    note: "bindViews (oimdb.ts:424-553) is called with GROUP_ORDER_SORTED_AT_WRITE (oimdb.ts:182, 1228). It builds the OIMDB, an OIMEffectService, the entity service from createRowEntityService (115-116) with its createStoreSlot() and the group orders from createGroupOrdersSortedAtWrite (151-180): createOIMIndexServiceSortedArrayDriven on group with sortColumns BY_RANK_THEN_ID (108-111, 158-165). A view holds one bucket slot through indexService.holdSlotByKey (169, makeView 322-345) and watches it with effectService.createEffect([bucketSlot], NO_SOURCE_COMPUTEDS, …) (176-177); resync (347-383) and refresh (385-394) walk the page from the view's offset with getBucketMemberSlotCount and getBucketMemberSlotAt (174-175) and hold the rank+label column group of each visible row. The index wakes that bucket slot when membership changes or a member's sort column changes: OIMIndexSortedArrayDriven.onBucketColumnsChanged repositions only when a sort column is among the changed ones (packages/core/src/facade/entity/OIMIndexSortedArrayDriven.ts:32-46), and repositionBucketMemberSlotByKey marks the bucket changed when the member was removed and re-added (facade/bucket/OIMBucketCollectionSortedArrayDriven.ts:36-49), which is every rank or id write of a member, whether or not its position moves. A label or note write does not touch the bucket. The writes are bindRowWrites (226-284), the oimdb row's: insertEntities then upsertEntities, label and note patches assign slot.entity and call markEntityChanged with the one column, setGroup and setRank are updateEntityColumn; frame is openSubframe/closeSubframe (269-276), settle is channel.flush then paint (277-280, 406-419). dispose (539-551) is channel.dropEverythingUnchecked and the adapter's arrays cleared. Not measured."
  bindPerGroup:
    verdict: "idiomatic"
    note: "The same body with fifty held buckets (oimdb.ts:1169-1170), so every write files into one of fifty sorted-array buckets and a rank write repositions the row in its own bucket; no sorted computed is maintained beside them."
  churn.row:
    verdict: "idiomatic"
    note: "The oimdb row's churn binding unchanged: oimdbAdapterWith passes no group-order strategy to it (oimdb.ts:1153), so bindChurnStore (660-768) builds one OIMDB and one entity service with no index and no order, and this row times the same code as `oimdb`. holdChurnRows (715-723) resolves the slots once with getSlotByKey; one effectService.createEffect over the root slots per mount whose body reads row `from` (727-734, churnBody 697-699); disposeEffect on unmount (751-757). The duplication is disclosed here, not in the adapter's departure."
  churn.wide:
    verdict: "idiomatic"
    note: "One effect over `count` roots taken from sourcesOf (oimdb.ts:680-689, 727-734); the body reads the first root only, as the shared departure states (1173-1184). Same code as `oimdb`."
  churn.column:
    verdict: "idiomatic"
    note: "mountOnColumn (oimdb.ts:735-741) takes entityService.slotContentOwner.holdColumn(slot, 'label'), puts one effect on that column slot and gives the hold back at once with unholdColumn, so the effect keeps the column slot until unmount. Same code as `oimdb`."
  churn.chain:
    verdict: "idiomatic"
    note: "createChurnMounts (oimdb.ts:580-658): chain levels are slots of one createOIMComputedService<number, string> store slot with oimSameValueZeroGuard (588-603), keyed at * CHAIN_KEYS_PER_SUBSCRIBER + level; level 1's sources are the root slots and it derives chainLevelOf of their joined labels, each level above takes the slot below as its source computed. subscribeHead (628-646) holds the keys bottom up, puts one effect on the head and gives the holds back. The derivation is the library's computed service; the adapter walks nothing to find roots (churnChain B3). Same code as `oimdb`. Not run."
  churn.diamond:
    verdict: "idiomatic"
    note: "Left and right nodes over the one root slot and a join over both, as slots of a second createOIMComputedService store slot keyed at * DIAMOND_KEYS_PER_SUBSCRIBER + node (oimdb.ts:605-626), with one effect on the join through subscribeHead (628-646); the effect body counts every run (readChurn, 691-695) and nothing deduplicates it (churnDiamond B3). Same code as `oimdb`. Not run."
  reads.byKey:
    verdict: "idiomatic"
    note: "entityService.findEntityByKey per key inside readKeys, nothing resolved before the call (oimdb.ts:823-831). Every key the plan names is a stored row's id."
  reads.byWindow:
    verdict: "idiomatic"
    note: "bindReadViews (oimdb.ts:777-861) is called with the sorted-at-write strategy (1155-1157) and builds two sorted-array indexes through it (795-799): the group one with OIMSlotReleasePolicyNever, the axis one with the default policy. scrollTo (835-840) only moves the offset and marks the view; the next settle's resync re-reads the page from the bucket with getBucketMemberSlotAt from the new offset. The ordering of rows appended since the last read is settled on that read: the bucket keeps an unsorted tail and getSlotAt orders it, by binary insertion for at most eight appended members and by a full sort above that (packages/core/src/engine/bucket/array/OIMBucketSlotsServiceSortedArrayDriven.ts:10, 105-110, 126-151)."
  reads.byTwoAxes:
    verdict: "idiomatic"
    note: "A second sorted-array index whose keyOf answers OFF_THE_SECOND_AXIS for rows off the axis (oimdb.ts:771, 796-799), the composite-predicate form; view B holds group A's bucket in it (809). The library files and orders both indexes on a write."
  reads.bySwitch:
    verdict: "idiomatic"
    note: "switchGroup (oimdb.ts:842-852) holds the new group's bucket slot, disposes view A's order effect, gives the old bucket back with unholdGroupOrder, re-subscribes the order effect on the new bucket, sets offset 0 and marks; view B's effects are untouched. The new key is held before the old is given back, so a switch to the group already shown keeps its bucket. Not run."
  relations:
    verdict: "idiomatic"
    note: "bindRelationViews (oimdb.ts:867-1036) takes no group-order strategy (1159-1162), so this is the oimdb row's relation wiring: owners and rows in two entity services on one channel, pair records in a third OIMEntityService keyed by [ownerSlot, rowSlot] over OIMSlotStoreServiceTreeDriven (882-888); holdRelation (957-990) holds the segments, mints the pair records untimed with upsertEntity and puts one effect on each touched owner and each pair record; writePair (998-1002) composes a new key per call and descends. frame is run() (944-946)."
  single:
    verdict: "idiomatic"
    note: "bindSingleStore (oimdb.ts:1045-1133), not strategy-dependent (1163-1166): one void-key OIMEntityService over OIMSlotStoreServiceSingleSlotDriven on one channel with two store slots (createStoreSlot, upsertEntity), each held through entityService.holdSlotByKey(storeSlot, undefined) (1056-1061), one effect each (1082-1095), writeSingle is updateEntityColumn on the value slot (1101-1103), delivery in settle after channel.flush (1115-1125); dispose disposes the two effects and unholds the two slots (1126-1131)."
improvements: []
---

## Version

`oimdbSortedIndexAdapter.version` is `4.0.0`, set once for both oimdb rows by
`oimdbAdapterWith` (`adapters/oimdb.ts:1137`). The adapter imports the built
working tree, `../../../core/dist/index.js` (`oimdb.ts:1-36`); the departure,
shared with `oimdb` (`OIMDB_DEPARTURE`, `oimdb.ts:1173-1184`), says 4.0.0 is
unpublished. The core behaviour cited below was read in `packages/core/src`, not
in `dist`; that `dist` was built from that source was not checked.

## What differs from the oimdb row

One argument: `oimdbAdapterWith(…, GROUP_ORDER_SORTED_AT_WRITE)` (`oimdb.ts:1210-1228`)
where `oimdb` passes `GROUP_ORDER_SORTED_AT_READ` (`oimdb.ts:121-149`, 1208). Both
strategies answer the same `TGroupOrders` shape (`oimdb.ts:77-84`), so
`createWindowViews`, `bindViews` and `bindReadViews` are the same code for both rows
and differ only in what a group order is:

| | `oimdb` | `oimdb-sorted-index` |
|---|---|---|
| index | `createOIMIndexServiceSetDriven` on group (123-129) | `createOIMIndexServiceSortedArrayDriven` on group, `sortColumns` rank then id (158-165) |
| order | `createOIMComputedServiceSorted` over the index service, `sortColumns` rank then id (131-136) | the bucket itself |
| held order | a computed slot from the sorted computed service (138) | the index's bucket slot (169) |
| page read | `getValueForSlot` then array index (142-144) | `getBucketMemberSlotCount`, `getBucketMemberSlotAt` (174-175) |
| order effect | the computed slot as a source computed (145-146) | the bucket slot as a root slot (176-177) |

## Public exports only

`createOIMIndexServiceSortedArrayDriven` is imported from the package root (`oimdb.ts:14`);
`holdSlotByKey`, `getBucketMemberSlotCount`, `getBucketMemberSlotAt` and
`owner.unholdSlot` are public members of the returned `OIMIndexServiceSortedArrayDriven`
(`packages/core/src/facade/entity/OIMIndexSortedArrayDriven.ts:48-53`,
`facade/entity/OIMIndex.ts:117-120`). No adapter code reports a sort move: the
index repositions the row when a write changes `rank` or `id`.

## What the index does on a write

- **Filing.** The collection reads `keyOf` on a write that changes `group` and moves
  the row between buckets; a new member is appended to the bucket's array
  (`OIMBucketSlotsServiceArrayDriven.addSlot`, `engine/bucket/array/OIMBucketSlotsServiceArrayDriven.ts:32-37`).
- **Reposition.** A write that changes a sort column removes the member
  (`indexOf` plus `splice`, `:39-46`) and appends it again
  (`OIMBucketSlotsServiceSortedArrayDriven.repositionSlot`, `:119-124`), then marks the
  bucket slot changed.
- **Order on read.** The appended tail is ordered on the next read of that bucket
  (`settle`, `:126-151`), by binary insertion and two `splice`s per member up to eight
  members, by `Array.prototype.sort` over the whole bucket above eight. In this suite
  every `settle` that paints reads the bucket, so the ordering cost lands inside the
  same timed frame as the write.

## Same code as the oimdb row

`churn`, `relations` and `single` are built by functions that take no group-order
strategy (`oimdb.ts:1153`, `1159-1166`), so on those tables this row and `oimdb` run
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
