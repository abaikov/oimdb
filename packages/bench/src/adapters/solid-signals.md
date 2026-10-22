# solid-js: which build runs, how consumption is forced, and the edge that is easy to lose

Companion to `packages/bench/src/adapters/solid-signals.ts`. Line references into the
library are to `node_modules/solid-js/dist/solid.js` (1.9.15) unless another file is named.

## Which build runs

`solid-js` declares conditional exports (`node_modules/solid-js/package.json`, the `"."`
entry): under `"node"`, `"worker"` and `"deno"` it resolves to `dist/server.js`, and only
under `"browser"` (or no matching condition) to `dist/solid.js`. Every bench worker is
spawned as `node --expose-gc --import tsx worker.ts …` (`src/harness/measureBatch.ts`,
`runWorker`) with no `--conditions=browser`, so a bare `import 'solid-js'` loads the SSR
build. There `createEffect` is `function createEffect(fn, value) {}` (`dist/server.js:78`),
`createSignal` is a closure with no observers (`dist/server.js:62-66`) and `batch` only
calls its argument (`dist/server.js:102-104`): nothing would ever be delivered.

The adapter therefore imports `solid-js/dist/solid.js` by path, which the package's own
`"./dist/*"` export permits, and types it with the package's `types/index.d.ts` through
`import type * as SolidApi from 'solid-js'`. The one `@ts-expect-error` above the import is
the TS7016 that path produces: no `.d.ts` sits beside `dist/solid.js`. `dist/solid.js` is
the production reactive build (`IS_DEV = false`, :149), not `dist/dev.js`.

## Why there is no `solid-js/store`

`createStore` is the collection API Solid's documentation leads with, and it is not used.
`store/dist/store.js:1` imports `batch`, `getListener` and `createSignal` from the bare
`solid-js`, so under node the store's proxies would be built on the server build's
signals, which no effect from `dist/solid.js` can observe; and `solid-js/store` itself
resolves to `store/dist/server.js` under `"node"`. Reaching a reactive store would take a
process-wide `--conditions=browser`, which changes the resolution of every other library
in the worker. What remains is Solid's signal layer, used the way the preact and alien
rows use theirs: a row is a signal per mutable field (`group`, `rank`, `label`, `note`; `id` is
immutable and a plain field), and there is one signal per group bucket.

## How consumption is forced

A `createMemo` is eager inside Solid (a marked memo goes into the `Updates` queue, :670,
which `completeUpdates` drains before the effects, :835-840), but a view still needs something that RUNS: each view
ends in a `createEffect`, the user effect Solid runs after pure computations
(`runUserEffects`, :900-921). Every effect is created inside a `createRoot` whose
`dispose` is what the adapter keeps; disposing the root cleans every computation it owns
(`cleanNode`, :946-979), which is how `unmount`, `pin` and `dispose` take subscribers down.
An effect created inside `createRoot` is queued and run when the root's `runUpdates`
completes (`createEffect`, :222-229; `createRoot` → `runUpdates(updateFn, true)`, :177-197),
so its first run — the mount — happens before `createRoot` returns.

`frame(run)` is `batch(run)` (:452-454), which is `runUpdates(fn, false)` (:819-834): a
write inside it only marks observers (`writeSignal`, :652-684); the queues run once, when
the outermost `runUpdates` returns, and a nested `runUpdates` only calls its function
(:820). Methods that write several signals — `write`, `remove`, `setGroup`, `setRank` in a
binding with buckets, `switchGroup` — carry their own `batch`. A method that writes one signal calls the setter bare: the
setter (:206-211) calls `writeSignal`, which opens and closes its own `runUpdates`
(:663-681). `settle` is therefore a no-op in
the view, read and relation bindings, and in the churn and single bindings only turns
what the effects recorded into one delivery.

## What the views depend on

