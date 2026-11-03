# Changelog

All notable changes to `@oimdb/core` are recorded here. This file starts at 4.0.0; releases
before it were not changelogged.

## 4.10.0

### Changed

- Index option `keyOf` → `selectKey`.

## 4.9.0

### Added

- `slot.watch(body, columnNames?)` on entity, computed and bucket slots; returns a disposer.
- Column doors on computed slots: `getColumnSlot`, `holdColumnSlot`, `getAnyColumnSlot`, `holdAnyColumnSlot`, `getColumnGroupSlot`, `holdColumnGroupSlot`; `TOIMComputedCarrierSlot`.
- `columnSlot.value` on every column slot (entity, bucket and computed).
- `IOIMSlotContentService.peekColumnValue` / `peekColumnGroupValue` / `peekAnyColumnValue`.
- `db.addSlotReleaseListener(listener)` → `TOIMDisposer`; `IOIMSlotReleaseListener`.
- `db.claimSlotDataCell()`: a `slot.data` cell index per consumer.
- `OIMBucketCommandsCursor` (`takeBucketCommands()`), `TOIMBucketCommandsCursorOptions`.
- `OIM_NOOP_DISPOSER`.
- `bucketCommands` on `OIMSortedArrayBucketContentService` and `createOIMSlotCollectionSortedArrayIndexService` (records the whole list).
- `columnNames` / `columnGroups` on `createOIMSortedComputedService` and `createOIMBucketMemoComputedService`; `slotSubscriptionListener` on every computed factory.

### Renamed

- Functions: `oim` + verb + object → verb + `OIM` + object (`oimIsSlotReleased` → `isOIMSlotReleased`, `oimSameValueZeroGuard` → `isOIMSameValueZero`, `oimGetBucketMemberSlotEntities` → `getOIMBucketMemberSlotEntities`, `oimPatchEntityColumn` → `patchOIMEntityColumn`, …).
- `TOIMEntityColumnName` → `TOIMColumnName`.
- `computedSlotStoreService` → `slotStoreService` on computed factories.
- Column doors: `getColumn` → `getColumnSlot`, `holdColumn` → `holdColumnSlot`, `unholdColumn` → `unholdColumnSlot`, `getAnyColumn` → `getAnyColumnSlot`, `holdAnyColumn` → `holdAnyColumnSlot`, `holdColumnGroup` → `holdColumnGroupSlot`; `getBucketColumnByKey` / `holdBucketColumnByKey` / `getAnyBucketColumnByKey` / `holdAnyBucketColumnByKey` → `…ColumnSlotByKey`; `getBucketColumn` / `holdBucketColumn` / `getAnyBucketColumn` / `holdAnyBucketColumn` → `…ColumnSlot`.
- `allRootSlots` → `rootSlots` (computed slots and effects).
- `readEntity(columnGroup)` → `getEntity(columnGroup)`.
- `findSlotByKey` → `peekSlotByKey`, `findSingleSlot` → `peekSingleSlot`, `findEntitySlotsByKeys` → `peekEntitySlotsByKeys`.
- `getOIMChannelSlot` → `peekOIMChannelSlot`, `getOIMBucketSlotsSetStore` → `peekOIMBucketSlotsSetStore`, `getOIMReleaseDueAfter{Idle,Unhold,Write}Ms` → `peekOIMReleaseDueAfter{Idle,Unhold,Write}Ms`.

### Changed

- A computed column slot is an `OIMColumnSlot`, like an entity column; `TOIMComputedColumnSlot<TSourceTracker>` carries its carrier's tracker type.
- `OIMEffectService`'s source-tracking list takes any computed.
- A bucket column slot wakes when a member joins or leaves, not only when a member's column is written.
- `OIMSlotRefetchWheel` hands over every due slot that is not released, including one nobody subscribes to.
- `db.createEffect(body, sourceSlots)` refuses a slot with `sourceComputeds` (a computed) instead of a slot with `value`.

### Fixed

- A column of a source-tracking computed follows the carrier's new sources.
- `db.createEffect(body, sourceSlots)` called inside a tracked body no longer tracks the slots its first run reads.

## 4.8.0

### Added

