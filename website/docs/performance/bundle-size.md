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
| Everything `@oimdb/core` exports | 102815 B | 24890 B |
| One entity store slot: `OIMDB`, `createOIMSlotCollectionService`, `createOIMSlotContentEntityService`, `writeSlotContentByKey`, `getSlotByKey` | 35518 B | 9352 B |
| The same, plus one effect and `db.flush()` | 45681 B | 11769 B |
| The same, plus one index: `createOIMSlotCollectionIndexService` | 65917 B | 16408 B |
| An ordered bucket with commands: `OIMSlotContentPositionalArrayBucketService`, `OIMBucketCommands` | 48571 B | 12301 B |
{/* bundle-size:end */}
