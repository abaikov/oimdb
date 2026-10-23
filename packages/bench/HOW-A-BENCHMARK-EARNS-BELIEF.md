# How a benchmark earns belief

Most state-management benchmarks are worthless, including ours until we started
taking them apart. This page is the standard we hold ours to. It is written as
requirements on **any** benchmark, not as a defence of the choices this one
happens to have made. It then says, item by item, where this suite stands
against them.

Read it as a checklist you could apply to somebody else's numbers, including
ours. If a claim on this site cannot survive it, the claim is wrong and we would
rather you found out here.

:::warning[Status]

This suite **does not yet meet the standard below**, and the reasons now form a
short, specific list rather than a general complaint.

The largest published ratios in the patch family measured a constant of the test
harness against a full population rescan, not the two stores at all. Six
such defects are repaired and the items say so; the repairs are described in the
code they landed in, not as intentions.

**What is still NOT MET, and it is C6 alone at the suite level:** almost nothing
is recorded. *`results/` exists and a series has begun there.* What is in it is
eighteen pieces: six scenarios
(`readByKey`, `scrollWindow`, `filterTwoAxes`, `consumerFloor`, `patchColumn`,
`patchOutsideWindow`) at three points, out of thirty-six scenarios. Every
one of them was taken with the load gate raised to **3.5** foreign runnable
processes, seven times the default of **0.5** that C1 below says every piece is
judged against at print time. So **no figure on this site is currently backed by an
artifact**: the series is incomplete, the pages that carry numbers quote runs
that predate the current engine, and nothing has been re-derived from what is on
disk now.

**And "the suite" is the wrong unit for most of the rest.** Almost every item
below is a property of a *script*: whether a consumer was driven inside the
clock, whether there is a population left to audit, whether the resolution control
was even asked for this wiring. This page can only answer for all thirty-six
at once. So each scenario now **signs** its own standing, item by item, in the
scenario (`packages/bench/src/harness/standard.ts`). The type refuses a scenario
that omits an item; the runner throws at load if a NOT MET carries no reason, if a
MET does not say what would make it wrong, if a record is used by a script it was
not signed for, or if A3, B3 or C5 disagree with the wiring the script is driven
through. **The report prints every one of those NOT MET entries before it prints a
single number.** Where an item below reads MET, read it as "met by the machinery";
which scripts it actually holds for is in that block, and several of them say it
does not hold for them.

**One measurement in the report is not a script, yet it signs anyway.**
The memory table, which shows what each library *holds* once the whole population is in it,
runs no script at all: it loads, collects, and reports a heap delta. It cannot be a
scenario (no `run`, no `check`, and a heap figure has no reference answer), so it
carries its own answers to the same fifteen items in
`packages/bench/src/harness/memoryPass.ts`, held to the same rules: a NOT MET owes
what is missing, a MET owes what would make it wrong. Several of the items below
are written for a **timing**, and that table starts no clock. The runner makes three checks on a stored timing row: the redundancy split, the estimator match, and
which rows drove no consumer. These have nothing to read on a weighed row, which is not
a gap in them but *is* that table's A2, C2 and A1. Where an item's subject is
absent, the item is NOT MET and says so, rather than MET on the grounds that a demand nobody
can fail is satisfied. **Its answers print in full, met and unmet alike**, because a
reader arriving at that table has just read every script's record and several of
the items it misses are met by all of them. Its unmet count is *not* folded into
the (scenario × item) figures below: it is not a scenario, and a total is not
allowed to include something its own name excludes.

**The count is no longer written anywhere; it is derived and printed.**
`standardCensus` computes it from `SCENARIOS` and `ADAPTERS` on every run, per
item and per scenario, and the report prints the per-item table. The figures
below were derived **by reading that code, not by running it**; the
report's own output supersedes them.

36 scenarios × 13 declarable items = 468 pairs, of which **43 are NOT MET**.
Eight items are met by all thirty-six (A2, A4, B2, **B4**, C1, C2, C3, C4), so
every unmet declared pair is A1 (6), A3 (17), B1 (1), B3 (2) or C5 (17). Adding
the two **derived** items, **B5** (unmet for sixteen scripts whose table is
narrower than the field) and **C6** (unmet for every scenario because `results/`
did not exist), the report prints **95 of 540**.

*That C6 term was derived when the directory was completely empty.
Eighteen pieces have landed since, so the derived total is no longer
95 and this page does not restate it. C6 is computed per scenario per point from
the pieces the report actually finds, so the report's own output is the figure and
nothing here should be quoted in its place.*

There is now **one floor per family**: four new scenarios at the mount, teardown,
cell and relation scales, and a fifth at the single-value scale, which arrived with
that family. So B4 is met by every script, and the gate that refuses a row for
measuring the harness is live in the four families where it was dead. The
resolution controls now also supply the **churn, read, relation and single-value
wirings**. That closes the two relation pairs and narrows the other twelve to "one arm, on the
right axis, and no second arm at the scale of those tables' own gaps".

**None of it is measured.** Four floor scenarios and three control wirings are
code that has never executed, and no claim below about what they come out at is a
measurement.
:::

## Why the bar is this high

A state manager is not a data structure. It sits between a socket and a screen,
and what it is actually judged on is whether the current frame stays
inside its budget. That makes three common benchmarking habits actively
misleading here:

- **Measuring an operation instead of a frame.** A store that defers everything
  wins any per-call microbenchmark and loses the frame.
- **Measuring with nobody watching.** A write nothing is subscribed to is not
  the operation a state manager exists to perform, and it is the cheapest thing
  any engine does.
- **Measuring one shape of work.** A library tuned for the shape a benchmark
  happens to use will beat a general one on that shape and lose everywhere else.

So the requirements below are not just about timing hygiene. Half of them are
about whether the thing being timed is what a front end actually asks for.

---

## A. The work must be real work

### A1. Every timed operation must end in a consumer that would have re-rendered

