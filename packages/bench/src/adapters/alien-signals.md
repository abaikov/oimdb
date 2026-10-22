# What alien's graph decides, and what it cannot skip

Companion to `packages/bench/src/adapters/alien-signals.ts`. The row's admission and departure
statements: see `packages/bench/PARTICIPANTS.md`.
https://github.com/stackblitz/alien-signals#basic-apis

## How consumption is forced

An alien computed is pull-based — it only recomputes when something CALLS it — so a benchmark that
ended at a computed would be measuring a derivation that had not happened. Each view therefore ends
in a real `effect`, queued by the write and run synchronously by `endBatch`.

## What the dedupe on identity rules out

alien dedupes a signal write on `!==`, so a bucket array mutated in place and written back would
propagate to nobody. The bucket is therefore mutated in place and announced with `trigger`, the
README's documented way to notify the dependents of a signal whose value was mutated directly
(README.md "Manual Triggering", esm/index.mjs:154-175). Every bucket is kept sorted by `rank`, then
`id`: a load splices each handle in at the position a binary search finds, a move splices one handle
out and into the destination the same way, a `rank` change splices it out and back in at its new
position in the same bucket, a removal of up to eight ids splices each out and triggers
its bucket, a larger removal compacts each touched bucket once, and one `trigger` call names every
touched bucket. The read store keeps a second bucket per group holding only the rows on the second
axis, maintained on the same paths, and view B reads that bucket. The result array of a view is fresh on every recompute, because a
buffer handed back a second time would tell the effect nothing moved. NO HAND-ROLLED VALUE DIFF —
see `TBinding.write`: a row is a signal per mutable field (`group`, `rank`, `label`, `note`;
`id` is immutable and is a plain field), and a replacing write sets all four inside one batch.
alien's own `!==` on each field signal decides what that wakes; the adapter compares nothing.

## Where the batches are, and what the first run of an effect is

Outside a batch alien flushes the effect queue on EVERY signal write, so loading 10 000 rows would
render 10 000 half-filled windows: every method that writes more than one signal — `write`,
`setGroup`, `setRank` in a binding with buckets, `switchGroup`, the owner and pair seeding — runs
inside `startBatch`/`endBatch`. A method that writes
one signal calls the setter bare: an unbatched write flushes once as it returns
(esm/index.mjs:301-311), which is what a batch of one would do too.

`frame(run)` runs `run` between `startBatch()` and `endBatch()` (esm/index.mjs:67-74). A script's
several writes before one `settle()` therefore reach alien as one batch; the batches inside `write`
and `setGroup` only move the depth counter, and the queue flushes at the outermost `endBatch`.
`settle()` has nothing left to do.

THE FIRST RUN OF AN EFFECT IS NOT A WAKE-UP: alien runs the body once on creation, and that run IS
the mount — it is how the effect learns what it reads.

## What a signal's granularity leaves the column scripts

A ROW IS A SIGNAL PER MUTABLE FIELD, the way a signals library models an entity. Each view is a
computed plus an effect: the computed reads only its bucket signal, which is already in rank
order, and slices the window, so a `label` or `note` patch does not re-select anything and no
view sorts; the effect reads the `rank` and `label` of the rows the computed selected, so a `label`
patch to a visible row re-delivers that view and a `note` patch re-delivers nothing that does not
read `note`. The group-A window computed returns a fresh array, so a `rank` or `group` change
anywhere in its bucket, which triggers the bucket, re-runs its effect.

`churn.row` and `churn.wide` subscribe to the WHOLE row, as `TChurnBinding`
(types.ts:55-60) and SCENARIOS.md define the shape: the effect calls all four field
signals of each row it covers and renders the label (`labelOfWholeRow`), so a write to
any column of the row wakes it. `churn.column` is the contrast: an effect reading the
`label` signal alone.

In the cell wiring, `pin` resolves the pinned row records once; the label cell effect reads each
record's `label` signal and the note cell effect its `note` signal directly, so a `note` write
reaches only the note cell and no computed sits between.

Delivered rows carry `id`, `rank` and `label` read through the signals; `group` and `note`, which no
consumer reads (`render.ts`), are filled with empty strings and read from nothing.

## Value checks that were taken out

REMOVED: `if (row.label === label) return;` and `if (row.note === note) return;` — value checks
alien has none of; a field write goes straight to that field's signal, and alien's own `!==`
dedupe is what skips an unchanged one.
