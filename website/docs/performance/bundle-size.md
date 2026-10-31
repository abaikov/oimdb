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
| Everything `@oimdb/core` exports | 112156 B | 26533 B |
| One entity store slot: `OIMDB`, `createOIMSlotCollectionService`, `createOIMEntityContentService`, `writeSlotContentByKey`, `getSlotByKey` | 44316 B | 10915 B |
| The same, plus one effect and `db.flush()` | 52068 B | 12996 B |
| The same, plus one index: `createOIMSlotCollectionIndexService` | 74009 B | 17843 B |
| An ordered bucket with commands: `OIMPositionalArrayBucketContentService`, `OIMBucketCommands` | 58333 B | 14066 B |
{/* bundle-size:end */}
