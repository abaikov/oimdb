---
participant: "tinybase"
version: "10.0.1"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "315bc094881f0e3a"
verdict: "idiomatic"
summary: "TinyBase's documented query path (one query per view, a sorted-row-ids listener with offset and limit on a calculated rank-then-id sort cell, per-row result listeners, one transaction per write call outside a frame and one per script frame), with each churn chain and each diamond built as queries from queries and the view switch as a query param; the read and churn wirings store the row id as a cell because a where callback is handed no row id."
wirings:
  bind:
    verdict: "idiomatic"
    note: "One query per view selecting rank, label and a calculated order cell where group (tinybase.ts:206-213), window ids from addResultSortedRowIdsListener(order, offset 0, limit window) (watchShape, 133-146), content through one addResultRowListener per window row; when the shape moves only the rows that left lose their listener and only the rows that entered get one (rewatchRows 153-170, renderWindow 174-190, settle 274-292). Outside a frame each write call is its own transaction (store.transaction around a multi-row loop, a bare setCell otherwise), and frame is store.transaction, inside which those nest (transactedStoreOf 61-79, transactionFrameOf 52-56). The order cell is a fixed-width rank joined to the row id (45-50), so TinyBase's one-cell sort produces the rank-then-id order itself; there is no hand sort and no tie left to the library at the window edge. Rows are written as four cells, the id being the key (237-243)."
  bindPerGroup:
    verdict: "idiomatic"
    note: "The same body with fifty queries (tinybase.ts:794), each maintained by TinyBase on every write to the table. The Indexes module (setIndexDefinition(id, table, 'group', sortKey, , rowIdSorter), @types/indexes/index.d.ts:424-431; index.js:1154-1268) keeps a sorted slice per group but has no window: getSliceRowIds copies the whole slice (index.js:1333-1334) and addSliceRowIdsListener fires on any membership or order change in the group (1279, 1341-1342), so a 32-row window over it would wake on reorders outside the window or need an adapter-side window compare, which TBinding forbids. Kept as queries; the reason is in tinybase.md."
  churn.row:
    verdict: "idiomatic"
    note: "store.addRowListener per subscriber on one row id, delListener to unmount (366-378, 333-337); the body reads row `from`'s label with getCell (labelAt 330-331), the row the churn read fold expects of each slot (churnList mounts slot `at` on row `at`, scenarios.ts:2279). The store carries no queries in this wiring, so nothing else is maintained on write. frame is store.transaction (transactedStoreOf, 78)."
  churn.wide:
    verdict: "idiomatic"
    note: "One addRowListener per row of the 64 (366-378), since addRowListener takes one row id or null; the body reads the first row only, as departure states (752-762). churnWide writes row 0 alone per frame (scenarios.ts:2014, rowsWrittenIn churnRowOnly), so each subscriber wakes once."
  churn.column:
    verdict: "idiomatic"
    note: "store.addCellListener(TABLE, id, 'label') (379-386): TinyBase's own column identity."
  churn.chain:
    verdict: "idiomatic"
    note: "Queries from queries (390-418): a root query over TABLE where the stored id cell is one of the subscriber's rows, selecting group, rank, note and a calculated label holding chainLevelOf(label, 1), then depth - 1 queries each defined with setQueryDefinition(id, true, belowQueryId, …) (@types/queries/index.d.ts:2280-2310, since 8.3.0) selecting chainLevelOf(label below, k) as label, and addResultCellListener on the head's label of the first row (409-413), so the text read is chainHeadOf(label, depth). Unmount runs the mount's own release, which deletes the listener and the definitions head first (414-417, unmount 333-337). Defining the root query evaluates its where over every table row (index.js:5365-5368), which is the mount cost the library charges for a derivation. chainFrameWrite builds the same stacks in prepare and times the frame alone."
  churn.diamond:
    verdict: "idiomatic"
    note: "Queries from queries (419-447): a left and a right query over TABLE, each where('id', rowId) and each selecting one calculated cell (diamondLeftOf(label) as left, diamondRightOf(label) as right), and a join query rooted on the left result that joins the right result by the same row id (join(true, rightId, on-callback), @types/queries/index.d.ts:1440-1444, since 8.3.0) and selects diamondJoinOf(left, right) as join; addResultCellListener on that cell. Once per frame by reading index.js (see the prose), not by a run. Each mount pays two whole-table where evaluations."
  reads.byKey:
    verdict: "idiomatic"
    note: "Two getCell calls per key, rank and label, a missing row answering undefined (518-534); nothing resolved in advance."
  reads.byWindow:
    verdict: "idiomatic"
    note: "The window is a property of the listener (@types/queries/index.d.ts:4028-4035), so scrollTo deletes it, registers one at the new offset and reads the page with getResultSortedRowIds on the order cell (pageAt, 498-504; scrollTo 535); the settle then moves the row listeners of the rows that left onto the rows that entered (rewatchRows 153-170). This is the API's only way to move an offset. frame is store.transaction (transactedStoreOf, 78)."
  reads.byTwoAxes:
    verdict: "idiomatic"
    note: "The axis is a where(callback) inside the query over the stored id cell (479-486, callback at 485), so TinyBase evaluates both predicates. This, and the churn chain's root query, are why those two wirings keep the id cell."
  reads.bySwitch:
    verdict: "idiomatic"
    note: "The paged query filters on where('group', param('group')) with the param seeded to group A (468-478); switchGroup calls queries.setParamValue('paged', 'group', group), which writes the param store (index.js:5496-5501) whose row listener re-runs the definition (5459-5467): the result table is deleted (4973) and the where re-evaluated over the whole table (5365-5368) inside one result-store transaction (4809). switchGroup then moves the window to offset 0 through the same pageAt a scroll uses (537-540). The settle delivers view A; view B's query is untouched, so viewSwitch's view-B check is met with no redundant delivery. The param, not a re-definition, is TinyBase's documented way to change what a live query selects (@types/queries/index.d.ts:820-849 Param, since 7.2.0; setParamValue at 2520). Not run."
  relations:
    verdict: "idiomatic"
    note: "Three tables in one store, owners and pair records as rows, addCellListener on each touched owner's name and each pair's mark (holdRelation 615-642), patchOwnerName and writePair as single setCell calls, each its own transaction, with the pair id composed per call (645-653). Rows are written as four cells (598-605). frame is store.transaction (transactedStoreOf, 78)."
  single:
    verdict: "idiomatic"
    note: "TinyBase Values: setValue, getValue and addValueListener per value (689-746); frame is store.transaction (726)."
