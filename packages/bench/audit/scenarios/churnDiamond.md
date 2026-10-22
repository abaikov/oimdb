---
scenario: "churnDiamond"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "2fdfacaa1fa1cd88"
verdict: "narrow"
models: "32 components each building, at mount, two derived values from one shared entity and a third that combines them, then torn down; the combined value must update once per change."
measures: "Building and disposing three derived nodes and one subscription per component over one shared root, plus one propagation through 32 diamonds per cycle, with a glitch (the join running once per arm) turned into a failure rather than a time."
favours:
  - "Hand-written code, which computes both arms and the join inline in one body and builds no graph (adapters/baseline-array.ts:619-637); the standing says the mount is not comparable (B1 NOT MET, scenarios.ts:2541-2548)."
  - "Libraries whose derived nodes are cheap to allocate and to dispose. Every passing library is glitch-free on this graph, so the time ranks graph construction and teardown, not scheduling."
  - "Pull-based or topologically ordered designs pass the correctness gate for nothing (mobx computeds, adapters/mobx.ts:430-436; reselect, adapters/redux-toolkit.ts:559-570); a push design without ordering fails instead of ranking."
biases:
  - "ONE SHARED ROOT. Every diamond is over `churnRows[0]` (`mountOnDiamond(at, 0)`, scenarios.ts:2587), so a store where each arm subscribes to the root puts 64 arm subscriptions on one source list. List-structure costs of `churnShared` (indexOf plus splice) are mixed into this row."
  - "The 32 diamonds are identical and never shared; a store that would dedupe identical derivations gets no credit, and one with cheap per-instance allocation is favoured."
  - "The only write is one `patchLabel` per frame outside `frame` (`writeFrame` with count 1, scenarios.ts:1880-1885), so batching plays no part."
  - "No floor divides this table: `stepDeliveryOf` returns `mount` (floor.ts:81), `BOUND_BY` has no `mount` entry (floor.ts:91-100) and `UNBOUNDED_BECAUSE` gives the reason (floor.ts:108-119)."
  - "Population differs from the row shape: lokijs and valtio decline the diamond (adapters/lokijs.ts:1026-1033, adapters/valtio.ts:714-720), as do `baseline-array-indexed` (no churn wiring, adapters/baseline-array-indexed.ts:463) and `control-write` (harness/control.ts:1226). signaldb and zustand supply it."
summary: "A per-component diamond built and destroyed at mount, gated on glitch-freedom; the time prices three derived nodes per subscriber over one shared root, and every standing diamond's joined text is checked on audited passes."
---

## What the script does

`makeChurnScenario` (scenarios.ts:1841-2007) with `wiring: 'diamond'`,
`churned: CHURN_SUBSCRIBERS` = 32 (dataset.ts:143), `reversed: false`,
`headOf: diamondHeadOf` (scenarios.ts:2507-2593). Each of `CHURN_CYCLES` = 8
cycles (dataset.ts:169) mounts 32 diamonds on row 0 (:1936), writes row 0's label
and settles (:1939-1940), unmounts oldest-first (:1941-1945), writes again and
settles (:1948-1949). `steps` = 8 × 32 (:1898).

`diamondHeadOf(label)` is `${label}<|>${label}` (derivations.ts:9-15), so the
delivered line (`churnLineOf`, render.ts:140-141) must read `32:s…<|>s…` in each
mounted frame, followed on the verify and proof passes by the fold of all 32
slots' joined text (render.ts:124-138).

## What `check` and the oracle prove

`check` (scenarios.ts:1961-1978) demands 8 deliveries, 8 distinct renders, none on
view B, and that the last line equals the one `deliveriesOf` (:1855-1879) states
for the last mounted frame (`expectChurnHead`, :1829-1839). The oracle
(:1979-2005) emits one line per mounted frame and nothing for an unmounted one;
the sequence digest is compared in the verify pass and again in the timed
process's proof pass (worker.ts:488-534, 644-662).

A glitch fails: the adapters count a wake each time the subscriber body runs
(e.g. adapters/mobx.ts:286-296, adapters/redux-toolkit.ts:449-462), so a join
that re-ran after each arm and re-ran the subscriber names 64, and an
inconsistent read (`new<|>old`) left as any slot's last value changes the fold.

## Ways a broken store passes

- **The three nodes are not observable.** The text is identical whether the arms
  and join are three library nodes or one function; an adapter that folded them
  would pass and post the anchor's shape. That is B2/B3's promise
  (scenarios.ts:2549-2556), not something `check` can see.
- **The woke count and the per-slot reads are the adapter's own bookkeeping**
  (render.ts:109-116). An adapter whose wake counter ignored a second body run
  would hide a glitch. Timed samples carry no fold.
- A glitch whose extra join run does not re-run the subscriber (the library
  suppresses an unchanged join) is invisible, and harmless.

## Representativeness

A component deriving two values from one prop and combining them is ordinary; the
diamond is the smallest graph where glitch-freedom matters, which
js-reactivity-benchmark-style suites probe on propagation. Here it is probed at
mount and teardown, at depth one, with every arm reading the same row. Narrow:
read against `churnChain` (a line) and `churnShared` (no derivation).

## The standing record, checked (scenarios.ts:2522-2583)

- A4 MET (:2536-2540) holds: every standing slot's joined text and the woke count
  are compared in the timed process too (worker.ts:644-662).
- B1 NOT MET (:2541-2548) holds; the anchor's body also keeps a per-settle guard
  (`ranAtSettle`, adapters/baseline-array.ts:623, 628-630) that no library-side
  wiring is allowed (B3, :2553-2556). On this script row 0 is touched once per
  frame, so the guard does not change the anchor's count; it is still the anchor
  doing deduplication by hand.
- B4 MET (:2557-2560) passes the load check through the declared `mount` absence
  (standard.ts:443-460).
- C5 NOT MET (:2577-2582) agrees with `control-write` declining churn
  (harness/control.ts:1258).