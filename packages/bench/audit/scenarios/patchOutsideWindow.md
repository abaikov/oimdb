---
scenario: "patchOutsideWindow"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "a4980f652b6c7ef6"
verdict: "representative"
models: "An update to a row that belongs to the list on screen but is scrolled out of view (virtualised list, paginated table), one row per frame."
measures: "Wake-up selectivity at sub-group granularity: whether a write to a watched-but-invisible row wakes the view, and what that wake costs."
favours:
  - "Stores whose views subscribe to the VISIBLE rows (per-visible-slot subscriptions; the script's own comment says the design that benefited from every write landing inside the window is 'ours', scenarios.ts:485-491) — they hear nothing."
  - "Fine-grained computeds that track only the properties of the rows they returned (MobX-style), for the same reason."
  - "Against: stores whose view is a derivation over the whole group or the whole population; each write wakes it, it re-derives an unchanged window and delivers redundantly."
biases:
  - "`label` is not a filter or sort column and the rows are the second window of group A (`outsideA`, dataset.ts:1030; documented at :478-484), so a write can never pull a row into view. The case where an off-screen row's SORT KEY moves it on screen — what makes visible-row-only subscription hard — is not asked here."
  - "Redundant deliveries are timed with their full 32-line render (render.ts:31-44), so a waking store pays the consumer for nothing. That matches an application that re-renders on a wake, and makes the row's gaps partly consumer cost."
  - "ADDRESSED: the window floor. The script sets `rendersNothing` (scenarios.ts:501), so `stepDeliveryOf` returns `nothing` (floor.ts:79), `floorKeyFor` returns no floor (floor.ts:91-100, 144-147), and the table prints `no floor` (floor.ts:191) with the reason from `UNBOUNDED_BECAUSE` (floor.ts:129-136)."
  - "With no floor, a row that wakes keeps its consumer share; the wake count is the subject, so that is the intended reading."
summary: "A real and frequent case — edits to off-screen rows of a virtualised list — that prices subscription scope; it carries no floor multiple, which fits a script whose correct answer delivers nothing."
---

## What the script does

32 steps; each patches `label` on one row of `plan.outsideA`, view A's own group
ranked immediately below its window, and settles (scenarios.ts:515-524). Neither
view may produce a distinct render (scenarios.ts:525-527). Restore writes the
original labels back untimed (scenarios.ts:506-513). A dropped write is caught by
the population audit (worker.ts:462; oracle.ts:526-528 compares `label`).

## Representativeness

Virtualised lists and paged tables hold far more rows than they show; writes to the
hidden part are at least as frequent as writes to the visible part. This is the
right question to ask and few public benchmarks ask it: js-framework-benchmark
renders every row, and signal benchmarks have no notion of a window.

## The standing record, checked

`SILENT_SCRIPT` (scenarios.ts:171-187, signed for this key at :172).

- A1 NOT MET (:175-180), with the reason that a correct store renders nothing.
- B4 MET (:181-186): the falsifier is a window floor scaling this table, which does
  not happen. The load check accepts it through the declared `nothing` shape
  (standard.ts:451-460). The item's demand — the consumer's cost measured and kept
  out (standard.ts:156) — is not met in substance, and `UNBOUNDED_BECAUSE` says so
  (floor.ts:133-135); the MET records that no wrong floor is applied.
- The rest is `ORDINARY_SCRIPT` (spread at :174) and holds for this script.

## What it does not cover

An off-screen row whose own RANK write should bring it on screen: no script writes
the rank of a row outside the window. Off-screen rows do enter view A when visible
rows are deleted (`outsideA` is what the deletion scenario refills from,
dataset.ts:60-61), and a row from another group enters view B's window on
`moveGroup` and `moveAndReorder` (dataset.ts:629-638); neither is a sort-key move
from outside the window.
