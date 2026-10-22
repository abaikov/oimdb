---
participant: "solid-js"
version: "1.9.15"
auditedAt: "2026-10-20"
auditedBy: "claude-opus-5-5 (author; not yet re-verified)"
digest: "2abf841ccd4355ba"
verdict: "idiomatic"
summary: "Solid's signal layer outside components: a createSignal per mutable field of each row, a bucket signal per group created with `equals: false` and mutated in place, a createMemo plus createEffect per view inside a createRoot, every script frame in Solid's own batch; the chain, diamond and view switch are createMemo and createSignal. The reactive build is imported by path because under node `solid-js` resolves to the inert server build, and solid-js/store is not used because it imports the bare `solid-js` and would sit on that server build."
wirings:
  bind:
    verdict: "idiomatic"
    note: "A `createMemo` over one bucket signal and the `group`/`rank` signals of its records, ending in a `createEffect` that reads the selected records' `label`, all inside one `createRoot` (solid-signals.ts:240-250). `write`, `remove` and `setGroup` mutate the touched buckets in place inside `batch` and set each to its own array, which notifies because the bucket signal has `equals: false` (`bucketOfIn` :127-136, `announce` :138-140, `fileRows` :154-185, `unfileRows` :187-212, `moveRow` :214-230). `readAll` calls each field getter through `byId` outside any tracking scope (:313). `frame` is `batch` (:123-125; node_modules/solid-js/dist/solid.js:452-454)."
  bindPerGroup:
    verdict: "idiomatic"
    note: "The same body with fifty views (solid-signals.ts:825); disjoint dependency sets, routed by Solid's graph."
  churn.row:
    verdict: "idiomatic"
    note: "A `createEffect` inside its own `createRoot` reading all four field getters of row `from` and rendering its label (`labelOfWholeRow`, solid-signals.ts:358-363; `subscribe` :338-354; mount :437-442), so it is a subscription to the WHOLE row, as types.ts:55-60 and SCENARIOS.md define the shape; `churn.column` is the label-only contrast. The first run is the mount, writes the read slot and is not counted; `unmount` disposes the root and clears the slot (:466-472). The first run happens before `createRoot` returns, because the root's `runUpdates` drains the effect queue (dist/solid.js:177-197, :222-229, :819-834, :875-877). That holds only for a mount outside an open batch — inside one, `runUpdates` sets `wait` (:823) and the first run is deferred to the outer batch's end."
  churn.wide:
    verdict: "idiomatic"
    note: "One `createEffect` reading every field getter of `count` rows, ending on row `from` (solid-signals.ts:365-371, :437-442)."
  churn.column:
    verdict: "idiomatic"
    note: "A `createMemo` returning the row's label under the effect (solid-signals.ts:356, :443-445). A `note` write touches a signal the memo never read, so nothing re-runs and the column identity is Solid's."
  churn.chain:
    verdict: "idiomatic"
    note: "Level 1 is a `createMemo` over the `count` sources returning `chainLevelOf(their labels joined, 1)`; levels 2..depth are each a `createMemo` over the one below; the effect reads the head (solid-signals.ts:446-457). All `depth` memos are owned by the subscriber's root, so `unmount` disposes them (dist/solid.js:946-979)."
  churn.diamond:
    verdict: "idiomatic"
    note: "Two `createMemo`s over root row `from`'s `label` getter (`diamondLeftOf`, `diamondRightOf`) and a third over both (`diamondJoinOf`), the effect on the join (solid-signals.ts:458-465). Once-per-frame is Solid's own: a node is queued only while clean (dist/solid.js:669-670, :935-945). The adapter adds no guard; the diamond script's check asserts it."
  reads.byKey:
    verdict: "idiomatic"
    note: "One `byId.get` and the getter calls of `shownOf` per key, untracked, nothing hoisted (solid-signals.ts:544-552)."
  reads.byWindow:
    verdict: "idiomatic"
    note: "The offset is a `createSignal` (solid-signals.ts:490) read only by the `paged` memo, which slices the `sorted` memo (:496-511), so a scroll re-runs the slice and never the sort — the shape of the preact and alien read wirings. `scrollTo` is one bare setter call (:553-555). View B's memo reads neither signal (:512-514)."
  reads.byTwoAxes:
    verdict: "idiomatic"
    note: "View B is a `createMemo` over the same bucket with the second predicate (solid-signals.ts:512-514, :518-520, predicate at :110)."
  reads.bySwitch:
    verdict: "idiomatic"
    note: "View A's group is a `createSignal` (solid-signals.ts:491) read by the `sorted` memo. `switchGroup` writes the group and resets the offset to 0 inside one `batch` (:556-561), so the effect re-runs once over the new group's bucket."
  relations:
    verdict: "idiomatic"
    note: "Owner and pair records each in their own `createSignal`. View A's effect reads owner getters and view B's reads pair getters, in one root created by `holdRelation` (solid-signals.ts:673-687), so the two views have disjoint dependencies. `writePair` composes the key on every call (:693-697)."
  single:
    verdict: "idiomatic"
    note: "Two signals, two effects in one root, the bare setter (solid-signals.ts:737-756, :763-765). The setter calls `writeSignal`, which runs its own `runUpdates` (dist/solid.js:206-211, :663-681), and a re-send of the stored value is stopped by Solid's `===` comparator (:654)."
