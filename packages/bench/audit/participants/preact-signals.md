---
participant: "preact-signals"
version: "1.14.4"
auditedAt: "2026-10-20"
auditedBy: "claude-opus-5-5 (author; not yet re-verified)"
digest: "9759a55d4c680506"
verdict: "idiomatic"
summary: "A row is a signal per mutable field, a bucket signal per group replaced copy-on-write, and a computed plus effect per view, routed by preact's own graph; every script frame and every multi-signal write runs inside preact's `batch`, single-signal writes go through the self-batching setter, a row subscription reads every field signal of its row, the cell wiring reads one field signal per pinned cell, and the chain, diamond and view switch are preact's own `computed` and `signal`."
wirings:
  bind:
    verdict: "idiomatic"
    note: "`computed` over one bucket signal and the `group`/`rank` signals of its records, ending in an `effect` that reads the selected records' `label` (preact-signals.ts:158-165). `write` and `remove` touch only the row signals and the touched buckets (:178-238). `readAll` reads every field signal's `.value` through `byId`, outside any effect and so untracked (:308). `frame` is `batch` (:126-128, wired at :304), and the same `frame` is carried by the churn (:410), read (:632), relation (:749) and single (:921) bindings."
  bindPerGroup:
    verdict: "idiomatic"
    note: "Same body with fifty views (preact-signals.ts:975); disjoint dependency sets, routed by preact."
  churn.row:
    verdict: "idiomatic"
    note: "An `effect` reading all four field signals of row `from` and rendering its label (`labelOfWholeRow`, preact-signals.ts:367-372; mount :436-440), so it is a subscription to the WHOLE row, as types.ts:55-60 and SCENARIOS.md define the shape; `churn.column` is the label-only contrast. The first run is the mount and is not counted (:354-365; preact-signals.md, 'Why an effect's first run is not a wake-up'). Every run, the first included, records the read in `churnRead[at]` (:358) and `unmount` clears it (:474-480)."
  churn.wide:
    verdict: "idiomatic"
    note: "One `effect` reading every field signal of `count` rows, ending on row `from` (preact-signals.ts:441-447)."
  churn.column:
    verdict: "idiomatic"
    note: "`computed(() => churnSignals[0].label.value)` under the `effect` (preact-signals.ts:449-452). A `note` write touches a signal the computed never read."
  churn.chain:
    verdict: "idiomatic"
    note: "Level 1 is a `computed` over the `count` sources returning `chainLevelOf(their labels joined, 1)`; levels 2..depth are each a `computed` returning `chainLevelOf(level below, level)`; the effect reads the head (preact-signals.ts:453-466). `depth` computeds in all."
  churn.diamond:
    verdict: "idiomatic"
    note: "Two `computed`s over root row `from`'s `label` signal (`diamondLeftOf`, `diamondRightOf`) and a third `computed` over both (`diamondJoinOf`), with the effect on the join (preact-signals.ts:467-473). That the join runs once per frame is left to preact's own graph; the adapter adds no guard, and the diamond script's check is what asserts it."
  reads.byKey:
    verdict: "idiomatic"
    note: "One `byId.get` and the `.value` reads of `shownOf` per key, outside any effect, nothing hoisted (preact-signals.ts:635-645)."
  reads.byWindow:
    verdict: "idiomatic"
    note: "`$offset` (preact-signals.ts:505) is read only by `$paged`, which slices `$sorted` (:518-533), so a scroll re-runs the slice and never the sort. `scrollTo` is one setter call (:647-649). A scroll does not touch view B (:534-536)."
  reads.byTwoAxes:
    verdict: "idiomatic"
    note: "View B is a computed over the same bucket with the second predicate (preact-signals.ts:534-536, predicate at :112)."
  reads.bySwitch:
    verdict: "idiomatic"
    note: "View A's group is a `signal` (`$group`, preact-signals.ts:506) read by `$sorted` (:518-529). `switchGroup` writes `$group` and resets `$offset` to 0 inside one `batch` (:650-655), so the effect re-runs once, over the new group's bucket. View B reads neither signal."
  relations:
    verdict: "idiomatic"
    note: "Owner and pair records each get their own signal. View A's effect reads owner signals and view B's reads pair signals (preact-signals.ts:796-811), so the two views have disjoint dependencies. `writePair` composes the key on every call (:821-825). The owner and pair `$...Population` signals (:689, :694) are written only in the untimed `writeOwners` and `holdRelation`."
  single:
    verdict: "idiomatic"
    note: "Bare `signal.value = v` with no `batch` (preact-signals.ts:916-918). The setter opens and closes its own batch (node_modules/@preact/signals-core/src/index.ts:461-487)."
improvements: []
---

## Version and recipe

`node_modules/@preact/signals-core/package.json` is `1.14.4`, the same as `version`
(preact-signals.ts:942). The recipe is the signals-core README's: `signal`, `computed`,
`effect`, `batch`. Each view ends in an `effect`, because a computed is pull-based
(preact-signals.md, 'How consumption is forced').

## What preact routes, and what the adapter adds

- The id map and the group map hold signal handles (preact-signals.ts:136, :140). Each
  view's computed reads one bucket signal and that bucket's records' `group` and
  `rank` signals (:158-161). A write to a row of group Z therefore reaches only the
  view over Z. A move writes three signals in one batch (:250-261): the row's `group`,
  the old bucket and the new bucket.
- Buckets are copy-on-write: preact has no way to announce a mutated value, so a move
  allocates two bucket arrays (:257, :259) and `write` drafts each touched bucket once
  per batch (:182-191), which avoids a quadratic load. This is where the row differs
  from alien's, which mutates in place and calls `trigger`.
- `readAll` iterates `byId.values()` and reads each field's `.value` through `rowOf`
  outside every effect (:308, :423, :657, :827); no `peek()` is used anywhere.

## Batching

`frame(run)` is `batch(run)` (preact-signals.ts:126-128; node_modules/@preact/signals-core/src/index.ts:95-106).
Every binding, the single one included, carries it, so a script's several writes before
one `settle()` reach preact as one batch and effects run once when it returns. The
batches inside `write`, `remove`, `setGroup` and `switchGroup` nest: `batch` at
depth > 0 only calls the function (src/index.ts:96-98).

Methods that write one signal (`patchLabel`, `patchNote`, `setRank`, the pinned
patches, `scrollTo`, `patchOwnerName`, `writePair`, the churn and relation field
patches) call the setter bare. The setter batches its own notification
(src/index.ts:461-487). `settle` is a no-op in the view, read and relation bindings
because effects have already run when the outermost batch returns; in the churn and
single bindings it only turns what the effects recorded into one delivery
(:412-422, :923-932).

## The derivation shapes

The chain and the diamond are built only from preact's `computed`; the adapter computes
nothing between levels beyond the `derivations.ts` function each level is defined by.
Whether the diamond's join runs once per frame is preact's own glitch-freedom, not
traced in its source by this audit; the diamond script's check is what asserts it.

## The cell wiring

`pin` resolves the pinned row records untimed (preact-signals.ts:269-297), and each
cell effect reads that column's field signal (`label` or `note`) of every pinned row
directly. A `note` write touches a signal the label effect never read, so it does
not re-run.

## What is idiomatic

No value guard sits in a patch method (`TBinding.write`). What compares is preact's
own `!==` on each field signal (src/index.ts:462).

## What was not traced

Nothing was compiled or run; line numbers were re-read against the current file on
2026-10-20. The card needs a second reader before it is stamped.
