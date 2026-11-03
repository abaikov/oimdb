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
| Everything `@oimdb/core` exports | 123502 B | 28386 B |
| One entity store slot: `OIMDB`, `createOIMSlotCollectionService`, `createOIMEntityContentService`, `writeSlotContentByKey`, `getSlotByKey` | 53868 B | 13400 B |
| The same, plus one effect and `db.flush()` | 53898 B | 13414 B |
| The same, plus one index: `createOIMSlotCollectionIndexService` | 77129 B | 18613 B |
| An ordered bucket with commands: `OIMPositionalArrayBucketContentService`, `OIMBucketCommands` | 68431 B | 16604 B |
{/* bundle-size:end */}
