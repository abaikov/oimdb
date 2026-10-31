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
| Everything `@oimdb/core` exports | 102669 B | 24555 B |
| One entity store slot: `OIMDB`, `createOIMSlotCollectionService`, `createOIMSlotContentEntityService`, `writeSlotContentByKey`, `getSlotByKey` | 35413 B | 9161 B |
| The same, plus one effect and `db.flush()` | 45582 B | 11543 B |
| The same, plus one index: `createOIMSlotCollectionIndexService` | 65835 B | 16192 B |
| An ordered bucket with commands: `OIMSlotContentPositionalArrayBucketService`, `OIMBucketCommands` | 48469 B | 12117 B |
{/* bundle-size:end */}
