---
scenario: "churnShared"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "692a8268becb4188"
verdict: "narrow"
models: "32 components that all subscribe to the SAME entity mounting together and unmounting oldest-first, e.g. items that each read one shared record (current user, settings), torn down when a route changes."
measures: "Per-subscriber add and remove on one source's listener list at length up to 32, plus one wake of all 32 per cycle; the per-source subscriber list structure decides it."
favours:
  - "Listener lists with O(1) removal (Set, recorded position plus swap-remove) over arrays with indexOf plus splice, though at 32 the difference is below run-to-run spread per WHY-EACH-ROW.md:1616-1619 (3.7-5.0 % of cost at 32; recorded figures, not re-measured)."
  - "Stores whose mount is one edge into an existing source list over those that build a per-subscriber observer graph."
biases:
  - "All 32 subscribers on ONE row (`onSharedRow`, scenarios.ts:2010). This is the fan-in corner; the ordinary list mount, one subscriber per row, is `churnList` (scenarios.ts:2260-2285), which also differs from this row in write volume (see that card)."
  - "The hand-written anchor unmounts with indexOf plus splice (adapters/baseline-array.ts:638-650); per WHY-EACH-ROW.md:1530-1535 and :1580-1590 `@oimdb/core` removes by recorded position (not re-read in packages/core for this card). The anchor does more work by algorithm. Toward oimdb against the anchor."
  - "Each step includes 1/32 of two frames and one wake per subscriber per cycle, so cheap wake-up helps as much as cheap mount."
  - "No floor divides this table (floor.ts:81, 91-100, 108-119), contrary to the standing's B4 comment (scenarios.ts:249-255)."
summary: "Mount and unmount of 32 subscribers sharing one source, oldest-first; a real but uncommon fan-in shape whose order and list-structure effects are below noise at this size."
---

## The script

`makeChurnScenario` (scenarios.ts:1841-2007) with `churned: CHURN_SUBSCRIBERS` = 32
(dataset.ts:143), `reversed: false` (scenarios.ts:2048-2068). Per cycle (8,
dataset.ts:169): 32 mounts on `churnRows[0]`, one `patchLabel` outside `frame`
(`writeFrame`, :1880-1885) and settle with one delivery naming 32 wakes, 32
unmounts in mount order, one write and settle with no delivery. `steps` = 8 × 32
(:1898).

## What `check` and the oracle prove

`check` (:1961-1978): deliveries and distinct both 8, view B silent, and the last
line exactly as `deliveriesOf` (:1855-1879) states it — woke 32, read
`CHURN_MARKS[14]` (`expectChurnHead`, :1829-1839) and, on the verify and proof
passes, the fold of all 32 slots' reads (render.ts:124-141). The oracle
(:1979-2005) states every line; the digest is compared in both passes
(worker.ts:488-534, 644-662).

## Ways a broken store passes

- **The woke count and the per-slot reads are the adapter's own bookkeeping**
  (render.ts:109-116); timed samples carry no fold. Subscribers 1..31 are now
  read on audited passes: a subscriber that ran and read nothing, or read the
  wrong row, changes its slot's entry in the fold.

## What decides the row

With 32 subscribers on one source, the per-source list structure and the
per-subscription allocation. WHY-EACH-ROW.md:1525 (upper bounds on a loaded
machine) recorded oimdb 126.7 ns/pair, baseline-array 73.6, jotai 516.2, and
:1616-1619 that the quadratic term is 3.7-5.0 % of cost at 32 — a linear-cost row;
the order and the quadratic are for `churnSharedDeep*`.

## Standing (CHURN_SCRIPT, scenarios.ts:202-290, listed at :205)

- A2 (:219-223) says a leaked subscriber delivers a new label that `check` fails.
  Matches the code.
- A4 (:230-234) names the per-slot read fold. Holds.
- B4 comment (:249-255) says `mountFloor` scales this table; floor.ts:91-100 says
  nothing does.
- B2 (:240-244) keeps the anchor's indexOf plus splice "because a person writing
  this writes it"; it is also why the anchor is not a lower bound here.