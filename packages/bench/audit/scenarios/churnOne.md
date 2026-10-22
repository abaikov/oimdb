---
scenario: "churnOne"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "5b008965a2fa6b0a"
verdict: "narrow"
models: "A conditional render toggling one component that subscribes to one entity: mount, the entity changes, unmount, the entity changes again with nobody listening."
measures: "The fixed cost of creating and disposing one subscription on one source, plus two write+settle frames per pair; with one pair per two frames, the frame cost is most of each step."
favours:
  - "Stores with a cheap near-empty frame (settle with one dirty source and one or zero subscribers), since each step carries two full frames."
  - "Stores whose subscribe allocates little (one closure or one edge) over those that build an observer object, a dependency Set or a derived atom per subscription."
biases:
  - "steps = CHURN_CYCLES × 1 = 8 (scenarios.ts:1898), so each reported step includes two writes, two settles and one delivery; the row ranks frame overhead as much as mount cost. Toward stores with low per-frame constants."
  - "The row is resolved before the clock (`holdChurnRows` in `prepare`, scenarios.ts:1912-1918), so key-to-handle lookup is excluded from the mount for everyone. Toward identity-holding stores whose mount would otherwise start with a lookup that selector-based stores do not have."
  - "No churn table has a floor (floor.ts:81, 91-100, 108-119), although the shared standing's B4 comment says `mountFloor` scales it (scenarios.ts:249-255)."
summary: "One subscription mounted and disposed per two frames; a real act at its smallest size, so the number is dominated by per-frame constants rather than by the mount."
---

## The script

Built by `makeChurnScenario` (scenarios.ts:1841-2007) with `resident: 0`,
`churned: 1`, `mount: onSharedRow` (:2026-2046, :2010). Each of `CHURN_CYCLES` = 8
(dataset.ts:169) cycles: mount subscriber 0 on `churnRows[0]` (:1936), one
`patchLabel` outside `frame` (count 1, `writeFrame`, :1880-1885) and `settle`
(:1939-1940), unmount (:1941-1945), `patchLabel` and `settle` (:1948-1949).

## What `check` and the oracle prove

`check` (:1961-1978) demands exactly one delivery and one distinct render per
cycle, silence on view B, and that the last line equals the last entry of
`deliveriesOf` (:1855-1879, last taken at :1963): woke 1, read
`CHURN_MARKS[14]` (`expectChurnHead`, :1829-1839). The line is
`churnLineOf(woke, reads)` (render.ts:140-141), with a `#1/<hash>` fold of the
one standing slot on the verify and proof passes. The oracle emits it per mounted
frame and nothing for the unmounted one (:1979-2005), compared in both passes
(worker.ts:488-534, 644-662).

The head check repeats, as an exact string, what the digest already compared line
by line; it adds a readable failure and protection against a 32-bit digest
collision on the last line, not a new constraint. At one subscriber the fold adds
little beyond the head: the standing count `1` confirms the unmount cleared the
slot's read before the next mount.

## Ways a broken store passes

- Nothing found at this size: one subscriber, one row, both frames' outcomes
  pinned. The woke count and the read are the adapter's own bookkeeping
  (render.ts:109-116), so a binding that counted a wake without the library
  calling it would be an adapter defect, outside this card.

## Representativeness

A component that appears and disappears subscribing to one entity is common (a
tooltip, a detail pane, a modal bound to the selected item). The list mount — N
components on N rows — is `churnList`.

## Standing checked against the code (CHURN_SCRIPT, scenarios.ts:202-290, listed at :204)

- A2 (:219-223) says a wake in the second frame delivers a new label that `check`
  counts as an unrequested distinct render and fails. Matches the code.
- B4 (:249-260): the comment says `floorKeyFor` hands this table `mountFloor`;
  `BOUND_BY` has no `mount` entry (floor.ts:91-100). The MET survives because
  `standard.ts:443-460` accepts a declared absence.
- B2 (:240-244): the anchor unmounts by `indexOf` plus `splice`
  (adapters/baseline-array.ts:638-650); at one subscriber that costs nothing.
- A3 NOT MET (:224-229) and C5 NOT MET (:279-288) hold as stated.