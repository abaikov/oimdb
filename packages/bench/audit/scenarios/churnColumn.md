---
scenario: "churnColumn"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "f18966eb2c6b4c66"
verdict: "narrow"
models: "32 components that each read one FIELD (`label`) of one shared entity, as a field-level selector or signal, mounting together and unmounting oldest-first."
measures: "The difference between subscribing to a column identity and to a whole row, at the same count, root and order as churnShared: minting or finding the column handle and releasing it."
favours:
  - "Stores with a first-class field identity (field signals, column handles) over stores that model a field subscription as a selector with an equality check."
  - "Stores that mint the column handle cheaply and share it across the 32 subscribers."
biases:
  - "Two libraries decline: lokijs (adapters/lokijs.ts:472, reason at :1010-1017) and redux-toolkit (adapters/redux-toolkit.ts:547, reason at :1137-1144), as do `baseline-array-indexed` (adapters/baseline-array-indexed.ts:405) and `control-write` (harness/control.ts:1258). This table and churnShared hold different populations; the pair comparison is across two populations for those rows."
  - "The hand-written anchor keeps a second Map of `label` subscribers by row id (adapters/baseline-array.ts:431-432, mount at :583-588) and its settle probes both maps for every touched row (adapters/baseline-array.ts:531-543). That probe is paid on every churn script, not only here. WHY-EACH-ROW.md:1627-1636 recorded the anchor at 174.6 vs 73.6 ns/pair and attributes it to a `${id}|label` key the current anchor no longer builds; that figure describes an older anchor body."
  - "Only `label` is written, and every subscriber reads `label`; nothing measures whether a column subscription stays silent when ANOTHER column of the row changes, which is the point of subscribing to a column."
  - "All 32 on one row (`mountOnColumn` reads `churnRows[0]`, e.g. adapters/oimdb.ts:735-741); see churnShared."
  - "No floor divides this table: `stepDeliveryOf` returns `mount` (floor.ts:81), `BOUND_BY` has no `mount` entry (floor.ts:91-100), `UNBOUNDED_BECAUSE` gives the reason (floor.ts:108-119)."
summary: "Mount and unmount of 32 field-level subscriptions on one row; read only against churnShared, with two libraries absent from this table, and no frame that shows the payoff of column addressing."
---

## The script

`makeChurnScenario` (scenarios.ts:1841-2007) with `wiring: 'column'`,
`churned: 32`, `mount: (churn, at) => churn.mountOnColumn(at)`
(scenarios.ts:2157-2258, mount at :2252). Same cycle, check, head-line check and
oracle as the row shape (:1930-2005); the last line must be
`churnLineOf(32, reads)` with every slot reading `CHURN_MARKS[14]`, folded by slot
on the verify and proof passes (render.ts:124-141). What passes it is as on
`churnShared.md`.

## Representativeness

Field-level subscriptions are what a selector-based app does on almost every
component, so the act is ordinary. Narrow: all 32 on one row, and no frame writes
a different column, so the row prices the cost of column addressing without its
payoff.

## Standing (own record, scenarios.ts:2183-2248)

- The comment above the record (scenarios.ts:2170-2182) says the per-shape split
  took `lokijs` and `oimdb-3.12.1` out of this table. `oimdb-legacy` (version
  3.12.1) implements `mountOnColumn` (adapters/oimdb-legacy.ts:444), and
  redux-toolkit, which the comment does not name, declines it. The comment is
  stale on both names.
- A4 MET (:2199-2203) names the per-slot read fold.
- B1 MET (:2204-2208) holds for the declines read: they throw (`declinedMount`,
  types.ts:130-137) rather than subscribe to the row.
- B3 MET (:2214-2218) names LokiJS; redux-toolkit declines for the same reason
  (adapters/redux-toolkit.ts:1137-1144). Holds for the adapter read
  (adapters/oimdb.ts:735-741 uses `effectService.createEffect([columnSlot], …)` on `entityService.slotContentOwner.holdColumn(…)`);
  others not read for this card.
- B4 MET (:2219-2222): no floor divides this table, so B4's demand is not met in
  substance; the MET passes only the declared-absence check (standard.ts:443-460).