- `OIMEntitySlotCollectionStoreAggregate` with `getEntities()` / `getEntityCount()`, returned by `createOIMEntitySlotCollectionStoreAggregate`.
- `OIMSlotCollectionBucketService.INSTANCE.getBucketSlot(storeSlot)` / `holdBucketSlot(storeSlot)`, `OIMCollectionSetBucketContentService`, `TOIMCollectionBucketSlot`, `TOIMSlotCollectionStoreSlot`.
- `oimGetBucketMemberSlotEntities(bucketMemberSlots)`.
- `OIMExplicitSourceComputedContentService`, `TOIMExplicitSourceComputedContentServiceOptions`.
- `createOIMColumnGroup(columnNames)`.
- `OIMDB` option `createSchemas: (db) => schemas` and field `db.schemas`; `OIMDB<TSchemas>`.
- `db.createEffect(body, sourceSlots?, { lazy? })`, returns a disposer.
- `db.dispose()`.
- `createOIMSortedCollectionSingleSlotStoreAggregate(collection, { sortColumns?, comparator? })`.
- `OIMSlotCollectionBucketService.INSTANCE.getBucketColumn` / `holdBucketColumn` / `getAnyBucketColumn` / `holdAnyBucketColumn`.
- `OIMSlotContentChangeListenerService.addListenerReadColumn` / `addListenerReadAnyColumn`; `addContentChangeListener` returns `TOIMSlotContentChangeListenerReadColumns`; `oimIsAnyAddedColumnRead`; `TOIMStoreSlot.slotContentChangeListenerReadColumns`.
- `columnGroups` option on the collection, single, index, entity aggregate and computed factories (`TOIMColumnSlotOwnerOptions.columnGroups`).

### Changed

