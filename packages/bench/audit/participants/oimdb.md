---
participant: "oimdb"
version: "4.0.0"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "b49d5c7fa6f7eee6"
verdict: "idiomatic"
summary: "The built engine through its public exports only: one channelled entity collection; an index service over the group column feeding a sorted computed service (createOIMIndexServiceSetDriven, createOIMComputedServiceSorted, rank then id as sort columns) whose held slot is the order of a group (createRowEntityService, createGroupOrders); slot, column-group and order effects from OIMEffectService, painted by settle after channel.flush. The churn binding is a channelled entity service alone, with no index and no order, like every other library's churn wiring. The group filing and the order are the library's: the collection calls keyOf on each write and the sorted computed re-sorts only when a write touches rank or id."
wirings:
  bind:
    verdict: "idiomatic"
    note: "bindViews (oimdb.ts:424) builds the OIMDB, an OIMEffectService, the entity service from createRowEntityService (115) with its createStoreSlot() and orderByGroup from createGroupOrders (122-148): a createOIMComputedServiceSorted over createOIMIndexServiceSetDriven on group with sortColumns BY_RANK_THEN_ID. Each view holds one group-order slot (makeView, 322-345) with one effect on it and one effect over the column-group slots of its window entities (resync, 347-383); settle is channel.flush then paint (277-280). The row-store methods are bindRowWrites (226): write is insertEntities then upsertEntities, label and note patches assign slot.entity and call markEntityChanged with the one column, with no equality check (248-261), setRank and setGroup are updateEntityColumn, so the index files the move itself (263-268); frame is channel.openSubframe/closeSubframe (269-276). dispose (539) is channel.dropEverythingUnchecked and the adapter's arrays cleared. Not measured."
  bindPerGroup:
    verdict: "idiomatic"
    note: "The same body with fifty held groups (oimdb.ts:1169), so the same write path paid across fifty maintained buckets and fifty sorted computeds."
  churn.row:
    verdict: "idiomatic"
    note: "bindChurnStore (oimdb.ts:660) builds its own OIMDB and one entity service with its store slot and nothing else: no index, no order, so a churn write is a slot write and its effects; groupOrder answers undefined, which the churn standings allow. The plain writes come from bindRowWrites (226). holdChurnRows (715) resolves the slots once with entityService.getSlotByKey; one effectService.createEffect over the root slots per mount whose body reads row `from` (mountOnRows, 727-734), disposeEffect on unmount (751-757). Under the churn read fold every standing slot's read is checked."
  churn.wide:
    verdict: "idiomatic"
    note: "One effect over count roots; the body reads the first root only, declared in departure."
  churn.column:
    verdict: "idiomatic"
    note: "mountOnColumn (oimdb.ts:735-741) takes entityService.slotContentOwner.holdColumn(slot, 'label'), subscribes one effect to that column slot and gives the hold back at once with slotContentOwner.unholdColumn, so the effect's subscription keeps the column slot; unmount disposes the effect, so the last unmount of a cycle releases the column slot and the next cycle's first mount mints it again. Not measured."
  churn.chain:
    verdict: "idiomatic"
    note: "createChurnMounts (oimdb.ts:580) builds the chain levels as slots of one createOIMComputedService<number, string> store slot with oimSameValueZeroGuard (588-603), keyed at * CHAIN_KEYS_PER_SUBSCRIBER + level: level 1's sources are the count roots and it derives chainLevelOf of their joined labels, each level above takes the slot below as its source computed and derives chainLevelOf of its value. subscribeHead (628-646) holds the keys bottom up, puts one effectService.createEffect on the head and gives the holds back, so unmount's disposeEffect releases the head and each release gives back the level below. The delivered text is chainHeadOf(label, depth) (harness/derivations.ts)."
  churn.diamond:
    verdict: "idiomatic"
    note: "Left and right nodes over the one root slot and a join over both, deriving diamondJoinOf of their values, as slots of a second createOIMComputedService store slot keyed at * DIAMOND_KEYS_PER_SUBSCRIBER + node (oimdb.ts:605-626), with one effect on the join through the same subscribeHead. The effect is enlisted once per frame, so the join derives once per frame, which churnDiamond's check asserts. Not run."
  reads.byKey:
    verdict: "idiomatic"
    note: "entityService.findEntityByKey per key inside readKeys, nothing resolved before the call (oimdb.ts:823-831), as TReadBinding.readKeys requires. Every key the plan names is a stored entity's id, so no read here mints."
  reads.byWindow:
    verdict: "idiomatic"
    note: "bindReadViews (777) builds two createGroupOrders, one per index (795-799); each view holds a group-order slot and its shape effect is on that slot, so a write that leaves the sorted list as it was wakes no view. scrollTo only marks (835-840); the next frame re-points the window by indexing the order's settled list from offset to offset + window."
  reads.byTwoAxes:
    verdict: "idiomatic"
    note: "A second group order, an index service whose keyOf answers OFF_THE_SECOND_AXIS for entities off the axis (oimdb.ts:771, 796-799), the composite-predicate form, with its own sorted computed service; the library re-files and re-sorts both indexes on a write."
  reads.bySwitch:
    verdict: "idiomatic"
    note: "switchGroup (oimdb.ts:842-852) holds the other group's order slot, disposes view A's shape effect, gives the old order back with unholdSlot, re-subscribes the shape effect on the new order, sets offset 0 and marks; the settle delivers through the same resync as scrollTo. View B's effects are untouched, so viewSwitch's view-B check is met without a redundant delivery. The new key is held before the old one is given back, so a switch to the group already shown keeps its slot. Not run."
  relations:
    verdict: "idiomatic"
    note: "bindRelationViews (oimdb.ts:867): owners and rows in two entity services on one channel, pair records in a third OIMEntityService keyed by [ownerSlot, rowSlot] over OIMSlotStoreServiceTreeDriven (882-888). holdRelation (957) holds the segments through the slots holdSlotByKey returns, mints the pair records untimed with upsertEntity, and puts one effect on each touched owner (view A) and each pair record (view B); writePair (998) composes a new key array per call and descends, as the contract requires. frame is run(): nothing in this binding files work to a subframe close. dispose (1024) is the channel drop and the adapter's arrays cleared. No relation script times dispose."
  single:
    verdict: "idiomatic"
    note: "bindSingleStore (oimdb.ts:1045): one void-key OIMEntityService over OIMSlotStoreServiceSingleSlotDriven on one channel with two store slots (createStoreSlot, upsertEntity), each held through entityService.holdSlotByKey(storeSlot, undefined) (1056-1061), one effect each (1082-1095), delivery in settle after channel.flush (1115-1125); writeSingle is entityService.updateEntityColumn on the held slot (1101-1103), so singleResend gets the library's own no-change check. frame is run(); dispose (1126) disposes the two effects and unholds the two slots."
