---
participant: "xstate-store"
version: "4.2.3"
auditedAt: "2026-10-20"
auditedBy: "claude-opus-5-5 (code edited 2026-10-20; nothing re-run)"
digest: "8001dfa79de8fe66"
verdict: "idiomatic"
summary: "One `createStore` per entity type with immutable transitions sent as `store.send` events, every consumer a subscription to a `store.select` or `createAtom` computed over the store; the package ships no batch, so `frame` buffers its row events and sends ONE `framed` event that re-triggers them through `enqueue.trigger`, one transition and one notification per frame; window, cell, relation and both read views compare with the package's own `shallowEqual`, and the wide churn subscriber selects the `count`-tuple of row objects under it; every churn shape, including the column, chain and diamond, is built from `select` and `createAtom`."
wirings:
  bind:
    verdict: "idiomatic"
    note: "One rows store (xstate-store.ts:115-169) and one `store.select(..., shallowEqual)` per view, subscribed (:260-268). Every point event spreads the whole `rows` record (:105-113, :151-166), the README's immutable pattern (node_modules/@xstate/store/README.md:28-45). A transition that changes the snapshot recomputes both views (store-55b22bbd.js:751-755); `shallowEqual` (xstate-store.js:13-27) delivers only a view whose window holds a different row object. `frame` (`rowWritesOf`, :201-228) buffers the row events and sends one `framed` event whose handler (:60-76) re-triggers them with `enqueue.trigger`, so a frame is one transition and one `atom.set` (store-55b22bbd.js:847-875, :646-649)."
  bindPerGroup:
    verdict: "idiomatic"
    note: "The same body with fifty selections (xstate-store.ts:689, body :258-303). One write recomputes all fifty selectors, since all depend on the one store atom; `shallowEqual` keeps the forty-nine whose window did not change from delivering."
  churn.row:
    verdict: "idiomatic"
    note: "`store.select(context => context.rows[id])` per subscriber, subscribed, with the row's label recorded at mount (xstate-store.ts:335-341, :362-367). The first effect run does not call the observer (store-55b22bbd.js:365-372), so a mount is not a wake. A write to another row returns the same row object and `Object.is` keeps the subscriber silent (store-55b22bbd.js:395, :405). The initial read at xstate-store.ts:340 is `source.get()` on a computed the effect has just evaluated, so it returns the cached snapshot without re-running the selector (store-55b22bbd.js:421-436). `unmount` stops the effect and clears the slot (:398-404); the selection purges its edge to the store synchronously (store-55b22bbd.js:252-258, :517-521). Every subscriber's selector runs on every transition. The store is `createEntitiesStore` (:171-199), the rows record without the group index, because no churn script reads a grouping."
  churn.wide:
    verdict: "idiomatic"
    note: "`store.select` returning the `count`-tuple of row objects (xstate-store.ts:368-373) compared with the package's `shallowEqual`, rendering the first defined row's label (`firstLabelOf`, :317-324). A write to any of the `count` rows yields a different tuple element and wakes the subscriber; a write elsewhere leaves every element the same object. The same shape as zustand's wide subscriber (zustand.ts:330-336)."
  churn.column:
    verdict: "idiomatic"
    note: "`store.select` of row 0's label alone (xstate-store.ts:375-378). The library's own selection comparator (`Object.is`, store-55b22bbd.js:395, :405) is what tells a label write from a write to another column; the adapter compares nothing. The store still has one change signal, so every column selector runs on every write — the same cost as `churn.row`, with a different filter."
  churn.chain:
    verdict: "idiomatic"
    note: "Level 1 is `store.select` returning `chainLevelOf(composed label, 1)`; levels 2..depth are `createAtom(() => chainLevelOf(below.get(), level))`; the subscriber is on the head (xstate-store.ts:379-389). `createAtom` with a getter is the package's computed (store-55b22bbd.js:343-437). Teardown cascades down the levels through `unwatched` (:252-258). Level 1 composes a string, as alien-signals' level-1 computed does (alien-signals.ts:456-462), so the chain's cut-off is the library's `Object.is` on that string."
  churn.diamond:
    verdict: "idiomatic"
    note: "A `select` of root row `from`'s label, `createAtom`s for `diamondLeftOf` and `diamondRightOf` over it, a `createAtom` join over both, the subscriber on the join (xstate-store.ts:390-397). The reactive core is alien-signals adapted in-package (store-55b22bbd.js:3-5, propagate :95-144, checkDirty :145-211), which marks the join pending once and recomputes it once per write. Not run; the diamond script's check is what asserts it."
  reads.byKey:
    verdict: "idiomatic"
    note: "One `getSnapshot()` per page and one property read per key, nothing resolved in advance, no event sent (xstate-store.ts:459-468)."
  reads.byWindow:
    verdict: "idiomatic"
    note: "View A's cursor is a second store with `scrolled` and `switched` events (xstate-store.ts:417-429). View A is a `createAtom` reading both stores via `store.get()` (:431-443), the README's tracked read (README.md:353); view B is a `select` over the rows store alone (:444-447), so a scroll recomputes A only. A scroll is one `send` (:469). View A's atom compares its `offset` and then its rows with `shallowEqual` (:443), through `createAtom`'s `compare` option (store-55b22bbd.js:395)."
  reads.byTwoAxes:
    verdict: "idiomatic"
    note: "View B is `select` over the rows store with the second predicate (xstate-store.ts:444-447, predicate in `selectionOf` :244) and `shallowEqual`. View A is the `paged` atom (:431-443); it depends on the rows store's atom, so every transition filterTwoAxes causes recomputes it (scenario lines from the 2026-10-17 audit, not re-read), and its comparator — same offset and `shallowEqual` rows — keeps it from delivering when the moved row was outside its window, as zustand's sliced page under `shallow` does (zustand.ts:378-390)."
  reads.bySwitch:
    verdict: "idiomatic"
    note: "`switchGroup` sends one `switched` event setting `{ group, offset: 0 }` (xstate-store.ts:424-427, :470): one atom write, one recompute of view A over the new group's bucket. View B does not read the cursor store."
  relations:
    verdict: "idiomatic"
    note: "Rows, owners and pairs in a store each (xstate-store.ts:487-527). View A is a `select` over the owners store, view B over the pairs store, both with `shallowEqual` (:541-550), so a write to one type never marks the other view. `writePair` composes the key on every call (:556-557)."
  single:
    verdict: "idiomatic"
    note: "One store with `value` and `bystander` in context and a `select` of each, subscribed (xstate-store.ts:572-637); no script writes a single inside a frame, so `frame` runs its function (`runDirectly`, :34-36). A re-send of the same value produces a new context and notifies the store atom, and the selection's `Object.is` (store-55b22bbd.js:405) keeps both subscribers silent."
