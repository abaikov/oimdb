---
participant: "zustand"
version: "5.0.15"
auditedAt: "2026-10-21"
auditedBy: "claude-opus-5-5 (churn.chain, churn.diamond, summary and Version re-read 2026-10-21; other wirings from 2026-10-20, their line numbers not re-checked; nothing run)"
digest: "ace4dff1b833f561"
verdict: "idiomatic"
summary: "One vanilla `createStore` per wiring holding the normalised shape, written by immutable `setState` updates, with every consumer a `subscribeWithSelector` listener compared by `Object.is` or the shipped `shallow`; a frame's row writes are buffered and applied as ONE `setState`, every `setState` re-runs every selector in the store, and a re-send of unchanged values notifies because nothing compares values. zustand has no derivation primitive, so `churn.chain` and `churn.diamond` derive through `reselect` `createSelector`, one memoised selector per level or node under a `subscribeWithSelector` listener on the top one."
wirings:
  bind:
    verdict: "idiomatic"
    note: "One store (zustand.ts:203-205) and one `subscribeWithSelector` listener per view selecting that group's top-k window through `selectionOf`, compared with `shallow` (:208-220), the comparison `useShallow` applies (node_modules/zustand/esm/react/shallow.mjs:4-10). Writes are immutable `setState` updaters built from a list of edits (`entitiesEdited`, `rowsEdited`, :83-132). `frame` (`rowEditorOf`, :139-165) buffers the row writes issued inside it and applies them as one `setState` when it returns; outside a frame each write is its own `setState`. A write to group B re-runs view A's selector and the `shallow` comparison leaves it undelivered. The cell wiring (`pin`, :235-253) is two listeners selecting the pinned `label` and `note` strings with `shallow` and `fireImmediately`, so a label write delivers the label consumer only."
  bindPerGroup:
    verdict: "idiomatic"
    note: "Same body with fifty listeners (zustand.ts:647). Every `setState` runs all fifty selectors — fifty top-k derivations and fifty `shallow` comparisons — and only the views whose window holds a new row object are delivered."
  churn.row:
    verdict: "idiomatic"
    note: "One `subscribeWithSelector` listener per subscriber selecting `entities[id]` with the default `Object.is` (zustand.ts:277-291, :324-329; equality at esm/middleware.mjs:254-258). The mount subscribes with `fireImmediately`, so the selector runs once per mount and that first call records the read; the middleware passes the same slice as next and previous there (esm/middleware.mjs:263-265), which is how the listener tells it from a wake (:285-288). `unmount` deletes the listener and clears the read slot (:344-350). Every `setState` runs every standing subscriber's selector, so the time carries zustand's global notification. The store holds `entities` alone (`onlyEntitiesEdited`, :134-137): no churn script reads a grouping."
  churn.wide:
    verdict: "idiomatic"
    note: "The subscriber selects the tuple of its `count` rows and compares it with `shallow` (zustand.ts:330-336), the documented multi-value selection (README.md:216-221); the rendered text is the first row's label (:296-303). Because the tuple holds the row objects, a write to any of the `count` rows wakes the subscriber, not only a write to the first; churnWide writes only the first (harness/scenarios.ts:2139-2140)."
  churn.column:
    verdict: "idiomatic"
    note: "The subscriber selects `entities[id].label` with the default `Object.is` (zustand.ts:338-341), so a write to another column of the row re-runs the selector and does not wake it. The column filter is the middleware's equality on a selected string (esm/middleware.mjs:254-258), the same thing the README's `state.paw` example shows (README.md:209-210); the adapter compares nothing."
  churn.chain:
    verdict: "idiomatic"
    note: "Supplied: churnShapes is called with no declines (zustand.ts:733). mountOnChain (zustand.ts:428-446) builds level 1 as `createSelector([state => state.entities], …)` whose result function joins the subscriber's `count` root labels with chainWindowOf and applies chainLevelOf, and each level above as `createSelector([selectLevel], text => chainLevelOf(text, level))`; the subscriber is one `subscribeWithSelector` listener on the top selector through the shared `mount` (363-376), default `Object.is`, `fireImmediately` for the mount read, a wake counted only when the slice moved. The derivation is a library primitive, reselect 5.3.0's memoised selector (node_modules/reselect/package.json:3, packages/bench/package.json:51), the pattern the departure names (zustand.ts:717-720); zustand ships none. B3 of churnChain (scenarios.ts:2279-2283): the root ids are the ones the mount was given, nothing walks the chain. B3 of chainFrameWrite (2374-2377): nothing caches the head across frames outside reselect's own memo. Cost the row carries: level 1's input is the whole `entities` record, which every `setState` replaces, so every standing subscriber's level 1 re-joins its labels on every `setState`, including the tiles whose roots were not written; the levels above are skipped when level 1's string is unchanged (zustand.md:109-111). Input selectors that extract the root rows one by one are the reselect-documented alternative; it trades the join for one memo lookup per root per tile and was not measured, so no faster way is established. Not run."
  churn.diamond:
    verdict: "idiomatic"
    note: "Supplied (zustand.ts:733). mountOnDiamond (zustand.ts:447-455): a plain input selector reads the root's label, `createSelector([selectLabel], diamondLeftOf)` and `createSelector([selectLabel], diamondRightOf)` are the arms, `createSelector([selectLeft, selectRight], diamondJoinOf)` is the join, and the subscriber is one `subscribeWithSelector` listener on the join through `mount` (363-376). The selectors are pulled once per `setState` by the middleware's listener, so the join's result function runs at most once per `setState`, and only when an arm's string changed; the wake is the middleware calling the listener when the join's string moved. B3 of churnDiamond and diamondFrameWrite (scenarios.ts:2489-2492, 2571-2574): the join is reselect's and the adapter deduplicates nothing. unmount (456-462) deletes the listener. Not run."
  reads.byKey:
    verdict: "idiomatic"
    note: "One `getState()` per page and one `entities[id]` per key, nothing resolved in advance and no `setState` (zustand.ts:409-418)."
  reads.byWindow:
    verdict: "idiomatic"
    note: "View A's cursor is a `cursor` field of the same state (zustand.ts:359-373). A scroll is one `setState` of a fresh cursor (:419-423); view A's selector takes the top `offset + window` of the cursor's group and slices the page (:378-390), view B's selector re-runs over unchanged rows and `shallow` leaves it undelivered (:391-401). The selection is a top-k walk and not a re-sort."
  reads.byTwoAxes:
    verdict: "idiomatic"
    note: "View B selects group A's window under the second predicate (zustand.ts:391-401, predicate in `selectionOf` at :182). A move of a row view B's predicate excluded replaces only that row's object, so B's window stays `shallow`-equal and is not delivered."
  reads.bySwitch:
    verdict: "idiomatic"
    note: "`switchGroup` sets `cursor` to `{ group, offset: 0 }` in one `setState` (zustand.ts:424-426); view A's selector reads the new group's id list (:378-390); view B's inputs are unchanged and `shallow` holds."
  relations:
    verdict: "idiomatic"
    note: "Owners and pairs are two more records of the same state (zustand.ts:438-447). The views select the owners' names and the pairs' marks as string arrays with `shallow` and `fireImmediately` (:478-491), so an owner write leaves the pair view undelivered and a pair write the owner view. Both selectors run on every `setState`, and the pair selector composes each key per line per notification. `writePair` composes its key per call (:501-508)."
  single:
    verdict: "idiomatic"
    note: "A two-field store and two listeners selecting `value` and `bystander` with the default `Object.is` (zustand.ts:523-585, listeners at :543-560). `writeSingle` is `setState({ value })` (:564-566); no script writes a single inside a frame, so `frame` runs its function (`runDirectly`, :167-169): the merged state is a new object, so `setState` notifies (esm/vanilla.mjs:6-9), and the middleware's `Object.is` on the selected string is what keeps the bystander silent and makes singleResend wake neither."
