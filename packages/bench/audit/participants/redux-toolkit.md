---
participant: "redux-toolkit"
version: "2.13.0"
auditedAt: "2026-10-20"
auditedBy: "claude-opus-5-5 (code edited 2026-10-20; nothing re-run)"
digest: "ee11cb2024a3a9a6"
verdict: "idiomatic"
summary: "A normalised RTK slice with `createSelector` views, every array selector carrying reselect's `resultEqualityCheck: shallowEqual` and every subscriber applying react-redux `useSelector`'s default reference bail-out; a frame's row writes are buffered and dispatched as ONE `edited` action; the chain and diamond are memoised reselect selectors, a view switch is an action into the `view` slice; `churn.column` selects the label string and compares it by `===`."
wirings:
  bind:
    verdict: "idiomatic"
    note: "One `store.subscribe` (redux-toolkit.ts:274-283) over one memoised selector per view (:260-271), each declared with `SHALLOW_RESULT` (:211), i.e. `memoizeOptions: { resultEqualityCheck: shallowEqual }` with react-redux's `shallowEqual`. A recomputed window holding the same row objects returns the previous array (reselect.mjs:151-156), so the reference bail-out — `useSelector`'s default (`refEquality`, react-redux.mjs:958-962) — skips it. Row writes go through `rowEditorOf` (:178-204): one `edited` action per write outside a frame, one per frame inside it."
  bindPerGroup:
    verdict: "idiomatic"
    note: "Same body with fifty views (redux-toolkit.ts:838). Every notification calls all fifty selectors, and any write to `entities` makes all fifty recompute; only views whose window's row objects changed get a new reference and are delivered."
  churn.row:
    verdict: "idiomatic"
    note: "One `store.subscribe` per subscriber over `entities[id]`. A wake is counted only when the selected reference changed (redux-toolkit.ts:359-373), which is `useSelector`'s default semantics. Every subscriber body still runs on every notification, so the time carries Redux's global notification (redux-toolkit.md, 'What the counter on a subscription-churn row counts'). The read is recorded at mount (:365) and on every wake (:371), and `unmount` clears it (:459-465). The store is the rows slice without the group index (:112-121)."
  churn.wide:
    verdict: "idiomatic"
    note: "Same subscriber, selecting a string composed from `count` rows (redux-toolkit.ts:378-387, :423-431)."
  churn.column:
    verdict: "idiomatic"
    note: "`mountOnColumn` (redux-toolkit.ts:432-435) is `useSelector(state => entities[id].label)`: the same subscriber as `churn.row`, selecting the label string and comparing it by `===`. Redux keeps no column identity; the column is the selector, which is how a react-redux user subscribes to one field."
  churn.chain:
    verdict: "idiomatic"
    note: "Level 1 is a `createSelector` over `entities` returning `chainLevelOf(label of row from, 1)`; levels 2..depth are each a `createSelector` over the level below (redux-toolkit.ts:436-446); the subscriber selects the head. reselect's `identityFunctionCheck` only runs outside production (reselect.mjs:183-200, :336-353). Same subscriber as `churn.row`."
  churn.diamond:
    verdict: "idiomatic"
    note: "An input selector for root row `from`'s label, two `createSelector`s over it and a third over both, the subscriber on the join (redux-toolkit.ts:447-458). Reselect memoises each result function on its inputs, so an unchanged label re-runs neither branch nor the join."
  reads.byKey:
    verdict: "idiomatic"
    note: "One `getState()` per page and one `entities[id]` per key, no dispatch (redux-toolkit.ts:552-561)."
  reads.byWindow:
    verdict: "idiomatic"
    note: "View A's cursor is a second slice (redux-toolkit.ts:477-489). The listener (:529-543) is two `useSelector`s for view A — the page rows (`selectPageRows`, :508-516, shallow result check) and `view.offset` — and one for view B (`selectOnAxis`, :517-521). On a scroll (:564) view B's inputs are unchanged and it is not delivered."
  reads.byTwoAxes:
    verdict: "idiomatic"
    note: "View B is a `createSelector` over `entities` and group A's ids with the second predicate (redux-toolkit.ts:517-521, predicate at :226), with the shallow result check, so a write that leaves B's rows the same objects does not deliver B."
  reads.bySwitch:
    verdict: "idiomatic"
    note: "`switchGroup` dispatches `view/switched` (redux-toolkit.ts:565), whose reducer sets `group` and resets `offset` in one draft (:484-487). The slice is pointed at group A by that action once, before any subscriber exists (:505)."
  relations:
    verdict: "idiomatic"
    note: "Three slices in one store (redux-toolkit.ts:632-639), so an owner write leaves `state.pairs` unchanged and the pair selector hits its cache; both selectors carry the shallow result check (:657-666). `renderBoth` (:670-682) delivers a view only when its selector's reference changed."
  single:
    verdict: "idiomatic"
    note: "Two `store.subscribe` listeners (redux-toolkit.ts:750-765), each selecting one string and rendering only when it is not `===` the last, `useSelector`'s default. No script writes a single inside a frame, so `frame` runs its function (:772)."
