# What a unit re-computes, and what Effector's own skip decides

Companion to `packages/bench/src/adapters/effector.ts`. The row's admission and departure
statements: see `packages/bench/PARTICIPANTS.md`.

## Which store the population lives in, per wiring

`combine` and `.map` fix their inputs when they are created, and `bind` must produce an EMPTY
store, so a view cannot be built over per-row stores that do not exist yet. What IS known at bind
is which groups are watched. So the window wiring keeps ONE STORE PER GROUP, created on first ask —
for the watched groups, at bind — and each view is a `.map` of its own group's store. A point write
copies that group's Map, not the population's, and wakes only the view over that group; under
`bindPerGroup` one write recomputes one view of fifty. An id → group-node table beside the stores
holds handles only.

The cell wiring, built by `pin`, is a `.map` per pinned cell and column — the row's group store
mapped down to that row's `label` or `note` string — and one `combine` per column over its cells.
`.map` skips an update whose result is `===` the previous one, so a label write updates the label
cell alone, the note `combine` never recomputes, and only the label consumer is delivered. That is
the library's skip on a primitive, not a comparison written here.

The read wiring keeps the population in ONE store holding the rows Map and the group index. Its
two views are over one group, so a partition would not separate them, and view A must re-point to
another group on a switch: a `combine` cannot change its inputs, so the group view A selects has
to be a value it reads — the cursor store — over a store that holds every group. A partition was
considered and not made: four of the five read scripts write nothing, the fifth writes four moves,
and a partitioned store would turn `readByKey`'s one `Map.get` per key into an id → group lookup
plus two more, moving cost onto the row whose lookup IS the measurement. A `combine` over fifty
group stores would also need every group's name at bind, which `TViewConfig` does not carry.

The churn and relation wirings subscribe AFTER the load, to rows already resolved, so a store per
row is expressible there and they use it.

## A move between group stores

EFFECTOR GIVES A REDUCER ONLY ITS OWN STORE'S STATE, so no single reducer can move a row from one
group store to another. A move is therefore two operations on two stores: the old group's store drops
the id, the new group's store takes the row. The row the second event carries is read out of the
first store with `getState()` in the binding method, before either operation is applied — outside
the graph, not inside a reducer, which is where the churn wiring reads its rows too. Outside a
frame the two are two launches, and between them the row is in neither store; the only watcher
that runs in between is the old group's view, which must not show the row either way, and each of
the two views is woken by exactly one of the two events. Inside a frame both are queued and land
with the rest of the frame.

In the read wiring the group index sits inside the same store value as the rows, because there the
move is ONE reducer and has to see the row's previous group.

## What a frame is to Effector

Effector 23 exports no `batch(fn)`: every event call is its own launch, and the kernel runs the
reducers, derivations and watchers it reaches before the call returns. `sample`'s `batch` option
coalesces updates inside one launch, not across separate event calls, so it is not a frame batch.
Effector's own answer to a bulk edit is ONE EVENT WHOSE PAYLOAD IS THE ARRAY of changes, reduced
by one `.on`.

So in the window and cell wirings each group store has one event, `opsApplied`, carrying an
ordered array of `write` / `patch` / `drop` operations, and its reducer copies the Map once per
call however many operations it applies. Outside a frame every binding method fires it with one
operation. Inside `frame(run)` the methods queue their operation on the store they target, and
when `run` returns each touched store's event fires once with its queue: a frame of N patches
over G groups is G events, G Map copies and one recompute per touched view, where it was N of
each. No value is compared; a `patch` of a row the store no longer
holds is skipped exactly as before, by the reducer finding no row.

A move needs the row's current value, and a reducer sees only its own store. `setGroup` reads it
with `getState()`; if this frame already queued an operation on that row, the old store's queue is
fired first so the value read is current. No script moves a row it wrote earlier in the same frame
(`moveAndReorder` moves first and re-ranks after; `mixedFrame`'s sets are disjoint, `makePlan`),
so that early fire is a correctness guard no timed script reaches.

The churn, read, relation and single wirings call `run()` directly, because no frame there writes
one store twice. In churn every row is its own store, and the three scripts that open a frame on
it write distinct rows: `churnList` writes `churnRows[0..count)` once each (`writeFrame`,
`scenarios.ts`, the only multi-write path; a count of one opens no frame), `appFill` writes
`APP_FILL_WRITTEN` (even cards 0–78, decks 80–84, user 90) and `appRound` writes decks 80–89,
cards 0–79 and one user in 90–94 (`APP_DECK_FROM`, `APP_USER_FROM`). Every other `frame` call in
`scenarios.ts` is a window-wiring script; no read, relation or single script opens a frame.

## Where Effector's identity skip can and cannot fire

Effector drops an update whose new value is `===` the old one. A derived window array is fresh on
every recomputation, so a `.map` here never skips and re-sending an unchanged list wakes the
watcher with identical text. On one value the skip does fire: Effector skips an update whose
reducer returns the state the store already holds, and that skip is the LIBRARY'S — this file
supplies no comparison. A store's `updateFilter` option could narrow a view further, but the
comparator handed to it would be written here, which `TBinding.write` forbids; it is not used.

## What a mount is, and what a column node does not buy

`.updates` and not `.watch`: Effector documents `.updates` as the way to subscribe to changes WITHOUT
the initial call, so a mount is a mount and not also a wake-up. A column is `.map` down to the
STRING, a genuine column identity built out of the library's own equality — what it does NOT buy is
a cheaper MOUNT, because a column node and a row node are the same node, and that is this row's
finding rather than a gap in the wiring.

## The derivation shapes

The chain is a `combine` over the sources followed by `.map` levels, the diamond two `.map`s of the
root row's store and a `combine` of both; each level applies the `derivations.ts` function it is
defined by and nothing else. The minified kernel (`effector.mjs`) carries a `priority:'barrier'`
step with `batch:1`; whether that step is what keeps the diamond's join to one run per write was
not traced, and the diamond script's check is what asserts it.

## The view switch

View A's cursor — its group and offset — is ONE store written by two events, `scrolled` and
`switched`. A switch is one event, one update of the cursor, and one recompute of view A over the
new group; view B is a `.map` of the population store alone and does not hear it.
