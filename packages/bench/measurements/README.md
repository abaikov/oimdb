# Measurements

Every performance figure this project publishes has to point at a directory in
here. Not at a memory, not at a terminal somebody had open, not at a comment.

`BENCHMARKING.md` at the repository root holds the rules this package is written
to — which harness owns which question, what a scenario is, what an adapter may
do, and the naming schemes. This file is the one of those rules that governs the
directory it sits in.

## Why the rule is this blunt

A number measured once and quoted outlives the thing that produced it. A figure
whose artifact does not exist is a claim wearing a measurement's clothes, and it is
indistinguishable from a real one by the time anybody reads it.

So: a figure in `website/docs`, in a `README.md`, in `llms.txt` or in a source
comment names a directory here, or it does not get written.

## Scenario tables are not artifacts of this directory

`npm run bench` produces the scenario tables — every ratio between two libraries,
every place, every floor multiple. A timing figure from them is citable only from
a `<date>-bench/` directory here; `recordedTimingArtifacts()` reads this directory on
each run, and the memory pass prints its caveat beside its figures until one exists.

`packages/bench/results/` is not a substitute.
A piece there is **one scenario at one operating point, as each worker reported
it** — an intermediate the report is reassembled from, overwritten by the next
run of the same (point, scenario), with no `report.txt` a link can point at. It
is evidence for the run that is happening; it is not a citation, and quoting one
in a README, in `llms.txt`, in `website/docs` or in a source comment is the exact
failure the section above this one is about.

## What a run directory holds

`<date>-<harness>/<piece>/`, e.g. `2026-08-20-price/write/`. Three files per
piece, because three different readers open them:

| file | who reads it | what it is |
|---|---|---|
| `machine.json` | anybody disputing a number | CPU, cores, memory, OS, Node build, **and the load gate that was in force**. A retention run adds the V8 build's pointer-compression flag and the bytes-per-reference its control measured — a byte table from a machine whose reference width is not recorded cannot be compared with one from any other machine. |
| `records.json` | anybody re-deriving a claim, and the next run's diff | every field the worker and the runner produced, unrounded |
| `report.txt` | a reader who followed a link out of the docs | the run exactly as the terminal printed it, controls first |

`report.txt` is regenerated from `records.json` rather than captured from stdout,
so the two can never drift apart or disagree about a rounding.

A fourth file appears where a run's own readings turned out not to measure what
they said: **`VOID.md`**, naming what the pair actually did and what it must have
before it is re-run. A directory carrying one may not be cited from anywhere, and
the readings are kept rather than deleted so that the next reader meets the
refutation instead of re-deriving the number.

**A retained path's enum value and the directory its artifact sits at here are the
same string, and nothing enforces that.** They hold together only as long as they
stay equal; a value renamed without its directory silently points a citation at
nothing.

## Four directories whose date is a filesystem date

No `machine.json` in this directory records a timestamp, and the date in the
name of `2026-09-07-price/chain-depth/` and of the three
`2026-09-06-alternatives/dedup-place*/` pieces is the modification time of that
piece's own `records.json` rather than anything the runner wrote. A date read
off a filesystem is weaker evidence than a date written by the runner.

All four were also measured with the gate raised — to 3 for `chain-depth/`, to
16 for `dedup-place/` and `dedup-place-with-checked-stamp/`, which are void by
their own `VOID.md`. `dedup-place-rebuilt/` ran at `maxForeignLoad: 0.5` with
the gate down.

## Why a piece, and never one directory for a whole run

A piece is self-contained: it re-measures **both controls** and carries its own
load readings, so it can be read, disputed and re-run without any other piece
being present. Nothing is merged, and no row is ever averaged with a row
measured at another moment.

The alternative — one directory per run, refilled as pieces complete — fails in
two ways at once. A later piece silently overwrites an earlier one's file, and a
table assembled from pieces measured minutes apart hides the fact that the
machine was a different machine for each of them.

`2026-08-20-price/write/` shows the case: the run asked for all 32 pairs and measured
**10**; the ten write-path pairs went through at a foreign load of 1.52, and then a
background process pushed the one-minute average to 3.84, so the remaining 20 were
**refused rather than measured**.

## The controls come first, and they can void the run

`report.txt` opens with two rows that are not prices:

- **`control-resolution-2x`** — two bodies of arithmetic where one deliberately
  does twice the work of the other. The true ratio is a little under 2, because
  both sides pay the driving loop once. **A reading below 1.5 voids the whole
  report** and the runner exits non-zero: a process that cannot resolve a
  doubling it was told about has no business printing ratios.
- **`control-scale-same-body`** — the same body twice, over its own copy of the
  same state. The true ratio is 1.00 exactly, so whatever it prints instead was
  produced by this machine at this moment. **No ratio closer to 1.00 than that
  gap is a reading.**

