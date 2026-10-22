---
scenario: "sortKeyMove"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "a0bc72d8816685ea"
verdict: "representative"
models: "A row's sort key changes so it moves within the visible list — a priority change, a re-ranked item, a drag within one column — one move per frame."
measures: "Order maintenance for a single moved row inside a window whose membership does not change."
favours:
  - "Stores with an incrementally maintained ordered index (insertion repair of one row) over stores that re-sort the group or rescan the population per derivation."
  - "Against stores that subscribe per visible row and re-point subscriptions whenever the window's shape changes (oimdb and tinybase per WHY-EACH-ROW.md:615-629): an order change is a shape change."
biases:
  - "View A's sorters are the rows at slots lowAnchor+2, +4, +6, +8 of the window (slots 7, 9, 11, 13 at WINDOW 32), and their targets are one rank past the anchors at slots lowAnchor and highAnchor (5 and 25), plus j (dataset.ts:779-793). Both targets are inside the window and the mover is never an anchor, so membership never changes. This isolates reordering cleanly and excludes the common case where a rank change moves a row into or out of the window."
  - "Unlike the per-group sorters (`sorterInWindow`, dataset.ts:692-742), view A's anchors are not searched for a strict rank increase; a rank tie at an anchor could make a step render the order it already had. That would fail `check` for every adapter alike rather than tilt the row; it does not occur at the shipped points as far as this card can tell, which is unverified."
  - "Four sorters, eight steps (dataset.ts:71; scenarios.ts:1077): small and folded by `repeat`."
  - "View B must not change (scenarios.ts:1097): selectivity against an unrelated group is asked; selectivity inside group A (rows outside the window) is not."
summary: "The single-row reorder every sorted list performs; its window-internal moves exclude the membership change a real sort-key update often causes."
---

## What the script does

`SORTER_COUNT × 2` = 8 steps; each moves one sorter's `rank` to its low then its
high target, both strictly inside view A's window, and settles (scenarios.ts:1086-1094).
A must produce 8 distinct renders, B none (scenarios.ts:1095-1097). `restore` writes
each sorter's resting rank back (:1082-1085).

## Representativeness

A sorted list reacting to a changed key is ordinary application work (leaderboard
entries, priority edits, last-activity sort). One change per frame is the typical
rate. The anchors are fractions of the window (dataset.ts:779-780), so the distance
moved scales with `BENCH_WINDOW` and the runner's `wide` point (window 100,
cells/points.ts:5) exercises a longer move.

The analogue in js-framework-benchmark is "swap rows" (two rows exchange
positions); that benchmark's cost is in the DOM move, which this suite does not
model.

## The standing record, checked

`ORDINARY_SCRIPT` (scenarios.ts:86-169, signed for this key at :92). The claims hold
for this script: A1 — every step changes A's order; B4 — a window delivery scaled by
`consumerFloor` (floor.ts:86, 95).
