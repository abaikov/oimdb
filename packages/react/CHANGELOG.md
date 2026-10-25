# Changelog

## 3.1.0

### Changed

- Requires `@oimdb/core` 4.1.0.
- `useOIMSingleComputedValue` takes an `OIMSingleComputedService`; `derive` and `createSources` take the computed slot.
- `useOIMComputedCollection`: `createSources` takes the computed slot, not the key.
- `useOIMField` reads `getColumn` from the service's `columnSlotService`.
- `useOIMSingleEntity`, `useOIMSingleBucketSlots`, `useOIMBucketSlots` take content slots (`TOIMEntityContentSlot`, `TOIMBucketContentSlot`).
- Keys are `NonNullable<unknown>`.