improvements: []
---

## Version

`oimdbAdapter.version` is `4.0.0` (`adapters/oimdb.ts:1137`). There is no package to compare it with: the adapter imports the built working tree, `../../../core/dist/index.js` (`oimdb.ts:1-36`), and `departure` says 4.0.0 is unpublished.

## Public exports only

`createGroupOrders` (`oimdb.ts:122`) builds `createOIMIndexServiceSetDriven(db, { ...indexKeyOptions, entityService, bucketCollectionOptions })` with `indexService.createStoreSlot(entityStoreSlot)`, then `createOIMComputedServiceSorted(db, { indexService, sortColumns: BY_RANK_THEN_ID, slotReleasePolicy })` read through `createSortedStoreSlot(indexStoreSlot)`. A held group order is a `TOIMComputedSlot` from `sortedComputedService.holdSlotByKey(sortedComputedStoreSlot, group)`, read with `computedValueService.getValueForSlot(slot)` (`oimdb.ts:138-142`, `353`, `388`). The churn derivations are `createOIMComputedService` (`oimdb.ts:588`, `605`). Nothing is reached through a private field and no adapter code reports a sort move: the index files the entity and the sorted computed re-sorts when a write changes `rank` or `id`.

## What the engine documents and what the adapter does

- **Entities.** An `OIMEntityService` from `createOIMEntityService` (`createRowEntityService`, `oimdb.ts:115-116`) with one `createStoreSlot()`, over a map-driven store with the default in-place entity writer.
- **Writes.** `write` is `insertEntities` on the first load and `upsertEntities` after; `setGroup` and `setRank` are `entityService.updateEntityColumn` on the slot `getSlotByKey` returns (`oimdb.ts:263-268`); label and note patches assign `slot.entity` and call `markEntityChanged`, guarded only against an absent entity.
- **Signal.** `OIMEffectService.createEffect` on the group-order slot per view, on the column-group slots of the window entities only, and painted in `settle` after `channel.flush()`.
- **Derivations.** Chain levels and diamond nodes are slots of two `createOIMComputedService` store slots keyed by subscriber and level (`createChurnMounts`, `oimdb.ts:580`), read with `computedValueService.getValueForSlot`; the effect subscribes to the head slot.
- **Frame.** The window and read bindings run `frame` inside `channel.openSubframe()` / `closeSubframe()`. The relation and single bindings keep `frame` as `run()`.
- **Teardown.** Every binding with entity collections disposes with `channel.dropEverythingUnchecked()` and clears its own arrays (`oimdb.ts:539`, `758`, `855`, `1024`); after the drop `flush` returns at once and the scheduled effects are discarded, so no body runs and `settle` paints nothing.

## Holds

- **Entity holds.** `pin` and `holdRelation` keep the slot `holdSlotByKey` returns; there is no second lookup after the hold. The churn rows are resolved with `getSlotByKey` and held by the effects and derivations that subscribe to them.
- **Column holds.** `pin` keeps its column holds until the channel drop; `mountOnColumn` gives its hold back right after subscribing.
- **Order holds.** Each view holds its group-order slot until the channel drop; `switchGroup` gives the old one back after the new one is held.
- **Untimed resolution.** `pin`, the churn row resolution and `holdRelation` resolve slots before the clock, as the contract allows. `readKeys` resolves nothing ahead.

## Not determined

- Nothing was run, linted by a suite or type-checked; no size for any change and no line count.
- churnDiamond, churnChain and viewSwitch were read against this wiring, not executed; the once-per-frame join rests on the enlist guard and the computed's revision check as read.