improvements:
  - "Unmeasured: inside a frame every triggered event is still its own handler, so a frame of k point writes spreads the rows record k times. One bulk event applying all k edits to one copy would spread it once; `enqueue.trigger` is what the package ships for one transition, and a bulk event is the adapter's own transition, so it is left as a question."
  - "Unmeasured: partitioning the rows record by group (one record per group inside context, or one store per group as the nanostores adapter does) would cut a point write's copy from the population to one group. It is not a pattern the README shows, and it is a different normalisation rather than a faster use of the same API."
---

## Version and recipe

`node_modules/@xstate/store/package.json` is `4.2.3`, the same as `version`
(xstate-store.ts:641). The package's entry exports `createStore`, `createStoreConfig`,
`createStoreLogic`, `createAtom`, `createAtomConfig`, `createAsyncAtom`,
`createReducerAtom`, `fromStore` and `shallowEqual` (dist/xstate-store.js:2, :90;
dist/declarations/src/index.d.ts:1-4). The adapter uses `createStore`, `store.send`,
`store.select`, `store.get` / `getSnapshot`, `createAtom` with a getter and a `compare`,
and `shallowEqual`. The online docs the `docs` field cites were not read; the recipe is
checked against the shipped code and the shipped README.

## Batching

There is no batch, transaction or deferred notification in 4.2.3. `send` calls `receive`,
which runs the transition and `atom.set`s the snapshot once (store-55b22bbd.js:646-649);
`atom.set` propagates and flushes the effect queue before returning (:439-447,
:270-278; these two from the 2026-10-17 audit, not re-read). The coalescing the package
ships is `enqueue.trigger` inside one transition: a triggered event is pushed onto the
transition's pending queue and processed in the same macrostep (:847-875), and the README
says so (README.md:330-332). It is reachable only from inside a handler, so `frame`
(`rowWritesOf`, xstate-store.ts:201-228) buffers the row events issued inside it, in order
and with nothing compared, and sends ONE `framed` event; its handler (`framed`, :60-76)
re-triggers each buffered event and returns `undefined`. A frame is therefore one
transition, one `atom.set` and one notification. This is the bench-wide rule that an
adapter may buffer a frame's writes into the library's own bulk mechanism
(harness/types.ts:23-25). Cursor, owner, pair and single writes are not buffered; no
script issues one inside a frame.

