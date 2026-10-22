---
scenario: "churnChain"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "115a18f5c52fae9a"
verdict: "narrow"
models: "32 components each building its own selector stack at mount (a selector factory, per-instance derived atoms or computeds) of 4 derivations over 8 entities, then torn down."
measures: "Building and tearing down a 4-deep linear derivation chain per subscriber, including whatever walk the store does to find the roots under the chain."
favours:
  - "Hand-written code, which knows the roots statically and builds nothing at mount (adapters/baseline-array.ts:589-618); the standing admits the two sides do not do the same job (B1 NOT MET, scenarios.ts:2326-2334)."
  - "Stores whose derived nodes are cheap to allocate and whose subscription does not expand roots through the chain."
biases:
  - "The chain is linear: level k applies `chainLevelOf` to level k−1 (derivations.ts:1-7; e.g. adapters/oimdb.ts:588-603, adapters/mobx.ts:415-429, adapters/redux-toolkit.ts:548-558). No diamond (that is `churnDiamond`), no fan-in between derivations, no equality cutoff exercised (every write changes root 0 and so every level), no derivation shared between the 32 subscribers."
  - "Depth 4 (dataset.ts:162) is shallow; a store with O(depth) per-level overhead is hard to separate from one with O(1)."
  - "All 32 subscribers build identical chains over the same 8 rows (scenarios.ts:2378-2379); in applications such selectors are often memoised once and shared. Toward cheap per-instance allocation, against stores that would share."
  - "The mount comparison against the anchor is not comparable (B1 NOT MET), and the report prints no per-row note for it, by the standing's own text."
  - "Population: lokijs and valtio decline the chain (adapters/lokijs.ts:1018-1025, adapters/valtio.ts:707-713), as do `baseline-array-indexed` (no churn wiring, adapters/baseline-array-indexed.ts:463) and `control-write` (harness/control.ts:1226). signaldb and zustand supply it."
  - "No floor divides this table: `stepDeliveryOf` returns `mount` (floor.ts:81), `BOUND_BY` has no `mount` entry (floor.ts:91-100), and `UNBOUNDED_BECAUSE` gives the reason (floor.ts:108-119)."
summary: "Per-subscriber linear selector stacks built and destroyed; it prices mount-time chain construction, with every chain's depth checked on audited passes, but no graph shape (sharing, cutoff) that differentiates reactive engines."
---

## The script

`makeChurnScenario` (scenarios.ts:1841-2007) with `wiring: 'chain'`,
`churned: 32`,
`mount: (churn, at) => churn.mountOnChain(at, 0, CHURN_CHAIN_ROOTS, CHURN_CHAIN_DEPTH)`,
`headOf: chainHead` (scenarios.ts:2287-2385, `chainHead` at :2024), 8 roots and
depth 4 (dataset.ts:161-162). The write lands on the first root (`churnRowOnly`,
:2014) as one `patchLabel` outside `frame` (`writeFrame`, :1880-1885).

## What `check` and the oracle prove

`deliveriesOf` (scenarios.ts:1855-1879) states each mounted frame's line: woke 32
and every standing slot's read, `chainHeadOf(label, 4)` = `${label}>1>2>3>4`
(derivations.ts:3-7). `check` (:1961-1978) compares the last line exactly
(`expectChurnHead`, :1829-1839); the oracle (:1979-2005) emits every line. On the
verify and proof passes the line folds all 32 slots' reads (render.ts:124-141), so
a subscriber that built fewer levels, or skipped a level's recomputation, renders
a shorter text in its slot and fails — any of the 32, not only subscriber 0.

## Ways a broken store passes

- **The four levels are not observable as nodes.** The text is the same whether
  four library nodes compose it or one function applies `chainLevelOf` four times;
  the latter is what the anchor does (adapters/baseline-array.ts:602-610). An
  adapter that folded the levels would pass. B2/B3 forbid it
  (scenarios.ts:2335-2344); `check` cannot see it.
- **Only root 0 is written**, so registration on roots 1..7 is untested, as on
  `churnWide`.
- The woke count and the per-slot reads are the adapter's own bookkeeping
  (render.ts:109-116); timed samples carry no fold.

## What decides the row

Allocation of 4 derived nodes per subscriber and the root walk at subscribe.
WHY-EACH-ROW.md:1642-1650 recorded oimdb 797.2 ns/pair vs 126.7 for a flat mount,
and baseline-array 639.6 paid "depth × count reads per wake-up". The anchor's body
now reads the 8 roots once and applies the 4 levels to the result
(adapters/baseline-array.ts:602-610), so that description of the anchor is
out of date.

## Representativeness

Per-component derived state built at mount is real (hooks creating computeds,
`atom()` inside a component). The narrowness is the graph: a single linear chain,
never shared, never cut off.

## Standing (own record, scenarios.ts:2303-2374)

- A4 MET (:2319-2325) holds for every standing slot: the head text is in the read
  fold, compared in the verify pass and in the timed process's proof pass
  (worker.ts:488-534, 644-662).
- B1 NOT MET (:2326-2334) is accurate and is the largest caveat on the row.
- B2 MET (:2335-2339): the anchor derives 4 levels per wake over one read of the
  roots, so the frame derives the same number of levels as the engine. Holds.
- B4 MET (:2347-2350) and the comment above it (:2345-2346, "this table is scaled
  by `mountFloor`") are stale against floor.ts:91-100: no floor scales this table.