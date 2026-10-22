---
scenario: "deleteOneRow"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "fd049e39c3346e53"
verdict: "representative"
models: "A user deleting one visible item at a time from a sorted, paged list; js-framework-benchmark's remove row."
measures: "One removal from an ordered group of about 200 rows, the window refilling from the row just outside it, and one full-window delivery, eight times."
favours:
  - "Stores that patch the window incrementally over those that re-derive it, and ordered buckets with cheap removal over arrays with indexOf plus splice. Each step removes one row, so the delivery of 32 lines is likely a large share; not measured for this card."
  - "Against stores that subscribe per visible row: a removal shifts every row below it up one slot, so those stores re-point the subscriptions of the shifted rows."
biases:
  - "Removal positions are fixed: `windowA[floor(i·WINDOW/8)]` (dataset.ts:1083-1086), original positions 0, 4, …, 28. After k removals the row at original position 4k sits at current position 3k, so the current positions removed are 0, 3, 6, …, 21. The last third of the window is never removed from, and the first removal is the head."
  - "One `remove` per step outside any `frame` (scenarios.ts:1388-1393); batching plays no part, which is the point of this row against `deleteRows`."
  - "The removed rows are copied once in `prepare` (scenarios.ts:1375-1383) and the same objects are written back by every `restore` (:1384-1387). A store that keeps the objects it is given holds these identities across samples; whether any participant has an identity-keyed cache this warms was not checked."
summary: "Single visible-row removal from a sorted paged list with refill, eight times; a common act at a realistic size, removing from the head and upper two-thirds of the window only."
---

## What the script does

`DELETE_ONE_STEPS` = 8 (dataset.ts:207). `prepare` copies the 8 rows of
`plan.deletedOne` and builds one single-id array per step, so nothing is
allocated in the clock (scenarios.ts:1375-1383). Each step is
`remove([id])` and `settle()` (:1388-1393). `restore` writes the 8 rows back and
settles (:1384-1387). `repeatable: false` (:1374).

## What `check` and the oracle prove

`check` (scenarios.ts:1394-1401): view A distinct renders exactly 8, view B
distinct 0, final view A row count `min(WINDOW, groupSize − 8)` = 32. The oracle
removes one id and emits both views per step (:1402-1408). `finalStateOnly` is
not set, so the sequence digest and distinct counts are the criterion
(`adapterAnswer`, worker.ts:419-434), compared in both passes (verify,
worker.ts:488-531; proof in the timed process, worker.ts:644-660); the population
and grouping audits run after (worker.ts:462-464).

A store that left a short window, refilled from the wrong row, or delivered an
intermediate state (a short window, then the refill) changes the digest or
exceeds 8 distinct renders. A store that kept a removed row in its group bucket
is caught by the grouping audit where the adapter exposes one.

## Ways a broken store passes

- **Deliveries to either view are not counted**, only distinct renders; a
  redundant wake of view B is reported, not failed. That is the intended
  reading.
- Nothing found that lets a lossy removal pass: every step changes view A's
  text, and the population audit checks the end state.

## Representativeness

Removing one item from a visible sorted list is one of the most common writes a
list UI performs, and this is the store-level form of js-framework-benchmark's
"remove row" at a windowed size. Read beside `deleteRows`, which removes the
whole window in one call.

## The standing record, checked (ORDINARY_SCRIPT, scenarios.ts:86-169, signed at :96)

- A1 holds: every step must produce a new state in view A.
- B4 holds: each step delivers a full window, so `consumerFloor` (floor.ts:95)
  is a bound on it.
- B1/B2 hold as for the other ordinary scripts: both anchors have a row
  (registry.ts:33-34).