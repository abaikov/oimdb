---
scenario: "moveAndReorder"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "65d9a6a8014c7f02"
verdict: "narrow"
models: "A row changes list and position together: a task dragged into another column at a chosen place, a ticket re-assigned with a new priority."
measures: "The cost of a group move combined with a rank change in one frame, where the arrival is in the middle of the target window rather than at its head: one run per sample, each after an untimed restore."
favours:
  - "Stores whose ordered bucket inserts by search over stores that append and re-sort; the arrival point is mid-window, so a head-only fast path does not help. Direction not measured."
  - "Libraries whose batching API `frame` reaches: the two writes of a step become one state. Libraries with no batching API render the intermediate state (group changed, rank not yet) and pay an extra derivation per step."
biases:
  - "Four movers, four steps (MOVER_COUNT, dataset.ts:69). Arrival ranks are adjacent integers in one gap of view B (dataset.ts:967-990, `inB[arrivalSlot].rank + 1 + j`), so every mover arrives at nearly the same slot."
  - "The way back to group A is the untimed restore (scenarios.ts:1033-1040), so the timed half is only the mid-window arrival; the head-of-group departure it pairs with is `moveGroup`'s cost too."
summary: "The mid-order arrival is real, its end state is verified, and every timed run is a real move (`repeatable: false`, one run per sample after restore); narrow because four arrivals land in one gap of one window."
---

## What the script does

`MOVER_COUNT` = 4 steps (scenarios.ts:1026). Each step calls `setGroup(mover, B)` and
`setRank(mover, arrivalRank)` inside `ctx.binding.frame` and settles (:1041-1051); the
oracle replays the same two writes with one `emit` per step (:1057-1065). `restore` puts
every mover back in group A at the rank captured in `prepare` (:1030-1040) before each
sample.

## What `check` and the final state prove

`finalStateOnly` (:1028) makes the final state the judge, and the final state is the
one the moves produced: every mover sits in group B at its arrival rank. A store that
lost a `setRank` places that mover at its resting rank (1 to 4, below every other row of
B; dataset.ts:440-447), so view B ends with a different line order than the model's and
the verify pass fails it. `check` (:1052-1056) additionally asks at least `MOVER_COUNT`
distinct states in each view over the run (a total, not one per step) and both windows
full.

## Why the verdict is narrow

`repeatable: false` (scenarios.ts:1029) caps `repeat` at 1 (cells/runBatch.ts:55), so
each sample is one run after `restore`, and every timed `setGroup`/`setRank` writes a
value the store does not already hold. What keeps it at `narrow`: four arrivals into one
gap of one window is one corner of drag-and-drop, read beside `moveGroup` (arrival at the
head) and `sortKeyMove` (a move inside one window).

## The standing record, checked

`ORDINARY_SCRIPT` (scenarios.ts:86-169, signed at :102). C2 MET's falsifier concerns the
sampling plan's source; with one run per sample there is no rerun for it to miss. B4: one window delivery per step (floor.ts:76-87, 95), while a
correct step changes both views, so the floor understates the minimum.

## History of this card

An earlier version rated the script `misleading` because the run ended with every mover
back in group A, so a store that dropped the rank write passed. The script was changed to
end in group B and return through `restore`, which closed that; the previous card rated it
`narrow`. A later version rated it `misleading` again because that same change left
`repeatable: true` in place, so up to 511 of every sample's runs rewrote values already
held. The script now says `repeatable: false`, and the verify pass's repeatability guard
(worker.ts, `secondRunFailure`) fails any script that claims to be repeatable and is not.
