---
participant: "alien-signals"
version: "3.2.1"
auditedAt: "2026-10-20"
auditedBy: "claude-opus-5-5 (author; not yet re-verified)"
digest: "3a849f37df9ede0b"
verdict: "idiomatic"
summary: "The preact adapter's shape in alien's surface, with one difference the library offers: a row is a signal per mutable field, a bucket signal per group is MUTATED IN PLACE and announced with the documented `trigger` (preact copies the bucket), and a computed plus effect per view; every script frame and every multi-signal write runs inside `startBatch`/`endBatch`, a row subscription reads every field signal of its row, the cell wiring reads one field signal per pinned cell, and the chain, diamond and view switch are alien's own `computed` and `signal`."
wirings:
  bind:
    verdict: "idiomatic"
    note: "`computed` over one bucket signal and the `group`/`rank` signals of its records, ending in `effect` (alien-signals.ts:259-266). `write`, `remove` and `setGroup` mutate the touched buckets in place and call `trigger` once over them (`fileRows` :152-183, `unfileRows` :185-211, `moveRow` :213-229, `triggerBuckets` :146-150), the README's documented path for a mutated value. `readAll` calls each field signal through `byId` (:348). `frame` is `inBatch`, `startBatch`/`endBatch` in a try/finally (:137-144, wired at :343), and the same `frame` is carried by the churn (:444), read (:598), relation (:709) and single (:877) bindings."
  bindPerGroup:
    verdict: "idiomatic"
    note: "Same body with fifty views (alien-signals.ts:937); disjoint dependency sets, routed by alien's graph."
  churn.row:
    verdict: "idiomatic"
    note: "`effect` calling all four field signals of row `from` and rendering its label (`labelOfWholeRow`, alien-signals.ts:404-409; mount :471-475), so it is a subscription to the WHOLE row, as types.ts:55-60 and SCENARIOS.md define the shape; `churn.column` is the label-only contrast. The first run is the mount and is not counted (:391-402). Every run, the first included, records the read in `churnRead[at]` (:395) and `unmount` clears it (:509-515)."
  churn.wide:
    verdict: "idiomatic"
    note: "One `effect` calling every field signal of `count` rows, ending on row `from` (alien-signals.ts:476-482)."
  churn.column:
    verdict: "idiomatic"
    note: "`computed(() => churnSignals[0].label())` under the effect (alien-signals.ts:484-487). A `note` write touches a signal the computed never read."
  churn.chain:
    verdict: "idiomatic"
    note: "Level 1 is a `computed` over the `count` sources returning `chainLevelOf(their labels joined, 1)`; levels 2..depth are each a `computed` returning `chainLevelOf(level below, level)`; the effect calls the head (alien-signals.ts:488-501)."
  churn.diamond:
    verdict: "idiomatic"
    note: "Two `computed`s over root row `from`'s `label` signal (`diamondLeftOf`, `diamondRightOf`), a third `computed` over both (`diamondJoinOf`), the effect on the join (alien-signals.ts:502-508). That the join runs once per frame is left to alien's own graph; the adapter adds no guard, and the diamond script's check is what asserts it."
  reads.byKey:
    verdict: "idiomatic"
    note: "One `byId.get` and the signal calls of `shownOf` per key, outside every effect, so nothing is tracked or hoisted (alien-signals.ts:600-609)."
  reads.byWindow:
    verdict: "idiomatic"
    note: "`$offset` (alien-signals.ts:536) is read only by `paged`, which slices `sorted` (:550-563), so a scroll re-runs the slice and never the sort. `scrollTo` is one bare setter call (:610-612). A scroll leaves view B untouched (:564-566)."
  reads.byTwoAxes:
    verdict: "idiomatic"
    note: "View B is a computed over the same bucket with the second predicate (alien-signals.ts:564-566, predicate at :123)."
  reads.bySwitch:
    verdict: "idiomatic"
    note: "View A's group is a `signal` (`$group`, alien-signals.ts:537) that `sorted` calls (:550-559). `switchGroup` writes `$group` and resets `$offset` to 0 inside one `inBatch` (:613-618), so the effect runs once, over the new group's bucket. View B calls neither signal."
  relations:
    verdict: "idiomatic"
    note: "Owner and pair records each get their own signal. View A's effect calls owner signals and view B's calls pair signals (alien-signals.ts:756-771), so the two views have disjoint dependencies. `writePair` composes the key on every call (:781-786). The owner and pair population signals (:648, :653) are written only in the untimed `writeOwners` and `holdRelation`."
  single:
    verdict: "idiomatic"
    note: "Bare `signal(v)` with no batch (alien-signals.ts:872-874). An unbatched write flushes before it returns (node_modules/alien-signals/esm/index.mjs:301-311)."