This is not ceremony. Under an unrelated `npm install` holding 71% of a CPU (load
9.75 on eight cores), the resolution control reported a known 2x difference as
**9.8%**, with spread 226–520% inside a process and drift 77–90% across processes.

Those two are the controls of the harnesses that hold a **stopwatch**. The
harnesses that count bytes have their own, aimed at their own instrument — the
toolchain for `bundle`, a known-size allocation and a two-process floor for
`retained` — and each of them voids its own report the same way. The rule is the
shape and not the rows: **a control that could not see something it was told was
there, printed before anything it was not told about.**

## The machine is part of the number

Every row carries the one-minute load average read before and after it, from the
parent process, where a process spawn was already being paid for. Nothing in this
suite calls `os.loadavg()` between a clock start and a clock stop.

A pair whose foreign load exceeds the gate is **refused rather than measured**.
The gate counts runnable work — not utilisation — because what hurts a
minimum-of-samples estimator is anything else being runnable at the instant the
sample is taken. The default allows 0.5 of a runnable process beyond this
harness's own workers.

**How many of its own it allows for is not the same in every artifact here**, and
which rule a piece was gated under is read off the piece itself: one with no
`selfAllowance` field allowed exactly one runnable process, and one carrying the
field allowed one per worker it was measured in — `BENCH_PROCESSES`, three by
default. The one-process rule counted two of the harness's own
processes as somebody else's work, which refuses a piece rather than admitting
a bad one; a refusal recorded by a piece with no `selfAllowance` may therefore be
a refusal on this suite's own workers.

### A measurement window is exclusive, and the interference is usually your own

The interference behind recorded refusals is **this
repository's own work** — a background process reading source files, running
beside the harness.

So the window belongs to the harness alone. Nothing else runs in it: no test
suite, no typecheck, no build, no editor indexing a rename, no background
analysis. Finish that work first, then measure. The two are never interleaved,
because the second one silently pays for the first — and the payment arrives as a
refusal if you are lucky, and as a plausible wrong number if you are not.

The gate is raised with `BENCH_MAX_LOAD=<number>`, never with a "yes": whoever
raises it names what they accept, and that number is written into
`machine.json` with `gateWasRaised: true` and printed under every table produced
under it. A widened gate ends up in the artifact instead of in somebody's shell
profile.

## Making a run

```bash
# one piece, controls first, recorded — this is the normal case
npm run price -- --only upsert,update,remove --record measurements/2026-08-21-price/write
npm run price -- --only find,read,slotOf,entity --record measurements/2026-08-21-price/read

# one area, while working on it — a terminal, no artifact
npm run price -- --only update

# the catalogue, without measuring anything
npm run price -- --list

# the same, for the designs we turned down — READ THAT TABLE BACKWARDS
npm run alternatives -- --only dirty --record measurements/2026-08-21-alternatives/dispatch
npm run alternatives -- --list

# what one public API costs an application that never calls it — bytes, not time
npm run bundle -- --record measurements/2026-08-21-bundle/ordered-list
npm run bundle -- --list

# what an option HOLDS for the life of the process — bytes again, and a heap this time
npm run retained -- --only clock --record measurements/2026-08-21-retained/clock
npm run retained -- --only changed-fields --record measurements/2026-08-21-retained/changed-fields
npm run retained -- --list

# one task, one arm, against the floor — while changing the engine. Prints, stores nothing.
npm run duel -- oimdb patchColumn
npm run duel -- --list
```

`--only` matches by substring against the pair id and takes a comma-separated
list. Whatever it selects, **the controls always run** and are recorded with the
piece: a price printed under an unattested instrument is a number nobody has any
reason to believe.

The price harness spawns one process per pair and each pair takes seconds, so it
is interruptible and can be run one operation at a time. That is deliberate: a
benchmark costing an hour is a benchmark that is never run honestly, because
either the machine is lost for the hour or it is used and the numbers are junk.

## Six harnesses, six different questions

Which one a new measurement belongs in — and the boundary between `price` and
`alternatives` in particular — is `BENCHMARKING.md §1`.

- **`price.ts` → `npm run price`** — what does each call `@oimdb/core` offers
  cost against the primitive a person would have written instead? `upsert`
  against `map.set`, a one-column update against `row.title = value`, resolving a
  group against `byDeck.get('spades')`. **A row here is a price tag, not a rank.**
- **`alternatives.ts` → `npm run alternatives`** — is this the fastest way we
  could have done it? Same worker, same controls, same records; the floor is not
  a primitive but **the design we rejected**. **So the ratio reads the other way:
  below 1.00 the shipped design wins, above 1.00 the decision was wrong.** Its
  report sorts ascending and marks every row above 1.00 with a `!`, which is why
  it is a separate entry point rather than `price --only alt.` — the price report
  would sort our best decisions to the top under the heading "worst ratio first".