improvements: []
---

## Version and recipe

`node_modules/zustand/package.json` is `5.0.15`, the same as `version`
(zustand.ts:701). The adapter imports `createStore` from `zustand/vanilla`,
`subscribeWithSelector` from `zustand/middleware` and `shallow` from
`zustand/vanilla/shallow` (zustand.ts:1-3), and `createSelector` from `reselect`
5.3.0 for the chain and diamond (zustand.ts:20); `shallow` comes from there because `zustand/shallow`
also re-exports `useShallow` and so imports React (esm/shallow.mjs:1-2). The
recipe is the README's "Using subscribe with selector" and "Using zustand without
React" (README.md:192-251) with state "updated immutably" (README.md:31).

## The store and its notification

`createStore` keeps one state value and one `Set` of listeners; `setState` skips
only when the updater returns the current state by `Object.is`, otherwise merges
the partial into a new top-level object and calls every listener synchronously
(esm/vanilla.mjs:1-21). `subscribeWithSelector` wraps `subscribe` so that a
listener is called only when `equalityFn(previousSlice, nextSlice)` is false,
default `Object.is`, and can be fired on subscribe (esm/middleware.mjs:249-271).
The adapter's updaters return `state` unchanged only when no edit found its id
stored (zustand.ts:131, :136, :497, :505); that is an existence test, not a value
test.

