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
| Everything `@oimdb/core` exports | 98595 B | 24021 B |
| One entity store slot: `OIMDB`, `createOIMSlotCollectionService`, `createOIMSlotContentEntityService`, `writeSlotContentByKey`, `getSlotByKey` | 35378 B | 9265 B |
| The same, plus one effect and `db.flush()` | 44019 B | 11377 B |
| The same, plus one index: `createOIMSlotCollectionIndexService` | 64397 B | 16056 B |
| An ordered bucket with commands: `OIMSlotContentPositionalArrayBucketService`, `OIMBucketCommands` | 48514 B | 12234 B |
{/* bundle-size:end */}
