# Changelog

## 3.3.1

### Changed

- README: examples use `@oimdb/core/oim` and `useOIMSourceTrackingValue`.

## 3.3.0

### Added

- `useOIMSourceTrackingValue(read, deps)`.

### Changed

- Requires `@oimdb/core` 4.4.0.

## 3.2.0

### Changed

- Requires `@oimdb/core` 4.3.0.
- `useOIMEntity(entityStoreSlot, key)`, `useOIMBucketSlotsByKey(bucketStoreSlot, key)`, `useOIMSlotsByKeys(storeSlot, keys)`, `useOIMComputedValueByKey(computedStoreSlot, key)`, `useOIMSingleEntity(singleSlotStoreSlot)`, `useOIMSingleBucketSlots(singleSlotStoreSlot)`: no service argument; the service is `storeSlot.slotService`.

## 3.1.0

### Changed

- Requires `@oimdb/core` 4.2.0.
- `useOIMSingleComputedValue` takes an `OIMSingleComputedService`; `derive` and `createSources` take the computed slot.
- `useOIMComputedCollection`: `createSources` takes the computed slot, not the key.
- `useOIMField` reads `getColumn` from the service's `columnSlotService`.
- `useOIMSingleEntity`, `useOIMSingleBucketSlots`, `useOIMBucketSlots` take content slots (`TOIMEntityContentSlot`, `TOIMBucketContentSlot`).
- Keys are `NonNullable<unknown>`.
