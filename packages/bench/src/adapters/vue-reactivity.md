# What a frame is when the library exports no batch, and what the views depend on

Companion to `packages/bench/src/adapters/vue-reactivity.ts`. Line numbers into the
library are `node_modules/@vue/reactivity/dist/reactivity.cjs.prod.js`, the build a
worker loads: `index.js` picks it under `NODE_ENV=production`, which
`src/harness/measureBatch.ts` sets. Declarations are `dist/reactivity.d.ts`.

## The recipe

The same shape as `preact-signals.ts` and `alien-signals.ts`, primitive for primitive:
a row is a `shallowRef` per mutable field (`group`, `rank`, `label`, `note`; `id` is
immutable and a plain field), a `shallowRef` per group holding that group's row
records, a `computed` per view over its bucket, and an `effect` per view that
delivers. `shallowRef` and not `ref`: Vue documents `shallowRef` as the choice for
performance (https://vuejs.org/api/reactivity-advanced.html#shallowref); for a
primitive the two differ only by the `toRaw`/`toReactive` work `ref`'s setter does.

A ref's setter compares with `hasChanged` (`Object.is`, :1428), the library's own
check: a re-sent row writes four field refs, and a field whose value did not change
triggers nothing.

## What a frame is

`@vue/reactivity` 3.5.43 HAS a batch internally — `startBatch` at :311 and
`endBatch` at :314-348 — and does not export it: the export list (:1856-1905) and
`dist/reactivity.d.ts` carry neither. What it does export is the `scheduler` option
of `effect` (`ReactiveEffectOptions.scheduler`, d.ts :270-274): a triggered effect
with a scheduler calls it instead of running (`ReactiveEffect.trigger`, :277-285).
That is the hook `@vue/runtime-core` builds its job queue on (`watch` sets
`effect.scheduler`, :1794), and the queue itself is not in this package.

So every effect here is created through `createEffectQueue().effect`
(vue-reactivity.ts:127-148): its scheduler adds the runner to a `Set`, and `settle`
drains the set, running each runner whose `effect.dirty` (d.ts :309; `isDirty`,
:376-386) is set — what the default trigger does in `runIfDirty` (:289-293), moved
to the frame's commit. `frame(run)` calls `run()`: writes only queue. This is the
same mechanism the valtio row gets, where a sync listener marks and `settle` renders.

`dirty` is not a value check written here: it compares the dep versions Vue keeps,
and is what lets a `note` write that re-ran a label `computed` with an unchanged
result leave the effect over it asleep (a computed bumps its version only when
`hasChanged` says its result differs, :408).

Two things that look like a batch and are not used:

- `effectScope().pause()`/`resume()` (:51-86, per effect :223-236) queue a paused
  effect's triggers and replay each once. It exists so a component kept alive
  off-screen stops reacting; as a frame it would walk every effect in the scope twice.
- `startBatch`/`endBatch` from the internal build: not exported, not declared.

## Buckets

A bucket is kept sorted by `rank`, then the plain `id`, and mutated in place — a load
splices each record in at the position a binary search finds, a move splices one record
out and into the destination the same way, a `rank` change splices it out and back in at
its new position, a removal of up to eight ids splices each out, a larger
removal compacts each touched bucket once — and
announced with `triggerRef` (:1437-1443), which Vue documents for exactly this:
"used after making deep mutations to the inner value of a shallow ref"
(https://vuejs.org/api/reactivity-advanced.html#triggerref). A move writes the
row's `group` ref and triggers both buckets; with effects deferred to `settle`,
the order of those writes no longer decides how often a view delivers.

## What the views depend on

A view's computed reads only its bucket, already in rank order, and slices the
window, so a `label` or `note` patch never re-selects and no view sorts. Its effect
reads the `rank` and `label` of the records the computed selected, so a
`label` patch to a visible row re-delivers that view and a `note` patch re-delivers
nothing that does not read `note`. A `rank` or `group` change to any row of the
group triggers the bucket, which re-runs the computed, whose fresh array re-runs the effect.

The read wiring keeps view A's group and offset in two refs (`$group`, `$offset` in
`bindReadStore`). A `paged` computed slices the group's bucket at the offset, so a
`scrollTo` re-runs only the slice; `switchGroup` writes
both refs, and the effect queued twice is in the set once.

The cell wiring reads one field ref per pinned row per column directly
(:313-339): a `note` write cannot reach the label cell effect at all.

## Row, column, chain and diamond

`churn.row` and `churn.wide` subscribe to the WHOLE row, as SCENARIOS.md defines the
shape: with a ref per field, the effect reads all four field refs of each row it
covers and renders the label (`labelOfWholeRow`, vue-reactivity.ts:439-444), so a
write to any column of the row wakes it. `churn.column` is the contrast and reads the `label` ref only.

The chain and diamond are Vue's `computed`; the column is the effect reading the `label` ref,
which a `note` write never reaches. An effect over a computed re-runs only if a
dependency's version moved (`isDirty`, :376-386). The diamond's
two branches each notify the join; the effect over it is in the queue once, and
`settle` runs it once.

## Why an effect's first run is not a wake-up

`effect` runs its body once on creation (:457-474), synchronously and without
the scheduler, which is how it learns what it reads. That run is the mount: it
records the subscriber's read in its slot and is not counted. `stop(runner)`
(:475-477) unlinks the effect, and a computed left with no subscriber unlinks from
its own sources (`removeSub`, :423-445), so an unmount of a chain or diamond takes
its computeds off the row's refs with it. A stopped runner still in the queue has
no deps left, so `dirty` is false and `settle` skips it.