A write that nothing observes measures a store's write path with its whole
purpose removed. Every scenario must drive a consumer that reads what changed
and produces something checkable, and the count of deliveries must be reported
beside the time.

**This suite: MET.** A `BenchConsumer` renders a window and counts
`deliveries / distinct / redundant`; those three counts are returned with every
timed result, so a scenario that woke nobody is visible in the raw output rather
than hidden in the average.

### A2. Redundant deliveries must be counted, not just total ones

"Delivered 32 times" and "delivered 32 times, none of which changed anything" are
different facts about a library, and only the second one distinguishes a store
that routes from a store that rescans.

**This suite: MET.** `distinct` and `redundant` are separate counters and are
printed per row.

### A3. Correctness must be checked against an independent model, not against the
other participants

Adapters agreeing with each other proves they share a bug. The reference must be
derived independently (a plain-`Map` model of what the scenario should produce),
and it must cover the **stored** state, not only the rendered window, or an
adapter can pass by rendering correctly over wrong data.

**This suite: MET, for the scripts that have a store to audit.**
There is an independent reference model; the population audit compares every
stored row's four columns against it; and a **grouping audit** now walks **every
one of the fifty buckets**, comparing the store's own index — read through
`TBinding.groupOrder`, which each adapter answers from whatever its views derive
from — against the model's full ordered group list. Both directions and the order:
a row the store lost, a row it invented, and two rows held in the wrong
order are three separate failures, each named as itself.

It was sabotage-tested rather than argued. Filing rows into every bucket except
one group that no scenario renders leaves every digest, every counter and the
column audit untouched — the column audit passes that store — and fails with
`grouping audit: group g7: the store's bucket holds 0 rows, the model 200`, in
the verify pass **and** in the timed one.

**Where it does not hold, declared per scenario rather than here:** a floor
scenario has no store, the teardown has no population left, and a churn or relation
binding derives no view and keeps no grouping, so it answers `undefined` and only
its columns are audited. The scripts that declare A3 NOT MET for one of those
reasons are the churn scripts, the two relation scripts, the floors and the
teardown, and every one of them is a finding rather than undone work: each would
stop being the script it is if it kept a grouping for the audit to walk.

**The count is no longer written here, and the reason is the rule this page is
about.** It read "Seventeen of the thirty-six scripts", and a total maintained by
hand in prose is a total nobody recomputes. It went stale the moment a script was
added. `standardCensus` in `packages/bench/src/harness/standard.ts` derives it from
`SCENARIOS` and `ADAPTERS` per item and per script, and `run.ts` prints it above
the tables. The categories above are the claim; the arithmetic belongs to the code
that can do it again.

**The single-value scripts declare A3 MET and hold no rows at all.** This needs
saying because the sentence above would otherwise imply they cannot. Their whole
stored state is two values, and both are read back through the library and compared
against the reference model's (`firstSingleMismatch`). That is a complete audit of
a store, not a partial one; the store is simply very small.

**How much it is worth also varies by adapter, and is stated in the contract.**
For a store that keeps a grouping (`byGroup`, an `OIMIndexService` store slot, a library
index), this is a genuine second witness. For a store that derives its views by
rescanning its rows, the answer comes from the same rows the column audit already
compared, so the column audit implies the check. It is asked of everybody alike so that
you can tell which of the two a row is from its adapter.

### A4. Verification and timing must not be separate runs

If the pass that proves correctness is a different process from the pass that
produces the number, the number is only as trustworthy as the assumption that
both did the same work.

**This suite: MET.** `verify` and `time` are separate modes, and the timed one carries its own proof.

The claim that "nothing in the timed run asserts that the consumer was driven" was
already too strong when it was written: the timing worker has always ended with a
clean pass and `scenario.check`, which is where a script asserts its own delivery
counts (`worker.ts`). What it lacked was the half that turns a check into a proof: the
independent model. A store can satisfy every counter a script demands and still
have rendered the wrong rows, which is why the verify pass exists at all.

That clean pass now asks the whole question, **in the process that produced the
number**: the script's counters, the reference model's answer folded through the
same `signature.ts` the runner uses, the stored columns, and the fifty buckets. A
timing process that fails any of them emits `failed` instead of a time, and the
row says it lost a process.

**What it costs, and why it is outside the clock.** Nothing may enter the timed
region: a check inside it would change what is being measured, and that is the one thing this suite will not
trade for assurance. So the proof runs once per
*process*, after the last sample: one extra script run, one replay against a plain
Map, one `readAll` comparison per stored row, and one `groupOrder` plus one sort
per group over fifty groups. For the per-group script that replay is the expensive
one — fifty derivations per step — and it is paid once per process rather than
once per sample. **None of it is inside any published number.**

---

## B. The comparison must be fair before it is favourable

### B1. Both sides must do the same job, and any asymmetry must be printed on the
row it affects

The commonest way a benchmark lies is that one participant keeps an index and
another does not. Whoever pays for the index loses the write rows and wins the
read rows, and the report shows two numbers that look like a verdict about
engines.

**This suite: MET, by shipping both strategies.** The hand-written
anchor deliberately kept no group index, while our adapter builds and settles
fifty ordered buckets inside its timed write. The consequence is an operation
count and it is stark: on patching one column the anchor pays the absence once per
patched row and we pay it never; on a batch insert we pay it once and the anchor
never. **The sign of the comparison flips between adjacent rows of one report
for that single reason.** That is the asymmetry this item is about, and why the
report now carries both anchors instead of one.

> *The consequence is not measured: no directory under
> `packages/bench/measurements/` holds a report for it. The patch count is
> **32**, one per patched row, a count taken from the script rather than a reading.
> The asymmetry itself is decided by the two adapters' code, which is where a
> reader can check it.*

**Both anchors ship**, which is the house rule for a trade-off whose two strategies are each
right for some consumer: do not price them and choose, ship both and let the
consumer pick.

