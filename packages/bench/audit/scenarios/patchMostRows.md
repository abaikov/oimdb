---
scenario: "patchMostRows"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "5d468168466f184e"
verdict: "narrow"
models: "A dense update: half of every group changes a visible field in each of two consecutive frames (a full refresh, a price tick across a whole book, a recompute of every row's status)."
measures: "Cost of a frame where the dirty set is a large fraction of the subscribed population, and what that frame leaves behind for the next."
favours:
  - "Designs that scan subscribers or rebuild at the boundary rather than maintain a per-write dirty list; the script's comment predicts the engine's rejected stamp-and-scan arm ahead by about 1.18x at this fraction (scenarios.ts:780-785; dataset.ts:101-106) — an internal figure, not verified here."
  - "Deferred-flush stores and libraries whose batch API `frame` opens (scenarios.ts:844-848), over adapters whose `frame` is a direct call."
biases:
  - "Each frame's 5000 writes run inside `ctx.binding.frame` (scenarios.ts:844-848; types.ts:24-26). Every adapter now supplies `frame`: a batch scope where it declares one (mobx `runInAction`, mobx.ts:40-42; legend-state `batch`, legend-state.ts:69-71; oimdb `openSubframe`/`closeSubframe`; tinybase transaction; signaldb `collection.batch`), and a direct `run()` in the anchors, lokijs (lokijs.ts:96), oimdb-legacy, nanostores (nanostores.ts:39-41) and effector (effector.ts:39-41). Whether each direct call is a library with no batch API or an adapter that skipped one is the participant cards' question."
  - "5000 separate `patchLabel` calls per frame (scenarios.ts:845-847). Refresh-style frames usually arrive as one array; an action-based store cannot fold the calls into one action, as on `batchPatch`."
  - "Only two frames (DIRTY_FRAMES, dataset.ts:95). 'The frame after a large frame' is asked once; a steady state of dense frames is not."
  - "A contiguous prefix of the population (dataset.ts:850-856; `TPlan.dirty`, :516-522) dealt round-robin: every group is half dirty. Real dense updates are clustered (one table, one feed); here every group's derivation is invalidated."
  - "The labels are built with a template literal inside the timed loop (scenarios.ts:846): the allocation is paid alike by every row."
  - "ADDRESSED: `check` now asks for at least DIRTY_FRAMES DISTINCT renders per view (scenarios.ts:871-872), not deliveries, so a store that re-delivered an unchanged window in frame 1 fails it. The comment above it still says 'delivered at least once per frame' (:852-859); the code asks the stronger thing."
summary: "The dense end of the write dial, which the rest of the suite never reaches; real for refresh-style frames and run inside each adapter's `frame`, but two round-robin frames of per-row calls are one corner of that behaviour."
---

## What the script does

`DIRTY_FRAMES` = 2 steps (dataset.ts:95; scenarios.ts:812). Each writes `label` on
every row of `plan.dirty` — the first N/2 rows, 5000 at the default point
(dataset.ts:852-854) — inside `ctx.binding.frame`, with a per-frame mark from
`DIRTY_MARKS` so no write is a no-op (scenarios.ts:432-434, 839-851), then one
`settle()`. `check`: view A full and in window order, view B full, and at least two
distinct renders per view (scenarios.ts:860-874). The final state is compared with
the model (`finalStateOnly`, :816; worker.ts:504-513).

## Representativeness

Whole-table refreshes exist (polling a dashboard, a market data tick, a
recalculation) and are exactly where per-write bookkeeping costs most; no other
script here goes above about 10% dirty (`batchPatch`'s BATCH_FRACTION, dataset.ts:690).
That makes the row necessary. It is narrow because the shape is fixed — exactly half
of every group, two frames — and because the frame is 5000 separate calls rather than
one array write.

## The standing record, checked

`ORDINARY_SCRIPT` (scenarios.ts:86-169, signed for this key at :90). B1 (:125-129):
the eager-versus-deferred asymmetry now shows only for adapters whose `frame` is a
direct call. B4 (:140-144): both views change per frame and the floor counts one
window delivery per step (floor.ts:86, 95) — the safe direction, since an eager
store delivers more than one.
