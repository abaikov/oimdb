# What a DynamicView defers, and why no index is built

Companion to `packages/bench/src/adapters/lokijs.ts`. The row's admission and departure statements are governed
by `packages/bench/PARTICIPANTS.md`.
https://techfort.github.io/LokiJS/DynamicView.html
https://techfort.github.io/LokiJS/tutorial-Indexing%20and%20Query%20performance.html

## What is deferred until someone reads

A DynamicView does not maintain its result: a write marks it `sortDirty` and NOTHING happens until someone calls
`data()`. Measured without a consumer LokiJS would look almost free, because almost nothing would have been
done. So every `settle` calls `performSortPhase()` on each view: on a view a write dirtied it re-sorts the whole
filtered set and emits `rebuild` synchronously, and the view is delivered; on a view no write touched it returns
at once and nothing is delivered. 32 patches settled one by one cost 32 re-sorts of the view they landed in and
cannot be deferred into one. The removal is the one thing a DynamicView cannot do lazily, and its re-sort still
waits for the read.

Loki's own way to say "this view changed" is that same `rebuild` event, but on a passive view a write only
queues it on a `setTimeout` (`queueRebuildEvent`). This harness never yields, so the timer never fires inside a
measurement; and if it ever fired between two settles, the flag it raised is cleared before the next
`performSortPhase`, so nothing here depends on it.

The paged view of the read wiring is `persistent: true`: a scroll reads it while it is clean, and a clean
persistent view hands back the `resultdata` it maintains instead of copying the group (`DynamicView.data`,
`lokijs.js:4653-4661`). The window views and the read wiring's `onAxis` view are not persistent, because they
are read only when dirty — no script scrolls view B — and on a dirty read a persistent view copies just the same
(`performSortPhase` sets `resultdata = this.resultset.data()`, `lokijs.js:4730-4734`) and pays for keeping
`resultdata` in step on every write besides (`evaluateDocument`, `:4747` on).

The sort stays `applySortCriteria`. `applySort(comparefun)` would replace `compoundeval`'s loose
`sortHelper` comparisons with a numeric comparator, but neither the DynamicView reference nor the indexing
tutorial names it a faster path: both compile to one `filteredrows.sort` with a wrapper per comparison
(`Resultset.sort`, `lokijs.js:3160-3176`; `compoundsort`, `:3321-3356`), so the switch would be an unmeasured
guess and a departure from the documented sort.

Every collection is created with `disableMeta: true`, the documented option that drops the `meta` stamp (a
`Date` and two field writes per update); it requires the changes API off and no TTL, which is this
configuration.

## What a view switch does

The paged view's group filter carries a uid. `switchGroup` calls `applyFind({ group }, uid)` with the new group,
which `applyFilter` turns into a replacement of that pipeline entry and a `reapplyFilters`: the Resultset is reset,
the find re-runs over the whole collection (a fresh Resultset, so no index would be consulted even if one existed),
`resultdata` is emptied and the sort is queued. The next `performSortPhase` re-sorts and emits `rebuild`, so the
settle delivers the switched view at offset 0 exactly as it delivers a write. This is LokiJS's documented way to
change a DynamicView's filter; the view, its sort and its listener stay.

## The column, the chain and the diamond are declined

LokiJS has no per-field subscription: `update` is document-level, and with
cloning off the replaced document the emitter passes as its second argument is
the very object that was mutated, so old and new always agree. Cloning the
collection would make them differ, but the subscriber would then compare labels
itself, which B3 of `churnColumn` forbids.

LokiJS has no derived-value primitive: a DynamicView is a filtered, sorted list
over one collection and cannot take another view as its source. A chain or a
diamond could only be hand-written levels run inside the collection listener,
which B3 of `churnChain` and `churnDiamond` forbids. The reasons are in
`churn.column.absent`, `churn.chain.absent` and `churn.diamond.absent`.

## No binary index, on purpose, and whose sort it is

One on `group` would only be consulted when a Resultset runs a fresh `find` (`Resultset.find` sets
`doIndexCheck = !this.filterInitialized`). The views are created against an EMPTY collection and everything
after that arrives through `DynamicView.evaluateDocument`, which runs the pipeline over a one-element Resultset
with `filterInitialized` already true — so the index would never be read and would still be maintained on every
write. The one exception is the view switch: `reapplyFilters` resets the Resultset and runs a fresh `find`, which
would consult a `group` index. Building one for that would put its maintenance on every write of every read
script, so it is listed on the card as a trade-off and not taken. Indexing `rank` is no better: `compoundsort` consults no index. The sort itself is Loki's own, tiebreak
included: `applySortCriteria` compiles to `Resultset.compoundsort`, and `[['rank', false], ['id', false]]` is
exactly `compareRows`.
`insert` throws on a duplicate unique key, so an upsert here IS a lookup per row, and it stamps `$loki` and
`meta` onto whatever it is handed; the bulk `update(array)` suspends adaptive index maintenance and rebuilds
once at the end. `addDynamicView` pushes and does not key by name, while `removeDynamicView` removes every view
with the name it is given, so fifty views called 'a' would all go at the first removal; the views here are named
after their groups, which are distinct. `eqJoin` IS NOT USED: it
builds a whole joined Resultset out of two collections on every call, which for eight rendered lines would be
two full scans. And LokiJS does NOT compare values: re-sending the population it already holds is a full
lookup-and-update per row and both views are rebuilt. Nothing distinct reaches a consumer, but the work is all
done, and that is the finding.

## What the counters report for a collection-wide signal

`woke` COUNTS THE SUBSCRIBERS WHOSE SOURCE MOVED, not the bodies that ran — every body still runs and every one
of those runs is inside the timed frame, so the TIME carries LokiJS's collection-wide notification and the
COUNTER stays the quantity every other row of these tables reports. On one value the same choice bites harder:
the bystander's body runs on every write and returns, so no redundant delivery is recorded for it. This is the
one participant whose coarseness a table reports as duration rather than as a count, and a reader comparing its
redundancy column against another row's is comparing two different things.
