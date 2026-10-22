# What a TinyBase listener is told, and what a held query costs

Companion to `packages/bench/src/adapters/tinybase.ts`.

## What each listener is told

`addResultSortedRowIdsListener` re-derives the window and compares it
(`arrayIsEqual`) before calling, so a write that left the window's ids alone
does not reach it. A `label` patch leaves the sorted ids untouched, so without a
per-row `addResultRowListener` the consumer would never hear about the one
column it renders that nothing indexes.

`setValidCell` records a change only when the incoming cell differs, so
re-sending the population wakes neither view while a fresh id creates the row.

A LISTENER IS NOT CALLED ON REGISTRATION, so a mount is a mount and nothing in
this file has to tell a first run from a wake-up.

`addRowListener` takes ONE row id or `null` for the whole table, so "these eight
rows" is not a registration the library has, and `null` would subscribe to ten
thousand rows to watch eight.

A query TinyBase still holds is a result table it maintains on every write. THE
QUERY ID IS THE GROUP'S: `setQueryDefinition` keys by id, so fifty queries
called 'a' would be one.

## Transactions and frames

Outside a frame each write call is its own TinyBase transaction: a multi-row
`write`, `remove` or `writeOwners` wraps its loop in `store.transaction`, and a
one-cell patch is a bare `setCell`, which TinyBase wraps in one itself
(`fluentTransaction`, `index.js:2547-2550`). The listeners run when that
transaction finishes, before the call returns, so `settle` only renders what
they marked. That is the contract's reading of an unframed write, and the same
one `tanstack-db.ts` follows with one sync `begin`/`commit` per call: the adapter
never merges writes the script did not put in one frame.

`frame` is `store.transaction(run)`. Transactions nest by a counter
(`index.js:3028-3050`), so a write's own transaction inside a frame is a second
level and the listeners run once, when the frame's outer level finishes.

## The window's content listeners

When the window's sorted ids move, `rewatchRows` gives back the result-row
listener of each row that left the window and adds one for each row that
entered; a row that stays keeps the listener it has. A scroll by one row is then
one `delListener` and one `addResultRowListener`, not 32 of each.

## Why the views are queries and not an Indexes index

The Indexes module keeps a sorted slice per group (`setIndexDefinition` with a
sort key, `index.js:1154-1268`), but it has no window: `getSliceRowIds` copies
the whole slice (`:1333-1334`) and `addSliceRowIdsListener` (`:1341-1342`)
fires on any change to the slice's membership or order, anywhere in the group.
A window over it would therefore wake on a reorder outside the 32 rows, or the
adapter would have to compare the old and new window itself — a value check
TinyBase does not ship, which `TBinding` forbids. A query's
`addResultSortedRowIdsListener` takes offset and limit and compares the window
before calling (above), so the query is the primitive that owns the window. The
per-group binding keeps the same body as the two-view one, as `TAdapter`
requires.

## The order inside the window

A sorted result sorts on ONE cell, and every row of the report is checked
against an order on two: `rank`, then the id. Each view query therefore selects
a calculated cell (`select((getTableCell, rowId) => …).as('order')`, TinyBase's
calculated select), a fixed-width string of the rank offset by 1e15 followed by
the row id, and sorts and windows on it. Ranks in this dataset are integers well
inside ±1e15, so the string order is the numeric-then-id order to the byte, and
which row of a rank tie lands inside the limit is decided by the library rather
than by an id sort over its answer.

## The row id as a cell

The window and relation wirings store four cells per row; the id is the row's
key. The read and churn wirings store it as a fifth cell, because a `where`
callback is handed the row's cells and not its id, and both filter on it: the
read wiring's second axis is a predicate on the id, and a chain's root query
selects its subscriber's rows by id.

## The chain is queries from queries

Each chain subscriber defines a root query over `TABLE` that selects `group`,
`rank` and `note` of its own rows and a calculated `label` holding
`chainLevelOf(label, 1)`, then `depth - 1` queries each rooted on the result of
the one below (`setQueryDefinition(id, true, rootQueryId, …)`, since 8.3.0),
level k selecting `chainLevelOf(label of level k−1, k)` as its own `label`, and
listens with `addResultCellListener` on the head's `label` of its first row —
so the text the subscriber reads is `chainHeadOf(label, depth)`.
The result stores of chained queries start and finish their transactions with
the store they read, so the head's listener runs inside the write's (or the
frame's) own `finishTransaction`, before `settle`. Defining the root query evaluates its `where` over every
row of the table (`index.js:5039-5041`): that is the mount cost of a TinyBase
derivation, and unmount deletes the definitions head first.

## The diamond is three queries

A diamond subscriber defines two root queries over `TABLE`, each filtered by
`where('id', rowId)` to the one root row and each selecting a calculated cell
(`diamondLeftOf(label)` as `left`, `diamondRightOf(label)` as `right`), and a
third query rooted on the left result that joins the right result by the same
row id (`join(true, rightId, (_, rowId) => rowId)`, since 8.3.0) and selects
`diamondJoinOf(left, right)` as `join`. The listener is `addResultCellListener`
on that cell.

Once per frame, by the reading of `index.js` and not by a run: a query's result
store is synchronised with its ROOT store's transaction only (`index.js:5056`),
and the joined result reaches it through a row listener. Both root results are
written while the main store's transaction is still open, and both are finished
from its did-finish listeners, so whichever of them finishes first recomputes
the join with BOTH new values already in place; the second recompute writes the
same string, and TinyBase calls no listener for a cell that did not change.

## The view switch is a param

The paged query filters on `where('group', param('group'))` and `switchGroup`
calls `setParamValue('paged', 'group', group)`, which re-runs the definition
(`index.js:5146-5150`, then the param row listener at `index.js:5113-5121`).
The window then goes back to offset 0 through the same listener swap a scroll
does. The definition re-runs over the whole table, which is TinyBase's cost of
changing what a live query selects.