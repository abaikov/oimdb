---
participant: "oimdb"
version: "4.1.0"
auditedAt: "2026-10-25"
auditedBy: "claude-opus-5-5 (oimdb-4b; wirings re-read against adapters/oimdb.ts and packages/core/src after the 4.1.0 port; bench tests run, nothing measured)"
digest: "5ce47437b8ade25c"
verdict: "idiomatic"
summary: "The built engine through its public exports only: one channelled entity collection; an index service over the group column feeding a sorted computed service (createOIMSlotCollectionIndexService with OIMSetBucketContentService, createOIMSortedComputedService, rank then id as sort columns) whose held slot is the order of a group (createRowEntityService, GROUP_ORDER_SORTED_AT_READ); one source-tracking effect per window view from createWindowViews, which reads the view's offset slot, the group order and, through slot.getEntity(renderedColumns), the rank+label column group of each visible entity, and cell effects on held column slots, painted by settle after db.flush. The churn binding is a channelled entity collection alone, with no index and no order, like every other library's churn wiring. The group filing and the order are the library's: the index calls keyOf on each write and the sorted computed re-sorts only when a write touches rank or id."
wirings:
  bind:
    verdict: "idiomatic"
    note: "bindViews (oimdb.ts:370-500) builds the OIMDB, takes OIMEffectService.INSTANCE, the entity service from createRowEntityService (105-106) with its createStoreSlot(db) and the group orders from GROUP_ORDER_SORTED_AT_READ (111-140): a createOIMSortedComputedService over a createOIMSlotCollectionIndexService with an OIMSetBucketContentService on group, sortColumns BY_RANK_THEN_ID. Each view comes from createWindowViews (292-367): makeView holds one group-order slot (313), keeps its offset in an entity slot of a separate offset collection (301-302, 307) and runs one createSourceTrackingEffect (watchWindow, 314-327) whose body reads the offset slot's entity, the order through groupOrder.value (135), and for each visible slot reads the entity with slot.getEntity(renderedColumns), the rank+label column group (300, 321-323), so the effect's sources are exactly what the last run read; paint delivers only when an id, rank or label differs from what was shown (330-348); settle is db.flush then paint (263-266). The row-store methods are bindRowWrites (215-270): write is writeSlotContentByKey per row inside entityService.writeInBatch, remove is clearSlotContent per found slot inside writeInBatch, label and note patches assign slot.entity and call markEntityChanged with the one column, with no equality check (239-252), setRank and setGroup are updateEntityColumn, so the index files the move itself (254-259); frame is entityService.writeInBatch(entityStoreSlot, run) (260-262). dispose (482-495) is db.dispose() and the adapter's arrays cleared. Not measured."
  bindPerGroup:
    verdict: "idiomatic"
    note: "The same body with fifty held groups (oimdb.ts:1093-1094), so the same write path paid across fifty maintained buckets and fifty sorted computeds."
  churn.row:
    verdict: "idiomatic"
    note: "bindChurnStore (oimdb.ts:611) builds its own OIMDB and one entity collection with its store slot and nothing else: no index, no order, so a churn write is a slot write and its effects; groupOrder answers undefined (663), which the churn standings allow. The plain writes come from bindRowWrites (215). holdChurnRows (665) resolves the slots once with entityService.getSlotByKey; one effectService.createEffect over the root slots per mount whose body reads row `from` (mountOnRows, 677-682), disposeEffect on unmount (699-705). Under the churn read fold every standing slot's read is checked."
  churn.wide:
    verdict: "idiomatic"
    note: "One effect over count roots; the body reads the first root only, declared in departure."
  churn.column:
    verdict: "idiomatic"
    note: "mountOnColumn (oimdb.ts:683-689) takes entityService.columnSlotService.holdColumnSlot(slot, 'label'), subscribes one effect to that column slot and gives the hold back at once with entityService.columnSlotService.unholdColumnSlot, so the effect's subscription keeps the column slot; unmount disposes the effect, so the last unmount of a cycle releases the column slot and the next cycle's first mount mints it again. Not measured."
  churn.chain:
    verdict: "idiomatic"
    note: "createChurnMounts (oimdb.ts:527) builds the chain levels as slots of one createOIMComputedService<number, string> store slot with isOIMSameValueZero (534-549), keyed at * CHAIN_KEYS_PER_SUBSCRIBER + level: level 1's sources are the count roots and it derives chainLevelOf of their joined labels, each level above takes the slot below as its source computed and derives chainLevelOf of its value. subscribeHead (577-597) holds the keys bottom up, puts one OIMEffectService.INSTANCE.createEffect on the head and gives the holds back, so unmount's disposeEffect releases the head and each release gives back the level below. The delivered text is chainHeadOf(label, depth) (harness/derivations.ts)."
  churn.diamond:
    verdict: "idiomatic"
    note: "Left and right nodes over the one root slot and a join over both, deriving diamondJoinOf of their values, as slots of a second createOIMComputedService store slot keyed at * DIAMOND_KEYS_PER_SUBSCRIBER + node (oimdb.ts:551-575), with one effect on the join through the same subscribeHead. The effect is enlisted once per frame, so the join derives once per frame, which churnDiamond's check asserts. Not run."
  reads.byKey:
    verdict: "idiomatic"
    note: "entityService.peekSlotByKey(entityStoreSlot, key)?.entity per key inside readKeys, nothing resolved before the call (oimdb.ts:769-777), as TReadBinding.readKeys requires. Every key the plan names is a stored entity's id, so no read here mints."
  reads.byWindow:
    verdict: "idiomatic"
    note: "bindReadViews (725) builds two group orders through the strategy, one per index (741-745), and both views through createWindowViews (746-756); each view's source-tracking effect reads its offset slot, its group order and the rank+label column group of its visible entities, so a write that touches none of them wakes no view, and a run whose page is unchanged delivers nothing (333-343). scrollTo writes the view's offset slot with updateEntityColumn (781-783, 349-351); the next flush re-runs the effect, which indexes the order's settled list from offset to offset + window."
  reads.byTwoAxes:
    verdict: "idiomatic"
    note: "A second group order, an index service whose keyOf answers OFF_THE_SECOND_AXIS for entities off the axis (oimdb.ts:719, 742-745), the composite-predicate form, with its own sorted computed service; the library re-files and re-sorts both indexes on a write."
  reads.bySwitch:
    verdict: "idiomatic"
    note: "switchGroup (oimdb.ts:785-787, 352-359) holds the other group's order slot, disposes view A's window effect, gives the old order back with unholdGroupOrder (owner.unholdSlot, 132-134), writes offset 0 to the view's offset slot and creates a new window effect, whose body runs at once over the new order; the settle paints what it read. View B's effect is untouched, so viewSwitch's view-B check is met without a redundant delivery. The new key is held before the old one is given back, so a switch to the group already shown keeps its slot. Not run."
  relations:
    verdict: "idiomatic"
    note: "bindRelationViews (oimdb.ts:802-964): owners and rows in two entity collections on one channel, pair records in a third keyed by [ownerSlot, rowSlot] over OIMSlotTreeStoreService (813-814). holdRelation (881) holds the segments through the slots holdSlotByKey returns, mints the pair records untimed with writeSlotContentByKey, and puts one effect on each touched owner (view A) and each pair record (view B); writePair (926) composes a new key array per call and descends, as the contract requires. frame is run() (869-871). dispose (952) is the channel drop and the adapter's arrays cleared. No relation script times dispose."
  single:
    verdict: "idiomatic"
    note: "bindSingleStore (oimdb.ts:970-1051): one createOIMSingleSlotService with an entity content service on one channel and two store slots, each held through holdSingleSlot and seeded with slotContentService.writeSlotContent (976-979), one effect each (1000-1013), delivery in settle after db.flush (1033-1043); writeSingle is slotContentService.updateEntityColumn on the held slot (1019-1021), so singleResend gets the library's own no-change check. frame is run(); dispose (1044) disposes the two effects and unholds the two slots."
