# Changelog

## 1.2.0

### Changed

- A model module exports `OIM_DEV_REGISTRY` (was `oimDevRegistry`); messages name `OIM_DEV_REGISTRY`.

## 1.1.1

### Changed

- README: examples use the `@oimdb/core` 4.4 names and slot methods.

## 1.1.0

### Changed

- README: a model module builds its services with `defaults: oimDevDefaults` instead of calling `oimInitDevtools()`.

## 1.0.0

### Added

- `oimdb inspect`, `dump`, `collection <name>`, `computed <name>`; sources `--model`, `--cdp`, `--url`.
- `oimdb serve`: the bridge, the DevTools UI, `/api/inspect` and `/api/dump`.
- `oimdb mcp`: the MCP server from `@oimdb/mcp`.
- `OIMDevStateReader`, `IOIMDevStateSource`, `OIMDevRegistryStateSource`, `OIMDevModuleStateSource`, `OIMDevBridgeStateSource`, `OIMDevHttpStateSource`, `OIMDevCdpStateSource`, `TOIMDevInspectSnapshot`.
- `OIMDevBridge`, `OIMDevUIServer`, `IOIMDevRegistry`, `TOIMDevBridgeOptions`, `TOIMDevUIServerOptions`, moved from `@oimdb/mcp`.
