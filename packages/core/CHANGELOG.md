# Changelog

All notable changes to `@oimdb/core` are recorded here. This file starts at 4.0.0; releases
before it were not changelogged.

## 4.1.0

Breaking: exports removed and renamed, `IOIMSlotOwner` has new required members.

### Added

- `IOIMBucketMemberSlotsArrayService`: the members of an array bucket. `OIMBucketMemberSlotsArrayService`
  (default) and `OIMBucketUniqueMemberSlotsArrayService`. Option `bucketMemberSlotsArrayService` on both
  array buckets (`TOIMSlotContentArrayBucketServiceOptions`, `TOIMSlotContentSortedArrayBucketServiceOptions`).
- `slotSubscriptionListener` option: `IOIMSlotSubscriptionListener` (`onSlotFirstSubscribed`,
  `onSlotLastUnsubscribed`), default `OIMNoSlotSubscriptionListener`.
- `OIMSlotReleaseWheel.markSlotReleaseDueNow(slot)`.
- `slotReleaseDueFramePolicy` on `OIMSlotAfterWriteReleasePolicy`: `OIMSlotReleaseAutoDueFramePolicy` (default),
  `OIMSlotReleaseManualDueFramePolicy` (`openSlotReleaseDueFrame`, `closeSlotReleaseDueFrame`,
  `writeInSlotReleaseDueFrame`).
- `OIMSlotWheel`, `OIMSlotReleaseWheel`, `OIMSlotRefetchWheel` (`scheduleSlotRefetchAt`), `IOIMSlotRefetchListener`,
  `TOIMSlotWheelOptions`, `TOIMSlotReleaseWheelOptions`, `TOIMSlotRefetchWheelOptions`.
- `oimMintAfterWriteSlotReleaseWheel`, `oimMintAfterIdleSlotReleaseWheel`, `oimMintAfterUnholdSlotReleaseWheel`.
- `IOIMSlotOwner.unsafeMutateSlot(slot, mutateSlot)`.
- `openBatch`, `closeBatch`, `writeInBatch` on `OIMSlotCollectionService`. An index gets the batch in one
  `onContentChangedMany` when the outermost batch closes. A flush inside a batch is allowed.
- `OIMSlotContentBucketService.getBucketMemberSlotsMissingFrom(bucketSlot, bucketMemberSlots)`.
- `storeSlot.slotService`; `TOIMStoreSlot` has a fourth type parameter.
- `TOIMSlotContentServiceKey`, `TOIMSlotContentServiceSlot`, `TOIMSlotContentServiceSingleSlot`,
  `TOIMSlotContentServiceContent`, `TOIMSlotContentServicePatch`.
- `IOIMSlotContentService`, `IOIMKeyedSlotCreator`, `IOIMSingleSlotCreator`, `IOIMSlotFilingService`.
- `TOIMEntityContentSlot`, `TOIMBucketContentSlot`, `TOIMComputedContentSlot`.
- `OIMWritableSlotCollectionService.writeSlotContentByKey`, `OIMWritableSingleSlotService.writeSingleSlotContent`
  and `clearSingleSlotContent`.
- `OIMSingleComputedService`, `createOIMSingleComputedService`, `TOIMComputedDerivationOptions`.
- `IOIMFlushSchedulerListener`.
- `OIMColumnSlotService`, as `columnSlotService` on `OIMSlotCollectionService` and `OIMSingleSlotService`.
- `OIMSlotContentComputedService` and `TOIMSlotContentComputedServiceOptions` as types.

### Changed

- The release queue is a timing wheel; a slot's place on it is a bit of `slot.slotFlags`.
- Release wheels on `db.collectorSlot` are created on first use.
- A single write files the slot, then tells the index. Nothing is rolled back if the index throws.
- Under a synchronous `channelScheduler` one write can run several frames.
- `releaseSlotContent` throws inside a flush when the slot has content.
- Single slots have the same shape as keyed ones (`key` and `indexKeys` are `undefined`).

### Renamed