improvements: []
---

## Version and recipe

`node_modules/alien-signals/package.json` is `3.2.1`, the same as `version`
(alien-signals.ts:899). The README documents `signal`, `computed`, `effect`,
`effectScope` and `trigger` (README.md:62-170) and does not mention batching. The adapter
batches with `startBatch`/`endBatch`, exported at types/index.d.ts:5-6 and implemented at
esm/index.mjs:67-74; the `departure` says the pair was read from the declarations
(alien-signals.ts:901-907). Without it, every signal write flushes the effect queue
(esm/index.mjs:301-311, `if (!batchDepth) flush()`), and the load would deliver once per row.

## Batching

`frame(run)` is `inBatch` (alien-signals.ts:137-144): `startBatch()`, `run()`, `endBatch()`
in a try/finally. Every binding, the single one included, carries it, so a script's several
writes before one `settle()` flush once at the outermost `endBatch`. The batches inside
`write`, `remove`, `setGroup` and `switchGroup` nest by depth counter (esm/index.mjs:67-74).

Methods that write one signal (`patchLabel`, `patchNote`, `setRank`, the pinned patches,
`scrollTo`, `patchOwnerName`, `writePair`, the churn and relation field patches) call the
setter bare: an unbatched write flushes exactly once anyway (esm/index.mjs:301-311). The
churn and relation `remove` write no signal and are a map delete (:425-427, :689-691).
`settle` is a no-op in the view, read and relation bindings; in the churn and single
bindings it only turns what the effects recorded into one delivery (:447-457, :880-890).

## What alien routes, and what the adapter adds

- The id map and group map hold signal handles (alien-signals.ts:238, :242). Each view's
  computed reads one bucket and that bucket's records' `group` and `rank` (:259-262), so
  a write reaches only the view over the written row's group.
- A bucket is mutated in place and announced with `trigger(() => { bucket(); … })`
  (alien-signals.ts:146-150; README.md "Manual Triggering", esm/index.mjs:154-180). A move
  splices one handle out and pushes it onto the destination (:213-229); a load pushes onto
  each touched bucket (:152-183); a removal compacts each touched bucket once (:185-211).
  The preact row cannot do this — it has no trigger — and allocates two bucket arrays per
  move, so the two rows differ by this as well as by the reactivity.
- Write-path reads are untracked, because alien links a dependency only when `activeSub`
  is set (esm/index.mjs:323-326), and the harness calls write methods outside every
  effect.
- `readAll` iterates `byId.values()` and calls each field signal (:348, :458, :621, :788).

## The derivation shapes

The chain and the diamond are built only from alien's `computed`; nothing between levels
is the adapter's beyond the `derivations.ts` function each level is defined by. The
diamond's glitch-freedom was not traced in esm/index.mjs by this audit.

## The cell wiring

`pin` resolves the pinned row records untimed (alien-signals.ts:308-336), and each cell
effect reads that column's field signal (`label` or `note`) of every pinned row directly.
A `note` write touches a signal the label effect never read, so it does not re-run.

## What was not traced

Nothing was compiled or run; line numbers were re-read against the current file on
2026-10-20. The card needs a second reader before it is stamped.
