---
scenario: "chainFrameWrite"
auditedAt: "2026-10-21"
auditedBy: "claude-opus-5-5 (script, check, oracle and population re-read 2026-10-21; standing record line numbers re-checked; not run)"
digest: "2472feb3e6a92f55"
verdict: "narrow"
models: "A screen of 32 mounted components, each with its own stack of 4 derived values over its own window of 8 entities, receiving one write to an entity that 8 of them read, frame after frame."
measures: "Propagating one row write through the 8 standing linear derivation chains that read it, running those 8 subscriber bodies once and leaving the other 24 asleep — the run half of `churnChain`, with mounting outside the clock."
favours:
  - "Engines whose derived nodes are cheap to re-evaluate: each level of the oimdb wiring is a derivation applying `chainLevelOf` to the level below (adapters/oimdb.ts:595-600)."
  - "The hand-written anchor reads its 8 roots once per wake and applies the 4 levels in one body (adapters/baseline-array.ts:594); it re-evaluates nothing it did not need, so it is a fair lower reference for the frame."
biases:
  - "Every write changes row 7's label (`CHAIN_FRAME_ROW` = `CHURN_CHAIN_ROOTS - 1`, scenarios.ts:2326; `CHURN_MARKS`, :1676), so every level of the 8 chains whose window holds that row changes and no equality cutoff is exercised; no diamond (that is `churnDiamond`), no fan-in between derivations, and overlapping windows are built separately, so a store that would share them gets no credit."
  - "Depth 4 over windows of 8 (dataset.ts:163-164) is shallow; O(1) and O(depth) per-level overheads are hard to separate here."
  - "The consumer receives one line per step (`deliverChurn`, render.ts:143), so the consumer's share of the time is small and the row is mostly store work. No floor divides it (see standing)."
  - "Each step is one `patchLabel` outside `frame` (scenarios.ts:2422-2428), so batching plays no part."
  - "Population: lokijs and valtio decline the chain (adapters/lokijs.ts:1018-1025, adapters/valtio.ts:707-713), as do `baseline-array-indexed` (no churn wiring, adapters/baseline-array-indexed.ts:463) and `control-write` (harness/control.ts:1226). signaldb and zustand supply it."
summary: "Propagation through standing per-component selector stacks, isolated from mounting; real in kind but linear, unshared and shallow, and the full depth of every chain is checked on audited passes."
---

## What the script does

`prepare` mounts `CHURN_SUBSCRIBERS` = 32 chains of depth 4, untimed
(scenarios.ts:2411-2415): subscriber `at` is a chain over its own window, rows
`at` to `at + 7` (`onOwnWindow`, :1976-1977). The run is `CHURN_MARKS.length`
= 16 steps, each a `patchLabel` on row `CHAIN_FRAME_ROW` = 7 and a `settle`
(:2422-2428). Row 7 lies in the windows of subscribers 0 to 7, so a step must wake
exactly `CHAIN_FRAME_WAKES` = 8 of them (:2327). `restore` puts row 7's label back
(:2416-2421). `auditChurnReads: true` (:2408).

## What `check` and the oracle prove

`check` (scenarios.ts:2429-2437): 16 deliveries, 16 distinct, nothing on view B,
and the last line exactly `churnLineOf(8, chainFrameReadsOf(CHURN_MARKS[15]))`
(`expectChurnHead`, :1771). `chainFrameReadsOf` (:2329-2333) is the 32 window
heads `chainWindowHead(labels, at)` (:1971-1972) with row 7 carrying the mark, so
on the verify and proof passes the line folds every standing chain's head by slot.
The oracle (:2438-2445) sets row 7's label and emits the same line per step;
compared in the verify pass and the proof pass of worker.ts. `chainHeadOf` appends
`>1>2>3>4` (derivations.ts:9-13), so a chain that built fewer levels, did not
re-derive, or woke when its window does not hold row 7 renders a different line
and fails.

## Ways a broken store passes

- **Levels folded into fewer nodes render the same text** (see `churnChain.md`).
  B2/B3 (scenarios.ts:2369-2377) forbid it; `check` cannot see it.
- **The woke count and the per-slot reads are the adapter's own bookkeeping**;
  timed samples carry no fold.

## Representativeness

Per-component derived state that stays mounted while data changes is the normal
case with selector hooks or computed props; pairing this row with `churnChain`
separates build cost from run cost. Narrow: one unshared line with no cutoff.

## The standing record, checked (scenarios.ts:2344-2405)

- A3 NOT MET (:2353) agrees with standard.ts (a churn wiring is not auditable
  by grouping).
- A4 MET (:2358) names the per-slot read fold and holds for all 32 chains.
- B1 MET (:2364) holds: both sides mount in `prepare`.
- B4 MET (:2378): `chainFrameWrite` is in `STANDING_FRAME_SCENARIO_KEYS`
  (floor.ts:69-70), and `stepDeliveryOf` returns `frame` for it (floor.ts:81): a
  step mounts nothing and is one write, the bodies that read it and one line. That
  describes this script.
- C5 NOT MET (:2399) agrees with `control-write` declining churn
  (harness/control.ts:1226).
