# The bench harness

## consumer

### Forced, not merely available

Reading a digest once at the end would let a pull-based store do everything in
one final gulp and look fast; the digest folds PER DELIVERY, so deferring N
changes into one render produces a shorter sequence and fails loudly instead of
posting a flattering time.

### Why a redundant delivery is counted and not folded

Waking for nothing belongs in the report, but must not make two adapters that
computed the same states disagree about the digest.

### What clearing the shape witness distinguishes

`undefined` AFTER A DELIVERY THAT PASSED NO ARRAY — a cell, relation, churn or
page delivery clears it rather than leaving the last window's array standing, so
the audit can tell "no window view was driven" from "the window view was driven
and this is what it was driven with".

## control

### What would settle the relation control's one divergence from the floor

One run of `relationWrite` with `patchOwnerName` positional, read against the
drift printed beside it. Until then the divergence is declared rather than
silently kept.

## dataset

### What the dials may not be set to

A WINDOW CAN NEVER EXCEED HALF ITS GROUP: `outsideA` is the second window and the
deletion scenario refills from it, so `makePlan` throws for anything wider.

The pinned count must not EXCEED `WINDOW`, because the values come from
`patchedLabels` / `patchedNotes`. It is FIXED rather than derived from `WINDOW`,
unlike every other count here, so the sweep's points agree about how much consumer
constant the row carries.

### Why half the population is the dirty fraction

More than one dirty frame is what the frame count is for: `batchPatch` asks what
ONE frame's writes cost and can never ask what the frame AFTER a large frame
costs.

HALF IS THE FRACTION THE ENGINE'S OWN CATALOGUE LOSES AT:
`alt.dirty-list-vs-scan.1k-50pct` in `price/alternativePairsDispatch.ts` prices
the frame delivery list against stamp-and-scan with 512 of 1024 dirty and records
the scan ahead by about 1.18x. That is an internal control; every script patching
one row per frame is the 0.1% end of the same table.

### Why a reorder target is searched for and never computed

THE ANCHORS ARE SEARCHED FOR RATHER THAN COMPUTED because `rankFor` scatters, so
two rows of one group can share a rank; if `held[a]` and `held[a + 1]` do, `+1`
sorts the mover AFTER both — the position it already held — and the row fails for
every adapter at once on a hash collision. An anchor is therefore a position where
the rank STRICTLY increases, and `anchor.rank + 1` lands in a gap no row holds.

The anchors are FRACTIONS OF THE WINDOW, because the per-shape-change cost some
libraries pay is LINEAR IN THE WINDOW.

### Why the batch stride must be coprime with the group count

THE STEP MUST BE COPRIME WITH `GROUPS` or the spread is a fiction: with
`group = g(i % GROUPS)`, a step sharing a factor with GROUPS visits only every
gcd-th group. At the default 10 000 rows the natural step is exactly 10, which
touches g0, g10, g20, g30, g40 and nothing else — group B among the 45 it
never reaches. Stepping down to the next coprime value keeps the walk regular
and inside the array, since a shorter step ends sooner.

View A's window is reached by construction — `rows[0]` is a group-A mover pinned
to the head of the window — but WHICH of group B's rows are in its window is
decided by the rank hash, so whether the stride lands on one is an accident of
`n`.

### The two derived attributes nothing ever re-files

What is measured is a write to a PARENT reaching a view over its children; what is
NOT measured is a store re-filing a child because its foreign key changed. Both
relation scenarios declare it.

The second selection axis is immutable too, and the row has to be read with that.
A store may index it once when a key arrives and never maintain it — what an index
on an immutable attribute is worth, and what a MUTABLE second axis would not give.
The two-axis script moves the OTHER axis, so re-selection is still measured; a
store re-filing a row because the second axis changed is NOT, and the scenario
says so.

### What a bounded growth can and cannot show

IT IS NOT UNBOUNDED AND THE SCENARIO SAYS SO. What a bounded growth can show is
whether the EIGHTH batch costs what the FIRST did; what it cannot show is an
asymptote.

### Why one value is written thirty-two times and not eight

