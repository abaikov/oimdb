---
scenario: "singleResend"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "7ef9eae2fbb38f19"
verdict: "narrow"
models: "Setting a held value to what it already holds — a state setter called with the current value, a toggle re-applied, a form field re-synced."
measures: "Whether the library itself suppresses a notification for an unchanged primitive, and the cost of the write path when it does or does not."
favours:
  - "Libraries that compare before notifying: they deliver nothing, and a correct row is close to the cost of the write call."
  - "Against libraries that notify on every write: each step wakes the subscriber, which renders the identical line."
biases:
  - "The value is a primitive string (`seeds[0]`, scenarios.ts:5467; SINGLE_SEEDS, dataset.ts:328). For a primitive, reference equality is value equality, so any library comparing with `===` or `Object.is` recognises it for free. The row separates 'compares at all' from 'never compares'; it cannot separate structural from reference comparison, which `resendUnchanged` asks with fresh objects (scenarios.ts:1496-1502)."
  - "A store whose `writeSingle` does nothing passes: the stored value is `seeds[0]` either way, `check` asks only that nothing distinct was rendered (:5473-5475), and the single-value audit reads back the value the model also holds (worker.ts:457-459; oracle.ts:621-641). `writeSingle` is proved by `singleWrite`, which calls the same method; the proof is across rows, not inside this one."
  - "No floor (`rendersNothing`, :5459; floor.ts:79, 129-136): a row that wakes is not relieved of its consumer share. That is what the row is meant to show."
summary: "A frequent no-op write, but on a primitive, so it ranks libraries by whether they compare at all; read it beside `singleWrite`, which proves the same write method moves the value."
---

## What the script does

`prepare` hands the binding its two values; `restore` does nothing because
nothing changes (scenarios.ts:5461-5464). The run writes the value already held
32 times, settling after each (:5465-5472). The oracle sets the same value and
emits both views each step (:5476-5485); every emit folds the state already shown,
so the model produces no distinct render.

## Representativeness

Re-applying an unchanged value is common in application code, and frameworks
spend effort bailing out of it (React's `setState` bail-out). For a primitive
held in a signal or atom it is trivial for any library that compares, so the row
is narrow: one corner of change detection, the cheapest one.

## The standing record, checked (SILENT_SINGLE_SCRIPT, scenarios.ts:5394-5401)

- RESOLVED: A1 is now NOT MET (:5396-5400), in a record of its own that spreads
  `SINGLE_SCRIPT` (:5335-5392) and replaces A1 alone, as `SILENT_SCRIPT` does for the
  row family. The previous card's finding — A1 MET contradicting a script whose
  correct answer renders nothing — no longer holds, and `undrivenRowsOf` returns no
  names for this table because it lists rows only when A1 is MET (standard.ts:771-779).
- A2 MET (:5341-5345, inherited) holds: the redundant count is the row's answer here.
- B4 MET (:5367-5371, inherited) holds as written: the falsifier text names this
  script as scaled by no floor, and `UNBOUNDED_BECAUSE` has the `nothing` entry
  (floor.ts:129-136), which standard.ts:451-460 requires.
- C5 MET (:5388-5391, inherited) agrees with the controls: all three supply a single
  wiring (control.ts:1187-1190, 1223-1226, 1286-1289).
