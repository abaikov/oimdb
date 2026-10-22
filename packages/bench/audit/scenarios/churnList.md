---
scenario: "churnList"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "aa293e1ecb7a083d"
verdict: "representative"
models: "A list of 32 items mounting one component per row, a batch of those rows updating, then the list unmounting: the ordinary list mount."
measures: "32 single-row subscriptions on 32 distinct rows mounted and disposed per cycle, plus a frame that writes 4 to 32 of those rows inside `frame` before and after the unmount."
favours:
  - "Stores with a per-row subscriber list: each list has length one, so list structure (array, Set, position) stops mattering and the per-subscription allocation decides."
  - "Libraries whose batching API `frame` reaches (scenarios.ts:1886-1889): up to 32 writes per frame become one notification. Redux Toolkit's adapter defers listeners to the frame end with autoBatch (adapters/redux-toolkit.ts:72-101), but each of its 32 subscriber selectors still runs once per frame."
  - "Against stores with one store-wide listener: every standing subscriber's selector runs on each notification, written row or not (adapters/redux-toolkit.ts:449-462)."
biases:
  - "THE PAIR WITH `churnShared` IS NOT ISOLATED. The description says the gap against `churnShared` is what a subscriber list per row costs (scenarios.ts:2272-2274). The scripts also differ in write volume: this one writes 32+28+…+4 = 144 rows twice per run, 288 `patchLabel` calls inside `frame` (`churnListPrefix`, scenarios.ts:2020-2022; `writeFrame`, :1880-1890), where `churnShared` writes 16 calls outside any `frame`. The gap includes 272 extra writes and 16 frame scopes."
  - "32 rows is a small list; js-framework-benchmark-style list mounts are 1000 rows. The mount count per cycle is the same as `churnShared`'s, by design."
  - "The rows are resolved before the clock (`holdChurnRows`, scenarios.ts:1912-1918), so key lookup is out of every mount."
  - "No floor divides this table: `stepDeliveryOf` returns `mount` (floor.ts:81), `BOUND_BY` has no `mount` entry (floor.ts:91-100), `UNBOUNDED_BECAUSE` gives the reason (floor.ts:108-119)."
summary: "One subscription per row for a 32-row list, mounted, written and torn down; the ordinary list shape at a small size, whose gap against the shared-root row also carries 272 extra writes."
---

## What the script does

`makeChurnScenario` (scenarios.ts:1841-2007) with `wiring: 'row'`,
`churned: 32`, `mount: (churn, at) => churn.mountOnRows(at, at, 1)` — subscriber
`i` on churn row `i` (scenarios.ts:2260-2285, mount at :2279). `rowsWrittenIn`
and `wokeIn` are both `churnListPrefix` (:2022): 32 − 4·cycle, so 32, 28, …, 4
across the 8 cycles (`CHURN_LIST_SHRINK` = 4, :2020). Each mounted frame writes
that prefix inside `frame` with labels `${mark}.${row}` (row 0 gets the bare mark,
`churnLabelOf`, :1810-1815; `writeFrame`, :1886-1889) and settles; the unmounted
frame writes the same prefix with the next mark. `restore` writes the 32 rows back
(:1922-1929).

## What `check` and the oracle prove

`check` (:1961-1978): 8 deliveries, 8 distinct, nothing on view B, and the last
line as `deliveriesOf` (:1855-1879) states it — woke 4, row 0's read
`CHURN_MARKS[14]`, and on the verify and proof passes the fold of all 32 slots'
reads, slot `i` reading row `i`'s label (`rowOf: at => at`, :2283;
render.ts:124-141). The oracle (:1979-2005) names the prefix length as the woke
count in every mounted frame, and the digest is compared in both passes
(worker.ts:488-534, 644-662).

Misplacement fails in every direction on the audited passes: all 32 on row 0 name
32 in every cycle; subscriber `i` on row `i+1` names `prefix − 1`; and any
permutation of subscribers among rows, including inside a block of four where the
count is unchanged, puts a different label under a slot index and changes the
fold.

## Ways a broken store passes

- **The woke count and the per-slot reads are the adapter's own bookkeeping**
  (render.ts:109-116); timed samples carry no fold.

## Representativeness

This is one component per row — what list rendering does on navigation.
Representative, at the size of a small page; read the comparison with
`churnShared` with the write-volume difference in mind.

## The standing record, checked (CHURN_SCRIPT, scenarios.ts:202-290, listed at :210)

- A2 (:219-223) says a wake in the second frame delivers a new label, which
  `check` counts as an unrequested distinct render and fails. Matches the code.
- A4 (:230-234) names the per-slot read fold and a subscriber on the wrong row.
  Holds.
- B4 comment (:249-255) says `floorKeyFor` hands this table `mountFloor`; it hands
  it none (floor.ts:91-100). The B4 falsifier itself (:256-260) is not triggered.