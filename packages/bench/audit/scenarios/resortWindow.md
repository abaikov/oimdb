---
scenario: "resortWindow"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "094adbdd5a106d6c"
verdict: "narrow"
models: "Every visible row's sort key changes in the same frame — a live leaderboard or price list re-ordering on each tick — for eight ticks."
measures: "Order maintenance as a function of how much of the order moved: a whole window re-ordered per frame, against `sortKeyMove`'s one row."
favours:
  - "Stores that sort lazily at derivation time (sort the window's candidates once per frame) over stores that maintain an ordered index incrementally — the script's comment expects the incremental bucket to lose here (scenarios.ts:1113-1125)."
  - "Deferred-flush stores and libraries whose batch API `frame` opens (scenarios.ts:1180-1184): 32 rank writes become one derivation. Adapters whose `frame` is a direct call re-derive per write if the library is eager."
biases:
  - "The 32 writes of each frame run inside `ctx.binding.frame` (scenarios.ts:1180-1184; types.ts:24-26). Every adapter supplies `frame`; it is a direct `run()` in the anchors, lokijs, oimdb-legacy, nanostores and effector (see the patchMostRows card for the lines). Whether each is a library with no batch API is the participant cards' question."
  - "Membership is constructed never to change: the rank pool is strictly below every rank outside the window (`TPlan.resortRanks`, dataset.ts:525-534; built at :1019-1026, 1066; scenarios.ts:1127-1131). A real tick re-orders rows into and out of the window as well; this asks only the permutation."
  - "The pool is rotated by frame+1 places (scenarios.ts:1174-1187): a structured permutation, not a random one. An insertion-based repair sees the same displacement pattern every frame. Direction unverified."
  - "The comment's mechanism names `settleBudget(n)` in `engine/bucket/array/OIMBucketSlotsServiceArrayDriven.ts` (scenarios.ts:1115-1120); no symbol of that name exists under packages/core/src. The mechanism exists under another name: the default `bucketFullSortGuard` is `fullSortGuardAboveLogBudget` (packages/core/src/engine/bucket/array/OIMBucketSlotsServiceArrayDriven.ts:37; utils/fullSortGuardAboveLogBudget.ts:1-7), which chooses `list.sort` when `2 * outOfPlace + arrived` exceeds twice the bit length of the bucket size (16 for a 200-row bucket), else insertion repair (OIMBucketSlotsServiceArrayDriven.ts:249-263). A whole window out of place is far above that budget, so the comment's prediction follows from current code; its symbol name is stale."
  - "32 separate `setRank` calls per frame (scenarios.ts:1181-1183): a tick usually arrives as one array, and an action-based store cannot fold the calls into one action, as on `batchPatch`."
  - "ADDRESSED: `check` now asks for at least RESORT_FRAMES DISTINCT renders of view A (scenarios.ts:1204), not deliveries, so a store delivering an unchanged order on an intermediate frame fails it."
summary: "The many-rows-reorder end of the sort dial, real for ticking ranked lists and run inside each adapter's `frame`, but with membership frozen and a structured permutation."
---

## What the script does

`RESORT_FRAMES` = 8 steps (dataset.ts:117; scenarios.ts:1146). Each writes `rank` on
all 32 rows of view A's window from a fixed pool rotated one place further each
frame, inside `ctx.binding.frame`, then one `settle()` (scenarios.ts:1174-1187).
`check`: A full, B no distinct render, and at least 8 distinct renders of A
(scenarios.ts:1197-1204). The order itself is judged by the final-state comparison
(`finalStateOnly`, :1151; worker.ts:504-513).

## Representativeness

Whole-window re-ordering happens in live dashboards and ranked feeds; it is the
counterweight to `sortKeyMove`, which only asks an ordered index for the case it
is best at. The operation is real. It is narrow because membership cannot move and
because a tick of that kind usually arrives as a single array write, while the
script issues 32 separate `setRank` calls.

A user-initiated sort change — clicking a column header so the COMPARATOR changes —
is a different task, and the suite has no script for it.

## The standing record, checked

`ORDINARY_SCRIPT` (scenarios.ts:86-169, signed for this key at :93). B1's
eager-versus-deferred asymmetry (:125-129) now shows only for adapters whose `frame`
is a direct call.
