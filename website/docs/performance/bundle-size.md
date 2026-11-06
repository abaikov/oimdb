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
| Everything `@oimdb/core` exports | 124441 B | 28548 B |
| One entity store slot: `OIMDB`, `createOIMSlotCollectionService`, `createOIMEntityContentService`, `writeSlotContentByKey`, `getSlotByKey` | 54821 B | 13592 B |
| The same, plus one effect and `db.flush()` | 54851 B | 13612 B |
| The same, plus one index: `createOIMSlotCollectionIndexService` | 78080 B | 18823 B |
| An ordered bucket with commands: `OIMPositionalArrayBucketContentService`, `OIMBucketCommands` | 69382 B | 16798 B |
{/* bundle-size:end */}
