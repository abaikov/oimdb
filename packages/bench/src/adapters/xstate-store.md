# What an @xstate/store store notifies, and what a frame is to it

Companion to `packages/bench/src/adapters/xstate-store.ts`. Library paths below are
under `node_modules/@xstate/store/dist/`; the core is `store-55b22bbd.js`.

## The recipe

One `createStore` per entity type, its `context` updated only by the transitions in
`on`, events sent as `store.send({ type, ... })`, and every consumer a subscription to a
`store.select(...)` or a `createAtom(...)` computed over the store. That is the README's
quick start (README.md:28-60) plus the reactive half the README points at for tracked
reads (README.md:353). The rows store keeps the population in one `rows` record and an
`idsByGroup` index of ids beside it, both written by the same transitions
(xstate-store.ts:115-169).

## One atom per store, and what a `select` is

A store holds its snapshot in ONE writable atom (`createStoreCore`,
store-55b22bbd.js:619-624). `send` runs the transition and calls `atom.set` with the next
snapshot (:643-649); `atom.set` compares with `Object.is` and, if the snapshot changed,
propagates and flushes every watching effect before it returns (:439-447, flush :270-278).
A transition that returns `undefined`, or the same context, leaves the snapshot as it was
(:863, :869-874), so nothing is notified.

`store.select(selector, equalityFn = Object.is)` is a computed atom over the store
(:751-755). Every `send` that changes the snapshot marks every selection over that store;
each recomputes its selector, and only a selection whose result differs under its
comparator wakes its subscriber (:393-416, the `compare` at :395 and :405). The engine is
alien-signals' push-pull graph, adapted in-package (:3-5), so a computed read by two others
recomputes once and a join over both runs once.

`subscribe` builds an effect that reads the atom immediately and does NOT call the
observer on that first run (:361-392, the `observed` flag at :365-372), so a mount is not
a wake. `unsubscribe` stops the effect and purges its dependencies (:517-521); a computed
that loses its last subscriber purges its own (`unwatched`, :252-258). The teardown is
synchronous all the way down a chain.

## What a frame is

The package exports no batch and no transaction (xstate-store.js:2, :90;
`declarations/src/index.d.ts`). Its coalescing is `enqueue.trigger` inside a single
transition: the triggered events are pushed onto the transition's pending queue and run
in the same macrostep (store-55b22bbd.js:847-875), and `receive` then calls `atom.set`
once with the final snapshot (:646-649). The README says the same of validation:
"Events queued internally with `enqueue.trigger` are processed as part of the same
macrostep" (README.md:330-332).

So `frame` buffers the row events issued inside it — what was written, in order, with
nothing compared — and sends ONE `framed` event (`rowWritesOf`, xstate-store.ts:201-228).
Its handler (`framed`, :60-76) re-triggers every buffered event through
`enqueue.trigger` and returns `undefined`, so the frame is one transition, one
`atom.set`, and one notification of every selection. Outside a frame each write is its
own `send`. Cursor, owner, pair and single writes are not buffered; no script issues one
inside a frame.

What the frame does NOT coalesce is the copying: every triggered event is its own
handler, so a frame of k point writes spreads the `rows` record k times. A single bulk
event that applies every edit to one copy would avoid that, and is not what the
library's batching primitive gives.

## Equality

The row, column and single subscribers keep `select`'s default `Object.is`. Every view
that hands back a fresh array — the windows, the cells, view B of the read wiring, both
relation views — passes the package's own `shallowEqual` (xstate-store.js:13-27), which is
exported for exactly this. A view recomputed after a write elsewhere, whose rows are the
same objects, is therefore not delivered. View A of the read wiring returns
`{ offset, rows }`, and its `createAtom` compares the offset and then the rows with
`shallowEqual` (xstate-store.ts:431-443).

## Immutability, and what a point write copies

The store detects change by identity, so a transition must return new objects. Every
point write copies the row and the whole `rows` record by spread, the README's pattern
(README.md:28-45). Immer is the README's other arm (README.md:137-160) and copies the
modified record too. A group move also copies the two buckets it touches; `write` and
`remove` copy each touched bucket once per event (`draftBucket`, xstate-store.ts:80-91).
Inside a frame these copies happen per triggered event, not once per frame.

## The derivation shapes

- Chain: level 1 is `store.select` over the `count` source rows returning
  `chainLevelOf(label, 1)`; levels 2..depth are `createAtom` computeds over the level
  below; the subscriber is on the head (xstate-store.ts:379-389).
- Diamond: one `select` of root row `from`'s label, two `createAtom`s over it
  (`diamondLeftOf`, `diamondRightOf`), a third over both (`diamondJoinOf`), the
  subscriber on the join (xstate-store.ts:390-397).
- Column: a `select` of the label alone, so the library's comparator is what filters a
  write to another column (xstate-store.ts:375-378).

## The other stores

The read wiring keeps view A's group and offset in a second store with `scrolled` and
`switched` events (xstate-store.ts:417-429); view A is a `createAtom` reading both stores,
view B a `select` over the rows store alone, so a scroll or a switch never recomputes B.
The relation wiring keeps owners and pairs in a store each (xstate-store.ts:489-527), so a
write to one type never marks the view over the other.
