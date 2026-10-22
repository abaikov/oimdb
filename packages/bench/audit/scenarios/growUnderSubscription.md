---
scenario: "growUnderSubscription"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "10e21555ef1900da"
verdict: "narrow"
models: "A feed or log that keeps receiving new items while it is on screen, so each batch lands in a store earlier batches already grew."
measures: "The cost of inserting a batch of new keys as a function of how much the store already holds, with both views re-derived after every batch."
favours:
  - "Structures whose insert cost does not depend on where in the order the new key lands, or that sort lazily at derivation time."
  - "Against array-backed ordered buckets that insert by shifting: every batch is ranked below everything already stored (dataset.ts:919-938), so every new row lands at position 0 of its group. That is the worst case for a shifting insert and the best case for nothing. Direction asserted from the shape, not measured."
biases:
  - "Every batch is visible: newest rows are ranked most negative (`rank: -(INSERT_COUNT + MOVER_COUNT + 1 + minted)`, dataset.ts:932), so each batch arrives at the head of all fifty windows and changes both views. An infinite list appends below the fold, where nothing re-derives; a chat or activity feed prepends a few rows per frame. This asks the prepend case at batch size."
  - "Batch size is max(INSERT_COUNT, N/20) = 500 rows per frame at N = 10000 (dataset.ts:215, 248, 919-922), 10 per group per frame. Live feeds bring a handful per frame; 500 is a page load, eight times over."
  - "Growth is bounded at 40 % over eight frames (GROWTH_FRAMES dataset.ts:235, GROWTH_FRACTION :248), as the description states (scenarios.ts:3973-3975). A cost that turns super-linear only at larger multiples is not reached."
  - "The untimed `restore` drops and rebuilds the whole store every sample (scenarios.ts:3988-3993). Where the worker has `gc` exposed, `collect` runs it untimed before every timed sample (measure.ts:45-47, 73-74; worker.ts:63-67), so the discarded store is not collected inside the clock; without `gc` it may be. Whether a given run had `gc` is carried as `gcAvailable` in the result (worker.ts:64)."
summary: "A real growth pattern asked at its most visible and heaviest (500-row prepends to every group, eight times), so it prices ordered-insert cost at the head rather than typical feed growth."
---

## What the script does

`GROWTH_FRAMES` = 8 steps (scenarios.ts:3981, 3994-3999): `write` of one prepared
batch of new keys, then `settle`. No row is removed between frames. Batches are
cloned once per process in `prepare` (:3985-3987). Each step is one binding call,
so the script does not use `frame`. `repeatable: false` (:3984).

## What decides correctness

`check` (scenarios.ts:4000-4008): both windows full, view A's head is a grown row
(`h` prefix, dataset.ts:930), and at least `GROWTH_FRAMES` DISTINCT renders per
view. Every frame changes both windows, so the distinct floor is the guard that
matches the script; the previous card's finding that `check` counted deliveries
(and so redundant ones) no longer holds. The description still says "at least one
delivery per frame" (:3979), which is weaker than what `check` asks.
`finalStateOnly` (:3983) compares the final state of both views with the model
(worker.ts:419-447), and the population and grouping audits read all 14000 rows
and fifty buckets afterwards (worker.ts:462-464). A store that dropped or
mis-ordered rows fails there.

## Representativeness

Stores that grow under a live subscription are common and every other script
runs at a fixed population, so the row fills a real gap. It is narrow because
it asks only head insertion at page-sized batches; the append-below-the-fold case,
which is the more frequent one for infinite lists, is not asked by any script.

## The standing record, checked

`ORDINARY_SCRIPT` (scenarios.ts:86-169, signed at :100). A1 holds through the head
check and the distinct floor. B4: both views change per step and the floor counts
one window delivery per step (floor.ts:76-87, 95), so the floor understates the
minimum, the safe direction.