---
scenario: "churnSharedDeep"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "1fa2856a4c6dee55"
verdict: "synthetic"
models: "256 components subscribed to one shared entity, mounted and torn down oldest-first. Rare as a workload; it is the large half of a size pair against `churnShared` to expose a quadratic unmount."
measures: "Whether mount plus unmount on one source is linear or quadratic in the number of subscribers on it: read against churnShared, 8× growth is linear, 64× is quadratic."
favours:
  - "O(1) listener removal (Set delete, recorded position plus swap-remove). Array indexOf plus splice pays a quadratic term, recorded at 25-33 % of cost at 256 (WHY-EACH-ROW.md:1559-1566; not re-measured)."
biases:
  - "The anchor keeps indexOf plus splice (adapters/baseline-array.ts:638-650) while `@oimdb/core` removes by recorded position per WHY-EACH-ROW.md:1580-1590 (not re-read in packages/core), so on this row the anchor is algorithmically handicapped against the engine. Toward oimdb in the oimdb/anchor ratio."
  - "256 subscribers on one row (dataset.ts:146, `onSharedRow`, scenarios.ts:2010) is a stress size for a single source; ordinary lists spread subscribers over rows."
  - "Each cycle also wakes all 256, so wake cost is in every step."
  - "No floor divides this table (floor.ts:81, 91-100, 108-119); the `mount` reason says rows of this table come out under `mountFloor` (floor.ts:110-113)."
summary: "An instrument: 256 subscribers on one source, to show whether unmount is quadratic; read only as a ratio against churnShared, not as a workload."
---

## The script

`makeChurnScenario` (scenarios.ts:1841-2007) with `churned:
CHURN_SUBSCRIBERS_DEEP` = 256 (dataset.ts:146), `reversed: false`
(scenarios.ts:2092-2112). Otherwise identical to `churnShared`; the last line must
be woke 256 with read `CHURN_MARKS[14]` (`expectChurnHead`, scenarios.ts:1829-1839,
called at :1976) and, on the verify and proof passes, the fold of all 256 slots'
reads (render.ts:124-141). What the check proves and what passes it is as on
`churnShared.md`.

## The pair is the measurement

The description states it: one size cannot separate linear from quadratic
(scenarios.ts:2096-2101). That is a sound design for an instrument, and
WHY-EACH-ROW.md:1537-1566 used it to fit `F + aN + bN²` through N = 1, 32, 256.
Because it is a three-point exact interpolation there is no residual. The oimdb
`b` term priced a removal path that file says is gone (:1568-1590), so the
recorded figures do not describe the current engine.

## Representativeness

Synthetic as a workload. A 256-way fan-in on one entity exists (a global theme, a
clock) but is usually served by one subscription high in the tree. It probes
one-source fan-out on the mount/unmount side, at an unrealistic size by design.

## Standing (CHURN_SCRIPT, scenarios.ts:202-290, listed at :207)

- B2 (:240-244) deliberately keeps the anchor's O(N) removal; on this row that
  makes the anchor a weak comparison and not a lower bound.
- B4 comment (:249-255) is stale against floor.ts:91-100.
- A2 (:219-223) states that a leak fails `check`. Matches the code.