improvements:
  - "NOT APPLIED. tinybase.ts:794: an Indexes-module wiring (one index by group with a sort key) for consumerPerGroup. bind and bindPerGroup must share one body (harness/types.ts:340-341), and the module has no windowed slice or windowed listener (index.js:1333-1342), so the window's change check would become the adapter's; see tinybase.md, 'Why the views are queries'."
---

## Version

`packages/bench/node_modules/tinybase/package.json:3` is `10.0.1`, equal to the adapter's `version`
(`packages/bench/src/adapters/tinybase.ts:750`). The bench package's copy is the one resolved,
through its `exports` "." entry, `./index.js`. Every `index.js` and `@types` line below is from
10.0.1; the previous card's citations were for 9.3.0 and all moved.

## What the documentation says and what the adapter does

The adapter cites the queries guide (`docs`, 751). It follows it: TinyQL `select`/`where` per view
(206-213), `addResultSortedRowIdsListener` for the window (133-146) and `getResultCell` reads in
`renderWindow` (174-186). TinyBase compares the new window with the old (`arrayIsEqual`,
`index.js:2577`) and calls a sorted-row-ids listener only when row ids changed or a cell it sorts on
changed (`index.js:2420-2454`, listeners keyed by `[tableId, cellId]` at 2591), so a label patch
reaches the view only through the per-row result listener (rewatchRows 153-170). Outside a frame
each write call is its own transaction and its listeners run before the call returns: a multi-row
`write`/`remove` wraps its loop in `store.transaction`, a single `setCell` is wrapped by TinyBase
(`fluentTransaction`, `index.js:2547-2550`). This is the same reading of an unframed write as
`tanstack-db.ts`'s per-call `begin`/`commit`; no transaction is held open across calls until
`settle`. `frame` is `store.transaction(run)` (`index.js:3028-3043`): transactions nest by a counter
(`startTransaction`, 3044-3047), so a write's transaction inside a frame leaves the listeners to the
frame's finish. In 10.0.1
`transaction` runs nothing while the store is in its listener phase (`transactions == -1`, 3029, set
at 3164 and 3193); no adapter listener writes, so this does not reach any binding. `pin` deletes the
query definitions so the cell rows are not charged for two maintained result tables, and the cell
views are `addCellListener` per pinned cell (246-270).

## The order inside the window

A calculated select cell (`select((getTableCell, rowId) => …).as('order')`,
`@types/queries/index.d.ts:997-1012`) holds `rank + 1e15`, zero-padded to 16 digits, a space and the
row id (tinybase.ts:45-50). `defaultSorter` compares with `<` (`index.js:1117-1118`), so on strings
of equal-width numeric prefix the order is rank, then id by code unit, which is `compareRows`
(`dataset.ts:423-424`). The dataset's ranks are integers from small negatives
(`dataset.ts:912, 932, 961`) up to `1000 + 200 × 99 999` (`rankFor`, 432), plus mover and arrival
ranks derived from those (448, 990), well inside the encoding's range; the ranks individual scripts
pass to `setRank` were not traced one by one. TinyBase decides both which rows are in the window
and their order, and a rank tie at the 32nd place is broken on id by the library.

## The row id as a cell

