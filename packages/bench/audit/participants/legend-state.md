---
participant: "legend-state"
version: "2.1.15"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "84d2277196868783"
verdict: "idiomatic"
summary: "Rows live in one Legend-State observable keyed by id, the group index is a second observable mapping each group to an object keyed by member id and mutated a key at a time, each view is one `observe` over its own group's node and the `group`/`rank`/`label` leaves of each row, so a write wakes only the view over that row's group and a `note` write wakes none; every script frame and every multi-write method runs inside Legend's own `batch`/`beginBatch`; the chain and diamond are Legend `computed`s over whole row nodes and a view switch writes the view's own observable cursor."
wirings:
  bind:
    verdict: "idiomatic"
    note: "One `observe` per view (legend-state.ts:123-159) reading the group's member node with `get()` (:131) and then, per member id, the `group`, `rank` and `label` leaves with `get()` and the row with `peek()` (`trackedRowOf`, :74-79). Writes go through node `set`/`delete` inside `beginBatch`/`endBatch` (:181-228); the group index is written one key at a time, `byGroup[group][id].set(true)` / `.delete()` (`groupIndexOf`, :100-108), so a move or removal is O(1) on it. A `note` write reaches no view listener (:212-214). `frame` is Legend's `batch` (:69-71, wired at :267), and the same `frame` is carried by the churn (:368), read (:596), relation (:722) and single (:870) bindings."
  bindPerGroup:
    verdict: "idiomatic"
    note: "Same `bindViews` body with fifty bindings (legend-state.ts:926); one `observe` per view (:164), disjoint dependency sets."
  churn.row:
    verdict: "idiomatic"
    note: "`observe` over `node.get()` of the held row node (legend-state.ts:319-330, :400-404): the whole row, which is what the row shape subscribes to (SCENARIOS.md, churnColumn: 'on one column instead of the row'). Node proxies are resolved once in `holdChurnRows` (:392-399), which the churn contract allows. Each run stores what it read in `churnRead[at]` (:323) and `unmount` clears the slot (:447-453), so the verify-pass fold over every standing subscriber's read (render.ts:124-141) sees exactly the mounted ones. `settle` delivers once per frame only if a reaction woke (:372-382)."
  churn.wide:
    verdict: "idiomatic"
    note: "Same `mountOnRows` body with `count > 1`: one `observe` reading every source row node whole, ending on row `from` (legend-state.ts:405-411)."
  churn.column:
    verdict: "idiomatic"
    note: "`observe` over the leaf `node.label.get()` of held row 0 (legend-state.ts:413-416). The leaf is its own node, so the column identity is the library's, not the adapter's."
  churn.chain:
    verdict: "idiomatic"
    note: "Level 1 is a Legend `computed` over the `count` source row nodes, each read whole (`labelOfRow`, :332-335), returning `chainLevelOf(joined labels, 1)`; levels 2..depth are each a `computed` returning `chainLevelOf(level below, level)`; an `observe` reads the head, because a computed is idle until read (legend-state.ts:417-433). Derivations over rows, as SCENARIOS.md defines churnChain."
  churn.diamond:
    verdict: "idiomatic"
    note: "Two Legend `computed`s over root row `from`'s node read whole (`labelOfRow`, :332-335), as types.ts:69-70 defines the shape ('two derivations over root row from'), deriving `diamondLeftOf` / `diamondRightOf` of its label; a third `computed` over both (`diamondJoinOf`), and an `observe` on the join (legend-state.ts:434-446). Whether Legend runs the join once per frame was not traced in index.js; the diamond script's check is what asserts it."
  reads.byKey:
    verdict: "idiomatic"
    note: "One proxy descent and one `get()` per key, nothing hoisted, outside every `observe` (legend-state.ts:599-607). `peek()` would skip the `updateTracking` call (index.js:1409-1414); with no active tracker that call does nothing, so no difference is expected."
  reads.byWindow:
    verdict: "idiomatic"
    note: "View A's cursor is an observable node with `group` and `at` leaves (legend-state.ts:473-479), read only by view A's `observe` (:528-537), so a scroll (`cursor.at.set`, :609-611) re-runs A and not B. A re-selects the top `offset + window` of its group from the group's member node through the same leaf reads as `bind` (`selectInto`, :492-525)."
  reads.byTwoAxes:
    verdict: "idiomatic"
    note: "View B is a second `observe` with the second predicate over group A (legend-state.ts:538-545). The predicate reads only the immutable id, so it is tested before any leaf is tracked (:502), and an off-axis row's leaves are not a dependency of B; its arrival or departure still changes group A's member node, which B tracks."
  reads.bySwitch:
    verdict: "idiomatic"
    note: "`switchGroup` sets the cursor's `group` leaf and resets its `at` leaf to 0 inside one Legend `batch` (legend-state.ts:612-617), so view A's `observe`, which tracks both leaves, re-runs once over the new group's member node. View B tracks neither leaf."
  relations:
    verdict: "idiomatic"
    note: "Two more observables, owners and pairs keyed by a composed string (legend-state.ts:658-661). Owner and pair nodes for the views are resolved in `holdRelation` (:734-767); `writePair` composes the key and descends the proxy on every call (:775-779), as `TRelationBinding.writePair` requires."
  single:
    verdict: "idiomatic"
    note: "`observable('')` scalars, one `observe` each, `set` outside a batch notifies before it returns; `settle` delivers only the side that woke (legend-state.ts:820-888)."
