# Changelog

All notable changes to `@oimdb/persist` are recorded here. This file starts at 4.1.0; releases
before it were not changelogged.

## 4.3.1

### Changed

- Internal helpers renamed; no API change.

## 4.3.0

### Changed

- Requires `@oimdb/core` 4.9.0; functions renamed to verb + OIM + object (`oimWritePersistRecordsDelta` → `writeOIMPersistRecordsDelta`, `oimUpsertPersistRecords` → `upsertOIMPersistRecords`, `oimHydratePersistResource` → `hydrateOIMPersistResource`, `oimDeliverPersistErrors` → `deliverOIMPersistErrors`, `oimHaveSameColumns` → `hasOIMSameColumns`, …); `oimNoop` → core `OIM_NOOP_DISPOSER`.

## 4.2.0

Requires `@oimdb/core` 4.4.0.

### Renamed

- `TOIMPersistRecordSourceBucketDrivenOptions.slotContentBucketService` → `bucketContentService`.

## 4.1.0

Breaking: exports renamed, source options changed. Requires `@oimdb/core` 4.2.0.

### Changed

- `TOIMPersistEntityCollectionService`: `getSlots`, `findSlotByKey`, `writeSlotContentByKey`, `writeInBatch` and
  `slotContentService` of a collection from `createOIMSlotCollectionService`.
- `TOIMPersistSingleEntityService`: `getSingleSlot`, `findSingleSlot` and `writeSingleSlotContent` of a single
  from `createOIMSingleSlotService`.
- `OIMPersistSingleEntitySnapshotSource` `entityStoreSlot`: `TOIMSingleSlotStoreSlot<TOIMEntityContentSlot<TEntity>>`.
- `OIMPersistBucketRecordSource`: `bucketSlot` is a `TOIMBucketContentSlot<TSlots>`; the `TBucketKey` type
  parameter is removed.
- `OIMPersistBucketRecordSource` `slotContentBucketService`: `writeSlotContent` in place of `writeBucketMemberSlots`.
- `OIMPersistEntityWriter`: the writer methods take a `TOIMEntityContentSlot`.
- The `TKey` type parameter of record sources, records resources and `OIMPersistor.load` / `unload`:
  `TKey extends NonNullable<unknown>`.

### Removed

- `IOIMPersistRecordSource.readRecordsDeltaOfKeys(keys)` → `readRecordsDelta(findEntitySlotsByKeys(keys))`.

### Renamed

- `OIMPersistResourceRecords` → `OIMPersistRecordsResource`
- `OIMPersistResourceSnapshot` → `OIMPersistSnapshotResource`
- `persistRecordsStrategy` → `persistRecordsService`
- `persistSnapshotStrategy` → `persistSnapshotService`
- `IOIMPersistRecordsStrategy` → `IOIMPersistRecordsService`
- `IOIMPersistSnapshotStrategy` → `IOIMPersistSnapshotService`
- `OIMPersistKeyValueEntryStrategy` → `OIMPersistKeyValueEntrySnapshotService`
- `OIMPersistKeyValuePathStrategy` → `OIMPersistKeyValuePathSnapshotService`
- `TOIMPersistKeyValueEntryStrategyOptions` → `TOIMPersistKeyValueEntrySnapshotServiceOptions`
- `TOIMPersistKeyValuePathStrategyOptions` → `TOIMPersistKeyValuePathSnapshotServiceOptions`
- `OIMPersistKeyValueStorageItemDriven` → `OIMPersistItemKeyValueStorage`
- `TOIMPersistKeyValueStorageItemDrivenOptions` → `TOIMPersistItemKeyValueStorageOptions`
- `OIMPersistCodecIdentity` → `OIMPersistIdentityCodec`
- `OIMPersistCodecVersioned` → `OIMPersistVersionedCodec`
- `TOIMPersistCodecVersionedOptions` → `TOIMPersistVersionedCodecOptions`
- `OIMPersistSchedulerFrameDriven` → `OIMPersistFrameScheduler`
- `OIMPersistSchedulerMicrotaskDriven` → `OIMPersistMicrotaskScheduler`
- `OIMPersistRecordSourceBucketDriven` → `OIMPersistBucketRecordSource`
- `OIMPersistRecordSourceCollectionWriteDriven` → `OIMPersistCollectionWriteRecordSource`
- `OIMPersistRecordSourceCollectionChangeDriven` → `OIMPersistCollectionChangeWriteRecordSource`
- `OIMPersistSnapshotSourceSingleEntityDriven` → `OIMPersistSingleEntitySnapshotSource`
- `OIMPersistSourceChangeMarkSlotDriven` → `OIMPersistSlotSourceChangeMark`
- `OIMPersistSourceChangeMarkSubscriptionDriven` → `OIMPersistSubscriptionSourceChangeMark`
