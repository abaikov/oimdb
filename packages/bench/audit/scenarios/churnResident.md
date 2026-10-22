---
scenario: "churnResident"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "a348ad19f9e4fa85"
verdict: "narrow"
models: "A screen that keeps most of its subscriptions and churns a fraction: 256 standing subscribers on one entity, 32 more mounted and unmounted on it per cycle."
measures: "End-to-end churn against a long standing listener list on one source: 32 mounts and unmounts plus 288 + 256 wakes per cycle, not mount cost alone."
favours:
  - "Stores with cheap wake-up per subscriber: per cycle 544 bodies run where churnShared runs 32 (WHY-EACH-ROW.md:1651-1660), so wake cost dominates the time."
  - "Stores whose unmount is O(1) in the standing list (Set, recorded position); indexOf plus splice scans up to 288 entries per unmount."
biases:
  - "The residents share the churned root (`mountResident: onSharedRow`, scenarios.ts:2683), so both frames wake them; the row cannot separate mount cost from wake cost (A1 NOT MET, scenarios.ts:2612-2620). A reader using it as 'mount cost when 256 are standing' reads the wrong number."
  - "In an application the standing subscriptions of a screen sit on many entities, so a churned mount does not lengthen any one list; putting all 288 on one source makes list length the variable, which is the uncommon case."
  - "Per step (`steps` = 8 × 32, scenarios.ts:1898) carries 17 wakes plus a share of two frames. Toward stores with fast notification loops."
  - "Anchor uses indexOf plus splice (adapters/baseline-array.ts:638-650) while the engine removes by recorded position per WHY-EACH-ROW.md:1580-1590 (not re-read in packages/core); toward oimdb in that ratio."
  - "No floor divides this table (floor.ts:81, 91-100, 108-119)."
summary: "Churn of 32 subscribers against 256 standing ones on the same source; an end-to-end churn-plus-notify cost, dominated by resident wake-ups, not a mount cost under load."
---

## The script

`makeChurnScenario` (scenarios.ts:1841-2007) with `resident: CHURN_RESIDENT` =
256, `churned: CHURN_CHURNED` = 32 (dataset.ts:157-158, scenarios.ts:2595-2690).
Residents take indices 0..255 and mount in `prepare`, untimed (:1912-1918); the
churned take 256..287 (:1932-1933). Both frames deliver (`deliveriesPerCycle` = 2,
:1843): the first names 288, the second 256, which proves the churned 32 left
(`deliveriesOf`, :1874-1876; oracle, :2000-2003).

## What `check` and the oracle prove

`check` (:1961-1978): 16 deliveries, 16 distinct, view B silent, and the last line
as `deliveriesOf` states it — for this script the last delivering frame is the
unmounted one, so woke 256, read `CHURN_MARKS[15]`, and on the verify and proof
passes the fold of the 256 resident slots (render.ts:124-141). A churned
subscriber that did not leave names 257 or more and, because its read was not
cleared, adds a slot to the fold's standing count; either fails.

## Ways a broken store passes

- **The woke count and the per-slot reads are the adapter's own bookkeeping**
  (render.ts:109-116); timed samples carry no fold. Every resident and churned
  slot's read is in the fold on audited passes, so residents 1..255 and the
  churned 32 are no longer attested by the count alone.

## Representativeness

The motivation (scenarios.ts:2599-2608) is sound: a screen churns a fraction. The
construction does not model it: the standing population of a real screen is
spread over many entities. What this row does show is the cost of notifying a long
list while it is being edited.

## Standing (own record, scenarios.ts:2611-2680)

- A1 NOT MET (:2612-2620) is accurate and should be read first.
- A2 MET (:2621-2625) holds: the second frame must name the resident count, and
  its read fold must hold no churned slot.
- A4 MET (:2631-2635) names the per-slot read fold.
- B2 MET (:2641-2645) keeps the anchor's linear unmount; on this row that is where
  it is most expensive.
- B4 MET (:2653-2656) and the comment above it (:2651-2652) say this table is
  scaled by `mountFloor`; floor.ts:91-100 gives it no floor.