Every bucket is kept sorted by `rank`, then the plain `id`, at write time, so a view's memo
reads only its group's bucket signal and slices the window: a `label` or `note` patch never
re-selects and no view sorts. The view's effect reads the `rank` and `label` of the rows the
memo selected, so a `label` patch to a visible row re-delivers that view and a `note` patch
re-delivers nothing that does not read `note`. A `rank` or `group` change to any row of the
group announces the bucket, which re-runs the memo and effect. Solid's default equality is `===` (`signalOptions`,
:155-157), so the memo's fresh array always passes, as preact's `!==` does. A replacing
`write` sets the four field signals of a held row inside one `batch`; delivered rows carry
`id`, `rank` and `label` read through the signals, and `group` and `note`, which no consumer
reads, are empty strings.

Solid re-collects an effect's sources on every run: `updateComputation` calls `cleanNode`
first (:685-688), which pops every source, and `readSignal` pushes them back (:619-650).
That is the library's cost model for a re-run, not something the adapter adds.

## The edge that would be easy to lose

The row that MOVES IN. A row in group Z is not a dependency of view A, so writing its
field signals cannot wake view A until it belongs there. Under the default `===` a
mutated array written back would notify nobody, so every bucket signal is created with
`equals: false` (`bucketOfIn`), Solid's documented option for a signal that is always
treated as changed (`comparator: options.equals || undefined`, :204; `writeSignal`, :654).
A load splices each record in at the position a binary search on (`rank`, `id`) finds, a
move splices one record out and into the destination the same way, a `rank` change splices
it out and back in at its new position, a
removal of up to eight ids splices each out, a larger removal compacts each touched bucket
once, and each touched bucket is set to its own
array inside the batch (`fileRows`, `unfileRows`, `moveRow`, `rerankRow`). Once the newcomer
lands inside the window, the effect reads its `rank` and `label` getters for the first time,
acquiring the edge.

## Why an effect's first run is not a wake-up

`createEffect` runs its body once on creation, and that run is how it learns its
sources. It is the MOUNT: it writes the subscriber's read slot and is not counted.
`unmount` clears the slot to `undefined` after disposing the root.

## The derivation shapes

- `churn.row` and `churn.wide`: a subscription to the WHOLE row, as `TChurnBinding`
  (types.ts:55-60) and SCENARIOS.md define it. With a signal per field, the effect reads
  all four field getters of each row it covers and renders the label
  (`labelOfWholeRow`), so a write to any column of the row wakes it.
- `churn.column`: the effect reads the row's `label` getter directly; a
  `note` write touches a signal the effect never read, so nothing re-runs.
- `churn.chain`: level 1 is a `createMemo` over the `count` source rows returning
  `chainLevelOf(label of row from, 1)`; each further level is a `createMemo` over the one
  below. All `depth` memos are created inside the subscriber's root, so `unmount` disposes
  the whole chain.
- `churn.diamond`: two memos over root row `from`'s `label` signal and a third over both; the
  effect reads the join. A write marks the left and right memos STALE and the join and
  the effect PENDING (`markDownstream`, :935-945); a node is queued only while its state
  is clean (:669-670), so the join and the effect are each queued once, and the left
  memo's new value re-marks the join STALE (:673) so it recomputes once, in `runTop`
  (:790-818). The diamond script's check is what asserts the once-per-frame.

## Cells, reads, relations, single

- `pin` disposes the window root and builds, in a new root, one effect per column reading
  that column's signal of every pinned row, so a `note` write never reaches the label effect.
- `reads`: the viewed group and the window offset are read by a `paged` memo that slices
  the group's bucket, already in rank order, so a `scrollTo` re-runs only the slice and
  nothing sorts — the shape of the preact and alien read wirings. View
  B's memo reads neither signal. `switchGroup` writes both inside one `batch`. `readKeys` is one `Map.get` and one
  getter call per key, outside any tracking scope, nothing resolved in advance.
- `relations`: owner and pair records each in their own signal; the pair key is composed
  on every `writePair`.
- `single`: two signals, two effects, the bare setter. A re-send of the stored value is
  stopped by Solid's own `===` comparator (:654), which is the library's equality and
  not one written here.

## Departure

Besides the build import above: bucket signals carry `equals: false` and are mutated in
place; a removal of up to eight ids splices each out of its bucket, and a larger one
compacts each touched bucket once for the whole batch rather than per removed row.
