---
scenario: "scrollWindow"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "5ce12faadb83edb3"
verdict: "narrow"
models: "A user scrolling a sorted, filtered list: the visible window moves over unchanged data while a second view on the same group stays put."
measures: "The cost of re-answering a window at a new offset over a maintained or re-derived ordering, plus whatever re-pointing of per-row subscriptions the store does, and whether the unmoved view is woken."
favours:
  - "Rescanning stores, for which a new offset is nearly free on top of a scan they do anyway (the lean anchor's `render` walks the population each settle, `adapters/baseline-array.ts:286-301`), and listener-parameterised windows (TinyBase re-registers with offset/limit, `adapters/tinybase.ts:849-862`; `WHY-EACH-ROW.md:2043-2046`)."
  - "Stores with change routing that leave view B unwoken (LokiJS dirties neither view on a scroll and re-reads only view A's slice, `adapters/lokijs.ts:608-628`; `WHY-EACH-ROW.md:2047-2049`)."
biases:
  - "Offsets go 8, 16, 24, 32, 24, 16, 8, 0 at WINDOW 32 (`dataset.ts:877-883`): never deeper than one window into a 200-row group. The deep case is now its own row, `deepScroll` (`scenarios.ts:4415-4457`), whose offsets go out to the group size less one window in four strides (`dataset.ts:884-887`); read this row beside it."
  - "Each step jumps a quarter of the window at once; real scrolling delivers many small offset changes per second. The direction of that bias is unverified."
  - "The comment that group A 'holds only two windows' (`dataset.ts:196-202`) is true at the `small` point (3,200 rows, 64 per group) and not at the default (10,000 rows, 200 per group, `cells/points.ts:4-6`)."
  - "oimdb re-points all 32 per-row subscriptions every step: `scrollTo` sets `shapeMoved` (`adapters/oimdb.ts:835-840`) and the next frame's `resync` disposes and re-creates one effect per visible row (`:347-383`), where only 8 rows actually enter and leave. That is the adapter's choice, not the script's, and it counts against oimdb. Its offset is an index into the ordered slot array (`slots[at]` from `state.offset`, `:357-358`), not a prefix walk."
  - "tanstack-db's plain row declines `reads.byWindow` (`adapters/tanstack-db.ts:1386-1389`, reason at `:1368-1374`, an unindexed `setWindow` returns a promise), so this table holds seventeen of the eighteen participants; the eager and indexed tanstack-db rows carry it."
summary: "Moves a window by a quarter-window up to one window deep and back; prices shallow offset changes only, and is read beside deepScroll, which asks the deep case."
---

## The script

`scenarios.ts:4355-4413`: `SCROLL_STEPS` = 8 (`dataset.ts:203`) steps of
`read.scrollTo(offset)` + `settle` (`:4393-4400`). Offsets from `dataset.ts:877-883`. `check`
(`:4401-4408`) demands 8 distinct states and a full window on view A, zero distinct states on
view B; redundant deliveries to either view are allowed and reported. View B is the two-axis
window over group A at offset 0 (`oracle.ts:360-363`). `scrollTo` must not re-sort and marks
rather than delivers (`types.ts:144-146`).

## What decides the row

How a store derives "rows `offset .. offset+window` of a group in rank order" without the data
changing. A store that keeps an ordered bucket indexes into it; one that rescans selects
top-(offset + window) from the population (`adapters/baseline-array.ts:287-293`, `visibleInto(...,
offset + view.window)`); TinyBase re-registers a listener; tanstack-db's indexed rows move their
own top-K window with `setWindow` (`adapters/tanstack-db.ts:841-850`). At offsets up to 32 these
differ little.

## Representativeness

Scrolling a virtualised list is one of the most frequent interactions in a data-heavy front
end, so the act is representative. The geometry is shallow: the window never goes deeper than
one window, and the list is a 200-row group. js-framework-benchmark has no scroll test; this is a
genuine addition, and the depth its own comment describes (`scenarios.ts:4363-4368`) is asked by
`deepScroll`.

## Standing (READ_SCRIPT, `scenarios.ts:315-386`)

- A2 MET (`:323-327`) holds: view B's redundant deliveries are the routing signal.
- A4 MET (`:333-337`) says "the exact delivery count these scripts assert"; this script asserts
  distinct counts, not delivery counts (`:4401-4408`).
- B1/B2 MET (`:338-346`) hold for the anchors read: the lean anchor rescans, the indexed one
  selects from the group's bucket (`adapters/baseline-array-indexed.ts:254-268`).
- B3 MET (`:347-351`): tanstack-db's plain row is a library admitted that answers some read
  shapes and declines this one; the falsifier text names exactly that case, and whether it was
  meant to fire on a declined shape is not settled by the code.
