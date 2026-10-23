---
sidebar_position: 6
description: What each consumer of @oimdb/core ships, minified and gzipped.
---

# Bundle size

What each consumer ships, bundled from source with esbuild (minified, tree-shaken,
ESM). `npm run size` measures it and fails when this table no longer matches;
`npm run size:write` rewrites it.

{/* bundle-size:begin */}
| Consumer | Minified | Minified + gzip |
|---|---:|---:|
| Everything `@oimdb/core` exports | 103361 B | 25288 B |
| One entity store slot: `OIMDB`, `createOIMEntityService`, `upsertEntity`, `getSlotByKey` | 41485 B | 10710 B |
| The same, plus one effect and `db.flush()` | 50131 B | 12876 B |
| The same, plus one index: `createOIMIndexService` | 71765 B | 17728 B |
| An ordered bucket with commands: `createOIMBucketService`, `OIMSlotContentBucketServiceArrayDriven`, `OIMBucketCommands` | 56072 B | 13880 B |
{/* bundle-size:end */}
