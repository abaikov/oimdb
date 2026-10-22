# Benchmarking

The rules every measurement in this repository is held to.

They exist for one reason: a number outlives the run that produced it. A figure
is copied into a comment, then into a README, then into a docs page, and by the
time anybody disputes it the script is gone and the machine is gone and what is
left is a sentence that reads exactly like a measurement. Every rule below
follows from making that impossible — by giving each measurement a question it
owns, an artifact it points at, and a standard it answers against.

`TESTING.md` is the companion document: a test asserts a **count**, which is
deterministic, and a benchmark reports a **duration**, which is not. Nothing in
`packages/bench` is a test, and no test anywhere asserts a time.

---

## 1. The seven harnesses, and which question each one owns

Seven entry points, seven questions. **A measurement belongs to exactly one of
them, and the way to find out which is to say the question out loud before
writing any code.** If the sentence you end up with is not one of the seven
below, the measurement does not have a home yet and inventing an eighth is the
smaller mistake than filing it under a question it does not answer.

| entry point | script | the question it owns | the unit |
|---|---|---|---|
| `src/bench.ts` | `npm run bench -- next` | which library is faster at a whole screen, against every other library in the registry — collected cell by cell (`src/cells/`) | ms and a ratio to the anchor of the same batch, ranked |
| `src/duel.ts` | `npm run duel` | did the change I just made move us on ONE task, against ONE arm | ms, a ratio, no rank |
| `src/price.ts` | `npm run price` | what does a call this library offers cost against **the primitive a person would have written instead** | a ratio, ours over the floor |
| `src/alternatives.ts` | `npm run alternatives` | is the design we shipped the fastest one we could have shipped — against **the design we turned down** | a ratio, read backwards |
| `src/retained.ts` | `npm run retained` | what does an option HOLD, for the life of the process | bytes of settled heap |
| `src/bundle.ts` | `npm run bundle` | what does one public API cost an application that never calls it | bytes, minified and gzipped |
| `src/lines.ts` | `npm run lines` | how much code did one library need for one task — per wiring shape, everything reachable from that wiring and nothing only another shape needs (`src/lines/wiringCodeVolume.ts`) | code lines per (participant, shape), shown beside every timing row |

### The boundary a contributor will get wrong: `price` against `alternatives`

They share the pair type, the worker, the machine gate and the controls. One
module measures both, deliberately, so the two tables can never be timed
differently (`src/price/runPricePairs.ts`). What differs is **what stands in the
`floor` of the pair**, and it changes the meaning of every ratio in the table:

- in `price`, `floor` is **a primitive a competent person would have written**
  instead of calling us — `upsert` against `map.set(id, row)`, `find` against
  `map.get(id)` (`src/price/pricePairs.ts`). A ratio above 1.00 is normal; the row is a
  price tag and not a rank.
- in `alternatives`, `floor` is **a design this project built and refused**. The
  ratio therefore reads backwards: below 1.00 the shipped design wins, above
  1.00 the decision was wrong (`src/alternatives.ts`).

Ask it as one question: *is the thing on the other side of this pair something a
USER would have written, or something WE would have written?* A user's hand-rolled
`Map` is a price. A dispatch scheme we prototyped and dropped is an alternative.
Nothing is both, and a pair that feels like both is two pairs.

The catalogues enforce it by id: every alternatives pair id begins `alt.`
(`src/price/pricePairs.ts`), and no price pair does.

### The other six boundaries, in one line each

- **`bench` against `duel`.** Same scenarios, same workers, the same points
  (`--point`) and the same sampling-plan rule (`src/duel.ts`, `src/cells/runBatch.ts`).
  `bench` measures every adapter and RANKS them; `duel` measures two rows and
  refuses to rank, because two rows have no places to hold (`src/duel.ts`). Use
  `duel` while changing the engine — the full `bench` matrix is many hours of an idle
  machine, collected a budget at a time (`npm run bench -- status` prints the
  estimate), and a check nobody repeats is not a check.
- **`duel` stores nothing.** A two-arm run written into `results/` would either
  overwrite a full table or sit beside one looking like a measurement of the
  same thing (`src/duel.ts`). If you want an artifact, you want `bench`.
- **`price` against `bench`.** `price` prices ONE CALL against ONE primitive;
  `bench` prices a whole screen against a whole library. A pair is not a scenario
  and a scenario is not a pair.
- **`retained` against `bundle`.** Both count bytes and they are different bytes.
  `bundle` is what SHIPS — source through a bundler, deterministic, no machine
  gate at all. `retained` is what a RUNNING process cannot give back — a heap
  delta on a settled heap, with `--expose-gc`. A claim about a download is
  `bundle`; a claim about memory is `retained`.
- **`retained` against a stopwatch.** Retention is not slow, it is *present*, and
  no stopwatch reports it (`src/README.md#retained`). A mechanism that trades
  retention for time owes BOTH halves, and each half names the other.
