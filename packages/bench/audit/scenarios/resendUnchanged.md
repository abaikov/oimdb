---
scenario: "resendUnchanged"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "cdadf4ca3023e087"
verdict: "representative"
models: "A page refetched or replayed with nothing changed — polling, refetch-on-focus, a websocket snapshot — written into the store as fresh objects."
measures: "Whether the library itself detects a value-identical write and stays silent, and what the check costs."
favours:
  - "Libraries that compare values on write (per-field equality, a no-op set): no derivation, no delivery."
  - "Against libraries that treat every write as a change (reference identity, whole-row replacement): they re-derive and deliver the identical window."
biases:
  - "No adapter may pre-filter (types.ts:11-13; scenarios.ts:1464-1466, description :1484-1486). This measures each library alone, which is fair; in applications a fetch layer often provides structural sharing before the store sees the data, so the penalty on non-comparing libraries is larger here than in apps that use such a layer."
  - "The page is exactly view A's visible rows (`resendCopies` are clones of `windowRows`, worker.ts:164-168, 309), so every write targets a visible row — the strongest wake. A real page refetch may include rows not on screen; neutral to slight tilt against non-comparing stores."
  - "One `write(rows)` call (scenarios.ts:1496-1502) and no `frame` call: a library can batch inside `write`, so eager and deferred stores are on equal terms without `frame`."
  - "ADDRESSED: the window floor. `rendersNothing` is set (scenarios.ts:1489), so `stepDeliveryOf` returns `nothing` (floor.ts:79), there is no floor (floor.ts:91-100, 144-147), and the table prints `no floor` (floor.ts:191) with the `UNBOUNDED_BECAUSE` reason (floor.ts:129-136)."
summary: "A real and frequent client event — an unchanged refetch — sized to one page; it carries no floor multiple, which fits a script whose correct answer delivers nothing."
---

## What the script does

One step: `write` of one of two cycled, freshly cloned copies of view A's 32 rows,
then `settle()` (scenarios.ts:1496-1502). Neither view may produce a distinct
render (scenarios.ts:1503-1505). The copies alternate so a reference check cannot
stand in for a value check (scenarios.ts:1497-1499). `restore` does nothing
(:1495); the oracle `put`s the same copy and emits once (:1506-1510).

## Representativeness

Polling and refetching unchanged data is one of the commonest client events, and
the page size is the realistic one; the earlier whole-population re-send measured
population size instead (scenarios.ts:1468-1471). js-framework-benchmark has no
equivalent; signal benchmarks test `===` equality on primitives, not row-level
value equality — `singleResend` is this suite's primitive case.

## The standing record, checked

`SILENT_SCRIPT` (scenarios.ts:171-187, signed for this key at :172). A1 NOT MET with
its reason (:175-180). B4 MET (:181-186) records that no window floor is applied;
the consumer share of a waking row is not removed, by design (floor.ts:133-135).
A `write` that silently does nothing would pass this script, as it would any
silent one; `write` is proved by the load and by the insert scripts, and the
population audit afterwards compares every stored row (worker.ts:462).
