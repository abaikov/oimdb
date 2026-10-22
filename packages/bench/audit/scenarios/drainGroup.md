---
scenario: "drainGroup"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "547c617be11f8be7"
verdict: "narrow"
models: "A selection refilled from nothing and then emptied under a mounted view: a folder whose items arrive and are all deleted, a cart filled and cleared."
measures: "Inserting every row of one group into a store that holds none of them, delivering the rebuilt selection, then removing every one in one call and delivering an empty selection."
favours:
  - "Stores that derive the group's order at read time (the lean anchor rescans) over stores that keep an ordered bucket, where bucket insert or removal is linear per row. The engine's ordered bucket removes by `indexOf` plus `splice` (packages/core/src/engine/bucket/array/OIMBucketSlotsServiceArrayDriven.ts:58-63) and inserts by `splice` (:154); the scenario file's comment on `deleteRows` (scenarios.ts:1306-1310) says the same of a class name that no longer exists."
  - "Stores with a cheap path for creating a bucket from nothing and releasing an empty one. The description's 'gives a bucket back' (scenarios.ts:1422) is phrased in the engine's terms; designs with no bucket pay nothing for it."
biases:
  - "THE REBUILT SELECTION IS NOT VERIFIED. `finalStateOnly` (scenarios.ts:1432) compares only the ending state, which is empty. A write-back that lost rows, or rendered a wrong window in step one, still produces two distinct states, an empty final view and a population and grouping audit that pass, because the removal takes every id either way. The description says so (scenarios.ts:1427-1428)."
  - "The same row objects are written in every sample: `drainRows` is cloned once in `prepare` (scenarios.ts:1434-1437) and reused by every run. A store that keeps given objects receives these exact identities again; whether any participant has an identity-keyed cache that this makes warm was not checked."
  - "Two frames over about N/50 = 200 rows at the default point (GROUPS, dataset.ts:37). No other group is touched, so view B's silence is cheap for every design."
  - "B4 divides by two window deliveries (`steps: 2`, scenarios.ts:1430; floor.ts:86, 95). A correct second step delivers an EMPTY window, which costs the consumer almost nothing, so the floor overstates the minimum consumer work for this script and is not a strict lower bound on it."
summary: "A whole selection rebuilt from nothing and emptied, ending on the empty state so that the emptying is checked; the rebuild in between is checked only for having produced a state."
---

## What the script does

`restore` (untimed) removes every row of group A and settles
(scenarios.ts:1438-1441), so each sample starts from a store without group A.
The run (:1442-1447) writes the rows back (`write`, keys the store no longer
holds) and settles, then removes every id in one `remove` and settles. No
`frame` call: each step is one binding call. `repeatable: true` (:1433).

## What `check` and the oracle prove

`check` (scenarios.ts:1448-1451): at least two distinct renders of view A, none
of view B, and view A left with zero rows. The oracle (:1452-1460) replays the
restore's removal, `settled()`, then the write and the removal, emitting after
each; with `finalStateOnly` the comparison is of the two views' final state
digests and row counts (worker.ts:419-447, 501-512), in both passes.

The emptying is checked three ways: view A must show no row; the population
audit (worker.ts:462) finds any row of group A a partial `remove` left; the
grouping audit (worker.ts:464) finds any id the bucket kept.

A store that skipped step one's render passes nothing: the state before the run
is empty and the consumers keep their last state between samples
(`forgetBetweenSamples` is false here, worker.ts:368-375), so a run that rendered
only the final empty state has zero distinct renders and fails `atLeast`
(scenarios.ts:416-421, 1449).

## Ways a broken store passes

- **A lossy or misordered write-back** (see biases). The script treats the
  number of states per settle as the store's answer (scenarios.ts:1426-1427),
  which is why it compares the final state only. `check` sees only the end of
  the run, so it cannot assert the rebuilt window; closing the hole needs a
  script that ends on the rebuilt state, or a model of every state a correct
  store may produce in step one.
- **The grouping audit stops at the first `undefined`.** `firstGroupingMismatch`
  returns on the first group whose `groupOrder` is `undefined`
  (oracle.ts:668-673), and group A is `g0`, the first group checked. An adapter
  that answered `undefined` for a group it holds no bucket for would skip the
  audit of all fifty groups on this script. The adapters read for this card
  answer `[]` for an absent bucket (adapters/alien-signals.ts:327,
  adapters/preact-signals.ts:283, adapters/nanostores.ts:220); not every adapter
  was read.

## Representativeness

Emptying a list under a mounted view happens, and no other script asks for an
empty selection or for a group to be rebuilt from nothing. It is narrow: two
frames, one group, values identical each time.

## The standing record, checked

`ORDINARY_SCRIPT` (scenarios.ts:86-169, signed at :103). A1 holds (two distinct
renders demanded). A3 is MET and the audits run on the emptied store, so they
say something about the removal. B4: see the floor bias above.