---
scenario: "batchPatch"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "09b9638bcfe4bbd3"
verdict: "representative"
models: "A sync response or bulk edit: about a tenth of the population changes one visible field, applied in one frame."
measures: "Cost of many writes before one frame boundary — whether the store coalesces deliveries, and how much of a widely spread batch reaches the two watched views."
favours:
  - "Stores whose delivery is deferred to `settle` (a dirty flag, a frame-scoped delivery list): one derivation and one render per view whatever the library's batching API."
  - "Libraries with a batching API, which `ctx.binding.frame` reaches (scenarios.ts:656-660; `TBinding.frame`, types.ts:24-26): `runInAction`, `batch` or `transaction` around the 1000 writes defers their reactions to the end of the scope, so they also derive once per view."
  - "Against libraries with no batching API: their `frame` is a plain call and they deliver once per visible write."
biases:
  - "One `patchLabel` per row (scenarios.ts:656-660). A library whose bulk idiom is ONE action carrying many updates cannot use it: merging the calls would be the adapter holding values the library does not hold, which B3 forbids (scenarios.ts:135-139). Redux Toolkit's adapter defers listener notification to the end of the frame with autoBatch (adapters/redux-toolkit.ts:72-101, actions prepared with `prepareAutoBatched` at :193-261), so its listeners run once; what the row still charges it for is 1000 reducer passes where an application would dispatch one action."
  - "A library with no batch API delivers per visible write, and every delivery re-derives and renders the full window synchronously (render.ts:31-43). An application under a UI scheduler would coalesce those renders; the consumer here has none."
  - "The stride is stepped down to be coprime with the 50 groups so every group is reached (dataset.ts:813-814), and both windows are forced to be hit (dataset.ts:817-848). A handful of the ~1000 writes are visible. Realistic for a sync response."
  - "`finalStateOnly` (scenarios.ts:636): the render count is reported, not judged, so the time column mixes one-render and many-render rows under one label. The counters column says which is which."
summary: "A bulk response in one frame, run inside each library's own batch scope; what remains tilted is the per-row call shape, which action-based stores cannot fold into one action."
---

## What the script does

One step. Inside `ctx.binding.frame`, `patchLabel` on every id of `plan.batch` —
`max(4·WINDOW, N/10)` rows, 1000 at the default point (`BATCH_FRACTION`,
dataset.ts:690, 799-802; `DEFAULT_N`, registry.ts:170) — then ONE `settle()`
(scenarios.ts:651-662). Labels alternate between two suffixes per run so a repeat
is a change (:653-654). `check` asks that both windows are full and A's rows are
still in window order (scenarios.ts:673-689); the text is judged by the
final-state comparison (`adapterAnswer`/`oracleAnswer`, worker.ts:419-450; final
state sent from the verify pass, worker.ts:504-514) and every write by the
population audit (worker.ts:462).

## Ways a broken store passes

- **Intermediate states are not judged.** With `finalStateOnly` only the ending
  state of each view is compared. A store that delivered a wrong intermediate
  window and then the right final one passes; for a one-step script with
  correct libraries delivering 1 to ~5 states per view that is the intended
  trade.
- **View B's order is not checked by `check`**, only its row count (:687); its
  text is compared by the final-state digest.

## Why the verdict is representative

The workload is js-framework-benchmark's "partial update" shape at store level,
and with `frame` an eager library can apply its documented batch across the
frame. The description states the outcome per class of library
(scenarios.ts:625-630): once per view for a deferred store or an honoured batch
scope, once per visible row for a library with no batch API.

## The standing record, checked

`ORDINARY_SCRIPT` (scenarios.ts:86-169, listed at :89). B3 holds: no adapter is
allowed to hold values the library does not hold, and `frame` gives a library its
own scope without the adapter doing the library's job. B1 holds for libraries
with a batch scope; for libraries without one, the many-delivery asymmetry is
printed only in the counters. B4: one step, `stepDeliveryOf` returns `window`
(floor.ts:86) and `BOUND_BY` scales it by `consumerFloor` (floor.ts:95); a
correct store delivers both views, so the floor understates the minimum — safe
direction.