- Index and sorted bucket member slots are typed with the collection key (`slot.key: TOIMStoreKey`, was `{}`).
- `OIMSlotCollectionIndexService.getEntitiesByKey` / `OIMSlotCollectionIndexStoreAggregate.getEntitiesByKey` return `TEntity[]` (was `(TEntity | undefined)[]`) and track.
- `OIMSortedArrayBucketContentService` options: `bucketCommands` removed.
- A slot filed during a release sweep lands in its own slice after the sweep (was one slice above the sweep).
- `new OIMSlotRefetchWheel(db, { slotRefetchListener })` (was `new OIMSlotRefetchWheel({ slotRefetchListener, getNowMs?, timer?, errorPolicy? })`).
- `TOIMEntitySlot`, `TOIMEntityContentSlot`, `OIMEntitySlot`: third generic `TColumnName`; `getColumn` / `holdColumn` take it.
- `data` (the user's cache, never touched by the core) is on every slot (`TOIMSlot`, `OIMSlot`), not only the entity slot.
- A slot minted by a write is filed by the collection / single service before `insertSlotContent`, like one minted by a get or a hold; `insertSlotContent` no longer files.
- `OIMComputedContentService` is abstract; `createSources` → `OIMExplicitSourceComputedContentService`.
- A throwing `channelScheduler` goes through the error policy (logged by default; the next write asks again).
- `holdColumnGroup` / `getColumnGroupSlot` take only a group named in `columnGroups`; a group read through `readEntity(columnGroup)` needs no declaration.
- `TOIMColumnGroup<TColumnName>` is generic.
- `openBatch` / `closeBatch` / `writeInBatch` are on `OIMWritableSlotCollectionService` / `OIMWritableSlotCollectionStoreAggregate` only (were on every collection service and aggregate).
- `OIMSlotOwner` is abstract: `releaseSlotIfUnheld` is abstract.
- `OIMSlotCollectionService` is abstract with no public store-slot door; `OIMWritableSlotCollectionService.createStoreSlot`. `OIMComputedService`, `OIMSourceTrackingComputedService`, `OIMSortedComputedService`, `OIMBucketMemoComputedService` extend `OIMSlotCollectionService`. `OIMSingleComputedService`, `OIMSingleSourceTrackingComputedService` extend `OIMSingleSlotService`.
- `new OIMSlotOwner(slotSubscriptionListener?)`; `createColumnSlotOwner(columnSlotOwnerOptions, slotSubscriptionListener)`, `createOIMPushColumnSlotOwner(options, slotSubscriptionListener?)`, `createOIMPullColumnSlotOwner(options, slotSubscriptionListener?)`.

### Renamed

- `OIMComputedService.createComputedStoreSlot`, `OIMSourceTrackingComputedService.createComputedStoreSlot`, `OIMSingleComputedService.createComputedStoreSlot`, `OIMSingleSourceTrackingComputedService.createComputedStoreSlot` → `createStoreSlot`.
- `IOIMSlotFilingService.fileSlot` / `unfileSlot` → `set` / `delete` (every store service).
- `TOIMStoreSlot.contentChangeListenerReadColumnNames` → `contentChangeListenerReadColumns`.
- `OIMBucketContentService.markBucketColumnsChanged` → `oimMarkBucketColumnsChanged`.

### Removed

- `computedCollectionService` on the four computed services; `computedSingleSlotService` on the two single computed services.
- `IOIMSlotOwner.onSlotFirstSubscribed` / `onSlotLastUnsubscribed` (protected on `OIMSlotOwner`).
- `OIMSlotCollectionService.slotOwner`, `OIMSingleSlotService.slotOwner`.
- `OIMSlotCollectionService.createStoreSlot` / `createStoreSlotFrom` / `createStoreAggregate` → the subclass's own door.
- `OIMSlotOwner.onSlotIdle`, `OIMSlotOwnerService.onSlotIdle`.
- `OIMSlotOwnerService.releaseSlotIfUnheldAfterListeners` → `releaseSlotIfUnheld`.
- `OIMSlotContentChangeDeliveryService.isBatchOpen`.
- `IOIMSlotContentService.hasReference` and its implementations.
- `OIMSourceTracker.readSourceSlot` → `trackSourceSlot`; `readSourceComputedValue` → the computed slot's `value` while the tracker is active.
- `IOIMEffectService.runEffect`, `runEffectIfSourcesChanged`.
- `IOIMSlotFilingService.getSlots` / `getSlotCount` → `IOIMSlotStoreService`; `OIMSingleSlotStoreService.getSlots` / `getSlotCount`.
- `IOIMSlotStoreService.set(store, key, slot)` / `remove(store, key)` → `set(store, slot)` / `delete(store, slot)`.
- `OIMColumnSlotService.getColumnGroup` / `OIMColumnSlotOwner.getColumnGroup` → `createOIMColumnGroup`.
- `@oimdb/core/oimdb` (with `getInstance` / `db`) and `@oimdb/core/soimdb`; `OIMEntityCollection`, `OIMSingleEntity`, `OIMEntityIndex`, `OIMSortedEntityIndex` → the store aggregates in `createSchemas` and the slot methods; `effect` → `db.createEffect`.
- `OIMColumnSlotOwner.isAnyColumnReferenced`, `OIMSlotOwnerService.isAnyColumnReferenced`.
- `OIMSlotOwnerService.takeChangedColumnNames`.
- `OIMSlotOwnerService.writeSlotToChannelAndSettle` → `markSlotContentChanged(slot, isEmpty)`.
- `TOIMStoreSlot.bucketColumnNames` / `isAnyBucketColumnRead` (and on `TOIMIndexStoreSlot`); `TOIMStoreSlot.keptStampedEntitySlots`; `OIMSlotContentChangeListenerService.addReadColumn` / `removeReadColumn` / `addReadAnyColumn` / `removeReadAnyColumn` are private.
- `TOIMColumnReaders`; `TOIMStoreSlot.columnGroupsByKey`, `columnGroupSlotCountsByKey`, `columnReadersByColumnName`, `anyColumnSlotCount`.

### Fixed

- A sorted computed sees a bucket member swapped by hand.
- An effect that disposes itself during its run no longer resubscribes.
- Moving a slot to a column-filtered edge keeps its column wakes.
- A late bucket column read on a disposed index leaves no read registration on the source.
- A column mint that throws leaves no column store behind.
- An empty list written to a new bucket key keeps the slot until the flush.
- `dropChannelSlot` cancels the release wheels.
- The default release timer caps a delay at 2^31-1 ms.
- A slot queued in a batch is not released before delivery; a nested batch on the same store slot is delivered once.

## 4.7.0

### Added

- `oimdb.getInstance()`: the default database; `oimdb.db()` is the same function.

### Renamed

- `@oimdb/core/oim` → `@oimdb/core/oimdb` (the default-db layer).
- `@oimdb/core/oimdb` (db first) → `@oimdb/core/soimdb`. `@oimdb/core/oimdb` is now the default-db layer.

## 4.6.0

### Added

- `@oimdb/core/oimdb`: `db`, `entities`, `entity`, `index`, `sorted`, `computed`, `effect`, `OIMEntityCollection`, `OIMSingleEntity`, `OIMEntityIndex`, `OIMSortedEntityIndex`.
- `@oimdb/core/soimdb`: the same names, db first.
- `IOIMSourceTracker` (type-only export).
- `createOIMEntitySlotCollectionStoreAggregate<TEntity, TColumnName?>(db, options?)`.

### Changed

- `OIMSourceTracker.activeSourceTracker` → internal `OIM_ACTIVE_SOURCE_TRACKER`.

## 4.5.0

### Added

- `createOIMSlotCollectionIndexStoreAggregate(slotCollectionStoreAggregate, options)`.

## 4.4.0

4.x collects feedback; 5.0 freezes the interface.

### Added


- `entitySlot.readEntity(columnGroup)`: a tracked read that makes only the group's columns a source.

- Methods on an entity slot (`TOIMEntitySlot`): `writeSlotContent`, `updateEntity`, `updateEntityColumn`, `deleteEntityColumns`, `markEntityChanged`, `clearSlotContent`, `getColumn`, `holdColumn`, `getAnyColumn`, `holdAnyColumn`, `getColumnGroupSlot`, `holdColumnGroup`, `holdSlot`, `unholdSlot`.
- Methods on a bucket slot (`TOIMBucketSlot`): `getBucketMemberSlots`, `getBucketMemberSlotCount`, `hasBucketMemberSlot`, `getBucketMemberSlotsMissingFrom`, `writeSlotContent`, `addBucketMemberSlot`, `addBucketMemberSlots`, `removeBucketMemberSlot`, `removeBucketMemberSlots`, `clearSlotContent`, `markContentChanged`, `holdSlot`, `unholdSlot`.
- `holdSlot`, `unholdSlot` on a computed slot (`TOIMComputedSlot`) and a column slot (`TOIMColumnSlot`).
- `slot.entity` and `computedSlot.value` are getters; read inside a source-tracking body, they make the slot a source. So do a bucket slot's membership reads.
- `OIMColumnSlotService.getColumnGroupSlot(slot, columnGroup)`.

### Changed

- `TOIMSourceTrackingEffectBody` and `TOIMSourceTrackingComputedDerive` take no `sourceTracker`; no `onSlotRead` hook: slots register their reads with the tracker themselves.


- Removed from the public slot types: `content` (entity, computed), `computedValueService` (computed), `bucketSlotsStore` (bucket). Read `slot.entity` / `slot.value`. `IOIMEntityWriter` and `TOIMEntityInserter` take `OIMEntitySlot` (type-only export), whose base is `OIMSlot` (type-only export).
- A custom `IOIMEntityWriter` or `IOIMSlotStamp` writes the slot's `content`, not `entity`.

### Renamed

- `OIMSlotOwnerService` → `OIMSlotOwnerService`; `TOIMSlotOwnerServiceOptions` → `TOIMSlotOwnerServiceOptions`; `TOIMEntitySlotOwnerService` → `TOIMEntitySlotOwnerService`; `TOIMBucketSlotOwnerService` → `TOIMBucketSlotOwnerService`.

- `OIMSlotContentEntityService` → `OIMEntityContentService`; `createOIMSlotContentEntityService` → `createOIMEntityContentService`; `TOIMSlotContentEntityServiceOptions` → `TOIMEntityContentServiceOptions`.
- `OIMSlotContentBucketService` → `OIMBucketContentService`; `OIMSlotContentSetBucketService` → `OIMSetBucketContentService`; `OIMSlotContentArrayBucketService` → `OIMArrayBucketContentService`; `OIMSlotContentPositionalArrayBucketService` → `OIMPositionalArrayBucketContentService`; `OIMSlotContentSortedArrayBucketService` → `OIMSortedArrayBucketContentService`; `TOIMSlotContentBucketServiceOptions` → `TOIMBucketContentServiceOptions`; `TOIMSlotContentArrayBucketServiceOptions` → `TOIMArrayBucketContentServiceOptions`; `TOIMSlotContentSortedArrayBucketServiceOptions` → `TOIMSortedArrayBucketContentServiceOptions`.
- `OIMSlotContentComputedService` → `OIMComputedContentService`; `OIMSlotContentSourceTrackingComputedService` → `OIMSourceTrackingComputedContentService`; `TOIMSlotContentComputedServiceOptions` → `TOIMComputedContentServiceOptions`.
- The old names stay exported as deprecated aliases until 5.0.

### Deprecated

- `OIMEntityContentService`: `writeSlotContent`, `updateEntity`, `updateEntityColumn`, `deleteEntityColumns`, `markEntityChanged`, `clearSlotContent`; `OIMBucketContentService` (and subclasses): `getBucketMemberSlots`, `getBucketMemberSlotCount`, `hasBucketMemberSlot`, `getBucketMemberSlotsMissingFrom`, `writeSlotContent`, `addBucketMemberSlot(s)`, `removeBucketMemberSlot(s)`, `clearSlotContent`, `markContentChanged` → the same method on the slot, without the slot argument.

## 4.3.0

### Added

- `OIMSlotCollectionStoreAggregate`, `OIMWritableSlotCollectionStoreAggregate`, `OIMSingleSlotStoreAggregate`, `OIMWritableSingleSlotStoreAggregate`, `OIMSlotCollectionIndexStoreAggregate`.
- `createStoreAggregate(storeSlot)` on `OIMSlotCollectionService`, `OIMWritableSlotCollectionService`, `OIMSingleSlotService`, `OIMWritableSingleSlotService`, `OIMSlotCollectionIndexService`.
- `createOIMSlotCollectionStoreAggregate(db, options)`, `createOIMSingleSlotStoreAggregate(db, options)`.

### Changed

- `TOIMComputedStoreSlot` has a fourth type parameter, the slot service. The store slots of the computed services carry their service's type in `slotService`.

## 4.2.0

### Added

- `OIMDefaults` instance (`new OIMDefaults(options)`, `OIMDefaults.INSTANCE`), `TOIMDefaultsOptions`; option `defaults` on every factory.
- `releaseValue` option on `createOIMComputedService` and `createOIMSingleComputedService`; `TOIMComputedValueReleaser`.
- `createOIMSourceTrackingComputedService`, `createOIMSingleSourceTrackingComputedService`, `OIMSourceTrackingComputedService`, `OIMSingleSourceTrackingComputedService`, `TOIMSourceTrackingComputedSlot`, `TOIMSourceTrackingComputedContentSlot`, `TOIMSourceTrackingComputedDerive`, `TOIMSourceTrackingComputedDerivationOptions`, `OIMSlotContentSourceTrackingComputedService` (type), `TOIMComputedServiceFactoryOptions`.

### Changed

- `createOIMSlotCollectionService`, `createOIMSingleSlotService`, `createOIMSlotContentEntityService`, `createOIMSlotCollectionIndexService`, `createOIMSlotCollectionSortedArrayIndexService`: no `db` argument.
- `createEffect`, `createAndRunEffect`, `subscribeEffect`: `(db, body, sourceSlots?, sourceComputeds?, sourceTrackingComputeds?)`.
- `closeBatch` throws when no batch is open.
- A slot written inside a batch is released only after the batch is delivered.
- Slot flag bit `32` is taken by the engine; a library's own bits start at `64`.
- `TOIMSlot.storeSlot` is required; a column slot carries its carrier's store slot.
- A last unhold inside a flush releases the slot at once, for every slot kind.
- `IOIMSlotContentService.releaseSlotContent(slot)` takes the slot only and throws on a held slot.
- `TOIMChannelClock.epoch` is an int32 that wraps; `oimIsRevisionAfter` compares epochs as `(epoch - sinceEpoch) | 0`.

### Removed

- `OIMDefaults.STANDALONE_SLOT_OWNER`. Use `new OIMSlotOwner()`.
- `OIMDefaults` static fields and `OIMDefaultValue.setValue`. Use `new OIMDefaults({ … })` passed as `defaults`.
- `OIMDefaults.KEY_TREE_WALK_SCALAR`, `OIMDefaults.KEY_TREE_WALK_COMPOSITE`. Use `OIMScalarKeyTreeWalk.INSTANCE`, `OIMCompositeKeyTreeWalk.INSTANCE`.
- `OIMDefaults.ENTITY_SLOT_EMPTINESS`. Use `new OIMDefaults({ entitySlotEmptinessPolicy })`.
- `TOIMDBOptions.entityWriter`, `slotStamp`, `slotReleasePolicy`, `indexKeysService` and the same fields of `OIMDB`. Use `OIMDefaults`.

### Renamed

- `TOIMSlotEditable` → `TOIMEditable`
- `OIMEffectService.createEffectImmediate` → `createAndRunEffect`
- `OIMEffectService.createEffectWithSourceTracking` → `createSourceTrackingEffect`
- `TOIMEffectBodyWithSourceTracking` → `TOIMSourceTrackingEffectBody`
- `OIMEffectSourceTracker` → `OIMSourceTracker`
- `IOIMContentChangeListener.onContentChangedMany` → `onManyContentsChanged`
- `createOIMEntityWriterInPlace` → `createOIMInPlaceEntityWriter`
- `createOIMEntityWriterReplacing` → `createOIMReplacingEntityWriter`
- `oimPatchEntityColumnsGuarded` → `oimGuardedPatchEntityColumns`
- `oimPatchEntityColumnGuarded` → `oimGuardedPatchEntityColumn`
- `oimPutEntityColumnsGuarded` → `oimGuardedPutEntityColumns`
- `TOIMSortColumn.column` → `columnName`
- `TOIMSlotStoreTree.root` → `rootCompositeKeyNode`
- `TOIMDerivation` → `TOIMComputedDerivation`
- `OIMContentChangeListenerService` → `OIMSlotContentChangeListenerService`
- `IOIMContentChangeListener` → `IOIMSlotContentChangeListener`

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
