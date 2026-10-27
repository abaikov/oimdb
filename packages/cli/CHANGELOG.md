# Changelog

## 1.0.0

### Added

- `oimdb inspect`, `dump`, `collection <name>`, `computed <name>`; sources `--model`, `--cdp`, `--url`.
- `oimdb serve`: the bridge, the DevTools UI, `/api/inspect` and `/api/dump`.
- `oimdb mcp`: the MCP server from `@oimdb/mcp`.
- `OIMDevStateReader`, `IOIMDevStateSource`, `OIMDevRegistryStateSource`, `OIMDevModuleStateSource`, `OIMDevBridgeStateSource`, `OIMDevHttpStateSource`, `OIMDevCdpStateSource`, `TOIMDevInspectSnapshot`.
- `OIMDevBridge`, `OIMDevUIServer`, `IOIMDevRegistry`, `TOIMDevBridgeOptions`, `TOIMDevUIServerOptions`, moved from `@oimdb/mcp`.
