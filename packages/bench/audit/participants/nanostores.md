---
participant: "nanostores"
version: "1.5.5"
auditedAt: "2026-10-20"
auditedBy: "claude-opus-5-5 (verified)"
digest: "6aab0cfff154922a"
verdict: "idiomatic"
summary: "The window wiring holds one `map` store per group with a computed per view over its own group's store, so a point write spreads one group's record and wakes only that group's view. `frame` is nanostores' own synchronous `batch(run)`, which queues every listener and drains once when the outermost batch returns, so a multi-write frame reaches each listener once, with final values. The cell wiring is a `computed` per pinned cell and column, so the atom's own `Object.is` keeps a label write away from the note consumer. The chain and diamond are nanostores' own `computed`. A computed that loses its last listener is detached only on a 1000 ms timer (`STORE_UNMOUNT_DELAY`) the worker never reaches, so after an unmount on the churn rows, and after `pin` for the two window computeds, the edges stay and keep recomputing; that is a library limit with no public workaround, stated as a known effect and not worked around."
wirings:
  bind:
    verdict: "idiomatic"
    note: "One `map` store per group (nanostores.ts:51, :55-62) and an id → group-store handle table (:53). One `computed` + `.subscribe` per view over its own group's store (:115-122). Point writes use the documented `setKey` (:134-140), which itself spreads the store's record (node_modules/nanostores/map/index.js:14-19) — one group's, not the population's. Batched writes publish one whole-record `set` per touched store (`write` :162-179, `remove` :180-189); a move is two store writes (:194-209). The cell wiring built by `pin` (:227-249) is a `computed` per pinned cell and column over that row's group store, returning one string, and a `computed` per column over its cells (`pinnedTextOf`, :142-156): a label write leaves every note cell's string unchanged, the atom's `set` drops it (`Object.is`, atom/index.js), and the note consumer is not delivered. `frame` is `batch(run)` (:38-40; `batch` exported at index.js:1, defined at atom/index.js:43-57, documented at atom/index.d.ts:196-224). Inside it each view's `.subscribe` listener is queued once per batch and called once when the outermost batch returns, with the computed's value at that moment (atom/index.js:15-41, :96-119). `batch` coalesces notifications only: each `setKey` inside a frame still spreads its group's record (map/index.js:14-19)."
  bindPerGroup:
    verdict: "idiomatic"
    note: "Same body with fifty computeds, each over its own group's store (nanostores.ts:880), so a write in one group recomputes one view. Same `batch` `frame` as `bind`: a frame recomputes and delivers each touched group's view once."
  churn.row:
    verdict: "idiomatic"
    note: "One `map` store per row (nanostores.ts:297), `listen` on it (:350), with the store's current label recorded as the slot's read at mount (:351). `listen` does not call the listener on subscribe (atom/index.js), so a mount is not also a wake. Each wake writes `churnRead[at]` (:287-290) and `unmount` clears it (:396-402), which is what the verify-pass fold over every standing read (render.ts:124-141) checks. The multi-row frames that reach this wiring — `churnList` (`writeFrame`, scenarios.ts:1881-1891), `appFill` (:2917-2922) and `appRound` (:2983-2993) — write each row once per frame, and every subscriber is its own listener closure (:287, :350), so under `batch` every subscriber on a written row still runs exactly once, at the end of the frame rather than inline; the woke counts the scripts expect (`churnListPrefix`, `APP_FILL_WOKE`, `appRoundWoke`) count subscribers on written rows and are unchanged by the switch."
  churn.wide:
    verdict: "idiomatic"
    note: "`computed` over the source row stores, then `listen` (nanostores.ts:354-363). Unmount splices the listener, but the computed stays attached to its sources until `STORE_UNMOUNT_DELAY` (lifecycle/index.js:117, :136-145), which no sample reaches; a KNOWN EFFECT on this row, shared with `churn.chain` and `churn.diamond`, with no public workaround, and the `departure` says its direction is unmeasured (src/adapters/nanostores.md, 'A computed with no listener stays attached for a second'). `churnWide` writes one row per frame (`rowsWrittenIn: churnRowOnly`, scenarios.ts:2152), and `writeFrame` with a count of one calls `patchLabel` without opening a `frame` at all (scenarios.ts:1883-1886), so the switch to `batch` does not touch this wiring's script."
  churn.column:
    verdict: "idiomatic"
    note: "`listenKeys(store, ['label'])` (nanostores.ts:365-370), the library's own key filter (listen-keys/index.js:3-29). The writes use `setKey('label', …)` (:306), which passes the key name the filter reads; `setKey` itself skips a value `Object.is`-equal to the held one (map/index.js:14). Inside a `batch` the `changed` key is `undefined` (atom/index.js:112, atom/index.d.ts:207-208) and `listenKeys` falls back to comparing the key's pre-batch and final values (listen-keys/index.js:9-16), which still filters by key; no script reaches this wiring inside a frame, because `churnColumn` writes one row (scenarios.ts:2255) and `writeFrame` opens no frame for one."
  churn.chain:
    verdict: "idiomatic"
    note: "Level 1 is a `computed` over the `count` source stores returning `chainLevelOf(label of row from, 1)`; levels 2..depth are each a `computed` over the level below returning `chainLevelOf(text, level)`; `listen` on the head (nanostores.ts:371-386). It carries the same deferred-unmount exposure as `churn.wide`."
  churn.diamond:
    verdict: "idiomatic"
    note: "Two `computed`s over root row `from`'s store (`diamondLeftOf`, `diamondRightOf` of its label), a third `computed([left, right], diamondJoinOf)`, and `listen` on the join (nanostores.ts:387-395). Read in node_modules/nanostores 1.5.5: a root write queues left's and right's recompute on the one listener queue before either runs (atom/index.js:96-119, the queue drains only when `runListenerQueue` was set by the outermost notify); each then queues the join, the first join run recomputes it and stamps `currentEpoch` (computed/index.js:32), and the second returns at `currentEpoch === epoch` (computed/index.js:12-13), so the listener fires once per write. Inside a `batch` the join's two queue entries share one listener (computed/index.js:62 registers the same `run` on both sources), and `drainQueue` skips the second because the first call cleared its pending set (atom/index.js:21-28), so the result is the same. Not run; `churnDiamond` writes one row per frame (scenarios.ts:2590) and its check is what asserts the count. Same deferred-unmount exposure as `churn.wide`."
  reads.byKey:
    verdict: "idiomatic"
    note: "One `$rows.get()` per page and one property read per key, nothing hoisted (nanostores.ts:554-563)."
  reads.byWindow:
    verdict: "idiomatic"
    note: "View A's cursor is one atom holding group and offset (nanostores.ts:423). View A is `computed([$rows, $cursor])` (:470-479) and view B is `computed($rows)` (:480-482), so a scroll recomputes A only (:566-568). A scroll sets a fresh `{ group, offset }` object rather than a number. Both views are over one group, so this wiring keeps the population in one store (:421) beside a Set-per-group id index (:422). A point write spreads the 10 000-key record (`setKey`, :523-546); the only timed writes in this wiring are `filterTwoAxes`' four moves, and a partition was considered and not made (src/adapters/nanostores.md, 'What a computed can depend on')."
  reads.byTwoAxes:
    verdict: "idiomatic"
    note: "View B is `computed($rows)` with the second predicate (nanostores.ts:480-482, predicate at :448)."
  reads.bySwitch:
    verdict: "idiomatic"
    note: "`switchGroup` sets the cursor atom to `{ group, offset: 0 }` (nanostores.ts:569-571): one atom write, one notification, one recompute of view A over the new group's ids. src/adapters/nanostores.md gives the reason for one atom as `switchGroup` not being called inside a frame. Against 1.5.5 two atoms written inside `batch` would also reach view A's computed once (one `run` listener on both sources, computed/index.js:62); the one-atom shape needs no batch and costs nothing. View B does not name the atom."
  relations:
    verdict: "idiomatic"
    note: "One `map` store per row, owner and pair (nanostores.ts:599-601). The views are computeds over the touched owner stores and over the pair stores (:673-692), so the two views have disjoint dependencies. `writePair` composes the key and looks up the store on every call (:713-717)."
  single:
    verdict: "idiomatic"
    note: "`atom('')` and `listen` (nanostores.ts:757-815). `atom.set` skips a value equal under the atom's `eq`, which is `Object.is` (atom/index.js:67, :123-129)."