- **`src/bench.ts` → `npm run bench`** — which library is faster at a whole screen,
  against every other row in the registry. (How many that is is derived from
  `ADAPTERS` and printed under every table, never written down here — a count in
  a document is a count nobody recomputes.) An hour-long batch; it splits into
  pieces for the reason above.
- **`duel.ts` → `npm run duel`** — did the change I just made move us, on ONE
  task, against ONE arm and the floor? The same scenarios, workers and dials as
  `npm run bench`, and two rows instead of the whole field. **It does not rank**
  — two rows have no places to hold — and **it stores no piece**, because a
  two-arm run written into `results/` would either overwrite a full table or sit
  beside one looking like a measurement of the same thing. So a duel is a check
  while working, never a citation: a figure quoted anywhere still names a
  directory here.
- **`bundle.ts` → `npm run bundle`** — what does one public API cost an
  application that never calls it? Not a stopwatch: two real consumer modules,
  the same program except that one of them asks for an ordered list, bundled and
  tree-shaken and minified and gzipped, and **the difference between them**. It
  exists because a claim about bytes is out of reach of any timing harness. For the
  ordered list it reads **+1 607 B minified, +655 B gzipped**, 3.6% and 5.3% of the
  exported surface (`2026-08-21-bundle/ordered-list/`).

  **It has no load gate, and that is not an omission.** A byte count is
  deterministic — the same source through the same bundler at the same settings
  emits the same bytes whatever else the machine is doing — so there is nothing
  for a foreign process to poison and nothing to refuse. Its controls are aimed
  at the toolchain instead, which is where it *can* be silently wrong: one row
  proves unreachable code is being dropped, another proves the minifier ran. Each
  of those failures produces a well-formatted table with a quotable wrong answer,
  and one of them produces the answer this project would most enjoy quoting, so
  either failing voids the whole report and exits non-zero.

  Its `machine.json` therefore opens with a `determinism` field saying why no
  gate is recorded, and carries the **toolchain** — bundler, version, format,
  target, gzip level — where a price run carries a CPU and a load average. Every
  one of those fields moves the number, and a byte count quoted without them is
  as unreproducible as a nanosecond quoted without a machine.

- **`retained.ts` → `npm run retained`** — what does an option HOLD, for the life
  of the process? Also bytes, and a different kind of bytes from the bundle
  harness: not what ships, but what a running process cannot give back. Two
  populations built to differ in exactly one mechanism, each in its own process,
  each measured on a settled heap, and **the delta between them**. It exists
  because `"~2x entity memory"` (the legacy change tracker's public option) is a
  retained-heap claim, and a timing ratio says nothing at all about a heap. It
  also weighs the shipped engine: what a derivation holds, against what the
  per-slot arm of the clock fork would add to it.

  **A delta, never an absolute, and three controls rather than two.** "The heap
  is 41 MB" settles nothing; "the heap with the mechanism is N and without it is
  M, at the same population" settles it. Two of the controls hold a *known*
  number of references — a reference on 64-bit V8 is four bytes with pointer
  compression and eight without, and there is no third answer — one at eight
  megabytes and one at the scale of the claims themselves, because an instrument
  attested only at the larger size has been attested at the wrong scale. The
  third builds the same population twice in two processes: the true delta is
  zero, and whatever it prints is **the floor, in bytes, that the whole table is
  read under**. Every row additionally carries its own floor, from building its
  `off` arm before and after its `on` arm.

  **`--expose-gc`, and the reading is taken on a settled heap.** A reading taken
  before collection measures garbage rather than retention, so each one collects
  until two consecutive readings agree to within 64 KiB and records how many
  collections that took and what the last one changed. Each arm is also built
  once and discarded before its baseline is read, so compiled code and
  inline-cache feedback are in the baseline instead of in the answer — and each
  arm's retention is measured twice, up from the baseline and down from the
  release, with the disagreement printed rather than averaged away.

  It is `v8.getHeapStatistics().used_heap_size` and **not
  `process.memoryUsage()`**, whose headline is RSS — the operating system's view
  of a process, which moves for reasons unrelated to what an object graph holds.
  A heap snapshot would be the more precise instrument and the argument for not
  using it is in `retained/measureRetainedArm.ts`.

  **A retention row is half a decision.** A mechanism that trades retention for
  time is answered here and on a timing table, and neither half settles it alone:
  what a mechanism HOLDS is this harness, what it COSTS is the write path. The
  clock pair is the example: bytes are the quantity that decides it, this harness
  answers it in bytes and `src/price/` in time.

## What does not belong here

A number produced by a script that no longer exists, a number reconstructed from
notes, a number from a run whose control was not printed. If a figure is worth
publishing it is worth re-measuring; if it is not worth re-measuring it is not
worth publishing.