improvements: []
---

## Version

`oimdbAdapter.version` is `4.1.0` (`adapters/oimdb.ts:1061`). The adapter imports the built working tree, `../../../core/dist/index.js` (`oimdb.ts:1-23`), and `departure` says the working tree is ahead of the published 4.0.1.

## Public exports only

`GROUP_ORDER_SORTED_AT_READ.createGroupOrders` (`oimdb.ts:111-140`) builds `createOIMSlotCollectionIndexService({ ...indexKeyOptions, entityService, slotContentService: new OIMSetBucketContentService(), slotReleasePolicy })` with `indexService.createIndexStoreSlot(entityStoreSlot)` (`oimdb.ts:113-122`), then `createOIMSortedComputedService({ indexService, sortColumns: BY_RANK_THEN_ID, slotReleasePolicy })` read through `createSortedStoreSlot(indexStoreSlot)` (`oimdb.ts:123-128`). A held group order is a `TOIMComputedSlot` from `sortedComputedService.holdSlotByKey(sortedComputedStoreSlot, group)`, read as `groupOrder.value` (`oimdb.ts:129-135`). The window effect reads each visible entity through `slot.getEntity(renderedColumns)`, a method of the public entity slot type (`packages/core/src/entity/types/TOIMEntityContentSlot.ts`), with the column group from `entityService.columnSlotService.getColumnGroup` (`oimdb.ts:299-300`, `323`). The churn derivations are `createOIMComputedService` (`oimdb.ts:534`, `551`). Nothing is reached through a private field and no adapter code reports a sort move: the index files the entity and the sorted computed re-sorts when a write changes `rank` or `id`.