The window and relation wirings write `{ group, rank, label, note }` (tinybase.ts:241, 602); the id
is the row's key, which `readAll` and `groupOrder` read back as the key of `getTable` and
`getResultTable` (`rowsOf` 82-83, `groupOrderOf` 88-98). The read and churn wirings still pass the
whole `TRow` (510, 343), id included, because `where(callback)` is handed `getTableCell` and no row
id (`@types/queries/index.d.ts:1765`; `index.js:5247` calls each where with `getJoinCell` alone): the
second axis (485) and the chain's root rows (399) are both predicates on the id, and the diamond's
two root queries filter `where('id', rowId)` on it.

## The chain

Each subscriber's chain is `depth` query definitions: a root over `TABLE`, and each further level
rooted on the result of the one below, each level's `label` a calculated cell applying
`chainLevelOf` with its own level number, so the head's `label` is `chainHeadOf(label, depth)`.
Each query has its own result store (`getResultStore`, `index.js:4610-4611`), and that store's
transactions are synchronized with the store the query reads (`synchronizeTransactions`,
`index.js:4740-4753`, called at 5383-5387), so the head's `addResultCellListener` runs inside the
write's (or the frame's) own `finishTransaction` and is counted before `settle` delivers. A label write to the
first root changes that row's label at every level once, so each standing subscriber wakes once per
frame. The head is listened to on the first root's `label`, the value the subscriber renders, so a
write that does not change it does not wake it.

## The diamond, and why the join fires once

Three query definitions per subscriber (tinybase.ts:419-447): left and right over `TABLE`, the join
rooted on the left result and joined to the right one. A query's result store is synchronized with
its ROOT store only (`index.js:5383-5387`); the joined right result reaches the join through a row
listener the join adds on it (`index.js:5319-5330`). So the join is not covered by one transaction
the way a chain level is, and whether it fires once rests on this ordering, read from `index.js`
(`finishTransaction`, 3120-3211):

1. The label write lands in the main store's transaction (its own, or the frame's); the main store's will-finish
   listeners (3163) start the left and right result stores' transactions (`index.js:4744`).
2. The main store's non-mutator row listeners (3166-3173) write the new `left` and `right` cells.
   TinyBase applies a cell at once and defers only listeners, so both result stores hold the new
   values from here.
3. The main store's did-finish listeners (3191-3195) finish left and right in turn
   (`index.js:4749-4751`). Whichever finishes first makes the join recompute, and the recompute
   reads BOTH sources through `getCell` (`getJoinCell`, `index.js:5178-5195`), already new, so the
   join cell takes its final value.
4. The second source's finish recomputes the join again to the same string; TinyBase calls no
   cell listener for a cell that did not change, so the listener has run once.

Not executed. If step 2 were wrong (a source's values deferred with its listeners) the join
listener would run twice per frame with an intermediate `new|old` text, and `churnDiamond`
(scenarios.ts:2507-2593) would fail its delivery count for this row rather than report a time.

## The view switch

`setParamValue` writes the param into the queries object's own param store (`index.js:5496-5501`);
a row listener on that store, registered as a mutator listener, re-runs the definition
(`index.js:5459-5467`), which deletes the result table (4973) and re-evaluates the `where` over
every row of `TABLE` (5365-5368), inside one result-store transaction (4809). `switchGroup` then
moves the window to offset 0 through `pageAt`, the listener swap `scrollTo` uses, so the settle
moves the row listeners of the rows that changed and delivers once. The re-evaluation is the cost TinyBase charges for
changing what a live query selects; there is no incremental re-filter.

## Is anything done for the library

No values are held outside the store; every render reads through `getResultCell` or `getCell`. The
`ids` array held per view is what the listener hands back. `groupOrder` defines and deletes a query
of its own, untimed (`groupOrderOf`, 88-98).

## Code volume

The figures are `npm run lines`' cell for each wiring: its builder, every helper it reaches and
every constant it reads, comments and blank lines excluded. Every row wiring pays for the store and
the four cell writes (`transactedStoreOf`, tinybase.ts:61-79).

- **bind** adds what the window needs and TinyBase does not hand over in one call: the calculated
  order cell (45-50, 211), because a sorted result sorts on one cell; a sorted-row-ids listener per
  view (133-146) for the window's membership; and per-row result listeners moved when the window
  moves (148-190), because the sorted-ids listener does not fire on a label change. The cell wiring
  is two cell listeners per pinned row (246-270).
- **reads.byKey** carries both read views, because one binding serves every read shape: the two
  query definitions (468-486), the two window views (488-491) and `pageAt` (498-504), over the same
  window helpers the bind wiring uses.

## Not verified

- Every claim above about time. Nothing was run; the chain and diamond mounts pay a where
  evaluation over the whole table per root query per subscriber per mount, and a view switch
  pays one over the whole table per switch.
- Whether a wildcard `addResultRowListener(queryId, null, …)` would be faster on any row.
- The cascade order of chained result-store transactions, and the once-per-frame join above, were
  read from `index.js` 10.0.1, not executed.
- The per-call transactions and `rewatchRows` (153-170) have not been run.