A write and a settle over one value is the cheapest operation in this suite, and
the sampling plan is derived from the SLOWEST participant of a scenario, so a
short run leaves the fast rows with samples whose spread is the clock's rather
than the store's — the failure C3 refuses a rank for. Four times the relation
family's count is what puts one run above the timer's resolution without making
the row a throughput measurement.

### Why a two-axis check may not demand a full window

A CHECK MAY NOT SIMPLY DEMAND A FULL WINDOW: the axis halves a group, and at the
smallest population these scripts run at, half of group A is about one window.

## floor

### The one adapter the plain-object floors are wrong for

mobx, whose window computed is `visibleOf` over an `ObservableSet` of row PROXIES
(`bucketOf` and `visibleOf` in `mobx.ts`), so the consumer's three property loads
per row are three trapped gets. Its real consumer part is HIGHER than the plain
floor and its true multiple LOWER than the one printed. EVERY OTHER ADAPTER WAS
AUDITED AND HANDS `deliver` PLAIN OBJECTS.

Both this and the view count push the printed multiple UP, so a row marked
floor-bound here is floor-bound under any correction to either. The mark is
conservative; its absence is not.

THE VIEW COUNT IS A SEPARATE, STILL-OPEN DEFECT: it is fixable by delivering into
as many consumers per step as the guarded script has views, which makes the floor
per VIEW COUNT rather than per shape. Nothing here measures that yet.

### The failure the shape audit is not hypothetical about

legend-state's delivery buffer is a closure variable inside its `observe` body,
so reaching it means restructuring the tracked region, and writing a fresh
derivation instead is the easy wrong answer.

## identity

### What an empty difference does not mean

Empty does NOT mean the two pieces were measured under the same CONDITIONS: that
is the load record's question, answered separately beside each table.

## load

### The incident the gate is set below

A full run was started while an unrelated `npm install` held 71% of a CPU. The
resolution control — one body deriving both views TWICE, the other ONCE — came
out 9.8% apart, with spread 226%/520% inside a process and drift 77-90% across
processes. The control voided the report an hour after the machine's state
already said so. Per-core normalisation would have put that `npm install` at
0.71/8 = 0.09 and waved through something that demonstrably poisoned the
measurement.

### What a flat allowance of one cost, measured

`scrollWindow` ran 389 s and drove its own load 2.09 → 7.98, which the runner
flagged as above its own gate; the next two points and every point of
`filterTwoAxes` were then REFUSED at 4.65 — reported as "3.65 of foreign work" —
with nothing but this harness on the machine. A chain of scenarios could not run,
because each piece refused on the previous piece's own processes.

THAT DOES NOT BY ITSELF MAKE THAT RUN PASS: 4.65 − 3.00 is 1.65, still above the
0.50 default. What it repairs is the COUNTING.

### The allowance belongs to whichever runner is asking

`measureBatch` drives `PROCESSES_PER_VARIANT` workers per piece, `runPricePairs`
two or six per pair, `runRetainedPairs` three. A single module constant would
charge the serial runners an allowance they never spend, which loosens their gate
by the difference. A table with no control arm — a one-row FLOOR table — is the
only place where this gate is the whole guard.

## measure

### Why the minimum is the headline

Measured here: two byte-identical copies of one library in one process differed
by 32% at the minimum and 66% at the median.

### Where the spread ceiling comes from, honestly

Nothing derives it. It is the same order as interference this harness has caught
(an `npm install` beside a run produced 226% and 520% within-process spreads),
held in one named place so arguing with it is one edit.

A spread under it is not a claim that the machine was quiet: a load present for
the whole of one process raises every sample alike and shows up in `drift`
instead, or in nothing at all.

### What pricing the fold from the slowest participant cost

`readByKey` holds signaldb at 5.9 ms beside effector at 55 µs — 107x — so the
slowest clears 20 ms on its own, `repeat` comes out 1, and every fast row is
timed one 55 µs run per sample. Measured on the same machine in the same minute:
`consumerFloor`, whose field spans no such gap, took repeat 171 and printed a
9.9% spread, while `readByKey` printed 42–142% and ten of seventeen rows were
refused a place. Priced from the slowest, a load-scenario outlier slower than
1000 ms made `floor(1000 / outlier)` zero and dropped the whole column onto the
floor of FIVE.

