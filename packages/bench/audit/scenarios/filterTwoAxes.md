---
scenario: "filterTwoAxes"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "ef7be3947053b9da"
verdict: "narrow"
models: "Two list views over the same group, one filtered by group alone and one by group AND a second attribute (status AND assignee); rows move between groups and only some of the moves are visible to the narrower view."
measures: "How often the two-predicate view is woken by a group move of a row its second predicate already excludes, and the cost of four group moves through both views."
favours:
  - "Stores that can keep a second index keyed on both predicates, e.g. oimdb's second index service (a second `createGroupOrders`) whose `keyOf` folds the axis into the key (adapters/oimdb.ts:796-799, `keyOf` at :798) or LokiJS's `applyWhere` dynamic view (adapters/lokijs.ts:499, 526); such a view is never woken by an off-axis row, by construction."
  - "Because the second axis is derived from the id (`onSecondAxis`, dataset.ts:393-394), any store may file a row on it once at insert and never maintain it; designs with expensive index maintenance pay nothing for the second index here."
biases:
  - "The second axis is immutable (dataset.ts:381-392; A1 NOT MET at scenarios.ts:4598-4607): no step changes it, so re-filing a row because the second predicate's field changed is never measured. Toward index-per-predicate designs, whose maintenance cost on that field is exactly what is skipped."
  - "The filter parameters never change: no step switches the view to a different value of either predicate (the user changing a filter chip), which is the most frequent two-axis event in a UI and where a pre-built composite index has to be rebuilt or a second one held. Toward pre-indexed designs. `viewSwitch` (`reads.bySwitch`) switches the group of view A only, never the two-axis view."
  - "Four steps (`steps: 4`, scenarios.ts:4665) and two moved rows; the time is dominated by four settles and up to eight window deliveries. The row's own description says the redundancy count, not the time, is the result (scenarios.ts:4584)."
  - "Both movers are the first on-axis and first off-axis rows of view A's window (dataset.ts:862-863), so every move is visible to view A; a move of a row outside both windows (the common case in a 10,000-row store) is not asked here."
summary: "Counts how often a two-predicate view is woken by moves its second predicate excludes, over four moves; the second predicate is immutable and its parameters fixed, so the hard half of multi-axis filtering is absent."
---

## The script

scenarios.ts:4561-4712: two group moves out to group B and two back (:4677-4688), each
followed by `settle`; `restore` puts both movers back in group A (:4672-4676). View A selects
on group, view B on group and `onSecondAxis(id)`; both over group A (`emitReadViews`,
oracle.ts:360-363). `check` (:4695-4699) demands 4 distinct states on A, exactly 2 on B, a full
window on A; redundant wakes of B are allowed and reported. View B's row count comes from the
plan (`axisWindowSize`, dataset.ts:1102) because the axis halves the group.

## What decides the row

Whether view B's derivation is reached at all by a write to a row its second predicate rejects.
A rescanning store with one dirty flag wakes both views on every step (adapters/baseline-array.ts:286-301,
`render` delivers both pages each settle), giving two redundant deliveries to B; a store with a
composite index files the off-axis mover under a key nobody holds (adapters/oimdb.ts:771, 796-799).

## Representativeness

Two-predicate filtered lists are everywhere in applications (status + owner, folder + unread).
The script is a narrow slice: it moves the FIRST axis and keeps the second immutable and the
predicate values constant. Neither js-reactivity-benchmark nor js-framework-benchmark measures
filtered collections at all; the suite is stronger in having the row and in counting redundant
wakes (consumer.ts:128-133), weaker in that the row cannot tell a store that maintains a
mutable composite index cheaply from one that cannot.

## Standing (own record, scenarios.ts:4597-4664)

- A1 NOT MET (:4598-4607) is accurate. Its count ("all seventeen adapters and the three
  controls") disagrees with the comment above the script ("all eighteen adapters, including
  the sixteen with no row here", :4573-4574); `ADAPTERS` lists eighteen (registry.ts:32-51), and
  no adapter declines `reads.byTwoAxes` (the only decline path is `readShapes`' `declined` map,
  types.ts:170-181, and no adapter passes `byTwoAxes` to it), so "sixteen with no row here" is
  stale.
- A3 MET (:4613-4617) holds: the population audit shows both movers returned.
- B3 MET (:4632-4637) lists the libraries' own predicate mechanisms; checked for oimdb and
  LokiJS only.