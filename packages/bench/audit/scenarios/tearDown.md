---
scenario: "tearDown"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "22af2307d174249e"
verdict: "narrow"
models: "Disposing a whole store together with its views and every subscription — a per-route or per-widget store going away, a micro-frontend unmount, or test teardown."
measures: "The synchronous cost of `dispose()` on a fully populated, fully subscribed binding."
favours:
  - "Libraries whose teardown is dropping references and letting the collector reclaim them: the reclamation is not timed (see biases)."
  - "Against libraries whose teardown walks every subscription and unlinks it from surviving structures (per-row effects, per-slot holds; the script's comment names `OIMEffect.detach` per per-slot effect, scenarios.ts:4105-4110)."
biases:
  - "The usual navigation in an application unmounts VIEWS while a global store survives; there each unsubscribe must unlink from live structures. This script disposes the store too, so a library can skip unlinking entirely. The surviving-store case is the churn family."
  - "GC is excluded: when the worker runs with an exposed `gc`, a forced collection runs before each timed sample (measure.ts:72-74; worker.ts:63-67), so the garbage this teardown creates is collected before the NEXT sample, outside the clock. In an application that cost lands on the main thread soon after navigation. Tilts toward drop-the-reference teardowns."
  - "`repeatable: false` (scenarios.ts:4218) means one run per sample (the repeat cap is 1, cells/runBatch.ts:55) of a region the script's comment puts at tens of microseconds (scenarios.ts:4111-4115), so timer resolution and noise are a large share; C3's spread ceiling is likelier to refuse a rank here, as the record says (scenarios.ts:4198-4202)."
  - "The proof frame cannot tell 'refused the write' from 'accepted and stayed silent' (scenarios.ts:4253-4255); both pass."
summary: "A real but uncommon event — the whole store disposed — whose measured cost excludes garbage collection; the everyday navigation case is an unmount against a surviving store, which this row does not ask."
---

## What the script does

Restore drops the binding, builds a fresh one and loads it untimed
(scenarios.ts:4226-4231); the timed step is `dropBinding()`, which calls
`binding.dispose()` (scenarios.ts:4232-4234; worker.ts:335-339). `check` demands no
delivery during the teardown, then writes a page into the torn-down binding (a throw
is swallowed) and demands no delivery again (scenarios.ts:4241-4268). The population
audit is skipped (`populationDestroyed`, scenarios.ts:4215; worker.ts:454).

## Representativeness

Whole-store disposal happens, but for most single-page applications the store
outlives screens. The task is therefore real and infrequent. As a measurement it
captures the synchronous unlinking work only; libraries that defer everything to
the collector look free. Neither js-framework-benchmark (which measures "clear
rows", DOM-side) nor the signal benchmarks measure a store teardown, so this is a
property the suite asks that others do not, with the GC caveat above.

## The standing record, checked

Its own record (scenarios.ts:4140-4212). A1 and A3 NOT MET are stated with reasons
that match the code; standard.ts:337-345 would refuse an A1 MET here. B4 MET: the
`populationDestroyed` flag makes the step a `teardown` (floor.ts:85) and `BOUND_BY`
hands it `tearDownFloor` (floor.ts:96); see that card for what the floor is. C5 MET
holds because the controls all supply `bind` (types.ts:463; standard.ts:380-397).