improvements: []
---

## Version and recipe

`node_modules/nanostores/package.json` is `1.5.5`, the same as `version`
(nanostores.ts:819). The `departure` (nanostores.ts:821-847) and src/adapters/nanostores.md
describe the 1.5.5 `batch`; the recipe comment at nanostores.ts:44 says "nanostores 1.5".
The adapter uses `map` for records, `computed` for derived state, `subscribe` /
`listen` for consumers, `setKey` for one key and `batch` for a frame. All five are
exported and typed in node_modules/nanostores/index.d.ts. The installed README only
links out to the docs (README.md:64-65), so this audit could not check the online README
the `docs` field cites. The recipe is checked against the shipped code, not the prose.

## Batching

nanostores 1.5.5 exports a synchronous `batch(fn)` (node_modules/nanostores/index.js:1,
atom/index.js:43-57), and the adapter's `frame(run)` is `batch(run)`
(nanostores.ts:38-40). Every wiring writes through it; no buffering is needed, because the
library's own batch already delivers each listener once per frame. What a listener sees, read from atom/index.js:

- While a batch is open, `notify` (:96-119) records each (listener, store) pair once in
  `batchSeen` and pushes at most one queue entry per pair; a second write to the same
  store inside the batch queues nothing more for that listener (:105). The entry carries
  the store's value from before its first change in the batch as `oldValue`, and
  `undefined` as the changed key (:112).