## Writes

A row write is an edit (`write`, `remove`, `patch`; `setGroup` and `setRank` are
patches) applied by `entitiesEdited` (zustand.ts:83-119), which copies `entities`
once per `setState` and gives every changed row a fresh object. The grouped stores
wrap it in `rowsEdited` (:124-132), which copies each touched group list once
(`bucketsDraftOf`, :62-76) and splices a leaving id out of that copy (:78-81); the
churn and relation stores use `onlyEntitiesEdited` (:134-137). A re-send makes a
fresh object per row and notifies: no zustand API compares values before notifying,
and the window views are delivered again with unchanged text.

## Batching

None exists in 5.0.15: the package's exports are `createStore`, `create`,
`useStore` (esm/index.mjs:1-2, esm/react.mjs:22), the middlewares `combine`,
`createJSONStorage`, `devtools`, `persist`, `redux`, `subscribeWithSelector`
and `unstable_ssrSafe` (esm/middleware.mjs:490) plus `immer` from its own entry,
`createWithEqualityFn`/`useStoreWithEqualityFn` (esm/traditional.mjs:26), and
`shallow`/`useShallow`; `setState` notifies before returning (esm/vanilla.mjs:9).
These export lists are from the 2026-10-17 audit and were not re-read. None of
these defers or groups notifications, and none is a derived value, which is why
`churn.chain` and `churn.diamond` derive through `reselect`.

The library's way of applying several changes together is one `setState` that
makes all of them, so `frame` (`rowEditorOf`, zustand.ts:139-165) buffers the row
writes issued inside it, in order and with nothing compared, and applies them as
one `setState` when it returns: one copy of `entities`, one copy of each touched
group list, one notification of every listener. This is the bench-wide rule that an
adapter may buffer a frame's writes into the library's own bulk update
(harness/types.ts:23-25; valtio.ts buffers inside a frame the same way). Outside a
frame each write is its own `setState`. Cursor, owner, pair and single writes are
not buffered; no script issues one inside a frame.

## Code volume

The figures are `npm run lines`' cell for each wiring; they have not been re-run
since the 2026-10-20 edit.

- **The writes are the library's recipe.** zustand has no update primitive beyond
  `setState(updater)`, so an immutable upsert, removal and patch are spelled out
  (zustand.ts:83-137), plus the frame buffer (:139-165). The window and read wirings
  keep `idsByGroup` beside `entities`, which needs the per-group copy-on-write draft
  (:62-81); the churn and relation wirings keep `entities` alone
  (`onlyEntitiesEdited`, :134-137), because no script there reads a grouping.
- **reads.byKey** carries both read views, because one binding serves every read shape:
  the cursor state and the two selectors (:377-402) over the shared top-k selection
  (:171-194), which a zustand selector has to spell out because zustand derives
  nothing.
- **bind** carries the grouped writes, the selection, one listener per view
  (:208-220) and the cell wiring's two listeners (:235-253).

## Unverified

The normalised `entities` + id-list shape is the instruction this adapter was
written to; the shipped README does not prescribe a state layout. The `immer`
middleware (README.md:316-334) would turn a re-send into a no-op, as Immer does
for Redux Toolkit, at the cost of a draft per write; neither arm is measured. The
cost of every `setState` running every listener's selector — fifty top-k
derivations per `setState` under `bindPerGroup`, and N or N×8 selectors per `setState` in
the shared-root churn scripts — is stated from the source, not measured. The
`shallow` comparison builds two `Map`s per array comparison
(esm/vanilla/shallow.mjs:2-18, :43-46), also unmeasured: an array has an
`entries` method, so `hasIterableEntries` is true for it and arrays go through
`compareEntries` rather than the cheaper `compareIterables`. The adapter has no
choice there, since `shallow` is the comparator the package ships. Nothing here was
run, and the card is unstamped until it is re-read against the current adapter.