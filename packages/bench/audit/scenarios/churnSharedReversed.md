---
scenario: "churnSharedReversed"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "897e142627830668"
verdict: "narrow"
models: "The same 32 components on one shared entity as `churnShared`, torn down newest-first, as a stack of routes popped or a list unmounted from the bottom."
measures: "The cost of unmount order on a 32-long per-source listener list: for an array with indexOf plus splice, a long scan and no shift instead of a short scan and a long shift."
favours:
  - "Order-insensitive removal (Set, recorded position): those rows should equal `churnShared`; array-backed lists move."
biases:
  - "At 32 subscribers the order effect is inside run-to-run spread (WHY-EACH-ROW.md:1525-1526: oimdb 126.7 vs 132.9 ns, baseline-array 73.6 vs 80.0, with 0.3-10.7 % between-process disagreement at :1549), so the pair this row exists for is not resolved at this size. Recorded figures from before the 2026-10-17 library upgrades (jotai was 2.20.2 then, 3.0.1 is installed) and before the engine's removal changed (:1568-1590); not re-measured."
  - "All subscribers on one row (`onSharedRow`, scenarios.ts:2010); see `churnShared`. Order only matters where a per-source list is long, which is the uncommon shape."
  - "No floor divides this table (floor.ts:81, 91-100, 108-119), contrary to the standing's B4 comment and B4 answer (scenarios.ts:249-260)."
summary: "churnShared with LIFO unmount; it prices removal order on a 32-long listener list, an effect this suite's own run found below its noise at this size."
---

## The script

Identical to `churnShared` except `reversed: true` (scenarios.ts:2070-2090), which
takes the `for (let at = last; at >= first; at--)` branch (:1941-1942). Same
`check`, head-line check and oracle (:1961-2005); see `churnShared.md` for what
they prove and what passes them.

`auditChurnReads: true` (scenarios.ts:1900): on the verify and proof passes
(worker.ts:489, 644) the churn line also folds every standing subscriber's read by
slot (`foldChurnReads`, render.ts:123-141), so a subscriber that read anything but
row 0's label fails. Timed samples skip the fold. Here every subscriber is on row 0,
so the fold proves each of the 32 read the written label, not only subscriber 0.

## What it isolates

Only the unmount order; nothing else differs between the two scripts. Whether it
matters depends on the listener structure. The anchor's indexOf plus splice
(adapters/baseline-array.ts:638-650, the scan and splice at :644-645) is
order-sensitive; `@oimdb/core` removes by a recorded position
(`unsubscribeFrom`, packages/core/src/engine/computed/OIMEffect.ts:118-126), which
is not. jotai's growth from 32 to 256 came out below 8× (WHY-EACH-ROW.md:1550),
which that file reads as an O(1) listener set; that run was on jotai 2.20.2.

## Representativeness

Both orders happen in applications, as the shape comment says
(scenarios.ts:1792-1800). The question only has an answer when many subscribers
share one source, which is the narrow case; with one subscriber per row
(`churnList`) order is irrelevant.

## Standing

Shared CHURN_SCRIPT (scenarios.ts:202-290, signed at :206). The B4 comment and
answer (:249-260) say `mountFloor` scales this table; `floorKeyFor` gives the
`mount` shape no floor (floor.ts:81, 91-100, 144-147). A2 (:219-223) now says a
leaked subscriber's delivery FAILS `check`, which matches the equality on
deliveries and distinct renders (:1961-1978); the A2 inaccuracy the previous card
carried is gone.