# Changelog

## 3.1.0

### Changed

- Requires `@oimdb/cli` 1.2.0; a model module exports `OIM_DEV_REGISTRY`.

## 3.0.0

### Changed

- Built on `@oimdb/cli`: the four tools answer through `OIMDevStateReader`.

### Removed

- The `devtools` and `cdp` subcommands. Use `oimdb serve` and `oimdb inspect --cdp` from `@oimdb/cli`.
- `OIMDevUIServer`, `createOIMDevUIServer`, `TOIMDevUIServerOptions`, `IOIMDevRegistry`. Use `@oimdb/cli`.