improvements: []
---

## Version and recipe

`node_modules/@reduxjs/toolkit/package.json` is `2.13.0`, the same as `version`
(redux-toolkit.ts:793). Installed beside it: `redux` 5.0.1, `immer` 11.1.21,
`reselect` 5.3.0, `react-redux` 9.2.0 (each `node_modules/<name>/package.json`; RTK
declares `immer ^11.0.0` and `reselect ^5.1.0`). The adapter imports `createSelector`
from `reselect` directly (redux-toolkit.ts:4) and `shallowEqual` from `react-redux`
(:3). `react-redux` is not declared in `packages/bench/package.json`; it resolves
because `packages/redux-adapter` declares it and npm hoists it, and importing it loads
React's module (react-redux.mjs:2) without rendering anything. The
recipe follows the `docs` page on deriving data with selectors: a slice with `entities`
and an id index, `createSelector` per view, `store.subscribe` as the change signal.

## What is idiomatic

- Reducers mutate the Immer draft (`applyEdit`, redux-toolkit.ts:71-110). The upsert
  in a `write` edit assigns the four columns onto the stored draft row. Immer's set
  trap returns without marking the draft changed when the value `is` the current one,
  so a re-send produces the same root. That line reference was last read on
  2026-10-17 and not re-read for this edit.
- A one-column write is a `patch` edit carrying `{ id, <column> }`, applied with
  `Object.assign(stored, patch)` onto the draft (:105), the update shape the Redux
  normalisation guide teaches; `setGroup` is the same edit with `group`, and the group
  array moves only when the group value differs.
- Every row write is the one `edited` reducer (:112-122 and :159-171) over a list of
  edits. Outside a frame a write is one action with one edit; inside `frame` the edits
  are buffered and dispatched as one action when the frame returns (`rowEditorOf`,
  :178-204) — the style guide's "Avoid Dispatching Many Actions Sequentially". The
  buffer compares nothing; an empty frame dispatches nothing.
- A group array is rebuilt once per action (`regroupingOf`, :126-157): leaves and joins
  are recorded per group, and `commit` filters the array read through `original()` —
  Immer's "for expensive search operations, read from the original state" tip — once
  per touched group, where the earlier code ran `indexOf` + `splice` on the draft per id.
- No `createEntityAdapter`. Its update path builds `Object.assign({}, original,
  changes)` for every row (`takeNewKey`,
  node_modules/@reduxjs/toolkit/dist/redux-toolkit.modern.mjs:1168-1180), which would
  defeat the Immer no-op. The hand-written reducer is the faster of two documented
  ways, and it is the same kind of draft mutation the RTK docs teach. The `departure`
  declares it.
- `immutableCheck` and `serializableCheck` are turned off. RTK only adds them when
  `NODE_ENV !== 'production'` (redux-toolkit.modern.mjs:334-345), and workers run as
  production (src/harness/measureBatch.ts:201), so turning them off changes nothing at
  run time. Both line references are from the 2026-10-17 audit and were not re-read.
  Immer's auto-freeze stays on: it is Immer's default in production as well.
- The pin hoists nothing, because a write is an action carrying an id. That is the
  accurate answer for this library.
- Two row slices, not one. `groupedRowsSlice` (:159-171) keeps `idsByGroup` beside
  `entities` and serves the window and read wirings, whose views walk a group.
  `rowsSlice` (:112-122) is `entities` alone and serves the churn and relation wirings,
  where no view is derived and `groupOrder` answers `undefined`: maintaining a key index
  nothing reads would be work this task does not ask for.

