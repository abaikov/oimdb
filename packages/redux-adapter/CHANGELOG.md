# Changelog

## 3.2.0

### Changed

- Requires `@oimdb/core` 4.9.0; `oimDefaultCollectionMapper` / `oimDefaultGlobalIndexMapper` / `oimDefaultKeyedIndexMapper` → `mapOIMCollection` / `mapOIMGlobalIndex` / `mapOIMKeyedIndex`.

## 3.1.1

### Changed

- Requires `@oimdb/core` 4.4.0 (renamed content services).

## 3.1.0

### Changed

- Requires `@oimdb/core` 4.2.0. The reducer writes through `writeSlotContentByKey` and `clearSlotContent` inside `writeInBatch`.
