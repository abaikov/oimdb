---
scenario: "tearDownFloor"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "d505e5a4e741b509"
verdict: "synthetic"
models: "Nothing an application does: a hand-built screen given back by overwriting one reference, used as the lower bound of the `tearDown` table."
measures: "The cost of one reference store — the least any teardown can cost."
favours:
  - "No participant. As the divisor of the teardown table it makes every row's multiple a ratio against an operation of a few nanoseconds."
biases:
  - "The timed region is one assignment (scenarios.ts:3688-3690) run once per sample (`repeatable: false`, scenarios.ts:3646; repeat cap 1, cells/runBatch.ts:55). The sample is bracketed by two `process.hrtime.bigint()` calls (measure.ts:75-77), so the measured minimum is likely of the order of the timer's own overhead rather than the assignment, and the teardown multiples are then ratios to clock overhead. Not measured by this card."
  - "The garbage released by the drop is collected before the next sample, outside the clock (measure.ts:72-74), exactly as for `tearDown`; the floor shares that exclusion, so it bounds the synchronous part only."
  - "The screen's subscribers are closures in an array attached to nothing (scenarios.ts:3661-3673); a teardown of subscriptions to a surviving store is not what this bounds."
  - "Windows A and B are the same rows (scenarios.ts:3659-3660), declared irrelevant to the cost (:3648-3652); true for a reference drop."
summary: "A lower bound that is, in practice, near the timer's resolution; use it to see which teardown rows are at clock noise, not to rank them."
---

## What the script does

Restore builds a `Map` of all rows, two window arrays, one closure per visible row
and two view bodies (scenarios.ts:3653-3686). The timed step sets the module
variable `floorScreen` to the shared empty screen `TORN_DOWN_SCREEN`
(scenarios.ts:3543-3550, 3688-3690). `check` runs a proof frame stronger than
`tearDown`'s: it writes a page into the torn-down screen, calls every per-row
subscriber left on it and fails if any read a label, then calls every view body and
demands nothing was delivered (scenarios.ts:3697-3724).

## Representativeness

An instrument. Its argument — a floor must be unbeatable, so clearing structures
would be a floor a reference-dropping store beats (scenarios.ts:3558-3563) — is
sound. The consequence is that the floor is essentially zero at the timer's
resolution, which makes the multiples in the teardown table large and not very
informative.

## The standing record, checked

Its own record (scenarios.ts:3583-3640). A1, A3, C5 NOT MET with reasons that match
the code (A1 is forced by standard.ts:337-345 for a `populationDestroyed` script).
B4 MET's falsifier "the teardown row coming out BELOW this number" (:3617-3619) is
unlikely to fire for the reason above, so it guards little.