- `baseline-array` is unchanged. It has no group index and is still the `FLOOR_ADAPTER`. It
  answers "what if you wrote it by hand and did not think about it".
- `baseline-indexed` keeps a row bucket per group, filled on write, with the order sorted
  at read. It answers "what if you wrote it by hand competently", because nobody
  rescans ten thousand rows to render a window of thirty-two.

They differ in the group index and in nothing else, so **the gap between them is
the price of the index**: a subtraction between two rows of the same table,
measured under the same sampling plan in the same interleaved batch. It is printed
under every table with the drift of both rows beside it, and a gap that does not
clear that drift is reported as a tie rather than quoted as a price. No
qualitative arrow prints there: the gap, the drift beside it and the tie verdict
are the whole statement.

**One script still declares B1 NOT MET, and it is a different asymmetry:**
`churnChain`. The hand-written floor mounts a chain for nothing extra, because a
person writing it knows statically which rows their derived value reads and
subscribes to those, so there is no walk down a graph to find the roots. An engine
that builds the chain at mount has to find them. The frame is comparable; the
mount is not, and the report prints no per-row note for it.

### B2. A "hand-written floor" must be what a competent person would write

A floor that is deliberately naive is not a floor, it is a strawman, and beating
it proves nothing. A floor that is deliberately hobbled in one direction and not
another is worse, because it flatters on some rows and punishes on others.

**This suite: MET, from the other side of B1.** There is now a floor that is what a competent person would write, standing
beside the one that is not, and the report does not have to choose which question
a reader wanted.

The design of the competent arm is a decision in its own right, because unlike
every other row here there is no library documentation to cite as the recipe. The
adapter's `departure` declares this: *"no library and no documented
recipe: this row's storage model is the suite's own invention"*. The two
shapes it was chosen over (a sorted insert; a `Set`) are argued in its header.

### B3. An adapter must not do the library's job for it

If a competitor needs bookkeeping the library does not provide, the number
measures our adapter code, not their library — and the same is true of ours.
Every such case must be named per adapter, and an adapter that cannot be written
without inventing the storage model should be excluded rather than shown with a
caveat nobody reads.

**This suite: MET**, in both halves, and the second half was
settled the opposite way from the wording above.

**Where the disclosure prints.** A `departure` changes how a *number* should be
read, and printing it once above twenty-two tables reached a reader who then met
that number pages later with nothing beside it. The full text now prints **under
every table the adapter has a row in**, and only for the rows in that table —
reprinting the declarations of rows that are not in a table under it would restore
exactly the wall of text a reader learns to skip. What stays at the top is the
count and the names, so a reader knows before the first table how many there are.

**Whether more libraries should be excluded: no, and the rule is now asked of
every row instead of only the one it rejects.** The admission rule was already
written down (`TExcludedLibrary`): a library is measured here when it OWNS THE
DATA and emits a CHANGE SIGNAL for it. It had been applied to `tanstack-table` and
never asked of the sixteen rows that then passed it — so "the rule is applied uniformly"
was a claim with no evidence either way, which is what made it look like a looser
standard.

Every adapter now carries a required `admission` line naming, concretely, **where
its values live** and **what emits the change signal that drives the consumer**,
and the report prints all of them together immediately above the exclusion. Asked
that way, no admitted row fails: in every case the values are in the library's own
signals, atoms, stores, collections or cells, and the consumer is driven by the
library's own effect, watcher, subscription or listener. Bookkeeping an adapter
keeps because its library has none (an id → signal map, an ids atom, a group
index) holds handles or keys and **no values**, which is the distinction
`TExcludedLibrary` already drew. `tanstack-table` fails *both* halves and stays
out. The two anchors and the three resolution controls say in their own lines that
they are not library claims at all.

No participant is excluded by it, and the exclusion can be *checked* against the
admissions rather than taken on trust.

**A declaration is per shape, not per family.** `TReadEntry` is one declaration
**per shape** (`reads.byKey`, `reads.byWindow`, `reads.byTwoAxes`), and
`TChurnEntry` is the same over the four mount shapes, so a decline names a shape and
a library keeps the rows it can answer. One `reads` declaration covering all
three read scripts would force a library that can answer the scroll but not the
two-axis selection to decline all three, with no way for the report to say
which. **Three** (scenario, B3) pairs are MET under the split that a single
declaration leaves NOT MET. The load check refuses a B3 NOT MET on a script whose
declaration is its own alone, so an expired reason cannot come back quietly.

`TRelationEntry` is still ONE declaration for both relation scripts, and the two
relation scripts still declare B3 NOT MET for it.

**What those wirings had to be checked for, one adapter at a time:** that the
second predicate is the LIBRARY'S and not the adapter's, and that a column
subscription is a column. Where a library could not do it, the adapter says so
where the number prints rather than implementing it under another name: LokiJS
has no column identity at all (its `update` event carries the document, and with
cloning off the "old" document it also carries is the same object), and 3.12.1's
field emitter is not reachable through the kit its row cites. So for both of
them, the churn column table reprints the churn row table's operation, and their
`departure` says so.

### B4. The consumer's own cost must be measured and subtracted from the reader's
attention

Every participant pays the same cost to render. If that cost dominates, the row
is a statement about the test harness and not about any library in it.

**This suite: PARTLY MET.** This was the most damaging defect the suite has carried: it
measured a `consumerFloor` (the cost of the rendering alone) and then **used it
nowhere.** On patching one column, our whole row sat barely
above that floor: most of the printed number was the harness formatting text. The
anchor's row on the same line is two full scans of the population. The ratio
between them is therefore a constant divided by a scan, and it moves when the
dataset size dial is moved, which is the signature of a number that describes the
dataset rather than the code.

Every row prints as a multiple of that point's floor, and any row under
`MOSTLY_HARNESS_UNDER_THIS_FLOOR_MULTIPLE` (three) **is marked, not refused**.
`floorBound` in `packages/bench/src/harness/floor.ts` decides it in one place so
the table and its footnote cannot disagree; the cell prints `‼` beside its
`≤n× floor`, a footnote travels under the table, and the
(m−1)/m sentence travels with it. The row keeps its rank.

