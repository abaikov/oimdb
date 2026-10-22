---
scenario: "batchInsert"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "68adaeb78a83af62"
verdict: "representative"
models: "Initial hydration: the first fetch of a list screen writes the whole dataset into a store whose views are already mounted."
measures: "Bulk-load throughput into an empty store with subscriptions standing, ending at both views' first full render."
favours:
  - "Stores that ingest a batch in one pass and build their indexes once at the end (deferred index build, a bulk-load path) over stores that maintain an ordered index row by row as rows arrive."
  - "Stores that adopt the given objects rather than copying them into their own representation; the harness hands one cloned array (worker.ts:85) and copying is legitimately extra work."
biases:
  - "Construction and subscription are outside the clock (`rebuild: true`, scenarios.ts:3085; `rebuild`, worker.ts:354-357, run from `settleForSample`, worker.ts:371-379, as the sample's untimed `setup`, measure.ts:73). Libraries expensive to construct and cheap to write look cheaper than at a real cold start; `coldStart` exists for that."
  - "The empty render some libraries make on subscribe is discarded by `reset(forgetBetweenSamples)` before the clock (worker.ts:368-379; harness/README.md#scenarios 'Two frames at a cold start'). Neutral here, but it hides a user-visible frame that `coldStart` shows."
  - "One `write(rows)` call (scenarios.ts:3091-3094): every adapter may batch inside it, so eager and deferred stores are on equal terms. It is not wrapped in `frame`."
  - "Five short columns per row (dataset.ts:29-35): stores whose load cost scales with field count (per-field observables, deep proxies) pay less than on application-width entities."
  - "`repeatable: false` with a rebuild per sample (scenarios.ts:3085-3088; cells/runBatch.ts:55): one run per sample and a `collect` call before it (measure.ts:73-77), which forces a GC when `global.gc` is exposed (worker.ts:63-67), so GC triggered by the load's allocations is likely outside the timed region."
summary: "A real, once-per-screen operation at a realistic size; it excludes construction and GC, so read it with coldStart and the memory pass."
---

## What the script does

One step: `write(ctx.loadRows)` — all 10 000 rows at the default point — into a
freshly built, empty binding whose two views are already subscribed, then
`settle()` (scenarios.ts:3091-3094). Each consumer must produce exactly one
distinct render and A a full window (scenarios.ts:3095-3102). The model starts
empty (scenarios.ts:3103-3109); the worker loads no opening state for a
`rebuild` script (worker.ts:362, 385-394).

## Representativeness

Hydrating a list from a fetch is something every list screen does, usually once
per navigation; 10 000 rows is large but realistic for an admin table or a
local-first cache. js-framework-benchmark's "create 1,000 / 10,000 rows" is the
same task measured with the DOM. The suite's version is stronger in demanding a
correct sorted, windowed view at the end and weaker in excluding parse, framework
and construction cost.

## The standing record, checked

`ORDINARY_SCRIPT` (scenarios.ts:86-169, listed at :97). Holds for this script.
WHY-EACH-ROW.md records two earlier explanations of this row ("batch insert —
oimdb is ~4× effector" and "batch insert — signaldb, figure retracted until
re-measured"); both were measured on earlier code and are not re-verified here,
and the signaldb figure is retracted because its wiring has since changed.