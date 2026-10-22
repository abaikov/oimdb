---
scenario: "mixedFrame"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "fc7303b1e1d43c11"
verdict: "representative"
models: "One socket or sync frame that carries every kind of change at once: rows created, rows deleted, a visible field edited, rows moved to another list, and rows re-ranked inside the visible list."
measures: "The cost of applying five different write kinds inside one frame and producing the final window of both views once, including whatever ordered structure the store keeps for the group."
favours:
  - "Stores that defer derivation to the frame boundary, or libraries whose batching API is honoured by `frame` (scenarios.ts:933-943): they derive each view once over the finished frame."
  - "Designs that re-derive one window from scratch, because every one of the 19 row changes lands in view A's window or at the head of view B's, so incremental maintenance has no off-screen work to skip. Direction asserted from the shape of the sets, not measured."
  - "Against libraries with no batching API at all: their `frame` is a plain call, so each of the 13 binding calls can deliver on its own."
biases:
  - "All five sets sit inside view A's window by construction (dataset.ts:940-965, 1092-1096): movers in slots 0-3, patched rows in slots 4-6 at the default window, sorters at slots 7, 9, 11, 13 (dataset.ts:779-793), the deleted set in slots 28-31. A real frame from a server touches mostly rows nobody is looking at; `batchPatch` asks that half."
  - "Movers arrive in group B at their resting ranks 1-4, which are below every other row (dataset.ts:440-447, 630-637), so each arrival is at position 0 of view B, the cheapest insertion into an ordered bucket. `moveAndReorder` is the script meant to ask the mid-order arrival."
  - "Small: 4 inserts, 4 deletes, 3 label patches, 4 group moves and 4 rank moves at the default point (MOVER_COUNT and SORTER_COUNT, dataset.ts:69-71; sorter count dataset.ts:779-782; patched slice dataset.ts:955). The row is dominated by per-frame overhead and two window derivations, not by write volume."
  - "The inserted rows are cloned once in `prepare` (scenarios.ts:910-918) and the same objects are written in every sample, after the untimed restore removed them (scenarios.ts:919-930). A store that keeps the objects it is given sees the same identities each time; whether any participant has an identity-keyed cache this helps is not verified."
  - "`finalStateOnly` (scenarios.ts:908): torn intermediate states produced by a library without a batch API cost time but are not judged. Sound for a frame whose render count is the store's answer."
summary: "A realistic mixed frame, small and concentrated on the visible window, whose correctness is pinned by the final-state comparison and the population audit rather than by `check` alone."
---

## What the script does

One step, one `settle` (scenarios.ts:931-945). Inside `ctx.binding.frame` it calls
`write` with the inserted rows, `remove` with the tail of view A's window, three
`patchLabel`, four `setGroup` to group B and four `setRank` to each sorter's `low`
rank. The five sets are disjoint and `makePlan` throws if the window is too small
to keep them so (dataset.ts:944-954).

## What decides correctness

`check` (scenarios.ts:946-954) asks for two full windows, view A's head to be an
inserted row (only those ids start with `m`: dataset.ts:959 against `r`, `f`, `h`
at dataset.ts:437, 910, 930), and at least one delivery per view. That alone is
weak: a store that applied only the insert would pass it. The strength is
elsewhere: `finalStateOnly` makes the verify and the timed processes compare the
digest and row count of the state both views are left showing against the model
(worker.ts:419-447, 501-512, 647-661), and the population and grouping audits read
the stored rows and all fifty buckets afterwards (worker.ts:462-464). The final
state differs from the starting one in every set, so a store that dropped any of
the five writes fails one of those. No case found where a broken store passes.

## Representativeness

A subscription push or sync response that mixes creates, deletes, edits and moves
is common in collaborative and real-time applications, and no other script here
issues more than one write kind per frame. The size is small and the placement is
the most visible possible, so read it as "one busy visible frame" and read
`batchPatch` for the wide, mostly invisible one.

## The standing record, checked

`ORDINARY_SCRIPT` (scenarios.ts:86-169, signed at :101). A1 holds: the head check
forces a changed state. B4: the table is scaled by `consumerFloor` (one window
delivery per step, floor.ts:76-87, 95); a correct step changes both views, so the
minimum consumer work is two deliveries and the floor understates it; the
multiple errs high, which is the safe direction. C5 holds only if every control
arm implements `frame`; `control.ts` does at the time of reading (control.ts:228,
546, 801, 1045, 1138).