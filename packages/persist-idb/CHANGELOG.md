# Changelog

All notable changes to `@oimdb/persist-idb` are recorded here. This file starts at 4.1.0; releases
before it were not changelogged.

## 4.2.0

### Changed

- Requires `@oimdb/core` 4.9.0 and `@oimdb/persist` 4.3.0; `oimIndexedDbRequestToPromise` → `promisifyOIMIndexedDbRequest`, `oimIndexedDbTransactionToPromise` → `promisifyOIMIndexedDbTransaction`, `oimOpenIndexedDb…` → `openOIMIndexedDb…`, `oimReadAllIndexedDbTableRecords` → `readOIMAllIndexedDbTableRecords`, `oimNormalizeIndexedDbPrimaryKey` → `normalizeOIMIndexedDbPrimaryKey`.

## 4.1.1

### Changed

- README: examples use the `@oimdb/core` 4.4 names and slot methods.

## 4.1.0

Breaking: exports renamed. Requires `@oimdb/persist` 4.1.0.

### Renamed

- `OIMPersistIndexedDbRecordsStrategy` → `OIMPersistIndexedDbRecordsService`
- `OIMPersistIndexedDbSnapshotStrategy` → `OIMPersistIndexedDbSnapshotService`
- `TOIMPersistIndexedDbRecordsStrategyOptions` → `TOIMPersistIndexedDbRecordsServiceOptions`
- `TOIMPersistIndexedDbSnapshotStrategyOptions` → `TOIMPersistIndexedDbSnapshotServiceOptions`
