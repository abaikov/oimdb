---
scenario: "patchColumn"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "c5144f73246c811c"
verdict: "representative"
models: "An inline edit or a pushed update to one field of one row the user can see, repeated row by row, each change its own frame."
measures: "Single-write latency from a keyed column write to a re-rendered window, plus whether an unrelated view (group B) is woken."
favours:
  - "Stores that route a row write to the views containing that row (per-row or per-visible-slot subscriptions, signal graphs) over stores that re-derive or rescan a whole group or the whole population per frame."
  - "Nothing favours coalescing here: one write per settle and no `frame` call (scenarios.ts:465-468), so eager and deferred-flush stores do the same number of derivations."
biases:
  - "Every delivery re-formats all 32 window lines and hashes them (render.ts:31-44 `deliver`, consumer.ts:108-148), so a store that knows exactly which row changed cannot show that advantage on the render side. Real per-row-component UIs re-render one row. Tilts toward list-level derivations and compresses every gap toward the consumer constant."
  - "`label` is neither filtered nor sorted on (dataset.ts:22-24), so a write can never change membership or order. Tilts toward stores whose window bookkeeping is expensive only on shape changes (per-visible-row subscribers: oimdb, tinybase, per WHY-EACH-ROW.md:615-629)."
  - "Rows have five short columns (dataset.ts:29-35). Copy-on-write stores (immutable entity spread) and per-field-observable stores pay less per patch than they would on application-width entities."
  - "Only 2 of the 50 groups are watched (dataset.ts:37-41). Stores maintaining an index on all 50 groups pay maintenance nobody reads (WHY-EACH-ROW.md:559-587); tilts against eagerly indexed stores."
  - "Timed in Node on a JIT-warm loop and reported as the minimum of samples (measure.ts:41-97). Real edits arrive sporadically into colder code; tilts toward monomorphic, JIT-friendly write paths."
summary: "The suite's baseline single-field edit: real and frequent, but the full-window string render per delivery makes much of every row the consumer's cost rather than the store's."
---

## What the script does

`WINDOW` steps (32 at the default point, dataset.ts:63; N = 10 000, registry.ts:170
and cells/points.ts:4). Each step is `patchLabel(id, label)` on the next row of view
A's window, then `settle()` (scenarios.ts:460-469). The two label sets alternate with
a suffix so a repeat inside one sample never writes a value already stored
(scenarios.ts:457-466). `check` demands exactly 32 distinct renders of A and 0 of B
(scenarios.ts:470-472); the oracle replays the same writes against the plain-Map
model with one `emit` per write (scenarios.ts:473-482, oracle.ts:400-403).

## Representativeness

A one-field edit to a visible row is among the most common things a list or table
screen does: inline editing, an optimistic update, a socket message for one row.
32 consecutive single-row frames is a reasonable stand-in for a burst of such
messages. The size (10 000 rows, 50 groups of 200, 32 visible) matches a mid-sized
table screen.

This is the closest analogue in the suite to js-framework-benchmark's "partial
update" — but that benchmark updates every 10th row in ONE frame, which here is
`batchPatch`. js-framework-benchmark also measures the DOM; this suite's consumer
is a string formatter, so render cost is uniform across libraries and keyed-row
reconciliation is not modelled at all.

## The standing record, checked

`ORDINARY_SCRIPT` (scenarios.ts:86-169, signed for this key at :88). For this script
its claims hold as far as the code shows: A1 (:106-110) — every step produces a
distinct render of A (check at scenarios.ts:471); B4 (:140-144) — the step is a
window delivery: `stepDeliveryOf` returns `window` (floor.ts:86) and `floorKeyFor`
maps it to `consumerFloor` (floor.ts:95, 144-147). Whether that floor is a true
bound is the `consumerFloor` card's question.

## What it does not cover

A write to a column a view filters or sorts on (`moveGroup`, `sortKeyMove` cover
those separately); a write to a row whose entity is wide; a write arriving while
the consumer is mid-render or under a scheduler (React batching, microtasks) —
`settle` is synchronous and nothing in the suite yields.
