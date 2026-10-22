---
scenario: "consumerPerGroup"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "32ddaddd75822d30"
verdict: "narrow"
models: "A screen with one live view per group (fifty board columns or fifty dashboard widgets) where one group's order changes per frame."
measures: "Wake-up selectivity across many standing views: how many of the 49 unaffected consumers are woken per write."
favours:
  - "Stores with a per-group change signal (a bucket or index per group with its own subscribers): 50 deliveries for 50 steps."
  - "Against a single global change signal: 50 × 50 deliveries, each a full 32-line render (scenarios.ts:1241-1249)."
  - "Stores that maintain all 50 group indexes are no longer charged for unread groups here (WHY-EACH-ROW.md:559-587)."
biases:
  - "The consumer is 50 times larger for a non-selective store: each redundant wake formats and hashes 32 lines (render.ts `deliver`; consumer.ts:108-147). The gap is mostly consumer cost multiplied by wake count, which WHY-EACH-ROW.md:589-600 states; the ratio is not a store-only ratio."
  - "Fifty standing windows of 32 rows is 1600 rendered rows, larger than a typical screen. Real many-view screens (boards, dashboards) usually show fewer rows per view; the size inflates the non-selective penalty."
  - "Each step is a rank move inside one window (scenarios.ts:1266-1276), a shape change; stores that re-point per-visible-row subscriptions on shape change (oimdb, tinybase) pay it 50 times per run, linear in the window (WHY-EACH-ROW.md:615-629). Tilts against them at the wide point, toward them at the default."
  - "Bind-time cost of fifty views is outside the clock (`rebuild: false`, scenarios.ts:1253; WHY-EACH-ROW.md:610-614)."
summary: "The only many-views selectivity probe in the suite; real in kind (boards, dashboards) but oversized per view, so its gaps are dominated by consumer re-renders."
---

## What the script does

`GROUPS` = 50 steps over `bindPerGroup` (`steps`, `perGroup: true`,
scenarios.ts:1251-1252). Step i moves group i's sorter between its `low` and
`high` ranks, both inside group i's own window, and settles
(scenarios.ts:1266-1276); `restore` puts every sorter back at `rest` and resets
`fanTurn` (:1258-1265). Every one of the fifty consumers must produce exactly one
distinct render and keep a full window (scenarios.ts:1284-1294). The oracle emits
to all fifty every step (`emitEveryGroup`, scenarios.ts:1295-1303), so it judges
content, never who woke. The worker folds the fifty digests and sums their
counters (worker.ts:419-434).

## Representativeness

Selectivity over many views is a real property and an important one; the
two-view wiring cannot ask it (WHY-EACH-ROW.md:546-557). The workload shape is a
board with all columns visible. It is narrow because the operation is fixed to a
rank move (a group move would touch two consumers, which is the board's common
case), and because 50 full windows overstate the render cost of a wake.

## The standing record, checked

`ORDINARY_SCRIPT` (scenarios.ts:86-169, signed at :94). B4 MET: the table is
scaled by `consumerFloor`, one window delivery per step (`perGroup` is not a
wiring flag `stepDeliveryOf` reads, so it falls to `window`, floor.ts:76-87,
95). For a selective store that is a bound; a non-selective store pays up to 50
deliveries per step, which the floor neither bounds nor separates, and the
floor-bound mark therefore cannot fire on the rows whose time is most dominated
by the consumer.

The header comment says the sweep over the windows in `cells/points.ts` is what
stops it (scenarios.ts:1232-1236).