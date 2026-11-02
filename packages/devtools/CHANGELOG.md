# Changelog

## 2.2.2

### Changed

- Requires `@oimdb/core` 4.8.0; reads a single computed through `computedService.getSingleSlot`.

## 2.2.1

### Changed

- Requires `@oimdb/core` 4.4.0; reads a computed slot through `computedSlot.value`.

## 2.2.0

### Changed

- Requires `@oimdb/core` 4.2.0.

### Removed

- `oimInitDevtools`. Use `oimDevDefaults` as `defaults` of a factory.

## 2.1.0

### Changed

- Requires `@oimdb/core` 4.1.0.
- `OIMDevRegistry.computed` takes an `OIMSingleComputedService` and its store slot.
- `OIMDevRegistry.collection`: keys are `NonNullable<unknown>`.
