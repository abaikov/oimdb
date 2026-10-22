# What a zustand selector is re-run for, and what it compares

Companion to `packages/bench/src/adapters/zustand.ts`.

## The recipe

One vanilla store per wiring, built with `createStore` from `zustand/vanilla`
and wrapped in the `subscribeWithSelector` middleware: the README's "Using
zustand without React" and "Using subscribe with selector" sections
(`node_modules/zustand/README.md:192-251`), with state "updated immutably"
(`README.md:31`). The state is the normalised shape:
`entities`, the rows by id, and `idsByGroup`, an id list per group. Every
`setState` updater returns new objects for what it changed and reuses the rest:
the changed rows, the `entities` record around them, and a group's id list only
when that list changed. Nothing is mutated in place.

## How consumption is forced

The store's own `subscribe` is a `Set` of listeners that `setState` calls before
it returns (`esm/vanilla.mjs:3-17`). `subscribeWithSelector` replaces it with a
version that takes a selector, an `equalityFn` (default `Object.is`) and
`fireImmediately`, runs the selector on every notification and calls the
listener only when the equality says the slice moved
(`esm/middleware.mjs:249-271`). Every consumer here is one of those listeners,
and the listener is what calls `deliver*`.

That is the same contract a React component gets from `useStore(store,
selector)`, which hands the selector to `useSyncExternalStore` and so re-renders
on an `Object.is` change of the slice (`esm/react.mjs:5-13`). Where a selector
returns a freshly built array — a window, a page, the pinned cells, the relation
texts, the wide churn subscriber's rows — the equality is the shipped `shallow`
from `zustand/vanilla/shallow`, which is exactly what `useShallow` applies
(`esm/react/shallow.mjs:4-10`). It is imported from `zustand/vanilla/shallow`
rather than `zustand/shallow` because the latter re-exports `useShallow` and
with it React (`esm/shallow.mjs:1-2`).

No comparison of values in this adapter is its own: the value checks are
`vanilla.mjs:6`, the middleware's `equalityFn`, and `shallow`. The churn
listener's `slice !== previous` tells the `fireImmediately` call, where the
middleware passes the same slice twice, apart from a real notification.

## What a frame is to zustand

zustand exports no batch, and `setState` notifies synchronously. The zustand way
to apply several changes at once is ONE `setState` that makes all of them, so
`frame(run)` buffers the row writes issued inside it — what was written, in
order, with nothing compared — and applies them as one `setState` when it
returns: `entities` is copied once, each touched group list once, and every
listener runs once. Outside a frame each write is its own `setState`. Cursor,
owner, pair and single writes are not buffered; no script issues one inside a
frame.

## What every `setState` costs

- `setState` runs EVERY listener of the store, whatever changed: there is no
  per-key routing in zustand. Each listener runs its selector.
- A window selector re-derives its group's top-k from that group's id list
  (`selectionOf`) on every `setState`, and `shallow` then compares the window
  element-wise — building two `Map`s, because an array has `entries`
  (`esm/vanilla/shallow.mjs:2-18`, `:43-46`). So a write to group B costs view A
  a top-k and a comparison, and delivers nothing to it.
- A `setState` spreads the whole `entities` record — the documented immutable
  update, and the price of a fresh reference for the rows it changed; a point
  write outside a frame pays it for one row.
- A re-send of unchanged values, or a patch with the value already stored,
  makes fresh row objects and so notifies; the window selectors return windows
  holding those fresh objects and both views are delivered with text they
  already showed. Nothing in zustand compares values before notifying. The
  shipped `immer` middleware would make such a write a no-op the way Immer does
  for Redux Toolkit; it is not the recipe the README leads with and is not used.

## The cells and the relation views

The pinned cells are two `subscribeWithSelector` listeners, one selecting the
pinned rows' `label` strings and one their `note` strings, both compared with
`shallow` and both `fireImmediately`, which delivers the opening render at
`pin`. A label write therefore delivers the label consumer only. The relation
views select the owners' names and the pairs' marks the same way, so an owner
write does not deliver the pair view and a pair write does not deliver the
owner view — but both selectors run on every `setState`.

## The churn wiring

One listener per subscriber on one store. A row subscriber selects
`entities[id]` with the default `Object.is`; the wide subscriber selects the
tuple of its rows with `shallow`; the column subscriber selects `entities[id].label`
with `Object.is`, so a write to another column of the row does not wake it. The
mount subscribes with `fireImmediately`, so the selector runs once at mount and
the listener records the current read from that one run; that call is not a
wake. `woke` is incremented only on a middleware-filtered notification;
`unmount` deletes the listener from the `Set` and clears the read slot.

Every `setState` still runs every standing subscriber's selector, so the time of
a churn frame carries zustand's global notification while `woke` counts only
the listeners whose slice moved.

## How chain and diamond are wired

zustand has no derived value: a selector is a plain function re-run per
notification. The wiring is the memoised-selector pattern a zustand user
writes, with `reselect` `createSelector` as the memoiser. Chain: level 1 is a
selector over `entities` that joins the window's labels and applies
`chainLevelOf`; each further level is a `createSelector` over the level below.
Diamond: `diamondLeftOf` and `diamondRightOf` are two selectors over the root
label, `diamondJoinOf` a third over both. The subscriber is one
`subscribeWithSelector` listener on the top selector, so it wakes only when
that selector's string changes, once per `setState`.

Every `setState` still runs the top selector, and level 1 of the chain runs per
`setState` because its input, `entities`, is replaced by every write; the levels
above it are skipped when its string is unchanged.

## Which arm of the audit bites

`readAll` reads `entities`; `groupOrder` walks `idsByGroup` the way the window
selector walks it, so a row its group list lost is caught there and nowhere
else.