## Events, and what each one allocates

Events are sent as literal objects through `store.send` (`rowWritesOf`,
xstate-store.ts:201-228). `store.trigger.x(payload)` is documented as equivalent
(README.md:51) and builds the event by spreading the payload (store-55b22bbd.js:543-549,
:590-598). Every sent event runs `createStoreTransition`, which allocates an effects
array and a pending-events array, and every event it processes — a triggered one too —
builds an enqueue object with two `Proxy`s (`createEnqueueObject`, :551-571, called at
:859-862); `enqueue.trigger` also spreads each payload into a fresh event (`toEvent`,
:543-549).

## Equality

`select` and `createAtom` take a comparator (`equalityFn`, store-55b22bbd.js:751-755;
`compare`, :395). The adapter uses the default `Object.is` for the row, column, chain,
diamond and single subscribers, and the exported `shallowEqual` (xstate-store.js:13-27)
for every array-returning view and the wide tuple. View A of the read wiring returns
`{ offset, rows }`, so its `compare` checks the offset by identity and passes the rows to
`shallowEqual` (xstate-store.ts:443) — the one comparator the adapter composes, and it is
composed only of the package's own. `_update` treats an `undefined` previous value as
always changed (:405); no selector here returns `undefined` for a view, because
`selectionOf` hands back a fresh array even for a group with no bucket yet
(xstate-store.ts:233-256).

## Immutability

Change is detected by identity, so every transition returns new objects: a point event
spreads the row and the whole `rows` record (`rowReplaced`, xstate-store.ts:105-113), a
move also copies the two buckets (:155-164), and `write` / `remove` copy each touched
bucket once per event (:80-103, :119-153). Inside a frame these copies are per triggered
event. A missing id returns `undefined`, which leaves
the snapshot unchanged and notifies nothing (store-55b22bbd.js:863, :869-874); that is a
presence check, not a value check. Every `write` copies each incoming row, so a re-send
of unchanged values notifies: the package compares no values before committing
(store-55b22bbd.js:869-874 compares the context by identity only), and the contract
forbids the adapter to add a check its library does not have (harness/types.ts:11-12).

## Code volume

The figures are `npm run lines`' cell for each wiring; they have not been re-run since
the 2026-10-20 edit, and the `digest` above is the 2026-10-17 value, now stale.

- Every row store carries the `framed` event types and handler (xstate-store.ts:49-76) and the buffering
  writer (:201-228).
- Two row stores. `createRowsStore` (xstate-store.ts:115-169) keeps `idsByGroup` beside
  `rows` for the window and read wirings, whose views walk a group, and needs the
  per-event bucket drafts (:80-103). `createEntitiesStore` (:171-199) is `rows` alone and
  serves the churn and relation wirings, where `groupOrder` answers `undefined`. Each
  transition is written out because the package's only update primitive is a handler
  returning the next context (README.md:28-45).
- **reads.byKey** carries both read views, because one binding serves every read shape:
  the cursor store (:417-429), the `paged` atom and the axis selection (:431-451), over
  the shared top-k `selectionOf` (:233-256), which a selector has to spell out because
  the package derives nothing from a collection.
- **bind** carries the grouped store, the selection, one selection per view
  (:260-268) and the cell wiring's two selections (:278-294).