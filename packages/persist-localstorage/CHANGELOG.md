# Changelog

All notable changes to `@oimdb/persist-localstorage` are recorded here. This file starts at 4.1.0; releases
before it were not changelogged.

## 4.1.2

### Changed

- Internal helper renamed to the `@oimdb/core` 4.9 function naming; no API change.

## 4.1.1

### Changed

- README: examples use the `@oimdb/core` 4.4 names and slot methods.

## 4.1.0

Breaking: exports renamed. Requires `@oimdb/persist` 4.1.0.

### Renamed

- `OIMPersistLocalStorageBackend` → `OIMPersistLocalStorageKeyValueBackend`
- `TOIMPersistLocalStorageBackendOptions` → `TOIMPersistLocalStorageKeyValueBackendOptions`
