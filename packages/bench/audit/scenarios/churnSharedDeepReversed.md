---
scenario: "churnSharedDeepReversed"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "30af11feded2f5bb"
verdict: "synthetic"
models: "256 subscribers on one shared entity torn down newest-first; the fourth corner of the size × order square."
measures: "Whether an unmount-order effect grows with the number of subscribers on one source (array indexOf plus splice) or is constant (Set, recorded position)."
favours:
  - "Order-insensitive O(1) removal; array-backed lists pay the long scan on every unmount."
biases:
  - "Same anchor asymmetry as churnSharedDeep: anchor indexOf plus splice (adapters/baseline-array.ts:638-650) against the engine's positional removal (`unsubscribeFrom`, packages/core/src/engine/computed/OIMEffect.ts:118-126). Toward oimdb in that ratio."
  - "Stress size on a single source (dataset.ts:146); one subscriber per row (`churnList`) has no order effect at all."
  - "No floor divides this table (floor.ts:81, 91-100, 108-119)."
summary: "An instrument completing the size × order square for unmount on one source; meaningful only as a ratio against its three siblings."
---

## The script

`reversed: true`, `churned: 256` (scenarios.ts:2114-2132); LIFO branch at
:1941-1942. Same check, head-line check and oracle as the other row-shape scripts
(:1961-2005); see `churnShared.md`. `auditChurnReads: true` (:1900): on verify and
proof passes (worker.ts:489, 644) all 256 standing reads are folded by slot into
the churn line (render.ts:123-141), so each subscriber must have read row 0.

## What it adds

With `churnShared`, `churnSharedReversed` and `churnSharedDeep`, it lets a reader
see whether the order gap at 32 grows at 256. WHY-EACH-ROW.md:1527-1528 recorded
oimdb 146.5 → 164.8 ns and baseline-array 83.6 → 97.1 ns going to newest-first at
256, against near-equal pairs at 32; those were on a loaded machine, on jotai
2.20.2 (3.0.1 is installed), and the engine's removal has since changed
(:1568-1590).

## Representativeness

As for `churnSharedDeep`: an isolation, not a workload. Its weight for an
application is small, because the long single-source list is the uncommon shape.

## Standing

Shared CHURN_SCRIPT (scenarios.ts:202-290, signed at :208). The B4 comment and
answer (:249-260) still say `mountFloor` scales this table, against floor.ts:91-100.
A2 (:219-223) now states that a leaked subscriber fails `check`, which is what the
check does (:1961-1978); that inaccuracy is gone.