- `OIMSlotContentBucketServiceArrayBased` → `OIMSlotContentArrayBucketService`
- `OIMSlotContentBucketServiceArrayDriven` → `OIMSlotContentPositionalArrayBucketService`
- `OIMSlotContentBucketServiceSortedArrayDriven` → `OIMSlotContentSortedArrayBucketService`
- `OIMSlotContentBucketServiceSetDriven` → `OIMSlotContentSetBucketService`
- `TOIMSlotContentBucketServiceSortedArrayDrivenOptions` → `TOIMSlotContentSortedArrayBucketServiceOptions`
- `OIMSlotReleasePolicyAfterWrite` → `OIMSlotAfterWriteReleasePolicy`
- `OIMSlotReleasePolicyAfterIdle` → `OIMSlotAfterIdleReleasePolicy`
- `OIMSlotReleasePolicyAfterUnhold` → `OIMSlotAfterUnholdReleasePolicy`
- `OIMSlotReleasePolicyAtEmpty` → `OIMSlotAtEmptyReleasePolicy`
- `OIMSlotReleasePolicyAtUnhold` → `OIMSlotAtUnholdReleasePolicy`
- `OIMSlotReleasePolicyEarliest` → `OIMSlotEarliestReleasePolicy`
- `OIMSlotReleasePolicyNever` → `OIMSlotNeverReleasePolicy`
- `TOIMSlotReleasePolicyAfterWriteOptions` → `TOIMSlotAfterWriteReleasePolicyOptions`
- `TOIMSlotReleasePolicyAfterIdleOptions` → `TOIMSlotAfterIdleReleasePolicyOptions`
- `TOIMSlotReleasePolicyAfterUnholdOptions` → `TOIMSlotAfterUnholdReleasePolicyOptions`
- `OIMErrorPolicyThrowAtOnce` → `OIMThrowAtOnceErrorPolicy`
- `OIMErrorPolicyLogAndContinue` → `OIMLogAndContinueErrorPolicy`
- `TOIMErrorPolicyLogAndContinueOptions` → `TOIMLogAndContinueErrorPolicyOptions`
- `OIMSlotStoreServiceMapDriven` → `OIMSlotMapStoreService`
- `OIMSlotStoreServiceTreeDriven` → `OIMSlotTreeStoreService`
- `OIMSlotStoreServiceSingleSlotDriven` → `OIMSingleSlotStoreService`
- `OIMIndexKeysServiceAppending` → `OIMAppendingIndexKeysService`
- `OIMIndexKeysServiceReclaiming` → `OIMReclaimingIndexKeysService`
- `OIMColumnOwnerPushDriven` → `OIMPushColumnSlotOwner`
- `OIMColumnOwnerPullDriven` → `OIMPullColumnSlotOwner`
- `OIMColumnOwner` → `OIMColumnSlotOwner`
- `TOIMColumnOwnerOptions` → `TOIMColumnSlotOwnerOptions`
- `OIMComputedServiceSorted` → `OIMSortedComputedService`
- `OIMComputedServiceBucketMemo` → `OIMBucketMemoComputedService`
- `TOIMComputedServiceSortedOptions` → `TOIMSortedComputedServiceOptions`
- `TOIMComputedServiceBucketMemoOptions` → `TOIMBucketMemoComputedServiceOptions`
- `createOIMComputedServiceSorted` → `createOIMSortedComputedService`
- `createOIMComputedServiceBucketMemo` → `createOIMBucketMemoComputedService`
- `OIMKeyTreeWalkComposite` → `OIMCompositeKeyTreeWalk`
- `OIMKeyTreeWalkScalar` → `OIMScalarKeyTreeWalk`
- `TOIMEntityInsertStrategy` → `TOIMEntityInserter`
- `OIMStoreSlotListenerNone` → `OIMNoStoreSlotListener`
- `IOIMSlotEmptiness` → `IOIMSlotEmptinessPolicy`
- `OIMIndexService` → `OIMSlotCollectionIndexService`
- `createOIMIndexService` → `createOIMSlotCollectionIndexService`
- `TOIMIndexServiceFactoryOptions` → `TOIMSlotCollectionIndexServiceFactoryOptions`
- `TOIMIndexServiceOptions` → `TOIMSlotCollectionIndexServiceOptions`
- `TOIMIndexServiceStoreSlot` → `TOIMSlotCollectionIndexServiceStoreSlot`
- `OIMIndexServiceSortedArrayDriven` → `OIMSlotCollectionSortedArrayIndexService`
- `createOIMIndexServiceSortedArrayDriven` → `createOIMSlotCollectionSortedArrayIndexService`

### Removed

- `createOIMEntityService`, `createOIMSingleEntityService`, `createOIMBucketService`,
  `createOIMSingleBucketService`, `createOIMIndexServiceByCompositeKey`, `TOIMBucketCollectionFactoryArguments`,
  `TOIMSlotContentEntityServiceFactoryOptions`. Use `createOIMSlotCollectionService(db, { slotContentService })`
  or `createOIMSingleSlotService(db, { slotContentService })`; an array key needs `slotStoreService`.
- `IOIMSlotContentStrategy`, `IOIMSlotContentFlushStrategy`. Use `IOIMSlotContentService`.
- `OIMSlotColumnService`, and the column doors on the collection and single services. Use their `columnSlotService` (`OIMColumnSlotService`): `getColumn`, `holdColumn`, `getAnyColumn`, `holdAnyColumn`, `getColumnGroup`, `holdColumnGroup`, `unholdColumn`.
- `TOIMBucketSlotsSortedArrayStore`, `TOIMBucketSlotsArrayUniqueStore`. Use `TOIMBucketSlotsArrayStore`.
- `OIMReleaseSlotCollectorService`, `OIMReleaseSlotCollectorServiceAfterWrite`,
  `OIMReleaseSlotCollectorServiceAfterIdle`, `OIMReleaseSlotCollectorServiceAfterUnhold`,
  `OIMReleaseSlotQueueService`, `TOIMReleaseSlotCollectorSlot`, `createOIMReleaseSlotCollectorSlot`, and the
  `…ReleaseSlotCollectorSlot` fields of `TOIMCollectorSlot`. Use the release wheels.
