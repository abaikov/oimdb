# What a Redux selector has to be told, and what the index cannot spoil

Companion to `packages/bench/src/adapters/redux-toolkit.ts`.

## How consumption is forced

A Reselect selector is PULL-based — a memoised function that recomputes when
CALLED and never on its own — so a benchmark that stopped at `dispatch` would be
measuring an empty room. `store.subscribe` closes it, and it does not call its
listener on subscribe, so the untimed opening delivery is made explicitly.

## When a view is delivered

Every window, read, relation and single subscriber keeps what it selected last
and delivers only when the selector returns a different reference — react-redux
`useSelector`'s default equality, applied here without React. The selectors are
memoised by Reselect, so a dispatch that leaves a view's inputs
reference-identical (an Immer no-op re-send, a scroll or a switch for view B, an owner write
for the pair view) delivers nothing to that view.

When the inputs DO move — any write to `entities` moves every view's input — the
selector re-runs and builds a fresh array. Every selector that returns an array
is therefore declared with `memoizeOptions: { resultEqualityCheck: shallowEqual }`,
the Reselect 5 option its docs pair with react-redux's `shallowEqual`: a fresh
array holding the same row objects as last time is discarded and the previous
reference returned, so the view is not delivered. Immer keeps every untouched row
object identical, which is what makes that comparison mean "the window did not
change". `shallowEqual` is imported from `react-redux` (9.2.0, hoisted into the
root `node_modules`), which loads React's module but renders nothing.

The cell wiring is one `useSelector(state => entities[id].label)` per cell and
one per note, written as one listener: each cell compares its own selected string
with `===` and a column's consumer is delivered only when one of its cells moved.

## What a frame is to Redux

Redux's `dispatch` runs every listener before it returns, and the style guide
says to "avoid dispatching many actions in a row" and dispatch one event that
makes all the updates instead. So every row write goes through one reducer,
`edited`, whose payload is a list of edits (`write`, `remove`, `patch`). Outside
a frame each write is one action carrying one edit; inside `frame(run)` the
edits are buffered and dispatched as ONE action when the frame returns, so the
listeners run once and the store never holds a half-applied frame. The buffer
holds what the script wrote and nothing else: no value is compared on the way in.

Only row writes are buffered; a cursor, owner, pair or single write is its own
action, and no script issues one inside a frame. RTK's `autoBatchEnhancer` is in
`configureStore`'s default enhancers, but it only defers actions carrying the
`prepareAutoBatched` flag, and none here does.

## Why a group array is rebuilt once per action

A move or a removal takes an id out of its group array. Splicing it out of the
draft once per id would be `indexOf` over the Immer proxy per id. The `edited`
reducer instead records which ids leave and join each group and, after all edits,
rebuilds each touched array ONCE by filtering the array from `original(...)` —
Immer's "read from the original state, not the draft" performance tip. An id that
leaves and comes back inside one action cancels out.

## What the development middleware would have measured

`immutableCheck` and `serializableCheck` are off: development-only middleware
RTK itself strips from production builds, and a 10,000-row payload walked twice
per dispatch would be measuring the dev harness. Immer's auto-freeze is left ON:
it is Immer's default in production too, and every part of a state the reducer
produced is frozen on the way out, so its cost is part of what a production RTK app pays.

## Why the group index cannot spoil a write that changes nothing

THE INDEX DOES NOT SPOIL THAT: a re-send changes no row's group, so
`state.idsByGroup` is not so much as read, and every path that DOES touch it has
already modified `entities` in the same reducer.

Both halves land in ONE draft and therefore one state object, which is what
makes the index unable to disagree with the rows: the listener runs after the
reducer has committed, so there is no window in which a view could derive over a
bucket that had caught up while `entities` had not.

WHAT THE INDEX DOES NOT CHANGE: not one wake-up. It shortens the SCAN each
re-run performs and does nothing else — it is not a dependency edge and Redux
has nowhere to put one.

## What the counter on a subscription-churn row counts

SO `woke` COUNTS THE SUBSCRIBERS WHOSE SELECTED VALUE CHANGED, not the bodies
that ran. Every body still runs inside the timed frame, so the TIME carries
Redux's global notification while the COUNTER stays the same quantity every
other row of the table reports. In these scripts the two coincide anyway — every
standing subscriber reads the one row the frame writes.

## Which arm of the audit bites

`readAll` reads THE WHOLE RECORD AND NOT THE BUCKETS, deliberately:
`idsByGroup` is what the views walk, so an audit enumerating it could agree with
a view about a row that had fallen out of both. The group audit walks
`idsByGroup` EXACTLY AS THE SELECTOR WALKS IT, in the same two steps and the
same order: a row the bucket LOST is caught there and by nothing else, while an
id the bucket wrongly kept is skipped there exactly as the view skips it — the
store would not render it, so the audit must not claim it does.