- **`lines` against every other one.** It is the only harness whose answer is not
  a cost the machine pays, and it has no gate and no machine controls for the same
  reason `bundle` has none: the same source through the same parser yields the same
  count on a loaded laptop and an idle one (`packages/bench/README.md`). **Fewer lines is not
  better on its own**, and a line count is never summed with a time into a score —
  the hand-written floors are the shortest code here and the least survivable. It
  also counts the ADAPTER, written once by us per library, and not what a consumer
  writes per application.

### Where the seven genuinely overlap

There is one place, and it is named here because a contributor cannot follow a
rule that does not exist. **A rejected design that is also a shipped strategy has
two homes.** Where a trade-off has two arms that are each right for some
consumer, this project ships both behind one abstraction and lets the consumer
pick at construction — `createOIMEntityWriterInPlace` / `createOIMEntityWriterReplacing` is the shape — and each
arm's cost belongs in that strategy's own documentation. But a fork that was
*considered and not shipped* is an `alternatives` pair. The two look identical
from inside the pair: two bodies, one ratio.

The rule that separates them: **`alternatives` measures what is NOT in the
tree.** If both arms are reachable from a consumer's `import`, it is not an
alternative, it is a fork, and it is priced as a `price` pair per arm so that a
consumer choosing between them reads two price tags rather than one ratio in
which their own choice is called wrong.

---

## 2. What a scenario is

A scenario is a **task with an observable result**. It is written once, in
`src/harness/scenarios.ts`, and every adapter answers the same one.

**It states the task and the result, never the method.** "Patch one column of
every row in the window and leave both views showing what they should show" is a
task. "Call `updateByKey` in a loop" is a method, and a scenario that states a
method has already decided which library wins.

### What a cell is

A cell measures **a real application doing a real task, with the renderer replaced
by a string consumer**. A UI framework's render costs far more than any state
manager's bookkeeping, so a real renderer would bury the difference under its own
cost and its own noise. The string consumer keeps the shape of a real app and takes
the renderer's cost out:

- **The store drives the paint.** The library's own observers (effects, reactions,
  subscriptions) mark what changed. `settle` is the frame's commit, as a renderer's
  `requestAnimationFrame` is: it paints what was marked and nothing else. An adapter
  never decides on its own to repaint.
- **The adapter is what a competent user of that library would write**: its fastest
  idiomatic path, its shipped parts before hand-written ones. What the library does
  not ship, the adapter writes, and those lines are counted.
- **A result is three numbers, never one**: the time (with the harness floor of its
  shape beside it), the lines of code the task needed (`npm run lines`), and what the
  consumer saw — deliveries, distinct renders, redundant renders (`d/n/r`). A fast row
  that woke the wrong view, or a short one that renders twice, is not a win.

### Two phases, and everything a library can hoist belongs in the first

`prepare` is untimed and `run` is timed (`src/harness/types.ts`, `TScenario`).

**Every adapter may hoist into `prepare` as far as its library allows.** The bind
phase is outside the clock for every participant, so *an adapter that could hoist
and did not was measuring its own wiring rather than its library*
(`src/adapters/effector.md`, `pairsSeeded`). Hoisting is not cheating; failing to hoist
is.

What an adapter hoists it must **declare**, in the header of the wiring that does
it, in the terms of the library's API. The effector relation binding is the
worked example: it says what moved out of the clock, what stood there before, and
why the previous shape was this file's choice and not the library's limit
(`src/adapters/effector.md`, `pairsSeeded`).

### What makes a scenario inadmissible

- **It names a method.** See above.
- **It has no observable result.** Every scenario ends in a `check`, and every
  timed operation ends in a consumer that would have re-rendered
  (`src/harness/standard.ts`, item A1). A script whose consumer never wakes is timing
  a write nobody reads.
- **Its result cannot be checked against the reference model.** Each adapter's
  digest is compared against `BenchOracle`, which shares no derivation, no
  sorter and no delivery loop with any adapter (`src/harness/oracle.ts`, `BenchOracle`).
  A disagreement VOIDS the scenario and is printed as a disagreement, never as a
  table (`src/bench.ts`).
- **It is a rewording of a scenario that already exists.** Two scenarios may
  cover the same operation only when they reach it by a **different path in the
  source** — the same rule `TESTING.md §5` applies to a "through a real X" test
  file. `churnColumn` and `churnShared` are two scenarios because they mount
  different SHAPES; `churnSharedReversed` is one because the order of the mounts
  is the thing under measurement.
- **Only one library can express it.** A scenario every other adapter has to
  decline is a fact about the scenario. Sixteen declines around one row is not a
  comparison.
- **It runs several frames and is checked only on its final state, with no floor
  on the counts.** `finalStateOnly` says the digest compares the state a script
  left behind rather than the sequence it emitted, which a multi-frame script
  needs; what it does not give is any bound on how many deliveries happened
  getting there. A multi-frame script must add a floor on the delivery or distinct
  count in its own `check` (`src/harness/types.ts`, `TScenario.finalStateOnly`).

A dial a script derives its own writes from is bounded by what makes the write
observable: `RESORT_FRAMES` is strictly below `WINDOW`, because the re-sort script
rotates the window's ranks by `frame + 1` positions and a shift of `WINDOW` is the
identity (`src/harness/dataset.ts`). Nothing throws on it.