The one refusal is `SPREAD_CEILING`: a number the process could not resolve is
not a number. The full argument is `packages/bench/src/harness/README.md#floor`.

**The multiple is a bound, and every cell says so.** A floor is measured in one
adapter's process, over plain objects, so it is exact only for a store of that
shape and an over-estimate for every other. A proxy, a pooled holder or an
enriched row costs more per property load, and a two-view script delivers more
than one window a step. Both corrections push the same way, and every cell says
so: each reads `≤4.12× floor`, and the line above each table names which
corrections apply and why none can push it the other way. Measuring a floor *per storage shape*
remains an unmeasured alternative: it needs a floor scenario per shape, in each of
those adapters' processes. Until somebody measures those, one floor per
family applied to seventeen shapes is honestly a bound.

**There are six floors, not one, and five of them close the
thirteen pairs that a single floor leaves unmet here.** One floor measuring a WINDOW
DELIVERY does not fit four families' steps: a churn step mounts a subscriber
(nine scripts); the teardown's step is a `dispose()` that delivers nothing (one);
the cell script delivers eight formatted lines where the floor measured thirty-two
(one); and the two relation scripts deliver a relation view at the same
under-estimating scale (two). In the last two cases the multiple would be an
*under*-estimate, so marking on it would refuse a row a place on arithmetic
pointing the wrong way, and **no row of those four families could be refused a
place at all**.

Each is scaled by a floor measured at its own scale (`floorKeyFor` in
`packages/bench/src/harness/floor.ts`), and the gate is live in all four:

| family | its floor | what one step of that floor is |
|---|---|---|
| 9 churn scripts | `mount lower bound` | one closure allocated and recorded, and one taken out again |
| `tear the screen down` | `teardown lower bound` | a hand-written screen dropped by storing one reference |
| `targeted column delivery` | `cell lower bound` | one cell delivery of `PINNED_COUNT` lines |
| the 2 relation scripts | `relation lower bound` | one relation delivery of `RELATION_ROWS` lines |
| the 2 single-value scripts | `single-value lower bound` | one delivery of ONE line |

**A floor is not the hand-written anchor, and the difference decides the design.**
A floor is used to *refuse a row a place*, so it has to be a quantity nobody in the
table can beat. That is a sharper requirement than "what a competent person would
write" (B2's requirement, and the anchor's job). So the mount floor's unmount is an
O(1) swap-remove and **not** the `indexOf` plus `splice` the anchor pays: a store
with an O(1) unmount would beat a floor built the anchor's way and then be refused
a place *for having beaten it*. The teardown floor drops one reference for the same
reason. Both floors are therefore *cheaper* than the anchor beside them, on purpose,
and the anchor still has its own row in every one of those tables.

**The single-value floor is the tightest one in the report, and that comes from the task
rather than the floor.** A correct store delivers exactly one of
those lines per write, so the bound is more than a bound: the gap between a
single-value row and 1.00 is that row's store and nothing else. Everywhere else the
floor is a *lower* bound that over-states nobody's consumer cost and under-states
most.

**None of the six is measured.** The five new ones have never been run.

### B5. A row must cover the whole field it is printed against, and a coverage
under it must print with the number

A ratio computed over fourteen rows and a ratio computed over seventeen are
different claims about different populations, and printed side by side they look
identical. This matters most exactly where a benchmark is most useful — where two
tables are meant to be read *against* each other, so that the gap between them is
the price of one thing.

**This suite: DERIVED PER SCENARIO, and NOT MET for sixteen of the thirty-six.**

The item is computed by the runner from `ADAPTERS`, not declared by the scenario,
for the same reason as C6: a script asserting how many libraries cover it would be
asserting other people's adapters, and would be wrong the moment one of them wired
or declined a shape.

**Why the item exists.** The per-shape split leaves `lokijs` and `oimdb-3.12.1`
out of `N subscribers on one column` while keeping them in the other three mount
shapes. That table and `N subscribers on one root` exist to be subtracted (the
gap between them is what addressing a column rather than a row costs), and they
do not hold the same libraries. Without this item, nothing in the standard makes
either row say so. These figures were derived by reading the adapters, not by
running anything: the root table is **16 of 17** (`baseline-indexed` declines all
four churn shapes) and the column table is **14 of 17**.

**Where it prints.** In two places, and the second is the point: with the NOT MET
entries above the results, naming the counts and the decliners; and in the
participation line **under the table itself**, but only when this table's coverage
is below the widest table of its own family, which is the case a reader is about to
misread. `departure` and the participation counts already had the same repair: a fact printed once, thirty tables above the number it changes, reaches
nobody.

**Who does not meet it, and why each is a different fact:**

| rows | coverage | what it is |
|---|---|---|
| 8 churn scripts (row, wide, chain) | 16 of 17 | `baseline-indexed` declines the churn family in writing: a churn binding derives no view, so the group index it exists to price does not exist in one |
| `N subscribers on one column` | 14 of 17 | that decline plus two libraries with no column identity reachable — the split above |
| the 2 relation scripts | 2 of 17 | fifteen libraries were **not asked**; each says in writing that it could answer both rows |
| the 2 single-value scripts | 16 of 17 | `baseline-indexed` declines in writing: a single value has no rows to group, so the index it exists to price is not merely unused there but inexpressible, and its row would be `baseline-array`'s code under a second name |
| the 6 floors | 1 of 17 | not a decline at all: a floor needs no store, so it is measured in one named adapter's process and the other sixteen were never asked |

Read the last row carefully. A floor is a population of one, and
every other table in the report is scaled by one of them.

---

## C. The measurement must be defensible as measurement

### C1. Machine interference must be refused, and when it is permitted it must be
recorded in the artifact

Interference only ever adds time, so a busy machine cannot make a library look
faster than it is — but it can hide a real difference and it can invent one
between two rows measured minutes apart.

