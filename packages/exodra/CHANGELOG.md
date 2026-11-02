# Changelog

## 1.1.2

### Changed

- Requires `@oimdb/core` 4.8.0; the README reads a computed through the service itself.

## 1.1.1

### Changed

- Requires `@oimdb/core` 4.4.0 (renamed content services); reads a computed slot through `computedSlot.value`.

## 1.1.0

### Changed

- Requires `@oimdb/core` 4.2.0.
- `exoCombine(fn, sources)`: the function comes first.

## 1.0.1

### Changed

- Requires `@oimdb/core` 4.1.0.
- `exoDerivedList` takes `TOIMComputedContentSlot`; the `TKey` type parameter is removed.
- `TOIMExoBinding.sourceComputeds` takes `TOIMComputedContentSlot[]`.
