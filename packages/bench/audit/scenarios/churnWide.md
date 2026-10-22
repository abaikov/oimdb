---
scenario: "churnWide"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "13f4fedba992b2c8"
verdict: "narrow"
models: "One component that reads 64 entities at once (a summary, a total, a chart over a selection) mounting and unmounting."
measures: "What a subscription pays for a 64-entry source list: registering in 64 sources on mount and leaving each on unmount, plus any deduplication or expansion of the list."
favours:
  - "Stores whose multi-source subscribe is one object plus one edge per source (an effect over a source array, a hand-written list per id) over stores that compose a derived node over 64 per-entity nodes."
  - "Stores that take the source list as given; the script never asks a store to discover its sources by tracking reads, so tracking-based designs pay for a capability the script does not exercise."
biases:
  - "The source list is static and known at mount (`mountOnRows(at, 0, CHURN_WIDE)`, scenarios.ts:2149). No dynamic dependencies: a component whose reads change between renders is not represented. Toward explicit-source designs."
  - "The 64 rows are resolved before the clock (`holdChurnRows` in `prepare`, scenarios.ts:1912-1918), so the lookup of 64 keys is excluded from every mount."
  - "One subscriber per cycle, so per step = one 64-source pair plus two frames; the frame share is small relative to 64 registrations but still present."
  - "No floor divides this table (floor.ts:81, 91-100, 108-119)."
summary: "One subscriber over 64 statically known sources mounted and disposed; real for aggregate components, blind to dynamic dependency tracking, and its check proves registration on one source only."
---

## The script

`makeChurnScenario` with `wiring: 'wide'`, `churned: 1`,
`mount: (churn, at) => churn.mountOnRows(at, 0, CHURN_WIDE)`
(scenarios.ts:2134-2155), `CHURN_WIDE` = 64 (dataset.ts:149). The write lands on
`churnRows[0]` only (`churnRowOnly`, scenarios.ts:2014; `writeFrame` with one row
calls `patchLabel(ids[0], …)`, :1880-1885).

## What `check` and the oracle prove

`check` (:1961-1978): 8 deliveries, 8 distinct, view B silent, last line
`expectChurnHead` (:1829-1840), i.e. `1:${CHURN_MARKS[14]}` plus, on verify and
proof passes, the read fold `#1/<hash>` (`churnLineOf`, render.ts:140-141). The
oracle (:1979-2005) states every line, compared in both passes (worker.ts:488-492
with the runner's digest comparison of the emitted `digestA`/`oracleA`;
worker.ts:644-660 in the timed process).

## Ways a broken store passes

- **Registration on 63 of the 64 sources is never tested.** Only row 0 is written,
  so a store or binding that registered on the first source only passes `check`,
  the digest and the head check, and posts a faster time. The churn read fold
  (`auditChurnReads`, scenarios.ts:1900; render.ts:123-141) does not close this:
  it folds one read per standing SUBSCRIBER, and the one subscriber here reports
  row 0's label (`rowOf: onRowZero`, `headOf: asRead`, :2153-2154; the anchor's
  `readInto(at, first)`, adapters/baseline-array.ts:579-581). Whether any adapter
  registers on fewer than 64 sources was not verified here; the population audit
  cannot see it, because no subscription state is audited.
- **A leaked registration on sources 1..63 is never tested either**: the unmounted
  frame writes row 0 only, so a subscriber that left row 0 but stayed on the
  others delivers nothing and passes.

## What decides the row

The cost per source of registering and leaving. WHY-EACH-ROW.md:1637-1641 (upper
bounds, loaded machine) recorded oimdb 65.4 ns/source, baseline-array 46.4,
jotai 1025, with the note that jotai's derived atom over 64 atoms is a different
object graph. That run was on jotai 2.20.2; 3.0.1 is installed. Not re-measured.

## Representativeness

An aggregate component over a selection exists in applications. What applications
also do and this cannot ask: a subscription whose source set changes between runs
(conditional reads). Here the set is fixed at mount.

## Standing (CHURN_SCRIPT, scenarios.ts:202-290, signed at :209)

- A1 MET (:213-218) proves liveness on one source, and its fold of "what EVERY
  standing subscriber read" is one read here, not 64; the falsifier is narrower
  than the description's claim to price "registering in each source"
  (scenarios.ts:2142-2143).
- B4 comment and answer (:249-260) say `mountFloor` scales this table; floor.ts:91-100
  gives the `mount` shape no floor. A2 (:219-223) now matches `check`.