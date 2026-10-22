---
participant: "vue-reactivity"
version: "3.5.43"
auditedAt: "2026-10-20"
auditedBy: "claude-opus-5-5 (author; not yet re-verified)"
digest: "be0372896d685348"
verdict: "idiomatic"
summary: "The preact and alien wiring in @vue/reactivity's primitives — a shallowRef per mutable field of each row, a shallowRef bucket per group mutated in place and announced with the documented `triggerRef`, a computed plus effect per view. The package exports no batch, so every effect is created with the `scheduler` option: a trigger queues it, and `settle` runs each queued effect whose `dirty` is set — the job queue @vue/runtime-core keeps and this package does not ship, the same mark-then-render-at-settle mechanism the valtio row gets."
wirings:
  bind:
    verdict: "idiomatic"
    note: "`computed` over one bucket ref and the `group`/`rank` refs of its records, ending in an effect that reads the selected records' `label` (vue-reactivity.ts:277-284). `write`, `remove` and `setGroup` mutate the touched buckets in place and `triggerRef` each once (`fileRows` :185-214, `unfileRows` :216-239, `moveRow` :241-254). `readAll` reads the field refs outside any effect, untracked (:348). `frame` is `run()` (:129-131); `settle` drains the effect queue (:134-155, wired at :347)."
  bindPerGroup:
    verdict: "idiomatic"
    note: "Same body with fifty views (vue-reactivity.ts:847); each view's computed reads only its own bucket, so Vue's dep graph routes a write to one view."
  churn.row:
    verdict: "idiomatic"
    note: "An effect reading all four field refs of row `from` and rendering its label (`labelOfWholeRow`, vue-reactivity.ts:384-389; mount :450-455), so it is a subscription to the WHOLE row, as SCENARIOS.md defines the shape. The effect's creation run (reactivity.cjs.prod.js:457-474) is the mount and records the read in `churnRead[at]` without counting (:372-381); `unmount` stops the runner and clears the slot (:478-484). `settle` drains the queue, then delivers once if anything woke (:432-437)."
  churn.wide:
    verdict: "idiomatic"
    note: "One effect reading every field ref of `count` rows, ending on row `from` (vue-reactivity.ts:391-397, :450-455)."
  churn.column:
    verdict: "idiomatic"
    note: "`computed(() => record.label.value)` under the effect (vue-reactivity.ts:456-459). A `note` write touches a ref the computed never read, so neither runs."
  churn.chain:
    verdict: "idiomatic"
    note: "Level 1 is a `computed` returning `chainLevelOf(labels of the count sources joined, 1)`; levels 2..depth are each a `computed` over the one below; the effect reads the head (vue-reactivity.ts:460-470). `depth` computeds in all."
  churn.diamond:
    verdict: "idiomatic"
    note: "Two `computed`s over root row `from`'s label ref (`diamondLeftOf`, `diamondRightOf`) and a third over both (`diamondJoinOf`), the effect on the join (vue-reactivity.ts:471-477). The effect is in the queue once however many branches notify it, and `settle` runs it once; the diamond script's check asserts it."
  reads.byKey:
    verdict: "idiomatic"
    note: "One `byId.get` and one untracked `.value` per field read per key, nothing hoisted (vue-reactivity.ts:564-572)."
  reads.byWindow:
    verdict: "idiomatic"
    note: "View A's group and offset are two refs (vue-reactivity.ts:508-509). A `sorted` computed orders the group's bucket and a `paged` computed slices it (:512-527), so a scroll re-runs only the slice. `scrollTo` is one ref write (:573-575). View B's computed reads neither ref (:528-530)."
  reads.byTwoAxes:
    verdict: "idiomatic"
    note: "View B is a computed over the same bucket with the second predicate (vue-reactivity.ts:528-530, predicate at :116)."
  reads.bySwitch:
    verdict: "idiomatic"
    note: "`switchGroup` writes the group ref and resets the offset ref (vue-reactivity.ts:576-579); view A's effect is queued by both and is in the set once, so it runs once at `settle` over the new group's bucket."
  relations:
    verdict: "idiomatic"
    note: "Owner and pair records each get their own `shallowRef`. View A's effect reads owner refs and view B's reads pair refs (vue-reactivity.ts:682-697), so the two views' dependencies are disjoint. `writePair` composes the key on every call (:702-706). The population refs (:597, :600) are written only in the untimed `writeOwners` and `holdRelation`."
  single:
    verdict: "idiomatic"
    note: "Bare `ref.value = v` (vue-reactivity.ts:784-786). The setter compares with `hasChanged` (reactivity.cjs.prod.js:1428); a changed value queues the effect, and `settle` runs it and delivers (:790-800)."
improvements: []
---

## Version and recipe

`node_modules/@vue/reactivity/package.json` is `3.5.43`, the same as `version`
(vue-reactivity.ts:810). The worker runs under `NODE_ENV=production`
(src/harness/measureBatch.ts:201), so `index.js` loads
`dist/reactivity.cjs.prod.js`, and every library line below is in that file. The
primitives are `shallowRef`, `computed`, `effect`, `stop` and `triggerRef` — all
exported (:1866-1905). The shape is the preact and alien rows': a ref per mutable
field, a bucket ref per group, a computed plus effect per view
(vue-reactivity.md, 'The recipe').

## Batching

`startBatch` (:311) and `endBatch` (:314-348) exist but are not in the export list
(:1856-1905) or in `dist/reactivity.d.ts`. What is exported is the `scheduler`
option (`ReactiveEffectOptions`, d.ts :270-274): a triggered effect with one calls
it instead of running (`ReactiveEffect.trigger`, :277-285). Every effect is made by
`createEffectQueue` (vue-reactivity.ts:134-155): the scheduler adds the runner to a
`Set`, and `settle` runs each queued runner whose `effect.dirty` (d.ts :309,
`isDirty` :376-386) is set — the check the default trigger makes in `runIfDirty`
(:289-293). `frame(run)` is `run()`. A frame's several writes therefore render once
per view at `settle`, and the order of a move's three writes no longer matters.
`effectScope` pause/resume was not used: it parks effects of a scope, and as a frame
would walk every effect twice (vue-reactivity.md, 'What a frame is').

## The cell wiring

`pin` stops the window effects and builds, untimed, one effect per column reading
that column's ref of every pinned row directly (vue-reactivity.ts:313-339). A
`note` write touches a ref the label effect never read.

## Unmount

`stop(runner)` (reactivity.cjs.prod.js:475-477) unlinks the effect from its
dependencies (:266-276); a computed whose last subscriber goes unlinks from its own
sources (`removeSub`, :423-445). A stopped runner still in the queue has no deps,
so `dirty` is false and `settle` skips it.

## What the adapter adds, and what it does not

No equality function is written in the adapter: every skip is the ref setter's
`hasChanged` (:1428), a computed's (:408), or `dirty`'s version comparison. The
effect queue is the one piece of machinery the adapter adds, and it is the part of
Vue that lives in `@vue/runtime-core`; the departure says so.

## What was not traced

Neither the author nor a verifier compiled or ran this version of the adapter;
every claim above is read from the source. The card needs a second reader before
it is stamped.