improvements:
  - "Coverage, not speed: Solid's documented collection API is `createStore` from `solid-js/store` with `reconcile`/`produce`. It is unreachable under this harness: `store/dist/store.js:1` imports the bare `solid-js`, which under node resolves to `dist/server.js` (package.json `exports['.'].node`), and `solid-js/store` itself resolves to `store/dist/server.js` under `node`. Spawning the solid-js worker with `--conditions=browser` (src/harness/measureBatch.ts, the worker's `args`, where no conditions flag is passed today) would let a store-backed wiring be measured as a second participant beside this one. Nothing shows a store is FASTER than a signal per field — a store is per-property signals behind a proxy — so this is not what `improvable` means and the verdict is not lowered for it."
---

## Version and build

`node_modules/solid-js/package.json` is `1.9.15`, equal to `version`
(solid-signals.ts:788). Its `"."` export resolves to `dist/server.js` under the `"node"`
condition and to `dist/solid.js` only under `"browser"` or the default. The worker is
spawned as `node --expose-gc --import tsx …` (src/harness/measureBatch.ts) with no
conditions flag, so `import 'solid-js'` would load the SSR build, where `createEffect`
is empty (dist/server.js:78), signals have no observers (:62-66) and `batch` only calls
its argument (:102-104). The adapter imports `solid-js/dist/solid.js`
(solid-signals.ts:2), permitted by the package's `"./dist/*"` export, and types it with
the package's `types/index.d.ts` (:3, :40). `dist/solid.js` is the production build
(`IS_DEV = false`, dist/solid.js:149). This is stated in `departure`.

## Why the verdict is idiomatic, and what is not measured

`improvable` means "a documented, FASTER way exists and is not used" (audit/README.md),
and no line here shows a store is faster than a `createSignal` per field — a store wraps
per-property signals in a proxy. What a store wiring would add is coverage, and it is
blocked by the module graph (see `improvements`).

## What Solid routes, and what the adapter adds

- The id map and the group map hold `[get, set]` pairs (solid-signals.ts:236-237); no
  value lives outside a signal. Each view's memo reads one bucket signal and that
  bucket's records' `group` and `rank` (:242-244), so a write to a row of group Z reaches
  only the view over Z. A move writes the row's `group` and announces both buckets in
  one `batch` (:214-230).
- Bucket signals carry `equals: false` (:132), Solid's documented option for a signal
  that is always treated as changed (`comparator: options.equals || undefined`,
  dist/solid.js:204; `writeSignal`, :654). That is what lets a bucket be mutated in
  place and set to the same array, as alien does with `trigger`, instead of copying it
  per move. Every other signal and memo keeps Solid's default `===`.
- Every effect lives in a `createRoot` whose `dispose` the adapter keeps; disposal is
  `cleanNode` over the root's owned computations (dist/solid.js:946-979).

## Batching

`frame(run)` is `batch(run)` (solid-signals.ts:123-125), which is `runUpdates(fn, false)`
(dist/solid.js:452-454, :819-834); a nested `runUpdates` only calls its function (:820),
so the `batch` inside `write`, `remove`, `setGroup` and `switchGroup` nests inside a
frame. A method that writes one signal calls the setter bare. `settle` is a no-op in the
view, read and relation bindings; in the churn and single bindings it turns what the
effects recorded into one delivery (solid-signals.ts:414-424, :769-778).

## Cost that is Solid's and not the adapter's

An effect or memo re-collects its sources on every run: `updateComputation` calls
`cleanNode` first (dist/solid.js:685-688), and `readSignal` pushes each source back
(:619-650). A view memo over a bucket of N rows therefore re-subscribes N sources per
re-run. That is Solid's model, and the preact and alien rows pay their own equivalents.

## What is not traced here

That the diamond's join runs once per frame is argued from `writeSignal` and
`markDownstream`, not traced end to end through `runTop`/`lookUpstream`; the diamond
script's check is what asserts it. Nothing was compiled or run; line numbers were
re-read against the current file on 2026-10-20. The card needs a second reader before
it is stamped.