- The outermost `batch` drains the queue when `fn` returns (:49-51); a nested `batch`
  drains nothing (:44).
- `drainQueue` (:15-41) calls the listener with the store's value read at drain time
  (:31), so the listener sees final values. For a listener queued under several stores,
  the first entry clears its pending set and calls it, and later entries for stores that
  call already covered are skipped (:21-28).
- `batchSeen` stays set until the drain finishes (:53), so a computed recomputed during
  the drain queues its own listeners through the same path, and they too run once. A
  store that changes after its listener has already run in the drain queues that
  listener again (comment at :25-26) — so "once per batch" holds per listener unless one
  of its stores changes again after it ran within the same drain. No wiring here has a
  listener whose source changes twice in one drain: every computed is a single `set` in
  its `run`, and the epoch guard (computed/index.js:12-13) collapses a re-entry.

The typings state the same contract: "each listener fires at most once when the
outermost `batch` returns — with the final store values" (atom/index.d.ts:197-199).
`batched(stores, fn)` is a different thing, a computed whose recompute is scheduled with
`setTimeout` (computed/index.js:54-58).

**Verification, 2026-10-17.** The previous version of this card marked `bind`,
`bindPerGroup` and `churn.wide` `improvable` and the participant `improvable`, because
`frame` called `run()` directly on the 0.11 premise that no synchronous batch exists, and
listed switching `frame` to `batch(run)` as its one improvement. That switch has been
applied (nanostores.ts:1, :38-40), the improvement is closed, and the three wirings and
the overall verdict are re-judged `idiomatic`. Nothing faster documented by the library
remains unapplied in this adapter.

What the switch changes, by script, read from src/harness/scenarios.ts and not run:

- Under `bind` / `bindPerGroup`: `batchPatch` (:657-661), `batchPatchNote` (:753-757),
  `patchMostRows` (:845), `mixedFrame` (:934), `moveAndReorder` (:1046-1049) and
  `resortWindow` (:1181-1185) go from one view delivery per write that reaches a watched
  group's store to one delivery per touched view per frame. In `moveAndReorder` view B
  was delivered twice per step (the `setKey` of the move and the `setKey` of the rank);
  it is now delivered once. Every one of these checks either is `finalStateOnly`
  (:637, :817, :909, :1029, :1152) and asks for row counts, order or `atLeast` one new
  state per step, or (`batchPatchNote`, :760-762) asks for zero distinct renders, so none
  of them requires per-write delivery. That the checks pass under `batch` is not
  established by a run.
- Under `churn.row`: `churnList`, `appFill` and `appRound` write each row once per frame,
  so the same subscribers run the same number of times; only when they run moves, from
  inline to the end of the frame. `settle` (nanostores.ts:317-327) runs after `frame`
  returns, so the comment above it, "nanostores drains its notification queue inline",
  still holds at the moment `settle` reads `churnWoke`.
- Under `churn.wide`, `churn.column`, `churn.chain` and `churn.diamond`: no change. Their
  scripts write one row per frame and `writeFrame` opens no frame for one
  (scenarios.ts:1883-1886).