**This suite: MET.** There is a load gate, it is checked, and an environment variable
can widen it. **Widening it cannot erase its own
trace.** A banner printed only when the gate is exceeded, with "exceeded" judged
against the widened number, would let a run at load 18 under a gate of 20 print
as an ordinary clean table. The banner is
printed unconditionally, and "was this machine busy" is answered at print time
against `DEFAULT_MAX_FOREIGN_LOAD` (0.5, the default) rather than against
whatever was permitted, so a piece measured under a raised gate carries `BUSY vs
THE DEFAULT 0.50` on its own line.

### C2. The estimator must be stated, and the same one used for every row of a
column

Minimum, median and mean answer different questions. A column that mixes them is
not a column.

**This suite: MET.** One sampling plan is derived from the slowest participant of
a scenario and handed to every participant of it; the reported figure is the
minimum. The consequence is disclosed: fast participants get samples far shorter
than the stated target, which is a real weakness of the design and is why C3
matters.

### C3. Run-to-run variation must be reported, and a figure whose variation
exceeds a stated threshold must not be presented as a result

**This suite: PARTLY MET.** Both a within-process spread and a cross-process
drift are printed, and each carries the population it was drawn
from in its own suffix: `/1p` for the one process whose minimum is the row,
`/2p` and `/worst` for the cross-process figures. The two are therefore no longer
side by side as if comparable.

**MET:** the gate is real. A spread above `SPREAD_CEILING` (0.3)
still marks its row with `!` and names it under the table, and now **refuses it a
place**, the same three-part refusal a floor-bound row gets: `·` instead of a
rank, no cell in the combined table across the points, and no standing as a row
anything below it was placed against. The threshold had been stated in
`SPREAD_CEILING` for as long as the field existed and nothing had ever gated on
it, which means presenting a figure as a result while saying it is not one.

The row keeps its time, its spread and its drift, because the variation *is* the
finding and hiding it would be worse than printing it.

**What this does not fix is C2's disclosed weakness:** the estimator is
derived from the slowest participant, so fast participants get samples far shorter
than the stated target and are the ones most likely to trip this gate. A row
refused a place here may be telling you about the sampling plan rather than about
the machine, and re-measuring is the only way to tell.

### C4. Two arms of a comparison must not share a compiled call site

A pair measured through one function teaches that function's inline caches both
shapes, and the second arm is then measured through a polymorphic site that
neither arm would have in production.

**This suite: MET** for the isolated-pair harness, which runs each arm in its own
process for exactly this reason.

### C5. The instrument must attest its own resolution, at the scale of the rows
it is used on

A control pair whose two arms differ by a known amount proves the harness can
see a difference — but only a difference that size, at that scale.

**This suite: MET, for the tables that have a control at all.**

There is now a **second** control pair, sharing the first one's baseline, and the
two attest different things:

- `control-lean` vs `control-heavy` — a doubled **derivation**. This is the pair
  that existed, and the objection to it stands: its gap is far larger than the
  gaps these tables ask a reader to read, and it varies on an axis most rows do
  not. *Two figures sizing that objection are struck: "around **a hundred
  percent** apart, roughly **twenty-four times** larger than the gaps these
  tables ask a reader to read". Neither names a directory under
  `packages/bench/measurements/`, so both are struck. The objection does not rest
  on them: what makes this arm the wrong instrument is the **axis** it varies on,
  which is read off the wiring and not off a clock. Both percentages are measured
  per table and printed beside that table's drift, so the report is where the size
  of the gap belongs.*
- `control-lean` vs `control-write` — a doubled **write path**. `control-write`
  performs the same single derivation as the baseline and performs every store
  mutation twice, writing the value it just wrote, so the state, every digest and
  every delivery count are identical and the arm passes every scenario's check
  unchanged. Its gap is small **because the write path is a minority of these
  scripts' time** (the same fact B4's floor column reports from the other side),
  which is exactly what puts it at the scale of the tables' own gaps, on the axis
  those gaps are along.

Neither is a prediction. The harness knows what was *doubled* in each arm, not
what percentage that will come out as. Both percentages are measured per table,
printed beside that table's drift, and **both are gated**: if either gap fails to
clear the drift it was measured against, the run fails and says which axis was not
resolved.

**The controls supply all five wirings, and what is doubled is not the same
quantity in every table.** A control is worth nothing off the axis its table varies
along, so a churn table is attested on a **doubled mount path** (a churn binding's
derivation is one line; doubling it would attest nothing at the scale of a mount),
a read table on a **doubled read**, a relation table on a **doubled render**, and a
single-value table on a **doubled dispatch**. A single view's derivation is one
value read and one formatted line, so doubling *that* would repeat the churn table's
mistake at a smaller size. The
report names the quantity above the table it was measured for. The churn arm's
second pass joins a *shadow* of the subscriber lists with the same body and nothing
walks a shadow, so every digest, delivery count and `woke` figure is what the lean
arm produces and the arm passes each script's own check unchanged. The read and
relation arms derive twice and **deliver once**, because `read a page by key`
asserts an exact delivery count.

**Seventeen scripts still declare C5 NOT MET, for two different reasons.**

*Twelve of them, the nine churn scripts and the three read scripts, have ONE ARM
AND NOT TWO*. That is the honest state after the work, not before it:
they went from no resolution at any scale to one arm on the right axis at roughly a
doubling. `control-write` declines both wirings **in writing**, for
the same reason that makes it valuable elsewhere. It is small because the write path
is a *minority* of the write scripts' time, and neither wiring has such a minority:
a churn frame performs exactly ONE store mutation against `CHURN_SUBSCRIBERS`
mounts and unmounts, so doubling it is a difference below that table's drift; and
two of the three read scripts — the keyed page and the moving offset — perform no
store mutation at all, so the arm's gap above them is exactly zero. An arm whose
gap cannot clear the drift fails the run while attesting nothing, and inventing a
quantity to double instead would attest a resolution nobody measured.

