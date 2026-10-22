---
slug: previous-index-key-on-the-row
title: "Where an index keeps the key a row was filed under"
authors: [oimdb]
tags: [internals, indexes, performance]
date: 2026-08-20
---

When a row is written, an index has to know which bucket the row was in before, so it can tell whether the row moved. OIMDB keeps that previous answer in a cell on the row's own slot. One recorded piece prices it against the two alternatives — recalling it from a `Map` keyed by the row, and recomputing and diffing through a pair of `Set`s — at 1.61× and 2.67× cheaper per row per write.

{/* truncate */}

## Context

An index files every row of a collection under a key derived from its columns. A write to a row means the index recomputes the key and compares it with the key the row is filed under now. Equal: nothing moves. Different: the row leaves one bucket and joins another.

The comparison needs the previous key. Where it is kept is the question.

## The three arms

- **On the slot.** The previous answer sits in a cell on the row's slot; the comparison is one `===` and no lookup.
- **In a `Map` keyed by the row.** The same one `===`, against a key recalled from a hash table beside the population.
- **Recompute and diff.** Recompute the address, recall the old one from a `Map`, and diff the two through a pair of `Set`s.

What the `Map` buys is that the row keeps nothing: a membership can be kept for rows the index does not own, and no cell is reserved on every row for an index most rows may never be read through. What the diff buys is cardinality-independence: one body serves one address and fifty.

## The measurement

`alt.key-on-the-slot-vs-key-in-a-map` and `alt.key-on-the-slot-vs-two-set-diff`, recorded in [`2026-08-20-alternatives/index/`](https://github.com/oimdb/oimdb/tree/master/packages/bench/measurements/2026-08-20-alternatives/index). Per row per write:

| alternative | on the slot | alternative | ratio | noise |
|---|---|---|---|---|
| key recalled from a `Map` keyed by the row | 61 ns | 97 ns | 0.62× — 1.61× cheaper | 2.6% |
| recompute, recall from a `Map`, diff through two `Set`s | 56 ns | 149 ns | 0.37× — 2.67× cheaper | 2.5% |

Every operation is one row written and one row re-filed, with the address unchanged: the selector reads two columns, the write moves the one that does not decide the address, and the index recomputes the group the row already sits in. That is the ordinary case for any address derived from more than one column.

The `Map` row is the one that isolates the claim. The allocations are gone and the comparison is the same comparison; what is left between the arms is where the previous answer was kept. The diff row also carries the diff's allocations.

The instrument: `control-resolution-2x` 1.93×, `control-scale-same-body` 1.00×, 0.2% from 1.00. The run was gated at a foreign load of 3.50, raised from the default (`gateWasRaised: true`).

**Both ratios are pulled toward 1.00.** The write, the mark, the delta and the frame are identical on both halves and inside both numbers, so the difference in the filing alone is wider than these rows show.

## What OIMDB does

Keeps the previous key on the slot. `OIMIndex.updateIndexKeyForSlot` reads it through `getIndexKeyForSlot(entitySlot, indexKeysPosition)`, compares it with the recomputed key by `===` and then by the bucket collection's `isSameKey`, and only on a difference writes the new key back and moves the row between buckets. The cell is `slot.indexKeys[position]`: each index is handed a position when it attaches to the collection, and `OIMIndexKeysService.set` creates a slot's `indexKeys` array only when a key is first written to it, so a row no index has filed carries no array.

## Caveats

- **The arm measured stored something else.** On 2026-08-20 the slot held the bucket, which carried its key. Today it holds the key itself in an array cell at the index's position — one array load more than the arm measured. Nothing has re-measured the shipped form, and the pair is no longer in `packages/bench/src/price/`.
- **The measured case now has an earlier exit.** An index declared with `columns` returns before computing any key when none of the written columns is a key column (`isWriteUnread`), so the write in these rows would not reach the comparison at all on such an index. An index declared with `keyOf` alone still recomputes and compares, as measured.
- The other rows in the same piece — `alt.reposition-one-vs-full-resort.*` and `alt.linear-scan-vs-set-diff.2` — price a sorted-bucket repair and a multi-address re-file that are not in the shipped engine, and are not covered here.

## Where it lives

- `packages/core/src/facade/entity/OIMIndex.ts` — `updateIndexKeyForSlot` and `updateIndexKeysForSlots`.
- `packages/core/src/engine/slot/OIMSlotAggregate.ts` — `getIndexKeyForSlot` / `setIndexKeyForSlot`.
- `packages/core/src/engine/index/OIMIndexKeysService.ts` — the cell on the slot; `OIMIndexKeysServiceAppending` and `OIMIndexKeysServiceReclaiming` hand out positions.
