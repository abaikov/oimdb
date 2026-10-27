# Changelog

## 3.0.0

### Changed

- Built on `@oimdb/cli`: the four tools answer through `OIMDevStateReader`.

### Removed

- The `devtools` and `cdp` subcommands. Use `oimdb serve` and `oimdb inspect --cdp` from `@oimdb/cli`.
- `OIMDevUIServer`, `createOIMDevUIServer`, `TOIMDevUIServerOptions`, `IOIMDevRegistry`. Use `@oimdb/cli`.