### The one string that is not a scenario

`NO_SCENARIO` is `'-'` (`src/harness/memoryPass.ts`). The memory pass runs no
script — it loads the population and reports what the store holds — and passing a
real key there would say the figure belongs to that row of the report. It is a
sentinel, not one of the scenarios, and nothing else may be passed in its
place.

It does not live among the things that ARE scenarios: one module owns the whole
of what the memory pass is — the sentinel and the pass's answers to the fifteen
items.

### A scenario signs the standard — and so does the one pass that is not one

Every scenario carries a `standing` — its answer to the fifteen items of §3 — and
it is checked against the code at module load, in every process, before anything
is measured (`src/harness/standard.ts`). A scenario that cannot answer all of
them does not load.

**The memory pass signs too, because it publishes a table.** It is not a
`TScenario` and cannot become one — it supplies no `run`, no `check` and no
`oracle`, and a heap figure has no digest and no reference answer — so it carries
a bare `TStandardItems` in `src/harness/memoryPass.ts` rather than a signed
`TStandardStanding`. Four things follow, and each is stated there rather than
implied:

- **No signature.** `signedFor` exists to stop a block of answers being pasted
  onto one more script. There is one memory pass, the throw names it, and
  `TScenario.standing` will not accept an unsigned record — the type is the
  barrier the signature would have been.
- **No load-time agreement checks.** `assertAgreesWithTheCode` reads a script's
  wiring to answer A1, A3, B1, B2, B4 and C5, and this pass drives none. Where
  such a check has a rule that transfers, the record follows it rather than
  inventing a second one: B1 needs two sides, B2's subject is the anchor pair (and
  both anchors are weighed here, so B2 is **MET**), B4's is the floor `floorKeyFor`
  hands the table (there is none, so B4 is **NOT MET**).
- **No artifact-time checks.** `firstFoldedRedundancy`, `firstEstimatorMismatch`
  and `undrivenRowsOf` all read counters, a `repeat` and a `samples` off a stored
  timing row. A weighed row carries `baseline` and `held` and none of them, so all
  three have nothing to run over — which is not a gap in those checks; it IS this
  pass's A2, C2 and A1.
- **No place in the census, and none in `STANDARD_GAPS`.** `standardCensus` counts
  (scenario × item) pairs and this is not a scenario; `STANDARD_GAPS` lists holes
  in the scenario record. `bench.ts` prints the pass's answers **in full**, met and
  unmet alike — a reader arriving at the memory table has just read every script's
  record, and several of the items this table misses are met by all of them, so an
  exceptions-only block would read as a short list of small caveats rather than as
  the guarantees that stop there.

Both halves of the same rule as everywhere else apply: `met(wrongIf)` needs a
falsifier and `notMet(missing)` needs what is missing. Where the item's subject is
absent — a clock this pass never starts — the answer is NOT MET saying so, never
MET on the grounds that a demand nobody can fail is satisfied.

---

## 3. The fifteen standard items

The suite's published standard is
`website/docs/performance/how-a-benchmark-earns-belief.md`. Almost every item is
a property of a **script** and not of the suite, so each scenario answers each
item for itself. Thirteen are declared in the scenario; two are derived, because
no source file can assert them.

The memory pass answers the same fifteen and is counted separately, for the
reasons under §2. Several of the items are written for a **timing** and it starts
no clock, so its record — printed in full, with the count derived rather than
written down — is where to look before reading a byte figure against a
millisecond one.

**A MET carries a falsifier** — one sentence naming the observation, code change
or measurement that would turn the answer over. A blank falsifier throws, one
shorter than `SHORTEST_USEFUL_ANSWER` throws, one that reads the item's own demand
back throws, and two items in one record sharing a falsifier throws
(`src/harness/standard.ts`, `assertAnswersSaySomething`).

**A NOT MET carries what is missing**, in the script's own terms, and the reason
says whether the item cannot be met because of what the script IS or because of
an omission (`src/harness/standard.ts`, `TItemStanding`).

### A signature nobody checks is a sentence somebody typed

The column that matters most in the table below is **checked by**. An item whose
answer nothing verifies is a paragraph, however carefully it is written, and the
`met` / `notMet` machinery makes a paragraph look exactly like a measurement.
Three moments can answer, and they are not interchangeable:

- **load** — `assertAgreesWithTheCode`, in every process, before anything is
  measured. The claim and the code disagree, so the script does not load.
- **piece** — asked of the stored piece when the report is assembled, and printed
  under the table it belongs to. These catch what a declaration cannot see: a
  ROW's behaviour, where the standing is a claim about a SCRIPT.
- **construction** — one code path, no assertion. `worker.ts` emits a time only
  downstream of its proof pass; `bench.ts` refuses a place to every row over
  `SPREAD_CEILING`; a worker is spawned with one adapter name. These are the ones
  a reader takes on trust, and they are named as such rather than counted among
  the checks.