*The others are the floors*, and this is a finding rather than undone
work: the controls are bodies over a store and a floor has none, and a table with
a single row has no gap for a control to attest. Their numbers are unattested, and
every other table in the report is scaled by one of them.

### C6. Every published figure must name an artifact

A number in prose with no directory behind it cannot be re-derived, refuted, or
compared against a later run.

**This suite: NOT MET, and it is the one item still unmet at the suite level.**
The rule exists, pieces are written to `results/` with the experiment, the
operating point, the load and the date, and a piece that does not match is refused
rather than printed. `results/` holds eighteen pieces — six scenarios at three
points, out of thirty-six. The
item stays NOT MET for two different reasons: thirty scenarios
still have no piece at any point, and the eighteen that do were taken with the load
gate raised to **3.5** foreign runnable processes, seven times the
`DEFAULT_MAX_FOREIGN_LOAD` of **0.5** named in C1 above — recorded in each piece's
`load.gate`, and it travels with any figure quoted from it. The stored runs under `measurements/` were produced by code that no
longer loads.

It is one of the two items a scenario cannot declare (B5 is the other), because
it is a fact about what is on disk rather than about a script, and a scenario
asserting it would be asserting an artifact into existence. The report derives it
instead, per scenario, from the pieces it actually found, and prints `C6 NOT MET`
with the points that have none. **Read the report to see which those are.** This
page is not the register of what is on disk, and a list here would be stale the
next time the suite runs.

---

---

## Every scenario answers all of this for itself

The items above are written as requirements on a benchmark, and this page answers
them for the *suite*. That is the wrong unit for almost all of them. Whether a
consumer was driven inside the clock, whether there is a population left to audit,
whether a step is a window delivery, whether the resolution control was even asked
for this wiring: every one of those is a fact about a **script**, and a page that
answers MET for thirty-six scripts at once hides the ones it does not hold for.

So each scenario carries its own record, in the scenario, and **signs it**:

```ts signature
standing: signedFor(['churnColumn'], {
    A1: met('the cycle’s first frame delivering nothing. One write and one settle …'),
    A2: met('a delivery in the cycle’s SECOND frame. Everything mounted has been …'),
    A3: notMet('a churn binding derives no view and keeps no grouping, so …'),
    …
})
```

Thirteen items, all required by the type. **A scenario added later cannot omit
one**, because leaving a key out does not compile, and there is no defaults object
to spread over that would hand that guarantee back.

**Four things throw at module load, in every process, before anything is
measured.** They exist because thirteen required fields are not the same as
thirteen answers: twenty-six of the thirty-six scripts share one of four records,
and a shared record is a document, and the question is who signed it.

1. **A `notMet` with a blank reason.** The same shape `TChurnEntry` already used
   for "supply a wiring or write the line saying why you have not".
2. **A `met` that does not say what would make it wrong.** `met(wrongIf)` takes
   the observation, the code change or the measurement that would turn the answer
   over — this page's own standard, applied to itself. Blank, too short, the
   item's own demand read back, or a sentence already used for another item in the
   same record: all four throw. An assurance nobody can imagine being wrong is one
   nobody checked.
3. **A record used by a script it was not signed for, or signed for a script that
   does not hold it.** `signedFor([...keys], {...})` names the scripts the answers
   were written for, and the list and the set of scripts actually holding that
   record have to agree. **Adding a scenario and pointing it at an existing record
   fails until somebody puts its key in the signature**, which means a person saying,
   in the file, that they read the thirteen answers for that script. This is what
   distinguishes a real signature from a copied one, and it is why
   `N subscribers on one column` writes its own thirteen: its table does not hold
   the same libraries as the six it would otherwise share a record with.
4. **A declaration that disagrees with the code.** Three items have a fact
   underneath them that the process can read, so they are checked rather than
   trusted: **A3** is met only by a script that leaves a population *and* a
   grouping behind; **C5** only when all three control arms supply that script's
   wiring; **B3** may be NOT MET only where a declaration is shared by more than
   one script. These are the checks a *stale* signature fails — one that was true
   when written and stopped being true when something else moved. One had already
   gone stale when the check was written, and it is recorded rather than quietly
   fixed:

**B5 and C6 are the two items no scenario declares**, for one reason put two
ways: coverage is a fact about the registry and an artifact is a
fact about the disk, and a source file asserting either is not evidence for it.
The runner derives both, per scenario, and prints them in the same block as the
thirteen.

**The report prints every NOT MET entry, with its reason, before it prints a
single number**, and a count of how many of the (scenario × item) pairs came out
unmet. The entries are not a footnote to the results; they are printed above them.

Four of them are the reason the record exists:

- **`a view filtered on two axes`**: the second axis is derived from the key and
  is therefore immutable, so a store re-filing a row because the second axis moved
  is not measured. That is half of what the row's name claims.
- **`tear the screen down`**: it cannot distinguish "refused the write" from "took it
  and stayed quiet". Both pass; only a delivery fails.
- **the three read scripts**: one declaration covering all three leaves the
  report unable to say which of them a declining library could have answered.
  **Closed**, by splitting the declaration per shape.
- **`churn against a standing population`**: it cannot isolate the cost of a mount
  against a standing population, because the residents must share the churned root
  for the list to be long, and sharing it means the proof frame wakes them too.

Each is an entry in a structure rather than prose in a scenario, so the report
reads them out and none goes uncollected.

---

## D. The scenario set must cover what the thing is for

A suite can satisfy every rule above and still mislead, by measuring five things
well and staying silent about the other twenty. For a front-end state manager the
list below is the minimum. A suite missing an item should say so where its
results are published, not in a file nobody opens.