- `IOIMBucketArrayMembership`, `OIMBucketArrayMembershipNonUnique`, `OIMBucketArrayMembershipUnique`, option
  `bucketArrayMembership`. Use `bucketMemberSlotsArrayService`.
- `upsertEntities`, `insertEntities`, `fillEntities`, `clearAllEntities`, `deleteEntities` and their errors.
  Loop single writes inside `writeInBatch`.
- Subframes: `openSubframe`, `closeSubframe`, `isSubframeOpen`, `listChangedStoreSlot`,
  `IOIMSubframeCloseListener` and their fields. Use a batch.
- `fillSlotContent` on `IOIMSlotContentWriter` and the content services.

## 4.0.1

Speed, with no change to the API.

- `OIMSlotOwnerService.isAnyColumnReferenced` looks only at the slot's own column slots.
- `OIMColumnOwner.mintColumnGroupSlot` skips rebuilding the key of a group already registered by the
  same object.
- `oimMergeRootSlots` drops duplicate roots with a linear scan up to 16 roots and a `Set` above.
- `OIMIndexService.updateIndexKeysForSlots` groups only under buckets it minted.
- `OIMSlotContentEntityService.fillEachEntity` detects a repeated key by the store's size when the
  store started empty.

## 4.0.0

A ground-up rewrite, not an incremental version: **nothing from the 3.x public API survives
unchanged.** There is no port table. The exported surface is `src/index.ts`, enumerated in the
README's export reference, and [the documentation](https://oimdb.org/docs/) describes it as it
is rather than as a diff.

### The two changes everything else follows from

- **Key-addressed → identity-addressed.** 3.x looked a key up on every operation. 4.0 resolves a
  key to a slot once (`getSlotByKey`, `holdSlotByKey`) and works through that slot afterwards.
  `updateEntity` takes a slot; `updateEntityByKey` / `deleteEntityByKey` say the lookup in their
  names.
- **A god-object runtime → stateless services over slots.** Writes and reads are methods of the
  service that owns the slot; delivery is `OIMChannelService`'s; `OIMDB` is a root that builds
  collections with its defaults and drives `flush()`.

### What the engine is made of

- **Slots and their owners.** Every observable thing is a slot — an entity, a column, a bucket, a
  computed — and only its owner mutates it. `OIMSlotOwnerService` owns a collection's slots and
  decides when an unheld one goes, through an injected `IOIMSlotReleasePolicy` (`AtEmpty` by
  default, plus `AtUnhold`, `AfterUnhold`, `AfterWrite`, `AfterIdle`, `Never` and `Earliest`).
- **Entities.** `createOIMEntityService` for a keyed collection, `createOIMSingleEntityService` for
  one record. The writer is a fork chosen at construction: `createOIMEntityWriterInPlace` or
  `createOIMEntityWriterReplacing`, each with an insert strategy (`oimInsertEntityWithCopy`,
  `oimInsertEntityWithoutCopy`, `oimInsertEntityWithSanitizedCopy`).
- **Columns.** `OIMColumnOwner` owns column slots on any slot, so an effect can wait on one
  column of one entity (`holdColumn`, `holdColumnGroup`).
- **Buckets and indexes.** `createOIMBucketService` holds slots the caller files;
  `createOIMIndexService` files an entity collection's slots by `keyOf`. How a bucket holds its slots
  is a fork: `OIMSlotContentBucketServiceSetDriven`, `OIMSlotContentBucketServiceArrayDriven` or
  `OIMSlotContentBucketServiceSortedArrayDriven`. Positional edits record a command script through
  `OIMBucketCommands`.
- **Computeds.** A computed is a `TOIMComputedSlot` created and read only by its service —
  `createOIMComputedService`, `createOIMComputedServiceSorted` or `createOIMComputedServiceBucketMemo` —
  over named sources. It is pulled: a read refreshes it against the channel clock.
- **Delivery.** `OIMChannelService` coalesces a frame's writes and `OIMEffectService` runs each
  effect once per frame over its root slots and source computeds; `subscribeAfterEachFrame`,
  `subscribeAfterEachFlush` and `subscribeOnceAfterFrame` run after it. Errors go through an
  `IOIMErrorPolicy`.
- **Keys.** A composite key is a chain descended one segment at a time
  (`OIMSlotStoreServiceTreeDriven` with `OIMKeyTreeWalkScalar` or `OIMKeyTreeWalkComposite`), so
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

- `@oimdb/react`: `OIMDBProvider` / `useOIMDB`, with `useOIMValue`, `useOIMEntity`, `useOIMField`,
  `useOIMBucketSlots`, `useOIMBucketSlotsByKey`, `useOIMSlotsByKeys` and the computed hooks.
- `@oimdb/persist`: `OIMPersistor` with `OIMPersistResourceSnapshot` and `OIMPersistResourceRecords`.
- `@oimdb/exodra`: `exoBinding`, `exoSource`, `exoCombine`, `exoFollowKey`, `exoRows`, `exoList`,
  `exoDerivedList`, `exoPositionalList`.
- `@oimdb/async`: deprecated outright, exports nothing.
