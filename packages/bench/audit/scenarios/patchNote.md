---
scenario: "patchNote"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "4f99b1436c60c49c"
verdict: "narrow"
models: "An update to a field of a visible row that this screen does not display (a timestamp, a sync flag, a hidden attribute), one row per frame."
measures: "Column granularity of change tracking: whether 'the entity changed' is distinguished from 'something the view reads changed'."
favours:
  - "Stores that track dependencies per property (MobX observables, per-field signals): the column has no observers, so nothing runs."
  - "Against: row-granular stores — a whole-row signal, a per-visible-row subscription, an immutable row replaced on write — which wake view A once per step to show identical text."
biases:
  - "`note` is read by NOTHING anywhere (dataset.ts:25-27), an extreme. In applications an unread-here column is usually read by some other view; the script prices only the best case for per-property tracking."
  - "The drop-the-write cheat is not caught by the digest (scenarios.ts:544-556 says so); it is caught only by the population audit after the run, which compares `note` on every row (worker.ts:462; oracle.ts:529-531). A failure there voids the row, so the bias is closed, but only by the audit."
  - "Narrow rows (dataset.ts:29-35): a per-field-signal store pays its per-field setup at load, which is not timed here, so this row shows its benefit and hides its cost."
  - "ADDRESSED: the window floor. `rendersNothing` is set (scenarios.ts:567), so `stepDeliveryOf` returns `nothing` (floor.ts:79), `floorKeyFor` finds no floor for it (floor.ts:91-100, 144-147), and the table prints `no floor` (floor.ts:191) with the reason from `UNBOUNDED_BECAUSE` (floor.ts:129-136)."
summary: "The isolation half of the patchColumn pair: it prices per-property versus per-row change tracking on a column nobody reads, and is meaningful only beside patchColumn and batchPatchNote."
---

## What the script does

The same 32 rows, count and step shape as `patchColumn`, writing `note` instead of
`label` (scenarios.ts:580-589). Both views must produce zero distinct renders
(scenarios.ts:590-592); the oracle emits per write and produces the unchanged
state because the model renders `id rank label` (scenarios.ts:593-604).

## Representativeness

Real, but one corner: in an application the visible row typically carries fields
that this view does not render, and server pushes often touch only those. How
often a field is truly read by no one is application-specific. As a measurement
of a single design axis it is clean, because it differs from `patchColumn` only in
the column (scenarios.ts:539-542, description :562-565). Read as a workload alone,
it overweights the case where per-property tracking wins outright.

## The standing record, checked

`SILENT_SCRIPT` (scenarios.ts:171-187, signed for this key at :172). A1 NOT MET with
its reason (:175-180). B4 MET (:181-186) records that no window floor is applied;
`standard.ts:451-460` accepts the absence because `nothing` has an
`UNBOUNDED_BECAUSE` entry. The consumer share of a waking row is not removed, by
design (floor.ts:133-135). The same holds on `patchOutsideWindow`.
