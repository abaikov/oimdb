---
scenario: "singleFloor"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "4e89916751349ab4"
verdict: "synthetic"
models: "Nothing an application does: 32 deliveries of one prepared line through `deliverSingle`, with no store and no value held."
measures: "The consumer's cost of one single-value delivery, used as the per-step floor for `singleWrite`."
favours:
  - "Not applicable: it has one row, measured in one adapter's process (FLOOR_ADAPTER, registry.ts:73), and ranks nobody."
biases:
  - "The description calls the bound tight — 'the gap between a row of that family and 1.00 is that row's store and nothing else' (scenarios.ts:5245-5251). The gap also holds the adapter's glue between write and delivery and the harness's `settle` call per step, which this floor does not make. Those belong to using the library, so 'store' should be read as 'store plus its binding'."
  - "The prepared marks are allocated once at module load (SINGLE_MARKS, scenarios.ts:5237-5240) and reused by `singleWrite` (:5427), so neither side allocates a value inside the clock."
  - "It scales `singleWrite` only. `singleResend` sets `rendersNothing` (scenarios.ts:5459), so `stepDeliveryOf` returns `nothing` before it reaches the `single` branch (floor.ts:79, 83) and it has no floor (floor.ts:129-136)."
summary: "An instrument, not a workload: the per-step consumer cost of a one-line delivery, against which `singleWrite` rows are read as multiples."
---

## What the script does

`run` calls `deliverSingle(consumers.a, name, SINGLE_MARKS[step])` 32 times
(scenarios.ts:5312-5318; render.ts:171-178). `check` demands 32 distinct renders, one
line, and no delivery on view B (:5319-5322). The oracle seeds the two values, emits
them, and sets the named one to each mark in turn (:5323-5332). The floor maps to the
`single` step shape (floor.ts:59) and `BOUND_BY` hands that shape to this floor
(floor.ts:99).

## The standing record, checked (scenarios.ts:5252-5306)

- A3 NOT MET agrees with standard.ts:357-373 (storeless).
- B4 MET (:5282-5285): its falsifier is a single-value row coming out below this
  number. Every passing `singleWrite` step delivers this same line shape, so that holds
  unless an adapter delivers fewer lines than steps, which its `check` refuses
  (scenarios.ts:5431-5434).
- C2 MET (:5290-5293) with falsifier "this row measured under a different sampling plan
  from the single-value tables it scales". The plan is derived per point and per
  scenario from that scenario's own probes (cells/runBatch.ts:43-56; standard.ts:730-732),
  and the repeat count is a function of the median run time (measure.ts:99-138). This
  floor's run is far shorter than a `singleWrite` run, so a different plan is the
  expected outcome, which would make the MET false by its own falsifier. Not verified
  against the runner's output; the same wording is on every floor (scenarios.ts:3186,
  3417, 3625, 3805, 5124).
- C5 NOT MET agrees with the code: storeless (standard.ts:380-397).
