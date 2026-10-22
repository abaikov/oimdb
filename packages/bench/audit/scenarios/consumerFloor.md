---
scenario: "consumerFloor"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "84bd190848322070"
verdict: "synthetic"
models: "Nothing an application does: the consumer alone, driven over plain objects, used as the lower bound of every window-delivery table."
measures: "The cost of formatting and hashing one 32-row window delivery, per step."
favours:
  - "No participant. As the divisor of the window tables it decides which rows carry the floor-bound mark (floor.ts:16, 197-203), so its accuracy tilts every one of those tables."
biases:
  - "The code still contains the per-row ternary that floor.md's tombstone (floor.md:17-30) says was removed: `i === step % rows.length ? `p${step}` : row.label` (scenarios.ts:3219), one remainder, one compare, one branch per row and one template-literal allocation per step that no participant's `deliver` performs. floor.md says this inflated the floor and deflated every multiple; it is still there."
  - "render.md:9-10 says `consumerFloor` calls `deliver` rather than inlining it, and floor.md:25-26 says it calls `deliver` over two alternating windows; the run calls `consumer.begin/row/end` directly over `floorRows` only (scenarios.ts:3209-3223). `floorRowsB`, built for that design (worker.ts:316-319; types.ts:380-381), is used by no scenario (grep over src/)."
  - "Drives ONE consumer per step (scenarios.ts:3211) where most scripts it scales deliver to two views; floor.md:13-15 names this as an open defect. The view count and the ternary move the printed multiple in opposite directions, so 'conservative' (floor.md:9-11) is not established."
  - "Its description says tinybase hands a pooled holder and tanstack-db an enriched row (scenarios.ts:3135-3137); floor.md:6-7 says every adapter except mobx hands plain objects. tinybase's holders are plain literals overwritten in place (adapters/tinybase.ts:80-81, 110, 158-173), so that half agrees; tanstack-db hands its live query's `toArray` with the read's virtual properties widened away by a cast (adapters/tanstack-db.ts:345-348), which is not what floor.md calls plain. Which cost is higher was not measured."
summary: "The divisor of most tables in the report; as the code stands it is not the floor its documents describe, though it no longer divides the silent scripts."
---

## What the script does

32 steps, each a delivery of the 32 rows of group A's window, built once by the
worker (worker.ts:312-315), through `BenchConsumer` with the label of one row
varied per step (scenarios.ts:3209-3223). `check`: 32 distinct renders of 32 rows
(scenarios.ts:3224-3226). The oracle re-derives the window from the population and
renders it the same way (scenarios.ts:3233-3249).

## Which tables it divides

Every scenario whose step shape resolves to `window` (`stepDeliveryOf`,
floor.ts:76-87; `BOUND_BY`, floor.ts:91-100). The four silent scripts now set
`rendersNothing: true` (scenarios.ts:501, 567, 733, 1489), which maps them to
`nothing` (floor.ts:79), a shape with no floor and a printed reason
(floor.ts:129-136). The previous card's finding that they were divided by this
floor no longer holds.

## Representativeness

An instrument. Its job is to tell a reader how much of a row is the harness's
consumer. Because every window delivery in this suite is a full re-format of 32
lines plus an FNV hash per character (consumer.ts:108-147), this number is large
relative to a single-row write, and many rows sit within a small multiple of it,
which says that the suite's consumer, not the store, dominates those rows.

## Defects to fix before the next stamp

1. Remove the ternary or restore harness/README.md#floor's tombstone to the truth.
2. Either use `floorRowsB` and `deliver` as harness/README.md#render and harness/README.md#floor describe, or correct those documents.

## The standing record, checked

Its own record (scenarios.ts:3140-3203). B4 MET's falsifier is "this number being
subtracted rather than divided into", true of the arithmetic (`floorMultipleOf`,
floor.ts:171-181). B1 MET ("this floor rendering fewer rows or fewer lines per row
than the consumer every adapter shares") holds, but the floor performs MORE work
per step than a participant's delivery (the ternary), which B1 does not ask about.
C5 NOT MET says "every other table in the report is scaled by it" (:3197-3202);
the frame, mount and silent tables have no floor and the teardown, cell, relation
and single tables have their own (floor.ts:91-100), so that clause overstates.