## What the engine documents and what the adapter does

- **Entities.** A collection from `createOIMSlotCollectionService` with `createOIMEntityContentService` (`createRowEntityService`, `oimdb.ts:105-106`) with one `createStoreSlot(db)`, over a map-driven store with the default in-place entity writer.
- **Writes.** `write` is `writeSlotContentByKey` per row inside `writeInBatch`; `setGroup` and `setRank` are `slotContentService.updateEntityColumn` on the slot `getSlotByKey` returns (`oimdb.ts:254-259`); label and note patches assign `slot.entity` and call `markEntityChanged`, guarded only against an absent entity.
- **Signal.** One `OIMEffectService.createSourceTrackingEffect` per window view (`oimdb.ts:314-327`), whose sources are the offset slot, the group order and the rank+label column group of the window entities it read; `createEffect` on the pinned column slots; painted in `settle` after `db.flush()`.
- **Derivations.** Chain levels and diamond nodes are slots of two `createOIMComputedService` store slots keyed by subscriber and level (`createChurnMounts`, `oimdb.ts:527`), read with `computedValueService.getValueForSlot`; the effect subscribes to the head slot.
- **Frame.** The window and read bindings run `frame` inside `entityService.writeInBatch(entityStoreSlot, run)`. The relation and single bindings keep `frame` as `run()`.
- **Teardown.** Every binding with entity collections disposes with `db.dispose()` and clears its own arrays (`oimdb.ts:483`, `702`, `786`, `948`); after the drop `flush` returns at once and the scheduled effects are discarded, so no body runs and `settle` paints nothing.

## Holds

- **Entity holds.** `pin` and `holdRelation` keep the slot `holdSlotByKey` returns; there is no second lookup after the hold. The churn rows are resolved with `getSlotByKey` and held by the effects and derivations that subscribe to them.
- **Column holds.** `pin` keeps its column holds until the channel drop; `mountOnColumn` gives its hold back right after subscribing.
- **Order holds.** Each view holds its group-order slot until the channel drop; `switchGroup` gives the old one back after the new one is held.
- **Untimed resolution.** `pin`, the churn row resolution and `holdRelation` resolve slots before the clock, as the contract allows. `readKeys` resolves nothing ahead.

## Not determined

- Nothing was run, linted by a suite or type-checked; no size for any change and no line count.
- churnDiamond, churnChain and viewSwitch were read against this wiring, not executed; the once-per-frame join rests on the enlist guard and the computed's revision check as read.
