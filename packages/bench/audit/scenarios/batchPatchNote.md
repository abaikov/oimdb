---
scenario: "batchPatchNote"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "554ffc26a5add9bd"
verdict: "synthetic"
models: "A bulk sync that changes only fields this screen does not display, applied in one frame."
measures: "Whether coalescing at the frame boundary recovers the wasted wake-ups a row-granular store pays on an unread column, versus per-property tracking that never wakes."
favours:
  - "Per-property trackers (mobx-style): nothing observes `note`, so no reaction runs at all, batched or not."
  - "Row-granular stores that defer delivery to `settle`, and row-granular libraries whose batch API `frame` reaches (scenarios.ts:752-756): at most one redundant derivation per view per frame."
  - "Against row-granular libraries with no batching API: one redundant derivation and one full-window render per visible write in the batch."
biases:
  - "The script sets `rendersNothing` (scenarios.ts:733), so `stepDeliveryOf` returns `nothing` (floor.ts:79) and no floor divides the table (`BOUND_BY` has no `nothing` entry, floor.ts:91-100); the reason is printed from `UNBOUNDED_BECAUSE` (floor.ts:129-136)."
  - "With no floor, the consumer's share of a row that does wake is not taken out of it (floor.ts:131-135 says so). Wakes are the subject here, so that is the intended reading, but B4's demand is not met in substance (see standing)."
  - "`note` is read by nothing (dataset.ts:25-27), an extreme that makes per-property tracking free; it says little about a column read by some views and not others."
  - "One `patchNote` call per row (scenarios.ts:752-756): an action-based store cannot fold them into one action, as on `batchPatch`. Redux Toolkit's listener calls are deferred to the frame end by autoBatch (adapters/redux-toolkit.ts:72-101); its 1000 reducer passes are not."
summary: "An isolation instrument bracketing patchNote and batchPatch; it prices coalescing against column routing, with each library's own batch scope and no false floor."
---

## What the script does

The same stride and count as `batchPatch` (`plan.batch`, 1000 rows at the default
point), writing `note` inside `ctx.binding.frame`, with one `settle()` after it
(scenarios.ts:747-758). Both views must produce zero distinct renders
(scenarios.ts:759-761). The oracle writes the notes and emits once; the model
renders `id rank label`, so its state is the one before (:762-773). The writes
are proved only by the population audit (worker.ts:462).

## Ways a broken store passes

- **A store that dropped every `note` write** passes `check` and the digest; it
  fails only the population audit, which compares every column of every row
  (`firstPopulationMismatch`, oracle.ts:507, run at worker.ts:462). That audit runs in
  both passes (`auditStore`, worker.ts:498, 660), so the hole is closed there and
  nowhere else.

## Representativeness

A sync that only touches undisplayed fields does happen (bookkeeping columns,
server timestamps), but the script is built as the fourth corner of a 2×2 —
{one write, batch} × {read column, unread column} — and its own comment says so
(scenarios.ts:704-719). As a workload on its own it would overweight the case
where per-property tracking is free. Read it only against `patchNote` and
`batchPatch`. The description says the per-write delivery applies to a library
with no batch API (scenarios.ts:727-729).

## The standing record, checked

`SILENT_SCRIPT` (scenarios.ts:171-187, listed at :172): `ORDINARY_SCRIPT` with A1
and B4 replaced.

- A1 NOT MET (:175-180), with the reason that a correct store renders nothing.
- B4 MET (:181-185), falsifier: a window floor scaling this table. The load check
  accepts it because the `nothing` shape's absence of a floor is declared
  (standard.ts:443-460). The item's demand is that the consumer's own cost be
  measured and kept out of the reading (standard.ts:156); here it is neither, by
  design. The MET records that no wrong floor is applied, not that the demand is
  met.