- The read, relation and single wirings: no script calls `frame` on them (every
  `binding.frame` call in scenarios.ts is one of the eight above).

## The window wiring's store per group

- `computed(stores, cb)` takes its dependency list once, at construction
  (computed/index.js:6-7, :61-67), and `bind` binds an empty store, so a view cannot be
  built over per-row stores that do not exist yet. What is known at bind is the watched
  groups (`TViewConfig`). The window wiring therefore holds one `map` store per group,
  created on first ask (nanostores.ts:55-62) — at bind for the watched ones — and each
  view's computed depends on its own group's store (:115-122).
- `setKey` creates `{ ...$map.value, [key]: value }` (map/index.js:14-19) unless the new
  value is `Object.is`-equal to the held one. A point write spreads one group's record,
  about 200 keys, and it reaches only the view over that group; under `bindPerGroup` one
  write recomputes one view of fifty. The adapter adds a second spread, of the row
  (`{ ...held, ...change }`, nanostores.ts:139), which also means the key's value is
  always a new object, so `setKey`'s equality skip never fires here. Inside a `batch` the
  spreads still happen once per `setKey`; only the notifications coalesce.
- A move takes the row out of the old group's store with one whole-record `set` and
  puts it into the new one with `setKey` (nanostores.ts:194-209): two store writes, one
  notification per view, and inside a frame one delivery per view. A re-send through
  `write` still publishes a fresh record per touched store, so it notifies, as a `map`
  store handed a new object does.
- `readAll` reads every group store's record (:211-218); `groupOrder` reads the group's
  own store (:220-224).
- `pin` (:227-249) resolves each pinned row's group store once, untimed, and builds a
  `computed` per pinned cell and column over that store returning one string, and a
  `computed` per column over its cells (`pinnedTextOf`, :142-156). A label write
  recomputes the cells over the written group's store; the note cells return the same
  string, `atom.set` drops it under `Object.is`, the note column's sources are unchanged,
  and the note consumer is not delivered. A pinned write still looks its key up through
  the id → store table, so `patchPinnedLabel` costs what `patchLabel` costs.

## The derivation shapes

The chain and diamond are built from `computed` alone; nothing between levels is the
adapter's beyond the `derivations.ts` function each level is defined by. A 1.5.5
computed also skips its callback when every source value is `eq` to the previous one
(computed/index.js:15). Their computeds are subject to the deferred detach described
below, so an unmount leaves their edges standing for the rest of the sample. Every churn
mount records the subscriber's current read (:351, :363, :369, :385, :394) and `unmount`
clears it (:401), which the verify-pass churn read fold relies on.

## The computeds that never detach — a known effect on churn rows and on the pin

This is stated, not worked around. On the churn rows it applies to every
`mountOnRows` over more than one row, every chain and every diamond: an unmount
splices the listener and leaves the computed's source edges standing, so later writes
in the sample recompute a computed nobody reads. `pin` unsubscribes the window
computeds (nanostores.ts:228). A computed's sources are
detached only in a `setTimeout(…, STORE_UNMOUNT_DELAY)` callback
(lifecycle/index.js:117, :136-145). The worker runs synchronously, so the two window
computeds keep recomputing on every `cellDelivery` write to their own groups' stores
and nothing reads the result. The synchronous escape, `cleanStores`, throws when
`NODE_ENV === 'production'` (clean-stores/index.js:5-10) and the per-store `clean`
hooks it calls are only installed outside production (atom/index.js:138,
lifecycle/index.js:147); workers run as production (src/harness/measureBatch.ts:201).
This is a library limit with no public workaround. It counts against nanostores on
`cellDelivery` and on the churn rows named above; which way it moves them is unmeasured.

## Unverified

The `departure` says per-key `setKey` writes in `write` "would make one call to write
into ten thousand record copies, batched or not". The copy per `setKey` follows from
map/index.js:14-19 and is independent of `batch`; the figure of ten thousand was not
traced to the operating point, and nothing was measured. The per-cell computeds' effect on
cellDelivery is unmeasured. The per-group partition's effect on patchColumn, patchNote,
batchPatch, patchMostRows, cellDelivery and moveGroup is unmeasured, and so is the cost
of the cursor object a scroll allocates. The effect of the switch to `batch` on the timed
rows listed under Batching is unmeasured, and that each of those scripts' checks passes
under it was established by reading the checks, not by a run.