## measureBatch

### The heap figures and the subtraction already performed

`baseline` is the process's heap before `bind()` — node, tsx, the dataset, the
consumers, and the module graph of the one adapter the worker loads through
`loadParticipant`. That is why it is the same ~26 MB for every row: it is
taken before this library's store exists and is a floor common to the column, not
a baseline for one adapter.

`held` IS ALREADY THE DIFFERENCE — `heapUsed` after the load MINUS that baseline,
subtracted in `worker.ts` before it is emitted — and NOT a second absolute
reading. Subtracting the two fields again yields −12 to −25 MB for every row,
which has been done off this piece.

### Which other libraries the production build variable reaches

The same mechanism `mobx` uses, smaller, reaches Immer and hence redux-toolkit.

### The direction in which a two-arm batch flatters

THE PROPERTY WEAKENS ON A BATCH OF TWO: a four-name round is shorter, so drift is
SMALLER and the tie threshold TIGHTER — the one direction that could flatter a
difference. The two-arm report says so beside its ratio.

## memoryPass

### Two records that disagree about the same disk

The artifact answer here is STRICTER THAN THE PER-SCENARIO `c6StandingOf`
(`standard.ts`), which asks only the second question and answers MET on a usable
`results/` piece. Both cannot be right about the same disk, and the conservative
one is the one that belongs on a record. The divergence is named here rather than
smoothed over, because a reader comparing the two blocks will see it.

### Where a NOT MET would be the wrong answer

WHERE THE SUBJECT IS PRESENT, THE ANSWER IS MET EVEN THOUGH THE TABLE IS WEAKER
FOR IT. B2 is the case: its subject is the anchor pair and both anchors are
weighed here as full rows. A NOT MET in the wrong slot reads as rigour and is a
misfiled answer.

## oracle

### The other candidate for this job, and why it was not taken

NOT `baseline-array`: it derives through `visibleInto` like the rest.

It DOES share `BenchConsumer`: the digest is the instrument the two sides are
compared with, so both must compute it the same way.

### Why emitting every view every step is not a disagreement

IT EMITS EVERY VIEW EVERY STEP and does not predict who a well-written store
would have woken. The digest folds only DISTINCT states, so a view whose text did
not change folds nothing and a correct adapter that woke one view arrives at the
same SEQUENCE as this model waking all of them. HOLDS FOR EVERY `emit*` and is
not repeated on each.

### Three rows that matched the model with the writes removed

Four scenarios write something no view renders (`patchNote`, `batchPatchNote`,
`patchOutsideWindow`, the re-send of stored values), and for those "the store did
the work and correctly woke nobody" and "the store did nothing at all" produce
the same counters, digest and oracle answer. That is not a theory: `patchNote`
and `patchLabel` were emptied out in `baseline-array` and the suite reported
three rows as matching the model; only `patch one column` caught it.

### What settling the model keeps, and what it would cost not to

Without it, a script that changes nothing visible — a re-send, a write to a
column no view reads — shows zero distinct renders for every adapter and one for
the oracle.

## pieces

### Why the grain is one scenario at one point

Four things are derived per scenario per point and shared with no scenario beside
it: the VERIFICATION (a scenario voids at a point, alone); the SAMPLING PLAN,
derived from that scenario's own participants' probes; the RESOLUTION CONTROL,
measured inside that table's interleaved batch; and DRIFT, measured round by
round across that table's rows.

Split any finer — one adapter at a time — and all four break: the plan would be
invented before the participants were probed, the control would be measured in a
different sitting from the rows it attests, and the round-robin that makes drift
an error bar over the distance between two compared rows would be gone.

SPLITTING COSTS ZERO EXTRA WARM-UP ITERATIONS. Warm-up is paid PER WORKER
PROCESS, and a piece spawns exactly the workers the batch spawned for that
scenario at that point; the batch amortised NOTHING across scenarios — every
worker is `execFileSync`'d fresh so no JIT or GC state crosses. A split adds one
RUNNER process and one `identity.ts` pass per piece, neither inside any clock.

