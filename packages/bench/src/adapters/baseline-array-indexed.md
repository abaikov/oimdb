# What a group index buys, and what the bucket costs to keep

Companion to `packages/bench/src/adapters/baseline-array-indexed.ts`. The row's admission and departure
statements: see `packages/bench/PARTICIPANTS.md`.

## What the index is, and what is part of it

This file is `baseline-array` with a group index. The index is two things a person keeping one writes
together: a bucket of rows per group, and the set of buckets written since the last settle. A write
names the bucket it touched (two for a row that changed group), and a settle re-derives the views over
those buckets and leaves every other view alone. Having a bucket per group and still re-rendering all
fifty on a one-row write is not what a hand-written store with that bucket does, so the gap to
`baseline-array` is the price of the index including the routing it makes possible.

## It is the denominator, so it does only what the screen needs

Every ratio the cell runner publishes is divided by this participant wherever it takes part
(`cells/participants.ts` `anchorFor`; `baseline-array` only where this one declines). A denominator
that does redundant work makes every library look closer to the floor than it is, so the view wiring
skips what a person writing it would skip:

- a `note` write marks no view: no window renders `note` (`harness/render.ts` `deliver` renders id,
  rank and label);
- a `label` write marks its group only when the entity is in a window of that group;
- a `rank` or `group` write marks a group when the entity was in its window or now ranks inside it
  (a window not yet full counts as entered).

The check is an `includes` over a window of at most 32 and one comparison against the window's last
entity: what a hand-written screen keeps anyway, since it already holds what it rendered. In the cell
wiring every point write still marks, because the cells are the screen there.

What is NOT added: no coalescing beyond one settle, and no sort. A sort would make the gap the price of the
index PLUS a sort against a selection, where the top-k every sibling runs spends one comparison on
each row that will never be shown.

The read binding keeps one dirty flag per view. A write marks view A when it touches the group A is
paged over, and view B when it touches group A; a scroll or a view switch marks view A alone, so view B
is never re-derived by either. In the cell wiring each column has its own flag and a settle
re-delivers only the written column. The row wiring walks from the dirty groups to the views over
them rather than probing every view.

## Why the bucket is an array and not a set

No consumer reads the bucket in order: every selection is a top-k over a total order and `groupOrder`
sorts a copy. A bucket is therefore left by swapping its last row into the vacated position, O(1),
with each row's position kept in a side `Map`. On the keyed read, where no group index is touched, the
gap between the two anchors is expected to be nothing, and that is a result: it says the index is not
what a keyed read pays for.
