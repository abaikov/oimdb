---
scenario: "singleWrite"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "c0b62cf7afde0250"
verdict: "representative"
models: "One value the application holds — a toggle, a counter, a selected id — written once per user event and read by one component."
measures: "The cost of one write to a held value, the library's notification, and a one-line delivery, with a second value beside it that must stay silent."
favours:
  - "Libraries built around a value cell with its own subscriber list (signals, atoms): a write is a field store and a short notify."
  - "Against libraries whose every write goes through a collection, document or transaction path; for them this wiring stores one value in machinery made for many. How each adapter maps a single value is the participants' cards' question, not this one's."
biases:
  - "One subscriber per value, no derived value, no fan-out: the smallest reactive graph there is. Differences in graph scheduling do not show."
  - "Each step is its own frame, one write and one `settle` (scenarios.ts:5424-5430), so `frame` is not called and has nothing to change."
  - "The bystander is checked for distinct renders only (scenarios.ts:5434); a library that wakes it is counted in its delivery column rather than failed. That is the intended reading (description, scenarios.ts:5409-5411)."
summary: "The commonest write in a signal-style application, sized as it happens — one value, one event, one reader — and checked as a sequence, so a skipped or reordered write fails."
---

## What the script does

`prepare` hands the binding its two values (scenarios.ts:5417-5419); `restore`
writes the resting value back and settles (:5420-5423). The run writes 32
distinct marks (SINGLE_MARKS, :5237-5240), settling after each (:5424-5430).

## What decides correctness

`check` (:5431-5434): 32 distinct renders on view A, one line per delivery, no
distinct render on the bystander. The script is not `finalStateOnly`, so the
sequence digest of both views is compared with the oracle (:5435-5444;
worker.ts:422-439, 515-530, 647-656). The single-value audit reads both values back
through the library and compares them with the model (worker.ts:457-459;
oracle.ts:621-641), which catches a write that landed in the bystander. No case
found where a broken store passes.

## Representativeness

Writing one held value per user interaction is the most frequent write in an
application using signals or atoms, and one reader per value is the typical
shape. Thirty-two steps is a sample size, not a usage claim (dataset.ts:289-305).

## The standing record, checked (SINGLE_SCRIPT, scenarios.ts:5335-5392)

- A1 MET (:5336-5340) holds for this script: every step changes the rendered value.
- A3 MET (:5346-5350) agrees with standard.ts:357-373 (the single branch at :359).
- B4 MET (:5367-5371): scaled by `singleFloor` (floor.ts:83, 99), whose step is the
  same one-line delivery.
- C5 MET (:5388-5391) agrees with the registry: all three controls supply a single
  wiring, `control-write` included (control.ts:1187-1190, 1223-1226, 1286-1289).
- B5 (derived): `baseline-array-indexed` declines the single wiring
  (adapters/baseline-array-indexed.ts:427-436); the other seventeen of the eighteen
  `ADAPTERS` supply it.