| What a front-end actually asks for | Covered here |
|---|---|
| Writes delivered to a live subscriber | yes |
| A write nobody is watching | yes |
| Re-sending unchanged data | yes |
| Moving a row between groups | yes |
| Re-sorting a visible window | yes |
| Deleting rows | yes |
| Mounting and unmounting a subscription | yes — nine scenarios; **sixteen** of seventeen adapters on eight of them and **fourteen** on `N subscribers on one column`. `baseline-indexed` declines the family because a churn binding derives no view and the group index it exists to price does not exist in one; `lokijs` and `oimdb-3.12.1` decline the column shape alone. B5 prints both counts |
| Tearing a screen down | yes — `dispose()` inside the clock, all seventeen adapters |
| Reading by key | yes — `read a page by key`, all seventeen adapters |
| A moving window (scrolling) | yes — `scroll the window`, all seventeen adapters |
| Inserting into a populated store | yes — `insert into a populated store`, all seventeen |
| One value, one subscriber, a write and a wake | yes — `write one value` and `re-write one value`, **sixteen** of seventeen adapters; `baseline-indexed` declines because a single value has nothing to index. The task carries no key, no collection, no window and no grouping, which is what makes these two rows the only place in the report where a difference between libraries is a difference in their notification and in nothing else |
| Two entity types and a relationship | partly — `a write to a related entity`, **two** participants (`baseline-array`, `oimdb`), fifteen decline; the relationship itself never moves, see below |
| Filtering on more than one axis | partly — `a view filtered on two axes`; the second axis is immutable, see below |
| Composite keys | partly — `a record keyed by two identities`, one wiring with the row above, the same two participants |
| Cold start to first render | yes — `cold start to first render`, all seventeen |
| **Retained memory after churn** | **no** — memory is one reading after one load, and `src/retained` does not compile (10 errors). That table **says so in a signed record** rather than in prose: `memoryPass.ts` answers all fifteen items, and the ones it cannot meet name what is missing — no delivery counters travel with a heap figure, so the redundancy split has nothing to check (A2); no independent model can hold an opinion about bytes (A3); no floor takes the consumer's share and the load's own rendered lines sit inside the delta, unmeasured (B4); a single reading is not an estimator and has no dispersion (C2, C3); and **nothing attests the instrument at the scale of these rows** (C5) — `src/retained`'s known-byte controls are the missing instrument and belong to a harness whose two arms are one process built to be as alike as they can be made, which a row per library in a process of its own is not. B2 is **met**: both hand-written anchors are weighed there as full rows, so the bytes a group index costs are readable straight off the table |
| **Bundle size** | **no** — `src/bundle` does not compile (51 errors) |

Subscription mount and unmount deserves its own paragraph, because it is the item
most specific to this category of library. It is what a component mount and
unmount cost, it happens on every navigation, and it is the one number a
front-end engineer feels directly. A script that builds its bindings once,
outside the clock, measures none of it; nine scenarios drive it inside the clock.
It has **sixteen of the
seventeen** on three of the four mount shapes: every library's own
subscribe/unsubscribe pair drives them, and the one family-wide decline is
`baseline-indexed`, whose reason is about itself: a churn binding derives no
view, so the group index that participant exists to price does not exist in one,
and its row would be `baseline-array`'s code under a second name. **The column
shape has fourteen**, because `lokijs` has no column identity to subscribe to and
`oimdb-3.12.1`'s field emitter is not reachable through the recipe its row is
measured under. B5 prints that difference under the table, because
`N subscribers on one column` is meant to be read against
`N subscribers on one root` and those two rows are no longer over the same field.

Reading the code says that tearing down N subscriptions sharing one root should be
quadratic in N, on both arms: `indexOf` + `splice` over an array of subscribers is
what the engine and the hand-written floor each do, so the quadratic term is the
container's and **not the engine's graph shape**. That is an operation count and
it stands on the two code paths. What it cannot settle on its own is the *linear*
term, which is where the two arms differ.

> **A sentence claiming this had been measured is struck.** It read "**the
> measurement confirms a quadratic** — and shows it is not the engine's … the
> hand-written floor carries it in the same proportion", and closed "the only
> thing that could tell was running it". No directory under
> `packages/bench/measurements/` holds a teardown piece and `results/` has none, so
> nothing ran that could tell. The complexity claim above survives as a count over
> the two `indexOf` + `splice` paths; the comparison of the two arms' constants does
> not, and what would settle it is a `churn` teardown piece at three values of N
> under the default gate.

One scenario in that family, `churnResident`, **does not isolate what it was
built to isolate**, and the limitation is inherent, not a bug: residents
must share the churned root for the subscriber array to be long, and sharing it
means the proof frame wakes them too. Its number is end-to-end churn against a
standing population and is labelled as such in the scenario itself.

### The six rows that close the gaps above, and what each of them is worth

Three of them are driven through the wiring every adapter already supplies, so
**all seventeen have a row**, and every one of them was verified against the
reference model and the population audit:

- **`insert into a populated store`** — `INSERT_COUNT` rows whose keys the store
  does **not** hold, written into the full population in one settle. The
  distinction from `batch insert` is the whole scenario: that one loads an empty
  store, and every other `write` in the suite writes keys that are already there,
  so nothing measured an insert against a store with fifty ordered buckets and a
  live subscription per visible row in it. The new keys are `f…`, which the
  dataset never produces, so no branch of any write path can take the
  already-there arm; the untimed restore removes them again.
- **`cold start to first render`** — the only row where **constructing the store
  is inside the clock**. It opens with nothing in existence and closes when both
  consumers have produced their first rendered window over the whole population.
  Read against `batch insert`, which is the same script with the construction
  removed. It immediately produced a fact no other row can show: **six of the
  seventeen paint two frames rather than one** — mobx, legend-state, effector,
  nanostores, preact-signals and alien-signals subscribe eagerly, so the reaction
  runs once against an empty store and once against the full one. *That six is a
  render count from a run this repository did not record — no directory under
  `packages/bench/measurements/` holds a `coldStart` piece and `results/` has none
  either — so it is a **countable** claim about six named adapters rather than a
  measurement: each one's eager subscription is readable in its adapter file, and
  a reader can check the six without starting a clock. What would record it is a
  `coldStart` piece carrying the render counters beside the time.* Every other row
  in the report hides that, because there the binding is built in the untimed
  setup and the empty render is discarded before the clock starts. The row is
  therefore judged on the state both views are **left** showing, not on the render
  count.
