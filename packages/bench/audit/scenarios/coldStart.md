---
scenario: "coldStart"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "5d29dda9269d341d"
verdict: "narrow"
models: "A screen opening from nothing: create the store and its two views, subscribe, load every row, and deliver the first frame."
measures: "Construction plus subscription plus bulk load plus first delivery, all inside the clock; read against `batchInsert` for the construction share."
favours:
  - "Libraries cheap to construct and to subscribe (no schema compilation, no per-view setup)."
  - "Libraries that do not render an empty frame at subscribe time, but only in the counters: the render count is not judged (`finalStateOnly`, scenarios.ts:4052-4067)."
biases:
  - "It is not cold. The timing loop runs the whole construction at least once and up to `warmup` iterations before sampling (measure.ts:55-69; `planFor` warmup between 5 and 2000, capped at 5 s of warm-up, measure.ts:34-39, 118-138), so construction runs JIT-hot. A real cold start runs library code for the first time, interpreted or baseline-compiled, after parsing it. Tilts toward libraries whose construction is heavy but JIT-friendly; the label overstates what is measured."
  - "Parse/evaluate of the library bundle is outside the clock (the module is loaded once per process, worker.ts:69); bundle size is measured elsewhere (src/bundle.ts) and not combined with this row."
  - "Allocating the row objects is outside (`loadRows` built once, worker.ts:85) and the previous store is disposed untimed (`restore` calls `dropBinding`, scenarios.ts:4076-4078); where `gc` is exposed it is also collected untimed before every timed sample (measure.ts:45-47, 74; worker.ts:63-67)."
  - "Six libraries were recorded rendering an empty frame before the full one (scenarios.ts:4056-4061: mobx, legend-state, effector, nanostores, preact-signals, alien-signals, measured 2026-08-29); that cost is inside the clock for them, as it is for a user. Neutral. The record predates the 2026-10-17 upgrades of mobx (7.0.6) and nanostores (1.5.5) and was not re-checked."
summary: "The only row with construction in the clock, but construction is warmed by repetition, so it is a hot-construction cost rather than a page-load cold start."
---

## What the script does

One step: `newBinding()`, `write(loadRows)`, `settle()` (scenarios.ts:4079-4083).
`check`: at least one delivery per view and a full window A (scenarios.ts:4090-4097).
`fromEmpty` (scenarios.ts:4051) resets the consumers to forget (worker.ts:368-375),
skips the opening load (worker.ts:362) and starts the model empty.
`repeatable: false` (:4071).

## Representativeness

Opening a screen is real and per-navigation. What a user experiences at a cold
start is dominated by code that has never run; this script repeats the
construction until it is warm and reports the minimum (measure.ts:55-97). The
quantity is useful (the cost of building a store and its subscriptions in a
running application, for example on a route change that creates a per-route
store), but that is a narrower thing than "cold start to first render".
js-framework-benchmark measures startup separately (script bootup, TTI) in a real
browser.

## The standing record, checked

`ORDINARY_SCRIPT` (scenarios.ts:86-169, signed at :99). Its header says the script
"settles inside its own loop with two live consumers" (scenarios.ts:80-85); here
the two consumers exist before the clock (worker.ts:76) and the views that drive
them are built and subscribed inside it by `newBinding` (worker.ts:320-334), which
the record does not describe but does not contradict.