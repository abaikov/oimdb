---
scenario: "diamondFrameWrite"
auditedAt: "2026-10-21"
auditedBy: "claude-opus-5-5 (read against scenarios.ts 2026-10-21; nothing run)"
digest: "d42cd98baca578e1"
verdict: "narrow"
models: "A screen of 32 mounted components, each with its own two values derived from one entity and a third combining them, receiving one write to that entity frame after frame."
measures: "Propagating one root write through 32 standing diamonds, two arms and a join each, and running every subscriber body once per write: the run half of `churnDiamond`, with mounting outside the clock and a glitch (the join running once per arm) turned into a failure rather than a time."
favours:
  - "Engines whose derived nodes are cheap to re-evaluate and that are glitch-free by construction, pull-based or topologically ordered: the oimdb wiring's arms and join are slots of one `createOIMComputedService` store slot (adapters/oimdb.ts:605-626) under one effect on the join (:628-646)."
  - "The hand-written anchor computes both arms and the join inline in one body subscribed to the root, guarded to one run per settle (`ranAtSettle`, adapters/baseline-array.ts:619-636); it builds no graph and schedules nothing, so it is a lower reference for the frame and not a peer in scheduling."
biases:
  - "ONE SHARED ROOT. Every diamond is over `churnRows[0]` (`mountOnDiamond(at, 0)`, scenarios.ts:2611), so a store whose arms subscribe to the root carries 64 arm subscriptions on one source, and the list-walk cost of one hot source is mixed into this row."
  - "Every step writes a new mark to the root (`CHURN_MARKS`, scenarios.ts:1676-1679), so both arms and every join change on every step and no equality cut-off is exercised; the 32 diamonds are identical and built separately, so a store that would share them gets no credit."
  - "Each step is one `patchLabel` outside `frame` followed by `settle` (scenarios.ts:2619-2625), so batching plays no part."
  - "The consumer receives one line per step (`deliverChurn`, render.ts:143-152), so the consumer's share is small and the row is mostly store work. No floor divides it: `diamondFrameWrite` is in `STANDING_FRAME_SCENARIO_KEYS` (floor.ts:69-73), `stepDeliveryOf` returns `frame` (floor.ts:81) and `UNBOUNDED_BECAUSE` gives the `frame` reason (floor.ts:122-129)."
  - "The woke count is the adapter's own bookkeeping (render.ts:100-116), so the glitch gate holds only while every adapter counts a wake per subscriber body run. valtio's former wiring collapsed its join's two rewrites into one counted wake in `settle`, which the B3 clause forbids, so valtio now declines the diamond (adapters/valtio.ts:714-720)."
  - "Population: `baseline-indexed` declines churn (adapters/baseline-array-indexed.ts:463), `control-write` declines churn (harness/control.ts:1226), and lokijs and valtio decline the diamond (adapters/lokijs.ts:1026-1033, adapters/valtio.ts:714-720). signaldb and zustand supply it."
summary: "Propagation through standing per-component diamonds, isolated from mounting and gated on glitch-freedom; real in kind but one shared root, no cut-off and no sharing, and every standing diamond's joined text is checked on audited passes."
---

## What the script does

`prepare` resolves the churn rows and mounts `CHURN_SUBSCRIBERS` = 32 diamonds
(dataset.ts:145), all on row 0, untimed (scenarios.ts:2608-2612). The run is
`CHURN_MARKS.length` = `CHURN_CYCLES * 2` = 16 steps (dataset.ts:171,
scenarios.ts:1676-1679, `steps` at :2603), each a `patchLabel` on row 0 and a
`settle` (:2619-2625). `restore` writes row 0's stored label back and settles
(:2613-2618). `churn: 'diamond'` picks the diamond wiring (:2604) and
`auditChurnReads: true` (:2605) turns on the per-slot read fold.

## What `check` and the oracle prove

`check` (scenarios.ts:2626-2630): 16 deliveries, 16 distinct, nothing on view B,
and the last line exactly `churnLineOf(32, diamondFrameReadsOf(CHURN_MARKS[15]))`
(`expectChurnHead`, :1771-1781). `diamondFrameReadsOf` (:2531-2532) is 32 copies
of `diamondHeadOf(mark)`, which is `${mark}<|>${mark}` (derivations.ts:15-21), so
on the verify and proof passes the line folds every standing diamond's joined
text by slot (`foldChurnReads`, render.ts:124-138). The oracle (:2631-2638) sets
the label and emits the same line per step. The audited fold is switched on in
the worker for both passes (`setChurnReadsAudited`, worker.ts:507, :663).

A glitch fails when the adapter counts honestly: a join that re-ran after each arm
and re-ran the subscriber makes the woke count 64, and an inconsistent join
(`new<|>old`) left in any slot changes the fold.

## Ways a broken store passes

- **The three nodes are not observable.** The text is identical whether the arms
  and the join are three library nodes or one function; an adapter that folded
  them passes. B2/B3 (scenarios.ts:2566-2574) forbid it; `check` cannot see it.
- **The woke count and the per-slot reads are the adapter's own bookkeeping.**
  An adapter that collapses a second body run, or a second join write, into one
  counted wake hides a glitch; valtio declines the diamond for this reason (see biases). Timed
  samples carry no fold.
- A glitch whose extra join run does not re-run the subscriber is invisible here,
  and costs only its time.

## Representativeness

A component deriving two values from one prop and combining them, staying mounted
while the data changes, is ordinary with computed props or memoised selectors;
pairing this row with `churnDiamond` separates the build cost from the run cost, as
`chainFrameWrite` does for `churnChain`. Narrow: depth one, one shared root, no
cut-off.

## The standing record, checked (scenarios.ts:2542-2601)

- A3 NOT MET (:2551-2555) agrees with standard.ts: a churn wiring keeps no
  grouping to audit.
- A4 MET (:2556-2560) names the woke count and every standing slot's joined text;
  `auditChurnReads` (:2605) is what makes the fold run.
- B1 MET (:2561-2565) holds: both sides mount in `prepare`.
- B3 MET (:2571-2574) is a promise the adapters must keep and `check` cannot
  enforce; see the biases for the one wiring that does not.
- B4 MET (:2575-2579): the `frame` step shape and its declared absence of a floor
  are as described above.
- C5 NOT MET (:2596-2601) agrees with `control-write` declining churn
  (harness/control.ts:1226).

## Not determined

Nothing was run. That every supplying adapter's woke count equals 32 per step was
read from the adapters named above, not executed.
