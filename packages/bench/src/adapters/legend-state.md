# What a tracked read subscribes to, and the global state underneath it

Companion to `packages/bench/src/adapters/legend-state.ts`. The row's admission and departure
statements: see `packages/bench/PARTICIPANTS.md`.
https://legendapp.com/open-source/state/v2/usage/reactivity/
https://legendapp.com/open-source/state/v2/usage/observable/#batching

## Which line is measured

The installed and measured release is 2.1.15, the current stable v2 line. Legend-State v3 is
the current beta line (https://legendapp.com/open-source/state/v3/); its API differs from v2's
and nothing here measures it.

## Module-scope state

Legend-State keeps its batch depth, tracking stack and pending-notification map in module scope
(`numInBatch`, `tracking`, `_batchMap` in index.js). The harness runs one process per (adapter,
scenario) pair, so no state from another scenario reaches a measurement. An `observe` that stopped
re-running would show as a `woke` short of the standing count, which the reference model states
independently.

## The group index

`byGroup` maps each group to an object keyed by member id, written a key at a time:
`byGroup[group][id].set(true)` on insert or arrival, `byGroup[group][id].delete()` on removal or
departure, so a move or a removal is O(1) on the index. A view reads its group's node with
`get()`, which tracks the node and its children; adding or deleting a key notifies it, and the
values never change. Legend creates a missing group object on the first `set` beneath it
(`ensureNodeValue`, index.js:153-165).

## Reading a previous value out of a node before the write

`setGroup` must read the PREVIOUS group as a PRIMITIVE. Reading the row node hands back the stored
object rather than a copy, so a reference taken before the write shows the value after it, the move
comparison never fires, and the destination view is never woken. Verification caught exactly that:
eight moves, zero renders of view B.

## Why the load has to be bracketed

Without `beginBatch`/`endBatch` around `write`, each of the N `set` calls notifies on its own and
the load becomes N renders instead of one — a correctness failure here, not merely a slow one. The
single-field writers are not batched: `set` opens and closes a batch of its own, and notifies
before it returns.

`frame(run)` is Legend-State's `batch(run)` (`index.js:591`, `beginBatch` / `endBatch` around the
function). A script's several writes before one `settle()` therefore notify once, when the
outermost batch ends; the brackets inside `write`, `remove`, `setGroup` and `switchGroup` only
move the depth counter. Inside a batch a `set` still writes the raw value at once, so `setGroup` reading the
previous group and `write` reading the stored row see every earlier write of the same frame.

## What a `set` compares, and what a read tracks

Legend-State's `set` walks the new value against the old KEY BY KEY (`updateNodes`) and notifies
only for the fields that changed, so the load notifies for every row and a re-send for nothing. A
LEAF read is a leaf DEPENDENCY: an `observe` calling `label.get()` tracks that node and no other,
which is what puts this row in the column-granular band. The window views use that too: for each
id in its group's bucket a view tracks the `group`, `rank` and `label` leaves — the three it
filters, sorts and renders by — and then takes the row with `peek()`. A `note` write, or a re-send
whose only difference is the note, therefore re-runs no view. A whole-row `set` still reaches the
tracked leaves, because `updateNodes` notifies every changed child that has listeners. `get()` hands back the raw value, not a
proxy, so nothing the consumer touches is added to the tracked set; `peek()` is `get()`'s value
without the subscription. `delete()` removes the KEY, which is what the audit needs — a node left
holding `undefined` would still be in the population.

## Why a row node is spelled out rather than typed as a record

Legend-State's recursive proxy type collapses on a `Record`: `keyof Record<string, TRow>` is
`string`, so the mapped type degenerates into an index signature and TypeScript can no longer tell
`state.get` from `state['get']` (a row whose id happens to be "get").