| item | what it demands | checked by | what a row failing it may print |
|---|---|---|---|
| A1 | every timed operation ends in a consumer that would have re-rendered | **load** (a `populationDestroyed` script may not claim it — a teardown's timed region ends in silence by construction) and **piece** (which rows woke no consumer at all) | the row, with its delivery counters — which is where a write nobody reads shows before the time does |
| A2 | redundant deliveries counted, not just total ones | **piece** — `deliveries === distinct + redundant` on every row and view, because `BenchConsumer.end` counts one delivery and then exactly one of the other two | the row, with the total only; a store that routes and one that rescans then look alike |
| A3 | checked against an independent model, over the STORED state | **load**, against the script's own declarations | the row; the sequence of states is still compared, the end state is not audited |
| A4 | verification and timing are not separate runs | **construction** — `worker.ts` emits `status: 'ok'` only downstream of `proveThisPass`. Whether a given `check` checks anything is the trust this rests on | nothing — a number produced in a process that did not also verify is not published |
| B1 | both sides do the same job; asymmetry printed on the row it affects | **load**, in the one direction a count can answer: a comparison needs two sides, so a MET on a one-row table throws. Whether the two sides do the same JOB is trust | the row, with the asymmetry printed under the table |
| B2 | the hand-written floor is what a competent person would write | **load** — the hand-written floor IS the anchor pair, so a MET on a table neither anchor supplies is a claim about a row that is not printed | the row, with the floor's shortfall named in the pair's caveat |
| B3 | no adapter does the library's job for it, and departures print here | **load**, NOT MET direction only. Its only unmet cause here is a declaration too coarse to decline in, and a NOT MET on a script whose declaration is its own alone THROWS (`src/harness/standard.ts`). A MET rests on every row's `admission`, which `registry.ts` refuses to leave blank | the row, with the departure under the table |
| B4 | the consumer's own cost is measured and kept out of the reading | **load** — `floorKeyFor` must hand this table a floor among the scripts whose STEP is this script's step, or no floor and an `UNBOUNDED_BECAUSE` entry saying why. None of the six floor scenarios sets the `churn`, `relation` or `single` flag, so a floor dropped from `FLOOR_STEP_DELIVERY` would fall through to `consumerFloor` and scale its family by a window delivery without a word | the row's time, spread and drift |
| B5 | the row covers the whole field, and a coverage under it prints with the number | **derived** from the registry, never declared (`src/harness/standard.ts`) | the row, with the two counts and the family's widest table beside it |
| C1 | machine interference refused, and recorded when permitted | **piece**, and only that the conditions were RECORDED: every piece carries the gate it was permitted, printed unconditionally (`src/harness/load.ts`, `TLoadSummary`). Whether the gate is the right number it cannot say — see §6 | the row, with the gate it was permitted and the load it was taken under |
| C2 | one stated estimator for every row of a column | **piece** — one plan per (point, scenario) is stored on it, and a row whose `repeat` or `samples` differs from that plan is a cell under another estimator | nothing — a column mixing estimators is not a column |
| C3 | variation over the threshold is not presented as a result | **construction** — one code path refuses a place to every row over `SPREAD_CEILING` (`src/harness/measure.ts`) | the row, with its spread; above the ceiling it is given no rank |
| C4 | two arms of a comparison do not share a compiled call site | **construction** — a worker is spawned with ONE adapter name, so no two arms can share a compiled body. Nothing in a stored piece could show that they had | nothing — one call site taught both shapes prices the second arm through a polymorphism neither arm has in production |
| C5 | the instrument attests its resolution at the scale of these rows | **load**, against `CONTROLS` — a table is attested when every control arm supplies its wiring and not otherwise | the row, under a table with no control above it — which is the standing every floor scenario declares, its table having one row and no gap for a control to attest |
| C6 | every published figure names an artifact | **derived** from what is on disk — for a (point, scenario), and before that from whether any directory under `measurements/` was written by this harness at all | nothing |

The count is never written down. `standardCensus` derives it from `SCENARIOS` and
`ADAPTERS` every time the report runs (`src/harness/standard.ts`); a header
carrying a number is a number nobody recomputes.

### The standard's own holes are part of the standard

An item is not the same thing as its check, and a compliance page that prints only
its exceptions reads clean exactly where an item is answered by a mechanism that
cannot fully answer it. Every scenario's C1 says MET, and the gate underneath C1
cannot police its own threshold. So the holes are carried in the record itself —
`STANDARD_GAPS` in `src/harness/standard.ts` — and are printed under the census,
beside the counts they qualify, rather than living in a backlog. **No number is
written into them**: where a gap has a size, the size is derived from the pieces on
disk at print time.

Four stand today: the gate's own subtraction error (C1); the pieces' disagreement
about the self-allowance they subtract (C1); whether any recorded timing run
speaks for the engine as it stands (C6); and the group index being priced in the
write and read families and in no other, because the indexed anchor declines the
churn, relation and single wirings (B1).

---

## 4. What an adapter may and may not do

An adapter is one library's answer to every scenario. The registry is
`src/harness/registry.ts` — `ADAPTERS`, with the resolution controls beside it in
`CONTROLS` and the excluded libraries in `EXCLUDED`. How many rows that is is derived and printed
under every table; it is not written down anywhere, here included.

### The one rule

**No adapter does the library's job for it.** An adapter that holds the VALUES
the library does not hold — an id → signal map, an ids atom standing in for a
store — has stopped measuring the library and started measuring itself
(`src/harness/scenarios.ts`). The admission line is where that is
answered.

### Every row says why it is in the comparison

`TAdapter.admission` is required and may not be blank; `registry.ts` throws at
module load for an empty one (`src/harness/registry.ts`). It answers the
same rule `tanstack-table` is EXCLUDED under — where the values live, and what
emits the change signal that drives the consumer. A rule tested only on the row
it rejects cannot be checked by a reader.

### How a refusal is declared

There are three kinds of refusal and they are not interchangeable. Which one you
are writing is decided by **what is being refused**, not by what is convenient.

| what is refused | how it is said | where the reader meets it |
|---|---|---|
| this library has no row in THIS table | `TWiring.absent` — a written reason standing where the builder would be (`src/harness/types.ts`) | printed above every table it removes a row from, under its declaration name |
| this library is not in the comparison at all | `TExcludedLibrary.reason` (`src/harness/types.ts`) | printed once, above the report |
| this BINDING has no row store to answer with | `noRowStore` — throwing members (`src/harness/types.ts`) | nowhere. It is a crash guard, not a declaration |

The third is the one to be careful with. It is not a statement about a library:
the single-value bindings have no rows because the SCRIPT has none, and a
throwing method is what stands where an empty answer would otherwise pass a check
(`src/harness/types.ts`, `noRowStore`). **A refusal a reader is entitled to see is
never written this way.** `settle` and `dispose` are deliberately not among its
throwing members: a frame boundary and a teardown are real for a single-value
family even when rows are not.

A whole-library exclusion is also deliberately not written as a `cannot` beside
every scenario: a per-scenario refusal reads as a verdict on each script, where
one rule failed once is a fact about the library (`src/adapters/tanstack-table.ts`, `tanstackTableExclusion`).

The rest of this section is about the first kind, which is the one an adapter
author writes.

- Exactly one of `build` and `absent` is set. Both means a wiring and an excuse
  above the same table; neither means a library missing with nothing said about
  it. `registry.ts` throws at module load for either (`src/harness/registry.ts`, `checkWiring`).
- **The unit of a refusal is the SHAPE, not the family.** `churn` is four
  declarations and `reads` is three, and each is checked separately
  (`src/harness/registry.ts`, `CHURN_SHAPES` / `READ_SHAPES`). A family-wide declaration once left an
  adapter that could express three of four shapes with two choices — decline all
  four, or supply the fourth as one of the other three under another name — and
  two adapters took the second, printing a ROW subscription under `churnColumn`
  (`src/harness/types.ts`, `TChurnBinding.mountOnColumn`).
- **`relations` and `single` are the declared exception: one declaration covers
  both of their scripts.** That is not the coarseness the churn and read families
  were split for — the two scripts in each of those families reach the same store
  through the same wiring, so there is no shape an adapter could express for one
  and not the other (`src/harness/types.ts`).
- **The reason must come from the library's API, not from convenience.** "Nobody
  wired it" is not a refusal; it is unfinished work wearing a refusal's clothes.
  The rule is checked by reading the column, not by a figure in this file.
- **A declined shape throws if it is ever reached.** `declinedMount` exists so
  that a worker spawned by hand for a pair that has no row crashes, rather than
  quietly subscribing to something else (`src/harness/types.ts`, `declinedMount`).
- Every `absent` string is printed above the tables it removes a row from, under
  its own declaration name — down to the shape, `churn.column`, `reads.byWindow`
  — so a reader can find it (`src/bench.ts`).
- **A refusal is written for the ROW, not for the file.** One builder factory may
  serve two registered rows; the name inside a refusal is the row it removes from
  the table, and hard-coding the file's own library there attributes a refusal to
  a row that did not make it.
- **Two families cannot be declined at all.** `bind` and `bindPerGroup` are plain
  required functions and carry no `absent` (`src/harness/types.ts`, `TAdapter`), so
  every script driven through them is answered by every row. A script that some
  library genuinely cannot express therefore needs a wiring of its own before it
  can be admitted — see §2.

The reasons themselves are prose and read as prose, but two habits are worth
keeping because they are what a reader compares across a column: the subject is
**the library or the wiring**, not the author, and the sentence names what the
row would otherwise have printed under that column's name. `churn.column` on
`lokijs` (`src/adapters/lokijs.ts`, `churn.column`) is the worked example — it names
the missing capability, names the rule it would break to work around it, and says
what a row there would actually have been.

### What an adapter may do

- Hoist into `prepare` as far as the library allows, and say what it hoisted (§2).
- Keep a different internal shape from its neighbours, provided
  `deliverableRows` READS the delivery path rather than deriving beside it. The
  audit that enforces this compares by identity, against a snapshot taken before
  the call (`src/harness/floor.ts`, `firstDeliveredShapeMismatch`).
- Register twice under two names when a configuration is a real alternative for a
  user — `tanstack-db` and `tanstack-db-eager`, `baseline-array` and its indexed
  twin. Each half of a pair is a full row: its own processes, the same
  reference model, the same population audit. Nothing about being half of a pair
  exempts a row from anything (`src/harness/registry.ts`, `ADAPTERS`).

---

## 5. The floors and the controls

They answer two different questions and neither substitutes for the other.

### A floor is a lower bound on the work every row pays alike

A floor scenario drives the harness's own consumer **with no store underneath**,
so one of its steps is one step's worth of the work every participant in its
family pays. A row's `min` divided by `steps × perStepMs` is its **multiple**
(`src/harness/floor.ts`).

**There is more than one floor because a step is not one thing.** A churn step
mounts a subscriber, a teardown step delivers nothing at all, a cell step
delivers `PINNED_COUNT` lines, a relation step `RELATION_ROWS`, a single step
exactly one. A single window-delivery floor was an arbitrary scale for the first
two and an over-estimate for the rest, so no row of those tables could be refused
a place and the gate B4 asks for was dead in them
(`src/harness/floor.ts`, `FLOOR_STEP_DELIVERY`). There are six floor scenarios,
and `floorKeyFor` is the single mapping that says which guards which
(`src/harness/floor.ts`).

**Five step shapes have a floor and two do not, and the absence is a declaration
rather than a hole.** `BOUND_BY` maps `window`, `teardown`, `cell`, `relation` and
`single` to their floors; `mount` and `nothing` map to nothing, and
`UNBOUNDED_BECAUSE` carries the reason each is unbounded in the words printed above
the tables it concerns (`src/harness/floor.ts`). A `standing.B4` of MET on a shape
that has neither a floor nor an `UNBOUNDED_BECAUSE` entry THROWS at load, which is
what keeps an undeclared absence from reading like a routed one
(`src/harness/standard.ts`).

**The harness may not charge a participant for its own address arithmetic.**
Anything the harness needs in order to name a row — an owner id, a composed
address, a rendered line's prefix — is built once, outside the clock, so that a
join running per rendered line per delivery is not billed to every row alike
(`src/harness/dataset.ts`, `OWNER_IDS`).

A floor is **a bound and never a subtraction**: the printed multiple carries `≤` on
every cell, because it is an over-estimate for every row whose script drives more
than one view per step (`src/harness/floor.ts`, `formatFloorColumn`). **And a
number something beat is not a bound** — that is exactly why `mount` has no floor.
`mountFloor` measures a mount and an unmount with no library at all and rows of the
churn tables come out UNDER it, `control-heavy` among them, because its own
per-mount bookkeeping buys an O(1) swap-remove on the way out. It is still measured
and still printed as a figure; nothing divides a churn row by it
(`src/harness/floor.ts`, `UNBOUNDED_BECAUSE`).

### A control is a difference the harness put there itself

**A control that could not see something it was told was there voids the report,
printed before anything it was not told about** (`measurements/README.md`, "The controls come first, and they can void the run").
That is the shape; the rows differ per harness because the instruments differ.

| harness | controls | what a failure voids |
|---|---|---|
| `bench`, `duel` | `control-lean` / `control-heavy` (a doubled derivation) and `control-lean` / `control-write` (a doubled write path) — `src/harness/control.ts`, `CONTROL_LEAN` / `CONTROL_HEAVY` / `CONTROL_WRITE` | the table. `lean/heavy` is coarse and on an axis most rows do not vary along; `lean/write` lands at the scale of the tables' own gaps, which is why there are three arms and not two |
| `price`, `alternatives` | `control-resolution-2x` (one body doing twice the work of another) and `control-scale-same-body` (the same body twice) — `src/price/priceControls.ts` | the whole run, non-zero exit. The scale control's distance from 1.00 is the floor below which no ratio in the table is a reading |
| `retained` | `control-known-bytes.1Mi-references`, `control-known-bytes.128Ki-references`, `control-noise.identical-populations` — `src/retained/retainedControls.ts` | the table. Two sizes, because an instrument attested only at the larger one has been attested at the wrong scale; the third is the byte floor the whole table is read under |
| `bundle` | the toolchain controls — that unreachable code is dropped and that the minifier ran (`src/bundle/bundleControls.ts`) | the whole run, non-zero exit. It has **no machine controls and no load gate, and that is not an omission**: the same source through the same bundler emits the same bytes on a loaded laptop and an idle one (`src/README.md#bundle`) |

**The controls always run, whatever `--only` says.** A price under an unattested
instrument is not evidence (`src/price.ts`), and on an alternatives table they
matter more: a win narrower than the noise floor is not a narrow win — the
decision is UNSETTLED, and the report says so in that word rather than ranking it
(`src/price/formatAlternativeReport.ts`).

### The load gate is a pre-check and not the authority

`os.loadavg()` is a cached kernel value and reading it is free, so it is read
before every piece, from the parent, never between a clock start and a clock stop
(`src/harness/load.ts`). The threshold is on load **minus this harness's own
workers**, counted in runnable processes and not normalised per core
(`src/harness/load.ts`, `foreignPart`). `DEFAULT_MAX_FOREIGN_LOAD` is `0.5`.

Two rules survive every argument about the number:

- **The gate is raised with a NUMBER, never a "yes"** (`BENCH_MAX_LOAD`), and the
  number is written into every piece measured under it and printed under every
  table those pieces produce.
- **"Was this measured on a busy machine" is asked at PRINT time against the
  default gate, not against whatever the measurer permitted.** `over` is a fact
  about a permission; the reader did not grant it. Judging the reading against
  the permission is what once let a run at foreign load 18 under a gate of 20
  print as clean (`src/harness/load.ts`, `busyForTheDefaultGate`).

The gate's own error is written in its header and is not hidden: the allowance
counts one runnable process per worker, which is each worker's main thread, while
V8 also marks and sweeps on helper threads. It refuses pieces that would have
been fine — costing minutes and printing how to accept it — rather than admitting
bad ones (`src/harness/README.md#load`). **The gate cannot police its own
threshold**, and a run that has to raise it says so in the artifact rather than
in a shell profile.

**`refused` and `failed` are kept apart.** A measurement not taken on a busy
machine is the correct outcome; a pair that was started and produced nothing is a
bug. Flattened into one state, a busy laptop looks like a broken pair, and that is
the confusion that gets a red run ignored. For the same reason the memory pass has
no `gcAvailable` flag: without a collector it refuses to produce a figure at all
rather than producing one and marking it (`src/harness/memoryPass.ts`).

**A load average matters less to a byte count than to a timing, and it still
matters.** V8's collector is concurrent and incremental, so on a busy machine a
full collection can return with work outstanding and a settle loop is likelier to
stop at its ceiling with a gap still open.

### What a retained arm owes

- **Everything the population allocates and keeps must be reachable from `root`,
  and from nothing else** — not from a module-level array, not from a closure the
  builder left behind, not from a registry inside the library. Nothing enforces
  this; an arm that breaks it reports another arm's retention as its own.
- **Which arm carries the shipped code is a per-pair decision**, stated in each
  pair's own prose — `on` for the legacy change tracker, and it has been the other
  way round. A reader who assumes one arm is always ours will misread the table.
- **A row whose settle gaps are large next to its delta is a row whose delta is
  partly uncollected garbage**, and the report marks it.
- **No pair carries its own expected answer**, which would be marking its own
  homework.
- **The controls always run here too**, and it matters more than on a timing
  table: a reader has no intuition for what a heap reading ought to look like, so
  nothing else catches an unattested one.

---

## 6. Where a figure lives, and what it owes

Two directories, two different things, and they are not interchangeable.

| directory | written by | what it holds | who may quote it |
|---|---|---|---|
| `measurements/<date>-<harness>/<piece>/` | `--record` on `price`, `alternatives`, `retained`, `bundle` | `machine.json`, `records.json`, `report.txt` | anybody. **This is the only directory a published figure may name.** |
| `results/cells/<point>--<scenario>.json` | `npm run bench -- next|run`, per finished batch | the latest record of every cell of that scenario and point: fingerprint, plan, batch (load, control, anchor), outcome | the report and the docs site (`website/src/data/bench/results.json`, every number with its date and freshness). A cell is an intermediate — not a citation |

**A figure in `website/docs`, in a `README.md`, in `llms.txt` or in a source
comment names a directory under `measurements/`, or it does not get written**
(`measurements/README.md`, "Why the rule is this blunt").

Say it plainly, because the failure mode is polite: **a figure with no artifact
is a claim wearing a measurement's clothes, and by the time anybody reads it, it
is indistinguishable from a real one.** Two source files stated `+76%` as
measured fact and `git log -S"76%"` finds no script, no log and no commit that
produced it. Nobody lied (`measurements/README.md`, "Why the rule is this blunt").

### Why a piece and never a run directory

A piece is self-contained: it re-measures **both controls** and carries its own
load readings, so it can be read, disputed and re-run without any other piece
being present. Nothing is merged and no row is averaged with a row measured at
another moment (`measurements/README.md`, "Why a piece, and never one directory for a whole run").

**The timing tables cross that boundary on purpose, and say how.** `npm run bench`
measures one batch per scenario and point, and a table is assembled from cells of
several batches. What makes two of them comparable is the anchor: every batch times
`baseline-array` beside its cells, and a row is ranked by its ratio to the anchor of its
own batch. Two rows from different batches are separated only by more than the larger
of the two sums *row drift + its batch's anchor drift* (`src/cells/scenarioTables.ts`),
where two rows of one batch need only the larger row drift; and every batch still
carries its own control pair and load record.

**One class of number crosses a piece boundary, and only because it is not a
comparison.** The floor figures come out of the storeless scenarios' own pieces
and are read beside rows measured in others. That is allowed because no row is
ranked against a floor and no place is decided by one; a figure that did decide a
place would have to be measured in the piece it decides.

`report.txt` is regenerated from `records.json` rather than captured from stdout,
so the two can never drift apart or disagree about a rounding
(`measurements/README.md`, "What a run directory holds").

### What an artifact owes the reader

- The machine, and the gate that was in force. A retention run adds the V8
  build's pointer-compression flag and the bytes-per-reference its control
  measured; a bundle run carries the toolchain — bundler, version, format,
  target, gzip level — where a timing run carries a CPU
  (`measurements/README.md`, "What a run directory holds", `src/README.md#bundle`).
- **The rule of its own date.** How much of the load average the harness allows
  for its own workers has changed, so an artifact is read against the
  rule in force when it was written (`measurements/README.md`, "The machine is part of the number"). An
  artifact is never edited to match a later rule; the rule change is recorded and
  the artifact is re-measured or left standing as dated evidence.
- A reason the figure is still current. A stored cell carries a fingerprint of the
  exact code its worker loaded — harness files, adapter files, engine sources and
  library versions, read from the bundler's module graph — plus the plan, the point
  and the machine; a cell that does not match is named **stale** with the reason
  (`src/cells/cellStatus.ts`). Silence has never been agreement.

### Deleting a figure

Removing a pair, a row, a floor or a mechanism that carried a claim is a
decision, and it is not made until the task that deletes it states what measures
the claim now, or that nothing does and why nothing needs to, and what the thing
BOUGHT. "It was wrong" is not what it was FOR. The source keeps nothing of it: a
deletion leaves no note in the file. Before removing a measurement, check whether
a correct one already exists.

---

## 7. Naming

One scheme per kind. Where the tree already carries two, the one below is the
one. What is already named otherwise, and what may be corrected, is the note
under the table.

| kind | scheme | examples |
|---|---|---|
| scenario key | `camelCase`, a verb phrase naming the TASK | `patchColumn`, `resendUnchanged`, `growUnderSubscription` |
| floor scenario key | the family, then `Floor` | `consumerFloor`, `mountFloor`, `cellFloor`, `singleFloor` |
| adapter file | the library's own package name, kebab | `alien-signals.ts`, `legend-state.ts`, `tanstack-db.ts` |
| adapter export | the file name in camelCase, then `Adapter` | `alienSignalsAdapter`, `legendStateAdapter` |
| adapter row name | what the row is called in every table and every stored piece | `mobx`, `tanstack-db-eager`, `oimdb-3.12.1` |
| price pair id | `<the API member>.<what it is against>`, dot-separated, kebab inside a segment | `upsert.insert-vs-map-set`, `subscribeToField.deliver-vs-filtered-queue-at-flush` |
| alternatives pair id | `alt.<the fork>.<the arm>`, same shape | `alt.frame-dedup.stamp-vs-set.fan-in-3` |
| retained pair id | `retained.<family>.<arm>` | `retained.clock.derivation-as-shipped` |
| control id | `control-<what it doubles>`, and a dotted qualifier where a family has several | `control-lean`, `control-resolution-2x`, `control-known-bytes.1Mi-references` |
| measurement directory | `<date>-<harness>/<piece>/` | `2026-08-20-price/write/`, `2026-09-02-alternatives/settle/` |
| stored timing piece | `timing--<point>--<scenario>.json` | `timing--wide--patchColumn.json` |

**A scenario key and an adapter row name are IDENTITIES, not labels.** Both are
written into the filename and the contents of every stored piece that measured
them (`results/timing--wide--patchColumn.json` is the key and the point; the
adapter name is a property on every row inside). Renaming one orphans every artifact
that names it, which is a worse outcome than a name that reads oddly.

So: **a scenario key and a row name are chosen once and do not change.** Where an
existing one departs from the scheme above — a scenario that names its operation
where its family names its shape, an anchor whose row name is shorter than its
file — that is a finding for the next name chosen, not an edit. New ones follow
the scheme.

Everything else in the table is free to be corrected, because nothing on disk is
keyed by it.

### Where a result is explained

`WHY-EACH-ROW.md` holds the **result explanations**: why a given row of a report
came out where it did, with `file:line` evidence. A report says what a row
measured; `WHY-EACH-ROW.md` says what the row means.

---

## 8. What may not be in this package

- **A figure without an artifact.** §6, and it is the rule the whole package is
  built around.
- **A number in a header comment.** A comment carrying a count is a count nobody
  recomputes; derive it and print it (`src/harness/standard.ts`, `standardCensus`).
- **A prediction printed as a reading.** Where a change's DIRECTION is known and
  its size is not, the direction is not a number anybody may print without an
  artifact (`src/harness/README.md#floor`).
- **A ratio from a run that voided.** A void report exits non-zero even though it
  printed a table (`src/bundle.ts`).
- **A measurement window shared with anything else.** No test suite, no
  typecheck, no build, no editor indexing a rename
  (`measurements/README.md`, "A measurement window is exclusive").
- **A module no entry point reaches, with nothing said about it.** `src/` is
  walked from the seven entry points and the three workers. A module outside that
  reach is either deleted or says in its own header that nothing imports it and
  what it is for.
- **A write body that touches the same identity twice in one frame.** The frame
  stamp makes the second mark on an identity an early return, so a body writing
  one row twice would price the operation at what the SECOND call costs. Every
  write body walks a batch of DISTINCT rows and then flushes.