improvements:
  - "legend-state.ts:74-79 — the leaf reads trade one listener per row for three on every view re-run (observe re-subscribes every run, index.js:1550 and setupTracking at :1479). They take the redundant wakes out of patchNote and batchPatchNote; whether the extra listeners slow patchColumn, patchOutsideWindow and batchPatch is unmeasured. If they do, the whole-row `node.get()` is the other documented arm and the two should be priced against each other. Left to the measurement phase."
---

## Recipe and version

`node_modules/@legendapp/state/package.json` is `2.1.15`, the same as the adapter's
`version` (legend-state.ts:892). The recipe cited in `docs` is the v2 reactivity page:
an `observable` keyed by id (legend-state.ts:114) and one `observe` per consumer
(:123-159). That is the documented shape for a collection. v3 is the current beta line
and is not what is measured; see legend-state.md ('Which line is measured').

## What a view depends on, and what wakes it

- The group index is a second observable mapping each group to an object keyed by
  member id (legend-state.ts:116). A view reads its own group's member node with
  `get()` first (:131), which tracks that node and its children, so adding or deleting
  a member key reaches the view through it; the member values are always `true`.
- Per id, `trackedRowOf` (legend-state.ts:74-79) calls `get()` on the `group` leaf and,
  if the row is in this group, on `rank` and `label`, then takes the row with `peek()`.
  `get()` tracks exactly the node it is called on (index.js:1409-1414) and `peek()`
  tracks nothing (:1415). Those three leaves are what the filter, `compareRows`
  (src/harness/dataset.ts:425-426) and `deliver` (src/harness/render.ts:31-43) read, so
  every write that can change a rendered line still re-runs the view, and a `note`
  write re-runs none.
- A whole-row `set` (a re-send through `write`) reaches the tracked leaves: `updateNodes`
  compares key by key and calls `notify` on every changed child that has listeners
  (index.js:815-990, the `child.listeners` branch). A re-send whose values equal what is
  stored notifies nothing, and leaves the group index untouched (:186-188).
- A whole-row `node.get()` tracks the row node; a child write is reported up through
  `node.parent` (`computeChangesRecursive`, index.js:525-541), so with it `note` writes
  would re-run the view. The leaf reads are the documented fine-grained form of the same
  read. The open cost is under `improvements`.
- Outside a batch, `set` notifies before it returns (index.js:478-496: `runBatch` is
  called when `numInBatch <= 0`), so `settle` is a no-op in the view, read and relation
  bindings (legend-state.ts:270, :619, :781). The churn and single bindings' `settle`
  only turns what the reactions already recorded into one delivery (:372-382, :873-882).

## The derivation shapes and the view switch

The chain and diamond are Legend `computed`s ending in an `observe`, each reading its
root rows whole (`labelOfRow`, legend-state.ts:332-335), as SCENARIOS.md and types.ts
define those shapes; nothing between levels is the adapter's beyond the
`derivations.ts` function each level is defined by. Every churn subscriber records its
read per slot and `unmount` clears it (legend-state.ts:323, :452), which is what the
verify-pass fold of every standing read (render.ts:124-141, enabled by
`auditChurnReads`) checks. The view switch writes two leaves of the observable cursor
view A already reads for its offset; the `batch` around them is what makes it one
re-run and not two.

## Batching

`frame(run)` is Legend's `batch(run)` (legend-state.ts:69-71; index.js:591-610, which is
`beginBatch(); try { fn() } finally { endBatch() }`). Every binding, the single one
included, carries it, so a script's several writes before one `settle()` notify once when
the outermost batch ends. The `beginBatch`/`endBatch` brackets inside `write`, `remove`
and `setGroup`, and the `batch` inside `switchGroup`, nest by `numInBatch`
(index.js:611-630). A `set` inside a batch writes the raw value immediately and defers
only the notification, so the previous-group read in `setGroup` and `write` sees the
earlier writes of the same frame.

## Write paths

- `write` reads each row's previous group as a primitive (`group.peek()`), sets the row,
  and, when the group changed or the row is new, deletes the member key from the old
  group and sets it in the new one (legend-state.ts:181-193). A missing group object is
  created by Legend on the first `set` beneath it (`ensureNodeValue`, index.js:153-165).
- `setGroup` reads the previous group as a primitive leaf first, for the reason in
  legend-state.md ('Reading a previous value out of a node before the write'), then
  writes the row's `group` leaf and the two member keys in one batch (:216-228).
- `remove` deletes the member key and then the row with `delete()`, which removes the
  key (`deleteFn`, index.js:1266-1273), one pair per id (:197-206).
- Every row is stored as a copy (`{ ...row }`, :187), because `set` keeps the reference
  it is given.
- The read binding's write paths are the same code (:549-588).

## Library cost charged to this row, not the adapter

`beginBatch` arms a `setTimeout(onActionTimeout, 0)` when no batch is open
(index.js:611-616), and `endBatch` clears it (:626-627). `updateNodesAndNotify` opens a
batch on every `set` (index.js:1353), and an `observe` re-run opens one too (:1550).
So each un-batched write outside a batch pays a timer arm and clear. Any user of v2
pays this, so it belongs to the library's number. Inside `frame` the timer is armed once
per frame.

## Unverified

Whether a Legend `computed` join runs once per frame in the diamond was not traced.
The time effect of the keyed group index against per-group id arrays was not run.
The leaf-tracking cost question in `improvements` is for the measurement phase.
`digest` above was not recomputed against this code.