## processes

### Why a row is measured in more than one process

A process that lands in a bad JIT or GC state stays there for its whole life, so
a single process gives a number that is stable and wrong. The minimum across
independent processes is the cheapest defence.

## render

### Who does not call the naive derivation, and that is the comparison

Libraries with a real index (oimdb, TinyBase, SignalDB, LokiJS, TanStack DB) do
not call it, and that is the comparison.

IT MUST BE GIVEN ROWS READ OUT OF THE STORE. Handing it the harness's own array
would answer the question without asking the library anything.

### The libraries a reused output array would silence

NOT SAFE EVERYWHERE, which is why `visibleOf` still exists: several of these
libraries decide "did this change?" by comparing the derived value with `===` — a
preact/alien computed, an effector `.map`, a nanostores computed, a Jotai derived
atom, a MobX computed — so handing back the same array would tell them nothing
changed and the consumer would never be driven again.

### What one folded churn line can still catch

Folding loses WHICH subscribers woke, bought back by the script's shape — every
standing subscriber reads the one row the frame writes, so a short count names a
subscriber that did not. A binding that counted wake-ups without reading anything
fails on the label beside the count.

## scenarios

### Where a correct silence cannot be told from a dropped write

THE ONE ROW THE DIGEST CANNOT POLICE, because its correct outcome IS "nothing
reaches the consumer": an adapter whose `patchNote` quietly did nothing would
pass the check, match the reference model, and post the fastest time in the
table. `patchNote` is the only binding method whose every caller expects silence
— `patchLabel` is proved by `patch one column`, `setGroup` by the group move,
`setRank` by the sort-key move, `write` by the load, `remove` by the deletion.

TWO THINGS STAND IN FOR A CHECK. Every `patchNote` here is written as the SAME
CALL as that adapter's `patchLabel`, differing in the column and nothing else, so
the two can be diffed by eye; read them that way before reading this row's
numbers. And the POPULATION AUDIT compares `note` on every row afterwards, so a
dropped write is caught there — `firstPopulationMismatch` in `oracle.ts` names
`patch a row off screen` as one of the four rows it exists for.

A mark written into the WRONG pair — a descent that lost a segment, a join that
dropped its separator, a key composed the wrong way round — is text a digest
cannot tell from the right answer while both confused records are on screen.
`readPairs` reads the KEY back out of the store and `firstPairMismatch` compares
it against the model's.

### Why a total near the floor says nothing about a store

The consumer, alone, over plain objects: no store, no library, no subscription —
the harness drives the consumer directly over a fixed array. A scenario whose
total is close to `steps × this number` measured nothing about its store,
whatever shape it holds — a lower bound is enough to say that.

### What an adapter may resolve before the clock

The pinned rows are the one untimed resolution, and the only place in the suite
where an adapter may look a key up on the harness's behalf and keep the answer.

A read is the other side of it: one adapter that kept a handle per key from bind
time would be printing `targeted column delivery`'s answer under a read. A read
the engine answers from state it already maintains is not cheating — both arms
resolve `WINDOW` keys and read three columns each, and the gap is what the
store's addressing is worth.

### Two frames at a cold start, measured rather than assumed

Six of the sixteen adapters produce TWO distinct states here — mobx,
legend-state, effector, nanostores, preact-signals and alien-signals (worker
`verify`, N=10 000, each `view A distinct renders: got 2`) — because subscribing
runs the reaction immediately, and it runs against an EMPTY store. That is what a
user sees: an empty frame and then a full one.

`batch insert` CANNOT SHOW IT: there the binding is built in the untimed setup
and the consumers are reset with `forget`, so the empty subscribe-time render is
discarded before the clock starts.

### Why one frame's five sets may not overlap

`makePlan` cuts them out of view A's window by slot and THROWS if the ranges
meet. A row both patched and deleted in one frame would make the answer depend on
which of the two a store applied last, which is a property of the store's
internal ordering and not of the frame.

