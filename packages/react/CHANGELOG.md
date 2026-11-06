# Changelog

## 4.1.0

### Changed

- Requires `@oimdb/core` 4.14.0.
- `useOIMSelector(select, deps?)` and `useOIMSelector.withTypes()` take optional `deps`: without them `select` runs every render; with them only on a deps change or a write, including one not yet flushed; `[]` is static.
- The commit runs in an insertion effect, only when the tracked sources changed.
- The shorthand hooks pass `[aggregate, key]` as `deps`.
- Mount and a key move cost one render; one more only if a slot it read was written or released, or any slot nobody held was written, between render and subscribe.

### Fixed

- A selector over a released slot no longer loops, throws or stays unsubscribed.

## 4.0.0

### Added

- `useOIMSelector(select)` and `useOIMSelector.withTypes<TDB>()`.
- `useOIMEntityByKey`, `useOIMEntities`, `useOIMEntitiesByKey`, `useOIMBucketMemberKeysByKey`.

### Changed

- Requires `@oimdb/core` 4.13.0.
- `useOIMSingleEntity`, `useOIMSingleComputedValue` and `useOIMComputedValueByKey` take aggregates.

### Removed

- `useOIMValue`, `TOIMBinding`, `useOIMSourceTrackingValue` → `useOIMSelector`.
- `useOIMEntity`, `useOIMField`, `useOIMBucketSlots`, `useOIMBucketSlotsByKey`, `useOIMSingleBucketSlots`, `useOIMSlotsByKeys`, `useOIMComputedCollection` → `useOIMSelector` or the shorthands above.

## 3.5.0

### Changed

- Requires `@oimdb/core` 4.9.0; `useOIMField` reads the column through `getColumnSlot`.

## 3.4.0

### Added

- `useOIMDB.withTypes<TDB>()`.

### Changed

- Requires `@oimdb/core` 4.8.0.

## 3.3.2

### Changed

- README: examples use `@oimdb/core/oimdb`.

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
