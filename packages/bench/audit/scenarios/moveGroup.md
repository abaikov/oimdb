---
scenario: "moveGroup"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "ff1b58e64ef8a02e"
verdict: "narrow"
models: "A card moved between two columns of a board, or a row whose status changes so it leaves one filtered list and joins another, one move per frame."
measures: "Re-selection: removing a row from one grouped view and inserting it into another, with both windows re-rendered every step."
favours:
  - "Stores keeping an ordered bucket per group: every arrival is at POSITION 0 of the target order, the cheapest insertion such a bucket has; `TPlan.arrivalRanks` says so and that it was chosen to make the move visible rather than to be typical (dataset.ts:629-638)."
  - "Stores with a group index over those that rescan the population per derivation."
biases:
  - "Movers are the first MOVER_COUNT rows of group A by ordinal and are ranked 1..4, below every other row (dataset.ts:440-448), so they sit at the head of whichever group they are in. Arrival is always at position 0 and departure always from the head. Tilts toward ordered-bucket designs (oimdb among them) whose insertion cost grows with position; `moveAndReorder` (scenarios.ts:1012-1066) exists to counter this and must be read beside it."
  - "One write per settle (scenarios.ts:987-995) and no `frame` call: coalescing is not exercised, which is neutral between eager and deferred stores."
  - "Only four movers and eight steps (dataset.ts:69; scenarios.ts:977): a small sample of the operation, folded by `repeat` for resolution."
  - "Both views change every step, so the selective-wake question is not asked here; a board with 50 columns would ask which other 48 are woken (that is `consumerPerGroup`, on rank moves rather than group moves)."
summary: "A real board or status-change operation, measured at its cheapest arrival position; read it only beside moveAndReorder."
---

## What the script does

`MOVER_COUNT × 2` = 8 steps (scenarios.ts:977). The first four move each mover from
group A to group B, the last four move them back, each followed by `settle()`
(scenarios.ts:987-995). `check` demands exactly eight distinct renders in each view
(scenarios.ts:996-998); the oracle replays the same moves with one `emit` per move
(scenarios.ts:999-1007). `restore` puts every mover back in group A (scenarios.ts:983-986).

## Representativeness

Changing a row's group is the core operation of a kanban board and of any
status-filtered list, so the task is typical. The size — one row per frame — is
typical of a drag. What is not typical is that the moved row always lands at the
head of the target list; in a board the card lands where the user drops it, and in
a status list it lands at its sort position. The plan's own comment admits the
choice (dataset.ts:629-638), and `moveAndReorder` asks the mid-order arrival with
`plan.arrivalRanks` (dataset.ts:967-990).

## The standing record, checked

`ORDINARY_SCRIPT` (scenarios.ts:86-169, signed for this key at :91). A1 MET
(:106-110) holds: both views render a new state every step. B4 MET (:140-144) holds:
`stepDeliveryOf` returns `window` (floor.ts:86) and `BOUND_BY` maps it to
`consumerFloor` (floor.ts:95).
