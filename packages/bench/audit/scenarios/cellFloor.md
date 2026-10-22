---
scenario: "cellFloor"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "79f409be8c98ca13"
verdict: "synthetic"
models: "Nothing an application does: the cell script with the store removed, used as the lower bound of the `cellDelivery` table."
measures: "The cost of one 8-line cell delivery through `deliverCells` per step, from arrays of strings."
favours:
  - "No participant; it is the scale for the cell table. It is tight for column-routing stores (one delivery per step) and half of a row-granular store's delivery work (scenarios.ts:3743-3747)."
biases:
  - "Delivers exactly one view per step (scenarios.ts:3847-3854); a correct row-granular store delivers two (one redundant). The floor therefore bounds both and separates them only through the counters."
  - "The values are held in two prepared string arrays (scenarios.ts:3734-3735); no lookup by key and no pin is in the timed region, so it bounds the delivery and not the address."
  - "Suffix alternation keeps every delivery distinct (scenarios.ts:3843-3844), so the digest fold is paid on every step as it is by the store rows."
summary: "A delivery-only lower bound for the cell table; correct in shape, and its multiple is a delivery ratio, not a store ratio."
---

## What the script does

16 steps in two halves. Each step writes one prepared string into
`cellFloorLabels` or `cellFloorNotes` and calls `deliverCells` (render.ts:62) on
consumer A or B (scenarios.ts:3840-3855). `check`: 8 distinct renders per
consumer and 8 lines in view B's last delivery (scenarios.ts:3856-3859). The
oracle loads the population, emits both views every step, and the digest folds
only distinct states, so both sides agree (scenarios.ts:3860-3885).

## Representativeness

An instrument, not a workload. It replaced `consumerFloor` for this table because
that floor's step is a 32-line window and overstated the bound
(scenarios.ts:3749-3752). The mapping in `floor.ts` is consistent for this pair:
`cellFloor` maps to `cell` in `FLOOR_STEP_DELIVERY` (floor.ts:52-60, at :57) and
to itself in `floorKeyFor` (floor.ts:144-147); `cellDelivery` maps to `cell` by
key (floor.ts:84) and `cell` is bound by `cellFloor` (floor.ts:97).

## The standing record, checked

Its own record (scenarios.ts:3764-3819). A3 (:3775-3779) and C5 (:3814-3818) NOT
MET are stated with reasons; both are inherent to a storeless script. B1 MET
(:3784-3788, "delivers PINNED_COUNT, which is what a store that routes by column
delivers") matches the code.