- **`tear the screen down`** — `dispose()` inside the clock, where it has always
  run outside it. Afterwards, untimed, a page is written into the torn-down
  binding and **nothing may be delivered**; a store that refuses the write has
  proved the teardown more strongly still and passes. The proof was sabotage-tested:
  removing one line from the hand-written anchor's `dispose` — the line that drops
  its view list — makes the row fail with `deliveries after the teardown, view A:
  got 1`. The population audit does not run for this row, because there is no
  population; that is declared on the scenario rather than skipped quietly.

The other three need a wiring no other script asks for — a window whose **offset**
moves, and a second view selecting on **two predicates** instead of one — so they
are driven by a fourth builder, `adapter.reads.build`, which **all seventeen
supply**: the offset lives in the
library's own reactive cell where it has one (a preact/alien signal, a jotai
atom, a nanostores atom, a MobX box, an effector store, a Legend-State node, a
Redux slice) and is an argument to the query where it does not (TinyBase's
listener window, SignalDB's `skip`, TanStack DB's `.offset()`, a slice of the
ordered bucket LokiJS and 3.12.1 already maintain). The second predicate is the
library's in every row — `where(callback)`, `$regex`, `q.fn.where`,
`applyWhere`, a second derived index keyed on both — and no adapter filters the
result of its own view.

- **`read a page by key`** — the first timed read in this suite's history. Every
  method on the binding contract is a write, and the only reads anywhere were the
  ones a delivery performs on its way to the consumer, charged to whichever write
  woke it. This one is a **pull**: nothing is written, nothing settles, the script
  asks for a page of keys and the answer goes straight to the consumer. No adapter
  may pre-resolve the keys — the lookup is the measurement, which is the exact
  opposite of what `targeted column delivery` pins away.
- **`scroll the window`** — the offset moves and **nothing else does**: no rank,
  no group, no order, which the population audit confirms afterwards. It is built
  to separate the two participants on selectivity as well as on time: eight scroll
  steps touch view A alone, so every delivery view B receives is redundant by
  construction, and a rescanning store cannot tell which view moved while a routed
  one can. The scenario pins view B's **distinct** renders at zero for every
  participant (`expect('view B distinct renders', …, 0)` in
  `packages/bench/src/harness/scenarios.ts`); what it does not pin is the
  redundancy count, which is per adapter and is the number this row exists to
  report.
- **`a view filtered on two axes`** — two views over the **same** group, one
  selecting on `group` alone and one on `group` **and** a second axis, so the gap
  between them is the predicate count and not the group. Four steps move a row
  that is on the axis and a row that is not, out of the group and back. The
  one-axis view must produce four new states and the two-axis view exactly two —
  that much is asserted by the scenario's own `check` and holds for every
  participant.

> **A per-adapter redundancy count is struck from each of those two bullets.** The
> first read "the anchor wakes the second view **eight times** for eight scroll
> steps … `oimdb` wakes it **none**"; the second, "the anchor delivers **four** to
> the second view (**two** redundant) and `oimdb` **two**". Both are `redundant`
> counters read off a run **nothing recorded** — no directory under
> `packages/bench/measurements/` holds a `scrollWindow` or `filterTwoAxes` piece,
> and the pieces in `results/` were taken under a raised gate and are quoted
> nowhere on this site. The *distinct*-render halves survive because the scenario
> asserts them in code and any run re-derives them; the redundancy halves are the
> per-adapter finding and they need a recorded piece carrying
> `deliveries / distinct / redundant` beside the time. This is C6 in the one place
> it is easiest to miss: a delivery count is a figure exactly as a nanosecond is.

**Why that last row is `partly` and not `yes`.** The second axis is derived from
the **key** and is therefore immutable: no script can write it, and a store is free
to decide once whether a row belongs to it. What is measured is a change on axis one
against a fixed predicate on axis two; what is **not** measured is a store re-filing
a row because the second axis itself moved, which is the harder half of multi-axis
selection. The reason is the dataset's: a row has five columns and each is spoken
for — `note` in particular exists to be the column *nothing* selects on, so
selecting on it would delete a row of this report to add one — and a sixth column
would have to be stored, returned and audited in all seventeen adapters and the
three controls. That is written on the scenario as well as here.

One further limit belongs with these rows rather than in a footnote: the teardown
row **cannot distinguish** "refused the write" from "took it and stayed quiet" —
both pass, and only a delivery fails. The read family carries no matching limit:
`reads` is one declaration per shape, so a library that can answer the scroll and
not the two-axis selection declines that shape by name and keeps its other two
rows.

---

## E. What we are not claiming

- **That we are fastest.** The suite exists to find where we are not.
- **That a ratio is a verdict.** A ratio above 1.00 against a hand-written floor
  is a loss only if no shipped combination of strategies reaches that floor for
  that task. Where none does, that is a finding we owe an explanation for, not a
  number to bury.
- **That old numbers still hold.** The engine moves. A figure describes the code
  it was taken against and nothing else, and figures are not carried forward.

## How to attack these numbers

If you want to check us rather than trust us:

1. Run a scenario and read the `deliveries / distinct / redundant` counters
   before you read the time. If `distinct` is 0, the row is about rescanning, not
   about storing.
2. Compare any row against that point's `consumerFloor`. If it is close, the row
   measured the harness.
3. Move the dataset size and watch the ratio. A ratio that moves is a fact about
   the dataset.
4. Check the machine load recorded with the piece against the gate it was
   measured under.
5. Read the adapter for the library you care about, and ask what it maintains by
   hand that the library does not provide.

Every one of those five is something we had to do to our own suite, and each of
them found something.
