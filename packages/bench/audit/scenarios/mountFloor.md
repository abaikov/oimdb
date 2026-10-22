---
scenario: "mountFloor"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "f2a9457e34816b6c"
verdict: "synthetic"
models: "Nothing an application does. It is an instrument: 256 closures pushed into one plain array, one write, every body run, one delivery, then an O(1) swap-remove of each, one more write, no delivery; eight cycles, no store and no library."
measures: "The cost of allocating a closure, recording its position and its read in side arrays, running it once, and removing it by swap-with-tail, amortised over the largest subscriber count in the churn family."
favours:
  - "Nothing by construction: no participant runs in this table. It exists to be printed beside the churn tables."
biases:
  - "Its label (`mount lower bound`), its description and its own B4 answer call it a lower bound that scales the nine churn tables. `floor.ts` says the opposite: `BOUND_BY` has no `mount` entry (floor.ts:91-100) and `UNBOUNDED_BECAUSE` records that churn rows come out UNDER it (eight of eighteen on `churnShared`, floor.ts:108-119). A reader trusting the label is misled about every churn row's distance from it."
  - "The per-mount bookkeeping (closure, list slot, owner and position side-array slots, a per-subscriber read slot for the churn read fold, and a swap-with-tail plus two resets to leave; scenarios.ts:3453-3480) is heavier than what a Set-based listener or a recorded-position engine pays, which is why rows beat it; the figure is a reference cost of one particular hand-written shape, not a minimum."
  - "Amortises the two frames over 256 mounts, so its per-step frame share is the smallest in the family; comparing its per-step number to `churnOne` (one mount per two frames) compares mostly frame overhead."
summary: "A reference cost for one hand-written mount/unmount shape with no library; despite its label it is not a lower bound and floor.ts divides no churn table by it."
---

## What the script does

scenarios.ts:3450-3484: per cycle, 256 (`CHURN_SUBSCRIBERS_DEEP`, dataset.ts:146) closures are
allocated and pushed, each recording its slot, its owner and its read (:3453-3466); the root
label is written and every body runs (`mountFloorSettle`, :3328-3340); each subscriber is
swap-removed and its read cleared (:3469-3480); the label is written again and nothing is
delivered. `CHURN_CYCLES` is 8 (dataset.ts:169); `steps` is 8 × 256 (:3433). `check`
(:3490-3493) and `oracle` (:3500-3516) agree on one delivery per cycle naming 256 wakes.
`auditChurnReads: true` (:3434): on verify and proof passes the line also folds all 256 reads
(render.ts:123-141), and the oracle states each as the cycle's mark (:3512).

## Claims in the script checked against the code

- Description (scenarios.ts:3364-3372) and the blocks above it (:3273-3285, :3342-3345) say it
  is a lower bound and "the nine churn tables are scaled by this". `floor.ts:91-100`
  (`BOUND_BY`) maps `window`, `teardown`, `cell`, `relation` and `single` only;
  `floor.ts:108-119` (`UNBOUNDED_BECAUSE`, `mount`) states rows come out under it and "nothing
  here divides these rows". `floor.md:58-65` tombstones the old mapping. The description is
  stale.
- "Nine" is stale on its own terms too: `stepDeliveryOf` maps every script with `churn` set and
  not in the frame list to `mount` (floor.ts:76-81), which is the eleven `makeChurnScenario`
  scripts (scenarios.ts:2026-2690) plus `appFill` and `appRound` (`churn: 'row'`,
  scenarios.ts:2900, 2960).
- B4 MET with falsifier "a churn row coming out BELOW this number. That would mean the floor is
  not a floor" (scenarios.ts:3408-3411). By floor.ts:110-112 that has happened; by its own
  falsifier this answer is wrong. `standard.ts:443-461` accepts the MET because `mount` has an
  `UNBOUNDED_BECAUSE` entry, so the load check cannot catch it.
- The block at :3287-3290 says a row under `FLOOR_MULTIPLE_A_ROW_MUST_CLEAR` is refused a place;
  floor.md:32-37 tombstones that rule, and floor.ts now only marks (`floorBound`,
  floor.ts:197-203).
- B1 MET (:3395-3399) holds: it mounts 256 per cycle, the largest `churned` of the eleven
  `makeChurnScenario` scripts (`churnSharedDeep` and its reversal; scenarios.ts:2104, 2124).
  `churnResident` has more STANDING (256 resident plus 32 churned, :2681-2682), but mounts only
  32 per cycle.
- C5 NOT MET (:3427-3431) holds; nothing attests it.
- `SCENARIOS.md:110` repeats "Every one is scaled by `mountFloor`", also stale.

## Representativeness

Not a workload, and not claimed to be one. Its value is as a named reference number for "what
a hand-written closure list with recorded positions costs", which `WHY-EACH-ROW.md:1530-1535`
uses when it notes the anchor (`indexOf`+`splice`) does asymptotically more work than the
engine. Against public suites: js-reactivity-benchmark has no storeless reference row at all;
this one exists but is mislabelled.

## What would make it hold

Rename it to what it is (a reference cost) and change its B4/B2 answers and description to
match `floor.ts`, or rebuild it with a cheaper removal (Set delete) so it is genuinely below
every row. Either is a change outside this card's remit.