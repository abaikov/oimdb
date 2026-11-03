# Changelog

## 1.2.0

### Changed

- Requires `@oimdb/core` 4.9.0; `listenOIMToBrowserWindow` → `listenToOIMBrowserWindow`; `OIM_NO_BROWSER_LISTENER_DISPOSER` → core `OIM_NOOP_DISPOSER`.

## 1.1.1

### Changed

- Requires `@oimdb/core` 4.4.0 (renamed content services).

## 1.1.0

### Changed

- README: `useOIMSingleEntity(online)` from `@oimdb/react` 3.2.0.

## 1.0.0

### Added

- `createOIMBrowserOnlineSingleSlotService`, `createOIMBrowserFocusSingleSlotService`, `createOIMBrowserVisibilitySingleSlotService`, `createOIMBrowserLocationSingleSlotService`.
- `OIMBrowserSlotSubscriptionListener` and its four subclasses; `TOIMBrowserOnlineEntity`, `TOIMBrowserFocusEntity`, `TOIMBrowserVisibilityEntity`, `TOIMBrowserLocationEntity`, `TOIMBrowserSingleSlotService`, `TOIMBrowserSingleSlotServiceOptions`.
