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
| Everything `@oimdb/core` exports | 105563 B | 25051 B |
| One entity store slot: `OIMDB`, `createOIMSlotCollectionService`, `createOIMSlotContentEntityService`, `writeSlotContentByKey`, `getSlotByKey` | 36382 B | 9314 B |
| The same, plus one effect and `db.flush()` | 46546 B | 11711 B |
| The same, plus one index: `createOIMSlotCollectionIndexService` | 67554 B | 16458 B |
| An ordered bucket with commands: `OIMSlotContentPositionalArrayBucketService`, `OIMBucketCommands` | 49435 B | 12310 B |
{/* bundle-size:end */}
