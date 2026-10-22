# Why it is written through the sync interface, and when it delivers

Companion to `packages/bench/src/adapters/tanstack-db.ts`.

## Why the sync interface and not the mutation API

THE CAVEAT FIRST: no write in any of the three rows goes through
`collection.insert` / `collection.update` / `collection.delete`, the API an
application calls. Every write is a message pushed through the sync handles
(`begin` / `write` / `commit`) that a collection-options creator receives, so
the optimistic path — transactions, optimistic state, rollback — is never
entered, and no number in these rows says what it costs.

`collection.insert` / `collection.update` are the OPTIMISTIC path: a transaction
is only dropped when `transaction.isPersisted.promise` resolves — a microtask
(`scheduleTransactionCleanup`). This benchmark never yields, so those
transactions would never be collected and `recomputeOptimisticState`, which
walks every live transaction on every write, would grow without bound.
`localOnlyCollectionOptions` wraps that same path — its `confirmOperationsSync`
calls `begin`/`write`/`commit` — so this is the real write path with the
optimistic round trip taken out.

## When a write reaches a subscriber

DELIVERY IS SYNCHRONOUS, read out of the installed source: `commit()` →
`commitPendingTransactions` → `emitEvents(events, true)` → the callback, all in
one call. The live query between them goes through `Scheduler.schedule`, whose
first line is `if (typeof contextId === 'undefined') { run(); return }`, and the
context id is `getActiveTransaction()?.id` — undefined outside a `tx.mutate`
block. So there is nothing for `settle` to await.

The VALUE check the re-send scenario measures lives in
`commitPendingTransactions`: it compares the visible value before and after with
`deepEquals` and pushes no event when they match.

`includeInitialState: false` on every subscription, so a mount is a mount and
not also a wake-up; and an EMPTY change list is not a change (`markReady`
broadcasts one).

A live query left alive is a pipeline fed by every later write, so unsubscribing
alone would price an unmount at a listener removal and leave the work standing.

## What maintains the window

`.orderBy(rank).orderBy(id).limit(32)` compiles to db-ivm's
`topKWithFractionalIndex` (`@tanstack/db`'s `src/query/compiler/order-by.ts`
calls `orderByWithFractionalIndex`, which `@tanstack/db-ivm`'s
`src/operators/orderBy.ts` hands that operator), an incrementally maintained
top-K over the ORDERED set, so a row leaving the window pulls in the row just
outside it.

`scrollTo` moves that same top-K with `live.utils.setWindow({ offset, limit })`
(`src/query/live/collection-config-builder.ts`, `setWindow`), which runs the graph
synchronously when no subset load is triggered and reports the moved window through
the view's own subscription. The binding throws if `setWindow` ever returns a
promise, because this harness would never see it settle.

On the unindexed row (`autoIndex: 'off'`, no `createIndex`) `setWindow` does return a
promise, since the moved window is loaded through a subset load. That row therefore
scrolls the way `switchGroup` moves: it unsubscribes and cleans up the paged live
query and builds a new one with `.offset(to)`, subscribed with
`includeInitialState: true`, as `useLiveQuery` does when a dependency changes. The
step times a query construction plus an ordering of the whole group, which the two
indexed rows do not pay. Not run: whether that initial snapshot is synchronous on the
unindexed row is the same open question as for `switchGroup`.

## What a frame is, and why the views are projected

`frame` opens ONE sync transaction (`begin` … `commit`) on each collection a write
reaches and every write of the frame joins it, so the library computes one change
set and runs each live query's graph once per frame. The sync interface does not
nest — `commit` takes the last pending transaction
(`db/src/collection/sync.ts:285-290`) — which is why a write inside a frame does
not open its own.

Outside a frame each write call is its own `begin`/`write`/`commit`, and its
subscribers have run before it returns; the adapter never holds a transaction
open across calls until `settle`. `tinybase.ts` follows the same reading with one
`store.transaction` per call.

The window queries `select` id, rank and label, the columns a window renders; a
note write then produces a projected row equal to the previous one and the
`deepEquals` above drops the event. The cell wiring is one projected live query
per column over the pinned ids, so a label write wakes the label view alone.

## Chain, diamond and view switch

A chain level is a live query over the level below it with `fn.select` calling
`chainLevelOf`; level 1 reads the roots out of the backing collection, so the head
holds `chainHeadOf(label, depth)` for each root and the subscriber reads the head's
row for root `from`. The diamond is two live queries over root `from`, each a
`fn.select` of `diamondLeftOf` / `diamondRightOf`, and a third live query that
inner-joins them on `id` and selects `diamondJoinOf`; the subscriber is on the join.
`fn.select` is used so the derivation is the harness's own function rather than a
`concat` restating it.

There is no scheduler context on the sync path (see above), so each live query's
graph runs the moment its source emits. The join therefore sees the left branch
change, runs, and then sees the right branch change and runs again: by this reading
the join subscriber can wake twice per write, once on a half-updated pair. Inside a
`tx.mutate` scope the transaction-scoped scheduler orders the three graph runs by
dependency and runs the join once; the adapter does not open one, for the reason the
sync interface is used at all.

A live query's `where` is fixed when it is built, and `setWindow` moves offset and
limit only. `switchGroup` therefore unsubscribes and cleans up the paged live query
and builds one over the new group — what `useLiveQuery` does when a dependency
changes — and subscribes with `includeInitialState: true`, whose synchronous
snapshot (`requestSnapshot`) is the mark the settle delivers.

## The three indexing rows

`tanstack-db` leaves `autoIndex` off and builds no index. `tanstack-db-eager` sets
`autoIndex: 'eager'` with `defaultIndexType: BTreeIndex`: eager builds every auto
index with that one type (`db/src/indexes/auto-index.ts:57-70`), and BasicIndex's
own doc says "Use BTreeIndex for write-heavy workloads with large collections"
(`db/src/indexes/basic-index.ts:28-36`) — these scripts rewrite `rank` across ten
thousand rows. `tanstack-db-indexed` leaves it off and calls
`collection.createIndex` on what each wiring's live queries filter on and on the
first sort key: `group` (`BasicIndex`, fifty distinct values, so its sorted array
of distinct values rarely moves) and `rank` (`BTreeIndex`, one value per row) under
the window and read wirings; `id` (`BTreeIndex`) for the pinned-cell queries,
built in `pin`, so only the scripts that pin pay for it; `id` under churn; owner
`id` and pair `key` under the relation wiring; nothing under single, whose
subscriptions read no initial state.
