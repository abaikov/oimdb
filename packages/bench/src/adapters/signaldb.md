# What its queries re-run, and what every write rebuilds

Companion to `packages/bench/src/adapters/signaldb.ts`.

## What a write rebuilds, and what a standing cursor costs

`rebuildIndices` runs after EVERY write outside a batch and rebuilds every index
over the whole collection, so an index is paid per write and not per query. The
load is wrapped in `collection.batch`, which defers the index rebuild to the
end; without it the load would rebuild every index ten thousand times, which
measures the absence of a batch API rather than the library.

A cursor left alive is re-queried by every later write, so unsubscribing alone
would price an unmount at a callback removal and leave the work standing.

## What a cursor derives, and how often

`Cursor.getItems` applies sort → skip → limit, so `limit: 32` is the first 32
rows OF THE SORTED SET, and `{ rank: 1, id: 1 }` is the harness's total order
exactly (fast-sort's default comparer is `<`/`>`, the tiebreak `compareRows`
uses).

Every write makes each cursor re-derive its window inside `Observer.runChecks`,
which DIFFS it against the last one seen. That diff is also the value check the
re-send scenario is about — `updateOne` emits `changed` whether or not anything
changed, and `runChecks` calls nothing when the new window `isEqual` the old.

The API will not hand back the list it just derived: `runChecks` keeps its
window private, so `fetch` in `settle` derives it a second time. That second
pass is billed here rather than hidden.

A churn subscriber reads nothing the observer has not already handed it.
`observeRawChanges` runs `getItems` once at registration (`index10.mjs:139-142`)
and, with `skipInitial` false, calls `added` for each row of that first result
(`index9.mjs:56-104`), so the mount label comes out of that run and not out of a
second `fetch`. A wake reads the row `changed` carries; the wide shape keeps the
label of its first row, ignoring changes to the others. Registering `added` adds
one walk of the cursor's own result per re-check, next to the O(n)
`memoryArray()` copy every re-check already takes.

A column subscription is built out of the library's own diff: the observer diffs
what `getItems` returns and `getItems` applies the projection (`getItems` in
`@signaldb/core/dist/index10.cjs.js`), so a `note` write produces an EQUAL
projected document and `changed` is not called.

## The chain and the diamond

SignalDB exports no computed and a cursor's result is not an input to another
cursor, so a derivation needs a signals library. The bridge is the one the
documentation gives with no reactivity adapter installed: `observeChanges` on a
cursor over the root rows (`{ id }` for the diamond, `{ id: { $in } }` for the
chain) writes each row's `label` into a `@preact/signals-core` signal, and
`computed` stacks the derivation over those signals. One `effect` per subscriber
reads the head. A write reaches the signal inside the cursor's `runChecks`, and
the signals library schedules the arms and the join, so the join runs once per
write. Installing SignalDB's own reactivity adapter is not used here: a
`Cursor.fetch` inside a `computed` creates a dependency and registers a fresh
observer on every re-run, and the notification of the superseded dependency
arrives from inside the nested `runChecks` while the `computed` is still running,
which `@preact/signals-core` rejects as a write inside a computed.

The signals hold the label strings the observer handed them; they are the
signals library's own state, not a copy of a view's result kept by the adapter.
Unmount stops the effect, stops the observer and cleans the cursor up.

## The keyed read and the view switch

`readKeys` is one `find({ id: { $in: page } })` per page. The collection's id
index is registered as an index provider at construction (`createExternalIndex('id',
idIndex)`), and that provider resolves `$in` key by key in the order given, so the
page comes back in key order with the id dropped from the residual selector — one
memory-array copy per page, where a `findOne` per key paid one per key.

A cursor takes its selector and `skip` at construction, so `switchGroup` does what
`scrollTo` does: stops and cleans up the paged cursor and observes a new one over
the new group at skip 0.

## What a frame is

`frame` runs the script's writes inside `collection.batch`, so the index rebuild
and every cursor's re-query are deferred to the end of the frame and each
observed cursor re-derives its window once (`postBatchCallbacks` is a Set). The
batch does not nest — an inner `batch` clears the flag, rebuilds and flushes
before the outer one ends — so a write inside a frame does not open its own. The
relation wiring's frame batches the owners and pairs collections, the two its
scripts write; it leaves the row collection out, because closing a batch
rebuilds that collection's whole id index.
