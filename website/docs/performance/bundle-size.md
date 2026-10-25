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
| Everything `@oimdb/core` exports | 98686 B | 24049 B |
| One entity store slot: `OIMDB`, `createOIMSlotCollectionService`, `createOIMSlotContentEntityService`, `writeSlotContentByKey`, `getSlotByKey` | 35379 B | 9243 B |
| The same, plus one effect and `db.flush()` | 44020 B | 11357 B |
| The same, plus one index: `createOIMSlotCollectionIndexService` | 64398 B | 16048 B |
| An ordered bucket with commands: `OIMSlotContentPositionalArrayBucketService`, `OIMBucketCommands` | 48515 B | 12218 B |
{/* bundle-size:end */}
