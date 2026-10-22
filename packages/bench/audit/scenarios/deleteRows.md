---
scenario: "deleteRows"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "ceeb633e8fc09994"
verdict: "narrow"
models: "Bulk removal of everything currently visible in one list (select-all-on-page and delete, or a server purge of those keys), refilled from the rows behind."
measures: "Batch removal from an ordered group plus the window refill, in one frame."
favours:
  - "Stores that remove a batch by one filter or rebuild pass over stores that remove element by element from a sorted array; the script was sized to stress the latter (scenarios.ts:1306-1315)."
  - "Neutral on coalescing: `remove(ids)` is ONE binding call (scenarios.ts:1337-1340), so every adapter can wrap it in its library's batch."
biases:
  - "The 32 removed rows are the lowest-ranked of group A, contiguous at the head of the sorted group (`plan.windowA`, scenarios.ts:1320, 1338; dataset.ts:794). For a splice-based ordered list that is the worst position (every remaining row shifts) and for a filter rebuild it is no different from any other; tilts against per-element splice designs. The removal in oimdb's ordered bucket is `indexOf` + `splice` (packages/core/src/engine/bucket/array/OIMBucketSlotsServiceArrayDriven.ts:58-63; `removeAt` :160-169)."
  - "The class the script's comment cites, `OIMBucketServiceOrdered` (scenarios.ts:1307-1310), does not exist in core/src; the adapter uses `createOIMIndexServiceSortedArrayDriven` (adapters/oimdb.ts:14, 158)."
  - "`repeatable: false` (scenarios.ts:1328) gives one run per sample (cells/runBatch.ts:55); the timed region is short, so per-sample noise is a larger share."
summary: "A real bulk-delete with a refill, positioned at the head of the order; read beside `deleteOneRow`, which now measures the single-row case."
---

## What the script does

One step: `remove(plan.windowA)` and `settle()` (scenarios.ts:1337-1340). A must
produce exactly one new state with a full window refilled from the next rows, B
none (scenarios.ts:1341-1350). Restore writes the deleted rows back untimed
(scenarios.ts:1333-1336). The oracle removes the same ids and emits once
(:1351-1355).

## Representativeness

Bulk delete of one page is a real UI action but rarer than deleting one row; the
row is sized to stress an ordered structure's removal path, which is a property of
one design rather than of the application (the comment says so, :1312-1314).
js-framework-benchmark's "remove row" removes ONE row from a 1000-row list; its
"clear" removes all. `deleteOneRow` (scenarios.ts:1361-1409) is now the
single-row case and `drainGroup` (:1414-1461) empties a whole group.

## The standing record, checked

`ORDINARY_SCRIPT` (scenarios.ts:86-169, signed at :95). Holds for this script.