### What the two-axis read leaves unmeasured

THE SECOND AXIS NEVER MOVES. It is derived from the KEY, so no script can change
it and a store is free to decide once whether a row is on it. What is measured is
a change on axis ONE against a fixed predicate on axis TWO; a store re-filing a
row because the second axis itself moved — the harder half of multi-axis
selection — is not.

The reason is the dataset's and is not fixable inside this row: `TRow`'s five
columns are all spoken for — `note` in particular exists to be the column NOTHING
selects on — and a sixth would have to be stored, returned and audited in all
eighteen adapters, including the sixteen with no row here.

### What a teardown row cannot tell apart

"Refused the write" from "took it and stayed quiet". Both pass and the report has
no column that tells them apart.

### A scalar composite key that is shipped and unwired

WHAT IS UNWIRED IS THE CURRENT ENGINE'S OWN SCALAR ARM, and unwired is not
unshipped. It is `OIMSlotStoreServiceTreeDriven` constructed with
`KEY_TREE_WALK_SCALAR` rather than a class of its own — it keys on `readonly
TOIMStoreKey[]`, takes no hold per segment and writes no `holdCount`
(`packages/core/src/engine/key/OIMKeyTreeWalkScalar.ts`). No adapter in
`src/adapters/` constructs it, so the two arms of that fork are not compared
against each other — a gap in the report and not a property of the engine.

## standard

### Two churn tables that no longer cover the same libraries

`churnColumn` and `churnShared` are read against each other — that is what the
churn family is FOR — and since the per-shape split they no longer cover the same
libraries. A reader comparing them is comparing two populations, and the only
place that can be said is beside the number.

### A script that drives a consumer may still decline the first item

THE `MET` DIRECTION ONLY: a script that DOES drive a consumer can still declare
A1 NOT MET for a narrower reason of its own — `churnResident` does, because it
cannot isolate a mount from the population standing behind it. So the absence of
a teardown flag proves nothing and is not asserted.

### When a row that woke nothing is not at fault

A participant that drove no consumer inside the clock is not always at fault: a
store comparing before it notifies delivers nothing at all on `singleResend` and
is correct to. So the answer is a list of names printed beside the times. A
script whose A1 is MET and whose row woke nothing is either measuring a write
nobody reads or measuring a store that had nothing to say — and the reader is the
one who can tell which, given the two counters.

### The branch that breaks if one audit call moves

A SINGLE SCRIPT IS AUDITABLE AND HAS NEITHER A POPULATION NOR A GROUPING, which
is why it is a branch and not a clause. Its stored state is TWO VALUES, both read
back through the library and compared against the model's
(`firstSingleMismatch`, called from `auditStore`). That is the whole of what this
family holds, so the audit covers it in full — and this branch becomes false if
that call ever leaves `worker.ts`.

## workerBundle

tsx compiles every TypeScript file with esbuild's `keepNames`, which wraps each
function expression created at run time in `__name(fn, "name")`, an
`Object.defineProperty` per closure. The floor sides (alien-signals and the other
libraries) load from `node_modules` as plain JavaScript and never pay it, so every
price pair whose ours side builds a closure per operation read ours inflated:
`graph.subscription.build.d1` measured 1.17 µs under tsx and 233 ns bundled, on the
same tree, on 2026-10-21. This was found four times before it was fixed.

`bundledWorkerPath` builds `price-worker.ts` and `retained-worker.ts` once per
runner process with `keepNames: false` into `src/.workers/` (git-ignored, removed at
exit). The bundle sits one directory below `src/`, the same depth as the files it
was built from, so every path derived from `import.meta.url` resolves as before.
`tests/what-a-price-worker-runs.test.ts` fails if either bundle contains `__name(`
or if a runner spawns its worker under tsx again.

The cell worker (`worker.ts`, spawned by `measureBatch.ts`) still runs under tsx:
it imports participant modules by URL at run time, which a bundle cannot see. Its
`oimdb` adapter loads core from `dist`, which has no `__name`, but the adapters'
own closures, ours and every other library's alike, still pay the wrapper.
