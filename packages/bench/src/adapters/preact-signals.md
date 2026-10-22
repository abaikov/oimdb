# How consumption is forced, and the dependency edge that is easy to lose

Companion to `packages/bench/src/adapters/preact-signals.ts`.

## How consumption is forced

A preact computed is pull-based: it marks itself dirty and does nothing until
someone reads `.value`, so left alone every write here would be almost free and
every number a lie about a store that had not derived anything. Each view
therefore ends in a real `effect` — the one primitive preact cannot defer —
which the runtime RUNS at the end of the outermost batch.

EVERY METHOD THAT WRITES MORE THAN ONE SIGNAL IS WRAPPED IN `batch` — `write`,
`remove`, `setGroup`, `setRank` in a binding with buckets, `switchGroup`, the owner and pair
seeding — and that is a requirement
rather than an optimisation: without one, preact flushes effects on EVERY signal
write, so loading 10 000 rows would render 10 000 half-filled windows. A method
that writes ONE signal has no wrapper: preact's setter opens and closes its own
batch (`src/index.ts:461-485`), so a wrapper would price an entry and an exit the
task does not contain.

`frame(run)` is `batch(run)` (`src/index.ts:95`). A script that makes several
writes before one `settle()` makes them inside it, so they reach preact as one
batch and the effects run once, when it returns. The batches inside `write` and
`setGroup` nest: preact's `batch` at depth > 0 only calls the function.

## What the views depend on

A ROW IS A SIGNAL PER MUTABLE FIELD (`group`, `rank`, `label`, `note`; `id` is
immutable and a plain field), the way a signals library models an entity. A
view is a computed plus an effect. Every bucket is kept sorted by `rank`, then
the plain `id`, at write time: a row joining a bucket is spliced in at the
position a binary search finds, a `rank` change splices it out and back in at
its new position, and a row leaving is spliced out. The computed reads only its
group's bucket signal and slices the window, so a `label` or `note` patch never
re-selects and no view sorts. The effect reads the `rank` and `label` of the rows
the computed selected, so a `label` patch to a visible row re-delivers that view,
and a `note` patch re-delivers nothing that does not read `note`. A `rank` or
`group` change to any row of the group writes a new bucket array, which re-runs
the computed, whose fresh array re-runs the effect.

The cell wiring reads one field signal per pinned row per column directly, with
no computed between: a `note` write cannot reach the label cell effect at all.

A replacing `write` sets all four field signals of a held row inside one
`batch`; preact's `!==` on each field signal decides what that wakes. Delivered
rows carry `id`, `rank` and `label` read through the signals; `group` and
`note`, which no consumer reads, are empty strings.

## What a row subscription reads

`churn.row` and `churn.wide` subscribe to the WHOLE row, as `TChurnBinding`
(types.ts:55-60) and SCENARIOS.md define the shape. With a signal per field, the
effect reads all four field signals of each row it covers and renders the label
(`labelOfWholeRow`), so a write to any column of the row wakes it. `churn.column` is
the contrast: an effect reading the `label` signal alone.

## The edge that would be easy to lose

THE EDGE THAT WOULD BE EASY TO LOSE is the row that MOVES IN. A row in group Z
is not a dependency of view A, so writing its field signals cannot wake view A —
and must not, until it belongs to A. The bucket gets a NEW array, because preact
decides "did this change?" by `!==` and a mutated array written back would
notify nobody; once the newcomer lands inside the window, the effect reads its
`rank` and `label` signals for the first time, acquiring the dependency edges for
every later write.

## Why an effect's first run is not a wake-up

preact runs an effect body once on creation, and that run IS the mount: it is
how the effect learns which signals it reads. Counting it would report `N`
wake-ups for `N` mounts before any row had been written, and the reference model
states independently that the mounted frame wakes exactly the standing count.