## The derivation shapes

The chain and the diamond are reselect's `createSelector`, the memoised selector the
`docs` page recommends; nothing between levels is the adapter's beyond the
`derivations.ts` function each level is defined by. The subscriber's `===` on the head
string is the same `useSelector` bail-out every subscriber here applies.

## The bail-out

Every subscriber keeps what its selector returned last and delivers only on a
different reference: the window views (redux-toolkit.ts:274-283), the read views
(:529-543), the relation views (:670-682) and the single listeners (:750-765), the
same check the churn wiring makes (:366-373). That is react-redux `useSelector`'s
default equality (react-redux.mjs:958-962). Every selector returning an array is
declared with `SHALLOW_RESULT` (:211), reselect 5's `resultEqualityCheck` set to
react-redux's `shallowEqual` (react-redux.mjs:454-468): when a recomputed array holds
the same elements as the last one, reselect returns the last one
(reselect.mjs:151-156), so a write elsewhere in `entities` no longer delivers a view
whose rows did not change. The cell wiring (`pin`, :300-329) keeps each cell's last
string and delivers a column's consumer only when one of its cells is not `===` its
last — one `useSelector` per cell, written as one listener.

## Batching

Redux's `dispatch` notifies every listener before it returns, and the Redux style
guide's "Avoid Dispatching Many Actions Sequentially" says to dispatch one event that
makes all the updates instead. `frame` does that for row writes: it buffers the edits
and dispatches one `edited` action as it returns (`rowEditorOf`, redux-toolkit.ts:178-204),
so the listeners run once per frame. A nested frame joins the outer buffer. Cursor,
owner, pair and single writes are their own actions and are not buffered; no script
issues one inside a frame. `configureStore`'s default enhancers include
`autoBatchEnhancer` (redux-toolkit.modern.mjs:424-429), but it defers only actions whose
`meta` carries `SHOULD_AUTOBATCH` (:405-417), and no action here does, so every
dispatch notifies before it returns.

## Code volume

The figures are `npm run lines`' cell for each wiring; they have not been re-run since
this edit. What each wiring holds beyond the median, and why the library needs it:

- **Every wiring pays for the store recipe.** The edit model shared by every row store
  (`applyEdit`, the `edited` reducers and `rowEditorOf`, redux-toolkit.ts:57-204), and
  `configureStore` with the production middleware options (:206-209). Redux has no
  batch of its own, so the buffered single action is how a frame notifies once.
- **churn.row**: the rows slice and the editor above, plus the per-subscriber
  `store.subscribe` with its own last-value comparison (:366-373). Redux's listener
  receives no change information, so the selected-value compare is the only edge a
  subscriber has.
- **relations**: three slices — rows, owners (:590-606), pairs (:610-627) — because a
  reference-identical branch is what lets the untouched view's memo hold; and two
  `createSelector`s plus the bail-out in `holdRelation` (:654-684).
- **single**: a slice of two values with a seed reducer and a write reducer, the store,
  two `store.subscribe` listeners each comparing its value (:716-789).
- **reads.byKey**: the binding is the same for every read shape, so it carries both
  views: the grouped slice with its regrouping (:126-171), the `view` slice (:477-489),
  the two memoised selectors and the bail-out subscriber (:508-543), and the shared
  top-k selection (:219-238).
- **bind**: the grouped slice with its regrouping (:126-171), the selection (:219-238),
  one memoised selector per view and the one global subscriber (:260-283), and the cell
  wiring's listener (:300-329).

## Unverified

Nothing in this card was re-run after the 2026-10-20 edit: no verify pass, no lines
cell, no `digest` (the value above is the 2026-10-17 one and is now stale). The claim
that `useSelector` is how an ordinary user consumes this store comes from react-redux
being the documented React binding; this bench drives no React. In the single wiring,
the cells, `churn.column` and the churn chain and diamond the selected value is a
string, so `===` there is a value comparison; it is applied because it is
`useSelector`'s default — the same rule now applied to `churn.column`, which this card
previously declined under B3 for exactly that comparison. `react-redux` is reached as an
undeclared, hoisted dependency.
