# Why each row is what it is

A benchmark table is a set of claims. This file is where each claim's
explanation is written down **once**, with the file and line that establishes
it, so nobody has to re-derive it the next time somebody asks "why are we
behind there" or "how can that possibly be".

Rules for entries here:

- **Evidence or nothing.** Every explanation names the file and line, or the
  measurement, that settles it. A plausible story with no line number is not an
  entry — it is a guess, and it must be labelled one.
- **Refuted explanations stay.** When a first explanation turns out to be
  wrong, the wrong one is kept with the reason it failed. That is the part that
  stops the same wrong answer being found again.
- **Direction is stated.** For anything about the harness rather than the
  libraries: does it flatter `@oimdb/core` or count against it.

---

## batch insert — oimdb is ~4× effector, and roughly 5th

**Explanation (read from source, operation-counted, not yet measured
in isolation).** Effector's load allocates one `Map` copy, N object spreads and
N `set`s, then derives both views by scanning the population twice. It builds
nothing that outlives the call. oimdb mints an identity per row, writes its
columns, resolves the bucket it belongs in and appends to it — and then settles each
bucket's order.

**WHAT THE ORDERED SERVICE ACTUALLY DOES ON A LOAD, at
`packages/core/src/engine/bucket/array/OIMBucketSlotsServiceArrayDriven.ts:149-158`.**
A load appends every slot of a bucket as a newcomer, so `outOfPlace === 0`,
`arrived === m`, and the appended run is in order. That is the `arrivedInOrder`
fast path at `:149-151` — `outOfPlace === 0 && arrived > budget && tailIs(...) &&
orderedFrom(...)` — and it does **no sorting work at all**. Where that path does
not hold, `:154` reads `2 * outOfPlace + arrived > budget`, which routes a load
to `slots.sort(sorter)`, one pass. `sortByInsertion` is reached only when the
disturbance is small relative to the budget.

**Also true and separate:** the index is paid once and returns 22.6 ms on
*every* subsequent patch (effector 22.815 ms vs 0.149 ms on `patch one
column`). Break-even is the first write. That is the answer to "is it
acceptable"; the paragraph above is the answer to "is it necessary", and it is
not.

**Caveat on the row itself:** `batch insert` fails the harness's own resolution
control (the control saw its deliberate 2× as 2.5% apart at 14% drift), so no
position in that column is a ranking. It is one step, one repetition, by
construction — `repeatable: false`.

---

## batch insert — signaldb, figure retracted until re-measured

**THE FIGURE THIS HEADING USED TO CARRY IS RETRACTED.** It was taken on the
wiring that loaded through `updateOne(..., { upsert: true })`. That wiring is
gone (see "The current wiring" below), no signaldb `batchInsert` cell has been
measured on the current one, and no figure for this row is quoted until one is.

**First explanation, REFUTED: "the `{id}` selector is unindexed, so every
upsert scans."** Wrong. `node_modules/@signaldb/core/dist/index23.mjs:151`
registers `idIndex` as an index provider and `:404-409` takes an id-only
selector to it in O(1).

**Why the upsert path was quadratic, verified in the shipped build (1.8.1).**
`index23.mjs:422-430`:

```js
getItemAndIndex(selector) {
    const memory = this.memoryArray();
    const indexInfo = this.getIndexInfo(selector);
    const item = (indexInfo.matched ? … : memory).find(document => match(document, selector));
    const index = indexInfo.matched && indexInfo.positions.find(i => memory[i] === item)
                  || memory.findIndex(document => document === item);
    if (item == null) return { item: null, index: -1 };
```

The `index` line runs **before** the `item == null` early return. For a row
that does not exist yet — every row of a load into an empty store — `item` is
`undefined` and this executes `memory.findIndex(d => d === undefined)`, a full
scan of the growing collection. Plus `memoryArray()` (`:447-449`) is itself an
O(n) copy taken before the index branch, the upsert branch re-enters
`getItemAndIndex`, and `insert` (`:574-590`) does its own `findIndex` at `:584`
to locate what it just pushed. About 5 · n²/2 element visits at n = 10 000 —
an operation count, not a timing.

**The current wiring.** A new row goes to `collection.insert`, an existing one
to `updateOne({ id }, { $set })`, chosen by `written`, an adapter-side Set of the
ids this binding has written and nothing else (`src/adapters/signaldb.ts:109`,
used at `:214-227`; `remove` deletes from it at `:237-244`). SignalDB has no
public O(1) presence test — `idIndex`, `memory`, `memoryArray`, `getIndexInfo`
and `getItemAndIndex` are private, and `findOne` → `Cursor.getItems` opens with
the same `memoryArray()` copy — so the presence question is the adapter's. It
holds keys, never values, and a wrong "absent" fails loudly: `insert` throws
"Item with same id already exists" (`index23.mjs:582`). The load runs inside one
`collection.batch` (`:560-567`), which defers the index rebuild to the end.

**What the current wiring still pays, by operation count.** `insert` keeps its
`findIndex` at `:584` over a collection that grows by one per row, so a load is
still ≈ n²/2 element visits — one scan per row where the upsert path paid
about five. Quadratic, and SignalDB's: there is no public insert that skips it
(`insertMany`, `:598-605`, calls `insert` per item).

**Latent quirk worth knowing:** at `:426`, when the matched position is `0`,
`0 || memory.findIndex(...)` is falsy and the full scan runs even for a row that
*is* present — one row per batch pays it on every `updateOne`.

---

## mobx was measured on its development build (fixed)

`import … from 'mobx'` resolves through the `node` condition of
`node_modules/mobx/package.json`'s `exports` map (mobx 7.0.6) to `dist/index.js`,
which is:

```js
if (process.env.NODE_ENV === 'production') module.exports = require('./mobx.cjs.production.min.js')
else                                       module.exports = require('./mobx.cjs.development.js')
```

`NODE_ENV` was set nowhere in the benchmark, so every published mobx figure was
the development build — which contains `checkIfStateModificationsAreAllowed` at
11 sites where the production bundle contains it at 0.

Measured A/B, one process, 9 samples, `repeat 1`:

| scenario | NODE_ENV unset | NODE_ENV=production |
|---|---:|---:|
| patch an unread column | 0.051 ms | 0.038 ms |
| patch one column | 0.407 ms | 0.400 ms |

The `patch one column` difference is inside that row's spread; the `patch an
unread column` one is larger but a single pair does not establish its size
(within-run spread there was 90–140%). **Direction: against mobx, i.e. toward
oimdb — and concentrated on the one timing row mobx wins.** Fixed by setting
`NODE_ENV=production` explicitly on every worker; the same
mechanism, smaller, reaches Immer and hence redux-toolkit.

---

## patch an unread column — mobx beats us, and the reason is structural

**The row below was measured against an engine that has since changed, and no
number in it is re-attributed to the current one.** A write reaches no index at
all. The column is addressed by a per-column identity —
`TOIMEntitySlot.columnSlotStore`, minted on the first subscription to that column and
written only by `packages/core/src/engine/column/OIMColumnOwner.ts`. The one
door onto a column is `holdColumn(slot, name)` on the collection, which mints the
column identity, handed to `OIMChannel.effectOnColumn(column, body)`, which builds
an ordinary effect on it. Nothing has re-run this row since.

The delivery counters said it: mobx posted `0d/0n/0r` on both views, oimdb posted
`32d/0n/32r` on view A. The column being written was in no index's `dependsOn`,
but a write to the row still lifted the row's slot, and view A holds a
per-visible-slot subscription, so we were woken 32 times to discover there was
nothing new to show. MobX's granularity there is finer: the computed depends on
the columns it read, and this is not one of them.

That was the one honest loss to a *mechanism* rather than to an adapter
difference. See also: the number mobx is compared against had been a debug
build, and the corrected figure widens the gap rather than closing it.

**WHAT IS STILL TRUE OF THIS ROW, AND WHAT IS OPEN.** The adapter's window views
still hold a subscription per VISIBLE SLOT, not per column — `channel.effect([slots[i]],
[], …)` at `src/adapters/oimdb.ts:213` — and a slot subscription still fires on
every write to the row. So the `32d/…/32r` shape is expected to survive, for a
reason that has nothing to do with column routing: it is what a window view is
subscribed to.

**CORRECTION, 2026-10-22.** "Per VISIBLE SLOT, not per column" no longer describes
the adapter, and the `src/adapters/oimdb.ts:213` it cites no longer exists. A window
view now holds, per visible row, a column-group slot over `rank` and `label`
(`entityService.slotContentOwner.holdColumnGroup(slot, renderedColumns)`, with
`renderedColumns` from `getColumnGroup(['rank', 'label'])`, `src/adapters/oimdb.ts:316`
and `:364`), and one effect over all of those column-group slots
(`effectService.createEffect(watchedColumnGroupSlots, NO_SOURCE_COMPUTEDS, state.markPending)`,
`src/adapters/oimdb.ts:382`, inside `resync`, `:347-383`). A write to `note` is on no
slot that effect subscribes to, so the `32d/…/32r` expectation in the paragraph above
is not a description of this wiring. The numbers in this section that were measured
under the old per-slot wiring are the `patchColumn` and `patchNote` oimdb cells of the
2026-09-12 table below (0.138 and 0.137 ms) and the `32d/0n/32r` counters quoted in the
section above; none has been re-run against the column-group wiring.

**MEASURED 2026-09-12, and it is 17× against us.** Per-step milliseconds:

| scenario | oimdb | mobx | tinybase | baseline-indexed |
|---|---|---|---|---|
| `patchColumn` | 0.138 | 0.354 | 0.660 | 0.736 |
| `patchNote` | 0.137 | 0.008 | 0.261 | 0.724 |

We pay the same for a column nobody reads as for a rendered one; mobx drops by
÷44 and wins this row by 17×, having been 2.6× behind on the row above it.

**IT IS NOT THE HARNESS, AND THAT WAS THE FIRST THING CHECKED.** A store that
silently discarded a `note` write would post exactly mobx's time, and that
sabotage is what forced the population audit — `firstPopulationMismatch`
compares `note` on every row after every script, outside every timed region
(`src/harness/oracle.ts:348-349`), and mobx's run came back with
`verification.failed = []`. The writes land. The time is real.

**NOR IS THE COMPARISON A STRAW MAN, and the reason is specific.** The window
renders `id rank label` — that is what the reference model emits, and why a note
write is invisible to it by construction (`src/harness/scenarios.ts:563-572`).
What the bucket holds, and in what order, already has its OWN effect over the order bucket
(`src/adapters/oimdb.ts:319-320`), separate from the per-slot one. So a window bound
with `effectOnColumn` on the column it renders would be faithful to what the view
reads, not a weakened arm — and the same adapter already does exactly that for
the cell views, `effectService.createEffect([columnSlot], …)` on `entityService.slotContentOwner.holdColumn(slot, 'label'/'note')`
at `src/adapters/oimdb.ts:508` and `:512`.

**SO THE NUMBER IS HONEST AND THE LOSS IS NOT ESTABLISHED.** 17× is a figure
about the DEFAULT per-slot window binding, not about the engine: the rule is that
a ratio above 1.00 is a loss only when no combination of shipped strategies
reaches the floor, and the per-column window binding has never been wired or
run. `cellDelivery` (`src/harness/scenarios.ts:1562`) and `cellFloor` (`:3467`)
are the scripts that would say and neither has been run against this engine.
**Until it is wired and run, this row prices a wiring choice and may not be
quoted as the cost of the engine's granularity.**

**CORRECTION, 2026-10-22.** Two claims of this section are false of the current adapter: the
window is no longer bound per slot, so the order bucket's effect is not "separate from the
per-slot one", and the per-column window binding is no longer unwired — the window holds a
column-group slot over `rank` and `label` per visible row and runs one effect over them
(`src/adapters/oimdb.ts:316`, `:364`, `:382`). What is still true: none of the 17× / 0.138 ms
figures above has been re-run against that wiring, so they describe the old per-slot binding only.

**ONE PART OF THE GAP CANNOT BE REMOVED, and it is declared rather than
measured.** Waking at all costs a consumer delivery and a re-render that produces
the text it already had, and the `nothing` step shape has NO floor by decision —
"the rows that DO wake here pay a consumer share that is theirs and not the
column's, and this report does not take it out of them" (`src/harness/floor.ts:112-119`).
That share is therefore inside our number and absent from mobx's, and it is not
separable by subtraction; it is avoidable only by not waking, which is the
per-column binding above.

**ALSO OPEN, AND SEPARATELY FROM THE NUMBER.** Whether a consumer should have to
name the column at all. mobx derives the dependency from what the body read; we
require it to be named, and the engine's per-slot default is what produces this
figure. That is a DX cost mobx does not charge, and no measurement settles it.

---

## re-send unchanged list — baseline-array beats us

**The row below was measured at the RETIRED shape of this scenario: the whole
population re-sent in one frame.** That is not a workload any client performs —
a re-send is a page refetched or replayed, and it arrives page-sized — so most
of what the row measured was population size rather than what a library can tell
about a write that changes nothing. The script now re-sends exactly the rows
view A is showing (`harness/scenarios.ts`, `resendUnchanged`; the copies are
built in `worker.ts`). Everything below stands as an explanation of the numbers
it was written about, and the mechanisms it names — who compares values and who
does not — are unchanged by the rescoping; the magnitudes are not comparable to
anything the current script prints.

`baseline-array` rewrites 10 000 rows and rescans; it never compares anything,
so it "wins" by doing the cheapest possible wrong-shaped work — and it posts
`1d/0n/1r`, i.e. it woke its consumer and produced identical text. oimdb pays
0.788 ms to establish that nothing changed and posts `0d/0n/0r`: nobody woken
at all. The two numbers are answers to different questions and the delivery
columns are what make that visible.

`redux-toolkit`'s cheapness on this row is not the adapter's: the adapter does
not compare columns before assigning, which
`packages/bench/src/harness/types.ts` (`TBinding.write`) forbids in absolute terms.
Its cheapness is Immer's `set` trap (`node_modules/immer/dist/immer.mjs:453-465`),
which returns without marking the draft changed when the assigned value `is` the
current one — that is the library's own check and is allowed to count.

---

## nanostores holds less memory than "baseline-array"

`adapters/baseline-array.ts` holds a `new Map<string, TRow>()` — the name says
array but the storage is a hash map; the only arrays are two reusable 32-row
window buffers. `adapters/nanostores.ts` holds `map<Record<string, TRow>>({})`,
a dictionary-mode object. Both hold the same 10 000 copied row objects
(~70 B each), so the comparison is **V8 `Map` against V8 dictionary object**,
about 56 B/row against 52 B/row.

And the gap is 1.16 MB vs 1.20 MB — 40 KB against a 24.5 MB baseline, from a
mode that takes **one** measurement with no minimum and no drift, and which
prints that there is no ranking in it. 3% there is not a result.

---

## The population audit, and the sabotage that forced it

Every check runs through the two consumers — what was
*rendered*. Three scripts write something no view renders. Probe: `patchLabel`
and `patchNote` in `baseline-array` were emptied out (write dropped, rescan
left in place) and the suite reported:

```
✗ patch one column          14 matched, 1 failed
✓ patch a row off screen    15 matched the model, 0 disagreed
✓ patch an unread column    15 matched the model, 0 disagreed
✓ re-send unchanged list    15 matched the model, 0 disagreed
```

So a store that silently discards writes to a column nothing displays was the
fastest possible participant. `patchNote` is unpoliced *anywhere* — `note` is
read by no consumer and no oracle view. `patchLabel` and `write` were policed
only against a **global** break, not a selective one (a store that keeps window
rows and loses off-window rows would have passed `patch a row off screen`, our
largest margin).

Fixed by `TBinding.readAll()` plus `firstPopulationMismatch` in
`harness/oracle.ts`: after every script the store's whole population is compared
against the model's on all four columns, outside every timed region.

---

## Harness properties that flattered us, now removed

| what | where | direction |
|---|---|---|
| mobx on its development build | worker env | toward us |
| warm-up bounded by wall clock — 2000 iterations for a 50 µs run, ~10 for a 20 ms run, same 200 ms | `measure.ts`, `TSamplingPlan.warmup` | toward the fast rows, i.e. us |
| three replicates back-to-back, rows in fixed registry order with oimdb at index 1; that within-seconds range then used as the tie threshold for rows measured minutes apart | the runner's timing loop | toward early rows, and under-declared ties |
| rank bands extended from a leader, so a row tying its neighbour but not the leader was promoted to a new place number | the runner's banding | manufactured rank boundaries |
| tinybase given a whole-result-table content listener while oimdb had per-visible-row subscriptions, although TinyBase ships `addResultRowListener` | `adapters/tinybase.ts` | toward us |
| preact-signals, alien-signals and jotai materialising a 10 000-element array per view per recompute, which their libraries do not require | those three adapters | toward us |
| redux-toolkit's hand-written four-column diff in `write` | `adapters/redux-toolkit.ts` | against us on one row, and against the stated rule either way |
| no scenario writing many rows in ONE frame — every update script settles inside its loop | `harness/scenarios.ts` | unknown; it is the workload our coalescing exists for |
| no scenario at the DENSE end of the dispatch dial — every write row moved a handful of a large subscribed set, which is the fraction our delivery list beats a scan by an order of magnitude at | `harness/scenarios.ts` | toward us — closed by `most rows change every frame` |
| no scenario re-ordering more than ONE row per frame, so an ordered index was only ever asked for the case it is best at (a binary insertion into an already-sorted list) | `harness/scenarios.ts` | toward us — closed by `the whole window re-sorted` |
| the unread column asked about only one row at a time, so the one mechanism we lose to (leaf routing) was never measured at the batch size where coalescing has its best chance of recovering it | `harness/scenarios.ts` | ambiguous — closed by `batch patch an unread column` |
| no scenario mounting or unmounting a subscription inside the clock: every binding is built in `bind`, before the timed region, and torn down in `dispose` after it | `harness/scenarios.ts`, `harness/types.ts` | **still open** — see below |
| no scenario driving a consumer by POLLING the store rather than by subscribing to it | `harness/types.ts` (`TBinding` has no per-view read) | **still open** — see below |
| adapter versions never printed, and `@oimdb/core` measured from working-tree source | the runner's header | unreproducible |
| legend-state alone denied the group → ids index that seven other adapters were granted under the same sentence, so every one of its views tracked the observable ROOT and woke for every write in the population | `adapters/legend-state.ts` header | toward us, on every wake-up column |
| no scenario subscribing to more than two of the fifty groups, so the index maintenance we pay on all fifty was charged against a measurement that reads two | `harness/scenarios.ts` | against us — see the row below |
| the whole report measurable only as one ~1 h batch, so it could be run honestly only by giving up the machine for an hour — and a run poisoned at minute three could not be re-done in part | the runner | unknown, and unknowable per row: it decides whether the numbers exist at all |

---

## batch patch — eight of fifteen libraries do not coalesce a frame at all

The scenario that was missing from the suite entirely: ~1000 rows patched, one
`settle()` after the loop. Every other update script in this benchmark calls
`settle()` INSIDE its per-row loop, so before this row existed no store was ever
asked what many writes in one frame cost it — which is the ordinary shape of a
client cache and the only place write coalescing is visible.

**Coalescing is judged against the script's own frame count, never against one.**
Several scripts in the suite settle more than once, so a store that delivers once
per frame is coalescing correctly there. Compared against a hard-coded 1, every
such adapter would be filed as eager and the banner would report that nobody
coalesced anything.

Seven of the ~1000 batched rows land inside view A's window. First run,
verification pass:

```
✗ batch patch   7 matched the model, 0 disagreed with it, 8 failed
    FAILED  mobx, jotai, legend-state, effector, nanostores,
            redux-toolkit, preact-signals, alien-signals
            — view A distinct renders: got 7, the script performed 1
```

**Coalesced the frame into one render:** oimdb, oimdb-3.12.1, baseline-array,
lokijs, tinybase, signaldb, tanstack-db.
**Delivered per visible write, seven renders:** the eight above.

### The criterion was wrong, and the way it was wrong is worth keeping

Marking those eight FAILED removed them from the row. That is backwards: not
coalescing is a **cost**, not a disqualification, and the cost is exactly what
the scenario exists to price.

Underneath it sat a real instrument problem. `BenchConsumer` folds its digest
over the SEQUENCE of distinct rendered states. The reference model emits once
for this script, so its digest is a fold of one state; an eager adapter folds
seven. **No single sequence digest can be right for both groups** — so the
oracle comparison could not adjudicate this scenario either, whichever way the
render count was asserted.

Resolved by giving `TScenario` a `finalStateOnly` flag, set by this scenario
first: correctness is asked of the state both views END in, the render count
becomes this row's measurement and is printed under its table with the two
groups named, and the population audit is untouched — it is what still proves
all ~1000 writes landed in either case.

The general lesson, which is why this is written down: **when a scenario's
subject is a difference in behaviour, that difference cannot also be the pass
condition.** Every other row in this suite settles per write, so the frame count
is the script's decision and the sequence digest is the right criterion. This
one is the exception because the frame count is the store's.

---

## a row arrives mid-order — the same eight, and a frame that is only two writes

`npm run bench:verify`:

```
✗ a row arrives mid-order    9 matched the model, 0 disagreed with it, 8 failed
    FAILED  mobx, jotai, legend-state, effector, nanostores,
            redux-toolkit, preact-signals, alien-signals
            — view A distinct renders: got 12, the script performed 8
```

The same eight libraries as `batch patch`, and the same cause with the batch
taken away: `moveAndReorder` writes one row's `group` and its `rank` and settles,
once per step (`src/harness/scenarios.ts`, `moveAndReorder`). TWO writes is already more than
one write per settle, so how many states come out of a frame is the store's answer
here exactly as it is under a thousand-row batch.

**It is not an intermediate state anybody chose to publish.** Each of the eight
has `settle: () => undefined` in its two-view binding — mobx
(`src/adapters/mobx.ts`, one `runInAction` per binding method, e.g. `setGroup`
and `setRank`), preact-signals
(`src/adapters/preact-signals.ts`, one `batch` per method, `setGroup` among them),
jotai, nanostores, legend-state, effector, alien-signals,
redux-toolkit — because those libraries flush their reactions when the write
call returns. The nine that passed do the delivery IN `settle`; TinyBase is the
clearest case, holding `startTransaction` open across the writes and calling
`finishTransaction` in `settle` (`src/adapters/tinybase.ts`), and
`baseline-array` is the same shape with a dirty flag
(`src/adapters/baseline-array.ts`).

**No adapter can close the gap, and the row already said so.** `TBinding` has one
call per column and no frame boundary, and the scoped batch these libraries offer
(a callback) cannot span two harness calls. Buffering the writes to replay them
inside one scope is the adapter doing the library's job, which this row's own
standing **B3** refuses in as many words: *"a store able to coalesce them inside
one frame is free to, and whether it does is the difference this row is
measuring."* A criterion that failed every store which did not coalesce turned
that difference into a disqualification.

**Which way the numbers cut.** For view A an outbound step is one new state (the
row leaves group A; the later rank write is to a row group A no longer holds) and
an inbound step is two (the row arrives at the arrival rank, then moves to its
rest rank) — so the eager arm reaches the step count plus one per inbound step,
which is what `got 12, the script performed 8` is. View B is the mirror. Nothing
in it is a wrong state, which is why the population and grouping audits had
nothing to say — and why `0 disagreed` was not evidence of agreement: `check`
fails before the reference model is replayed at all (`src/worker.ts`, `scenario.check`), so
those eight were never compared with it.

Resolved the way `batch patch` was: `finalStateOnly: true`, the exact per-view
counts replaced by `atLeast` floors at the step count, the windows-still-full
assertions kept. The alternative considered and not taken was a frame boundary on
`TBinding`, which would have kept one criterion for the whole field; what it
would have cost is not recorded anywhere.

**What a reader of this row should be told.** The times in it are measured on two
different frame behaviours, both correct, both ending every frame showing the
same rows: one arm derives once per step, the other derives twice because it
cannot be told the frame is not over. That is the row's subject, it is named in
the COALESCING block under the table, and the gap against `row moves between
groups` — the same movers, the same groups, one column, arriving at position 0 —
is still the arrival-position pair it was built to be.

---

## a consumer per group — what the row is for, and both directions it points

The scenario: one consumer per group — fifty — and fifty steps, each moving one
row's `rank` between two values that both sit inside THAT group's own window.
No group's contents change anywhere, so exactly one consumer may produce a new
state per step and the other forty-nine have nothing to show. The measurement is
how many of them were woken anyway
(`harness/scenarios.ts`, `consumerPerGroup`; `TAdapter.bindPerGroup` in
`harness/types.ts`).

### Why the two-view wiring could not ask it

`TViewConfig` names exactly two groups and `TConsumers` holds exactly two
consumers, so no adapter was ever *told* about a third. Folding the fifty groups
into one consumer would have destroyed the measurement rather than approximated
it: `BenchConsumer` folds one hash per `begin`/`end` pair and increments one
counter (`harness/consumer.ts`), so a store that woke once and a store that woke
fifty times produce the identical digest and the identical counts. Hence a
second consumer set (`TGroupConsumers`) beside `TConsumers` and a REQUIRED
`bindPerGroup` — required, because an optional builder would let an adapter be
absent from the row without saying so, and "nobody wired it" would be
indistinguishable from "this library cannot".

### Direction 1 — this row STOPS charging us for buckets nobody reads. **Toward us.**

Our binding maintains all fifty buckets on every write whether or not anything is
subscribed to them, and `adapters/oimdb.ts` builds one grouping over `group` for
the whole collection — one
`OIMBucketCollection` (`byGroup`). A bucket's slots are written by the adapter — the
`filedUnder` / `slotsOf` bookkeeping and the `byGroup.write` calls in
`adapters/oimdb.ts`. It is still all fifty buckets, still on every write, still
inside the timed region. Every other row of this report
subscribes to two of those fifty, so the maintenance of the other forty-eight is
paid inside every timed write and read by nothing — the two-view table
over-charges us in every row, and it does so on the one axis where a library
that derives lazily has nothing to pay at all.

**The instrument is registering the same load under both wirings and reading the
gap**, and the suite now has both halves of it. `sort key moves` and this row
perform the SAME per-step work — one `setRank` inside a window, one `settle` —
under two and fifty consumers respectively. Per step (each table states its own
step count), the difference between our two numbers is what forty-eight more
subscribed buckets cost us, and it is *delivery*, not maintenance: the
maintenance was already in the two-view number. For a library with no index the
same difference is forty-eight more derivations from scratch, which is why the
gap is the comparison and neither number alone is.

Two things stop that from being a free win and both are stated on the row:
per-shape-change re-subscription (below), and the consumer constant (next
paragraph).

### What would make the number a lie

- **The consumer is fifty times larger here than in any other row.** A
  non-selective store delivers `GROUPS × WINDOW` formatted lines per step where a
  selective one delivers `WINDOW`, and the formatting is the harness's, not the
  store's (`consumerFloor` measures a lower bound on it, per storage shape). The
  gap between the selective and the non-selective band is therefore mostly
  CONSUMER COST, multiplied by the wake-up count. That is a real cost — a screen
  woken does re-render — but a reader must not read the ratio as "their store is
  50× slower than ours".
- **Different code under the two wirings.** If any adapter's `bindPerGroup` used
  a strategy its `bind` did not, the row would compare wirings and print the
  answer as a library. Every adapter here derives both from ONE body that differs
  only in the list of views it is handed; `bind` passes two, `bindPerGroup`
  passes `consumers.views`.
- **A bystander woken with the WRONG text would not show up as a wake-up.** It
  would fold a distinct state, disagree with the reference model and void the
  scenario — which is the intended behaviour, but it means `redundant` counts
  only the honest wake-ups. The model emits to all fifty consumers every step
  (`BenchOracle.emitEveryGroup`), so it never predicts who should have woken; it
  only says what each should be showing.
- **Bind-time cost is outside the clock.** Fifty queries, fifty cursors, fifty
  live queries and fifty DynamicViews are built in `bind`, and this scenario does
  not rebuild between samples (`rebuild: false`). What IS inside the clock is
  every subscription a step re-points.

### Direction 2 — the fan window sets our churn. **Toward us at a small window.**

`oimdb` and `tinybase` are the two adapters whose views subscribe to the VISIBLE
ROWS, so a window whose shape moved re-points one subscription per visible row —
`resync` in `adapters/oimdb.ts`, the `addResultRowListener` loop in
`adapters/tinybase.ts`. Every step of this script moves a window's shape, so
that cost is paid fifty times per run and it is LINEAR IN `BENCH_WINDOW`, while
most of the field pays nothing for it. A fan frozen at the smallest window would
be the report choosing the operating point where our own cost is least visible.

So the window is not a constant here: each of the fifty consumers shows `WINDOW`
rows and each sorter's two target ranks are fractions of the window
(`sorterInWindow` in `harness/dataset.ts`), and the runner's `wide` point — half
of a group on screen — is where this row should be read before any claim is made
from the default one.

### The anchors are searched for, not computed, and that is not fussiness

`rankFor` scatters ranks over 100 000 values, so two rows of a ~200-row group
collide about once every five groups. Taking `held[a].rank + 1` as a target on
faith fails whenever `held[a]` and `held[a+1]` share a rank — the move then lands
the row back where it started, the consumer produces no new state, and the row
fails for every adapter at once because of a hash collision. `sorterInWindow`
walks to a position where the rank strictly increases before using it.

### legend-state was given the group index it had been denied

Its header argued that each `observe` must track the observable ROOT, because
Legend-State has no index and a view has to read the map to know which rows are
its own. Every clause of that is true of the library and none of it forces
the conclusion: the standing set does not have to be Legend-State's, and
`TExcludedLibrary` admits exactly this object by name — "an adapter keeping an
id → handle map… or an ids atom (`jotai`)… A key lookup is not storage."
**Seven** adapters had been granted it (jotai, mobx, preact-signals,
alien-signals, effector, nanostores, redux-toolkit) and this one had not, with no
reason stated. Root tracking is the worst possible wake-up count in a suite whose
subject is wake-ups, so the inconsistency counted toward us.

It now keeps a `byGroup` observable of ids per group, maintained inside the same
batch as the rows, and each view tracks its own group's ids node plus that
group's row nodes. **This changes rows that were already published** — a patch to
a group-A row no longer wakes a view over group B, and `batch patch` no longer
wakes every view once per written row — and it changes no rendered state, which
is what the digest and the population audit check.

---

## targeted column delivery — what the row does NOT isolate, and where we lose

The row is new, so nothing below is a measured number yet: it is what the row is
built to ask, plus the two things that are against us and are stated here rather
than discovered in a profile afterwards.

### 1. The pin is a real advantage, and it is NOT what the label/note gap shows

`pin(cells)` lets an adapter resolve its rows once, before the clock, and address
them by POSITION thereafter — a slot for oimdb, a proxy for mobx, a signal for
preact/alien, an atom for jotai, a document for lokijs, a node for legend-state.
That is a genuine advantage for the libraries that HAVE such a thing, and it is
measured against libraries for which the honest answer is "nothing, the id is the
handle" (tinybase, signaldb, tanstack-db, effector, nanostores, redux-toolkit,
and — for writing — oimdb-3.12.1).

**Both halves of the script write through the pin.** So the gap between the label
half and the note half is COLUMN ROUTING WITH THE ADDRESS HELD CONSTANT, and it
is the only thing in this row that may be read as routing. The row's absolute
time is address plus routing plus delivery, mixed, and no split of it into those
three parts is available from this row alone.

**What the pin itself is worth needs its own control, and does not have one yet.**
The shape it needs is the shape `control.ts` already uses: two harness-owned
bodies over the same Map, identical in every line except that one opens each
write with `byId.get(id)` and the other indexes an array the setup resolved.
That pair would price the lookup on this machine, in this harness, with no
library involved — which is exactly what `control-lean` / `control-heavy` does
for the derivation. Until it exists, nothing in this suite has reproduced the
keyed-versus-identity gap at all.

**What is live and says something adjacent**: `OIMEntityCollection.updateByKey`
carries its own keyed-versus-identity pair — 71 ns against 45 — measured in
`packages/bench/measurements/2026-08-20-price/write`. Read it the way that
comment asks: two pairs from two processes, each against its own floor (3.01x a
`map.get` plus a store on the keyed side, 34.6x a bare field store on the other),
never divided into each other. It prices a *write door*, not the pin this row
exercises, so it does not stand in for the missing control above.

### 2. On the note half we lose plainly, and the mechanism is worth predicting

Consumer B is driven by `note`; consumer A is driven by `label`. The oimdb adapter subscribes each consumer with
`channel.effectOnColumn(slot, 'label' | 'note', …)` (`adapters/oimdb.ts`), which
is the narrowest thing the engine offers.

**mobx, tinybase and legend-state pay no wasted subscriber call when a `note` write
reaches the `label` consumer**, and for the
same reason in three different vocabularies: their routing is at the LEAF, so the
`label` observer is not reached at all —

- mobx: `label` is its own atom, and an atom with no observers reports a change
  to nobody (`adapters/mobx.ts`, the two cell autoruns);
- tinybase: `addCellListener(table, row, 'label', …)` is registered per CELL, so
  a `note` write reaches no label listener;
- legend-state: an `observe` that calls `node.label.get()` depends on that leaf
  node and no other.

**WHAT THE ENGINE DOES.** A column of a
row is its own identity, minted lazily on the first subscription and hanging on
the row (`TOIMEntitySlot.columnSlotStore`, sole writer
`packages/core/src/engine/column/OIMColumnOwner.ts`); subscribing to a column
is an ordinary effect on THAT identity: `holdColumn` mints and resolves the
column through `OIMColumnOwner`, and `OIMChannel.effectOnColumn` hands it to
`OIMChannel.effect` as its single root. A write marks only the column identities that already
exist (`OIMEntityCollection` → `OIMColumnOwner.markColumnsChanged`, which
returns on `slot.columnSlotStore === undefined` and otherwise probes the map once per
changed column). The `label` handler is not reached by a `note` write.
**Direction: unknown, and it may not be inferred from the row above.** The cost
is a map probe per changed column and a second identity per watched column, and
no run has priced either.

### 3. Three measurement caveats that belong to this row

- **tanstack-db's column shape has the opposite sign from every other row in the
  table.** Its `where` filters ROWS and never columns, so a column subscription
  becomes a live-query pipeline rather than a narrower listener, and this row
  prices that pipeline against the row shapes' filtered listener.

- **nanostores is charged two group derivations per write that nothing renders.**
  `pin` unsubscribes the window computeds, but a nanostores computed's unmount is
  deferred by `setTimeout(…, STORE_UNMOUNT_DELAY)` — `1000` ms in
  `node_modules/nanostores/lifecycle/index.js` — and a worker of this harness
  never yields to the event loop, so the destroy never runs and the two window
  computeds keep listening to their groups' stores. There is no synchronous teardown in the
  public surface: `cleanStores` is guarded by `NODE_ENV !== 'production'`, and
  every worker runs as production. **Direction: against nanostores.** Effector had
  the same exposure — a derived store recomputes whether or not anyone is
  listening — and it does have a public answer, `clearNode`, which the adapter
  now calls.
- **oimdb-3.12.1 is in the row-granular band by CONFIGURATION, not by capability.**
  It ships `OIMCarrierKeyedFieldEmitter.subscribeOnKeyFields`, but that emitter is
  installed through `OIMReactiveCollection`'s `createUpdateEmitter` option, and
  `createOIMCollectionKit` — the recipe that row cites — takes
  `TOIMReactiveCollectionFactoryOptions = TOIMCollectionOptions`
  (`packages/core-legacy/src/types/TOIMCollectionKit.ts`), which has no such
  field, so the kit always builds the plain emitter
  (`packages/core-legacy/src/core/OIMReactiveCollection.ts`, its constructor). Reading the 4.0.0-vs-3.12.1 gap on this
  row as "the rewrite made routing finer" would therefore be wrong twice over: the
  difference measured here is one adapter subscribing by column and the other by
  row, and the second could not do otherwise through the documented kit. It is
  declared in that adapter's `departure`, which the report prints above the tables.

---

## three rows added because they are expected to count AGAINST us

Nothing below is a measured number. It is what each row is built to ask, which
way its author expects it to go, and the file and line the expectation rests on
— written before the measurement so that a result agreeing with it is worth
something and a result contradicting it cannot be quietly re-explained.

**The rule they were chosen under.** A benchmark holding only the shapes we win
is not evidence of speed, it is evidence of chosen scenarios. Every write script
this suite had before these three moved ONE row per frame, or moved a tenth of
the population ONCE. Both are the sparse end of the dispatch curve and the
shallow end of the ordering curve, and both are where @oimdb/core is at its best
by construction. So the three shapes added are the three the engine's own design
notes already say it is worst at.

**They needed no new binding method, and that is deliberate.** All three drive
`patchLabel`, `patchNote`, `setRank` and `settle`, which every adapter already
implements and which `patch one column`, `patch an unread column` and `sort key
moves` already prove are not no-ops. A new method would have been sixteen fresh
chances to give one library an unfair floor; these rows re-use bodies that are
already written, already reviewed and already verified against the reference
model. **No adapter had to declare that it cannot express any of them.**

### batch patch an unread column — expected to LOSE to leaf-routed stores

`note` on the same ~1000-row stride `batch patch` writes `label` to, settled
once. The pair `patch one column` / `patch an unread column` already establishes
the mechanism and the loss: the delivery counters there read `0d/0n/0r` for mobx
and `32d/0n/32r` for oimdb, because a write to a column no index declares still
lifts the row's SLOT and view A holds a per-visible-slot subscription
(`adapters/oimdb.ts`, `resync`). A column is its own identity, minted by
`OIMChannel.effectOnColumn` and marked only if it already exists, so a `note`
write does not reach a `label` subscriber at all; the expectation below has not
been re-derived or re-run. mobx's `label` atom, tinybase's `addCellListener` and
a legend-state `observe` over one leaf node are not reached at all.

What that pair cannot say is whether COALESCING GETS IT BACK, because it gives
every write its own frame. This row is the same mechanism with one frame for a
thousand writes, which is the largest recovery coalescing can possibly make.
**Expected direction: still against us, by less.** The three leaf-routed stores
pay nothing here and paid nothing there — their advantage does not scale with
the batch — while ours should fall from one wasted frame per write to one wasted
frame per batch. If it does not fall, the cost is in the per-write marking rather
than in the frame, which is a finding about the write path and not about routing.

Eight of the fifteen libraries deliver on every write (`settle: () => undefined`
in alien-signals, effector, jotai, legend-state, mobx, nanostores,
preact-signals, redux-toolkit). This row does **not** set `finalStateOnly`
despite being a batched script, and the reason is worth keeping: the correct
outcome is that NOTHING DISTINCT is produced by anybody, so an eager store's
extra deliveries are all redundant and fold nothing, every correct store arrives
at the identical empty sequence, and the sequence digest is a criterion again.
The general rule is not "batched scripts are judged on final state" — it is "a
script whose render count differs between correct stores may not be judged on its
render count".

**What proves the writes happened:** the population audit and nothing else. The
digest cannot see this row's work, exactly as it cannot see `patch an unread
column`'s — that is the hole `firstPopulationMismatch` was added to close, and it
compares `note` on every row.

### most rows change every frame — expected to LOSE, and the number to beat is 1.18x

Half the population patched, settled, and then again — `DIRTY_FRAMES` frames of
`N / DIRTY_FRACTION` writes.

**The expectation is not a hunch; it is already measured on our own bodies.**
`price/alternativePairsDispatch.ts` prices the shipped dispatch decision — push
each marked identity onto the frame's delivery list — against the design it
rejected — stamp it and scan every subscriber at the frame boundary — at four
dirty fractions. At `alt.dirty-list-vs-scan.1k-50pct`, 512 of 1024 subscribed
identities dirty, **the rejected design is ahead by about 1.18x**, and the row's
own caveat says it is in the catalogue for exactly that reason. The other three
points are the sparse end, where the list wins by an order of magnitude.

Every write row this suite had was the sparse end. This is the first time the
dense end has been put to another library rather than to a harness-owned control.

**Expected direction: against us**, and specifically against `baseline-array`,
whose per-frame cost is `dirty` map writes plus two top-k scans of the population
(`harness/render.ts`, `visibleInto` — one comparison per row past the window)
while ours is `dirty` × (lookup, `held` gate, slot mark, delivery-list push,
population mark) plus a walk of the queued list. Once nearly everything is dirty
the bookkeeping buys nothing, because a scan would have found the same
identities for free.

**What the row is NOT evidence of:** that the decision was wrong. The loss is
bounded — at M = K the scan is doing our work minus the push — and the win at the
sparse end grows with the subscribed set. A design that loses at most ~1.18x and
wins up to an order of magnitude is chosen on the shape of the payoff. The point
of putting it in the comparative table is that a reader can now see both ends of
that payoff in one report instead of being told about one of them.

**Why more than one frame.** One frame cannot ask what the frame AFTER a large
frame costs. `DIRTY_FRAMES` is two rather than eight for a wall-clock reason
stated on the constant (`src/harness/dataset.ts`, `DIRTY_FRAMES`): effector, nanostores and
redux-toolkit copy or spread something population-sized on every single-field
patch, so each extra frame costs those three rows seconds per run.

Read against the engine that ships:

- The frame's delivery list is `OIMChannel.pendingEffects`, ONE array
  (`packages/core/src/engine/channel/OIMChannel.ts`), pushed by `enlist`, walked and
  then emptied in place with `pendingEffects.length = 0` in the frame's own run. There is
  no second list, nothing is swapped, and nothing bounds its length.
  `PENDING_KEEP_AT_MOST` does not exist in `packages/core/src`.
- Identity stamps are not retired at all. The dedup is a compare of
  `OIMEffect.stampedInFrame` against `frame.number` (`OIMChannel.enlist`, and the
  frame walk that reads it), and `frame.number` is advanced in the frame's own
  `finally`, so last frame's stamps go stale by the counter moving past them —
  which the prose beside the engine says of the neighbouring stamp in as many
  words (`packages/core/src/engine/channel/README.md`).

**What the question survives on instead**, stated as what was found rather than
as a replacement for the sentence: the engine does carry bounded working state
between calls, but in the ORDERED-LIST machinery and not in delivery.
`oimOrderedListCommandsOfTransition` reuses six scratch buffers rather than reallocating them and
DROPS one above `OIM_MAX_DIFF_SCRATCH_SLOTS = 4096` entries — "one
allocation on the call after a giant one, and none on any call that stays under
it" (`packages/core/src/engine/bucket/commands/utils/oimOrderedListCommandsOfTransition.ts`,
against `packages/core/src/engine/bucket/commands/constants/OIM_MAX_DIFF_SCRATCH_SLOTS.ts`);
the ordered bucket service keeps three working buffers between settles "so that a
steady-state frame allocates nothing here", dropped above
`SLOTS_A_SHARED_BUFFER_KEEPS_AT_MOST = 32`
(`packages/core/src/engine/bucket/array/OIMBucketSlotsServiceArrayDriven.ts`,
against `packages/core/src/engine/bucket/array/constants/SLOTS_A_SHARED_BUFFER_KEEPS_AT_MOST.ts`); and
`OIMChannel` keeps one after-each-frame buffer written over rather than truncated
(`packages/core/src/engine/channel/OIMChannel.ts`, `afterEachFrameBuffer`). This suite is on that
path — the adapter constructs `OIMBucketSlotsServiceArrayDriven` and an order collection
(`src/adapters/oimdb.ts`, `bindViews`). **Whether this
script's settles are large enough to cross either bound is not established here**,
so this is a mechanism that could make the second frame differ from the first, not
a measured reason that it does. The two-frame shape is kept because a
single-frame script cannot ask the question at all, not because the old sentence
has been re-grounded.

**Judged on the state it ends in**, for `batch patch`'s reason. A multi-frame
script judged that way needs one thing a single-frame one does not: a FLOOR on
the delivery count. Without it a store could ignore every intermediate settle,
derive once at the end, leave the correct final state, pass the population audit
and post a time for work it did not do. `check` demands at least one delivery per
frame from each view — a floor and not an equality, because delivering more often
is the eager behaviour the row prices.

### the whole window re-sorted — expected to collapse our margin, and possibly to lose

`sort key moves` writes ONE `rank` per frame. This writes every visible row's
rank in one frame, dealing a fixed pool of ranks one place further round the
window each time. The pair is the ordering curve, of which `sort key moves`
alone is one point — the point an ordered index is best at.

**Two costs, and most of the field pays neither.**

1. **The budget flips to a full sort.** `OIMBucketServiceOrdered`'s `slotsInOrder`
   chooses between repairing a bucket one slot at a time and re-sorting it, on
   `2·moved + arrived > sortBudget(n)`, where `sortBudget` is about `2·log₂n`
   and is derived in that method's own comment from `m·n ≤ n·log₂n`. One mover in a
   bucket of ~200 is 2 against ~16 and takes the cheap path. A whole window of
   movers is 64 against ~16 and takes `slots.sort(order)` over the WHOLE
   bucket — every frame, including the ~170 slots below the window that nobody
   will look at. An index that re-sorts its bucket has spent what a store with no
   index spends; what is left over is that ours also paid to maintain the bucket
   on the way in.
2. **The window's shape moves every frame.** `adapters/oimdb.ts` (`resync`) and
   `adapters/tinybase.ts` (the `addResultRowListener` loop) are the two rows whose
   views subscribe to the VISIBLE ROWS, so a re-ordered window re-points one
   subscription per visible row. That is linear in `BENCH_WINDOW`, so **this row
   should be read at the `wide` point before any claim is made from the default
   one** — the same discipline `a consumer per group` is read under.

**Expected direction: our margin collapses; a loss is possible and is not
predicted with confidence.** The index-less stores still re-derive from the whole
population every frame — 10 000 rows at the default point — which is a constant
they cannot escape, so the row may still fall our way there and fall the other
way at `small`, where the population is 3 200 and our bucket sort is unchanged.
What it cannot do is flatter us the way `sort key moves` does. A report holding
only `sort key moves` was quoting the best point of a curve as the curve.

**The window's rows cannot move, and that is constructed rather than hoped for.**
`plan.resortRanks` is `WINDOW` DISTINCT values all strictly below the lowest rank
OUTSIDE the window (`harness/dataset.ts`), so no permutation of them — and no
half-applied prefix of one, which is what an eager store sees — can pull a row in
or push one out. Distinct matters as much as below: `compareRows` breaks ties by
id, so a pool with repeats would leave some rotations rendering the identical
order and a frame that did work would look like a frame that did none. At every
operating point of the sweep the pool values are congruent to `-(1+j) mod 200`
while every hashed rank is `1000 + 200k`, so no pool value can collide with any
rank in the group even mid-frame.

**The operation count, so it can be multiplied against the printed time:**
`RESORT_FRAMES × WINDOW` rank writes and `RESORT_FRAMES` settles per run — 256
writes and 8 settles at the default point, 800 and 8 at `wide`. Every one of
those writes is a real change, because a rotation by `s` and a rotation by `s+1`
of a pool of distinct values disagree on every position, and the last frame of
one run (shift `RESORT_FRAMES`) disagrees with the first frame of the next
(shift 1). That check is the one this file exists to force: a benchmark pair here
once wrote a value equal to the one already held, timed an empty frame, and
agreed with itself across three timings.

---

## two scenarios that are STILL missing, and what each would cost the contract

Both are named here rather than left to be re-discovered. Both are shapes a real
screen performs, and both are expected to count against us.

### a screen that mounts and unmounts many small subscriptions

Every binding in this suite is built in `bind`/`bindPerGroup` — before the clock
— and torn down in `dispose`, after it. `a consumer per group` states the
consequence in its own section above: *"Bind-time cost is outside the clock.
Fifty queries, fifty cursors, fifty live queries and fifty DynamicViews are built
in `bind`, and this scenario does not rebuild between samples."* A React screen
does the opposite of that all day: a route change, a virtualised list scrolling,
a modal opening. For us it is the most exposed shape there is — a mounted window
view is one bucket subscription plus one per visible row (`adapters/oimdb.ts`,
`resync`), so fifty views mounting is ~1 650 subscriptions, where a library with a
lazy derivation mounts a closure.

**Why it is not in this change.** It needs `TBinding` to grow a way to take its
views down and put them back inside the timed region, and — harder — it needs a
criterion that a binding whose remount did nothing would FAIL. The obvious
criterion is a delivery count, and getting it right requires knowing which of the
sixteen adapters deliver on subscribe and which do not, which is not something to
guess at: a scenario that sixteen adapters implement blind is sixteen chances to
hand one of them an unfair floor. It is a contract change plus a per-adapter
audit, and it should be made with the suite runnable, not from a reading.

### a consumer that re-reads a bucket per frame instead of subscribing

A floor per storage shape needs something the binding contract does not have: a
way to ask an adapter for the rows it would hand a consumer, without delivering.
That is a sixth read method on every adapter, and it is what a polling row needs
too.

A polling consumer is the shape that strips out everything our overhead buys:
marks, frames, delivery lists and subscriber stores are all paid on the write
path and read by nobody, while the reader gets only the maintained order. It is
what a `requestAnimationFrame` render loop over a store does.

**Why it is not in this change, and the trap that is worth recording.** A poll
cannot simply be added on top of the existing wiring: the window views are still
subscribed, so for a non-selective store the same consumer would receive both the
subscription's delivery and the poll's, and the row would price polling *in
addition to* subscribing rather than *instead of* it. Making it mean the intended
thing needs a second method as well — "drop your view subscriptions, the store
stays loaded", which is the first half of every adapter's existing `dispose` —
and then a `check` on delivery counts to prove the unbind actually happened.
Two methods across sixteen adapters, with a criterion that has to be validated by
running it.

**Direction, stated so it is on the record before anyone measures it: mixed, and
not obviously against us.** Polling nullifies our routing, which is against us;
but it also charges every index-less library a full derivation per frame while we
read a maintained bucket, which is for us. That is precisely why it is worth
measuring rather than asserting — and why it must not be added in a form that
answers a different question.

---

## `flush.empty-vs-noop` — 30.1x, and what the empty frame is made of

Two facts belong on the record, because they are about the ARTIFACT rather than
the design:

- **The ratio is not a reading, and the flag column does not say so.**
  `measurements/2026-08-20-price/frame/records.json` records `floorNs` 1.12 and
  `floorAgainNs` 5.24 for the same code timed twice around our side — a noise
  figure of 366.9%, the largest in that piece. No marker fires (`~`, `L`, `=`
  and `w` all test other things, and `=` compares `|ratio − 1|` against the
  noise, which 29.07 clears), so the row prints clean. The absolute figure on
  our side, 33.77 ns, is the reading; the multiple is not.
- **The figures above are a reading of the pre-rewrite flush.** The 33.77 ns, the
  30.1x, the `floorNs` 1.12 / `floorAgainNs` 5.24 and the 366.9% noise figure may
  not be quoted as figures for the flush that ships. The artifact is
  `measurements/2026-08-20-price/frame/records.json`. `pricePairsFrame` carries
  `flush.empty-vs-noop`, whose ours-side body is `channel.flush()` on an
  `OIMChannel` with nothing marked and nobody subscribed
  (`packages/bench/src/price/priceFixture.ts`); nothing has re-run it.

Split by `flush.empty-vs-the-same-bookkeeping-by-hand`
(`packages/bench/src/price/pricePairsFrame.ts`).

## `new-db.vs-hand-written-frame-state` — 204.5x, the largest ratio published

**The gap decomposes into twenty-two allocations against the floor's two.**

What belongs here is the arithmetic that FAILS. Using
`new-collection.vs-new-map` from the same piece as the rate for one marginal
allocation on that machine, the twenty extra allocations account for roughly an
eighth of this row's gap; **seven eighths is unaccounted for by any count in the
source**. The collector is not the answer: the collection row's pass allocates
more objects than this one and still comes out cheaper per allocation.

Direction and how to read it: this is a `per declaration` row and the price
table sorts every path together by ratio, which is what puts a boot-time
construction at the head of the catalogue. The reading is the absolute figure
against one construction per application.

Split by `new-db.vs-the-same-object-graph-by-hand`
(`packages/bench/src/price/pricePairsDeclare.ts`).

---

## the strategy sweep — what nine rows are FOR, and the sentence each task owes

**The price table could not answer the project's goal, and this is the row set
that can.** The house rule, *"reach the floor by strategy"*, states it:

> For every typical task there exists a combination of shipped strategies whose
> cost is at or below the hand-written floor.

Every other pair in `packages/bench/src/price/` prices ONE call as a consumer
would write it *on the defaults*. A default is one arm. So a row of that table —
including the 34.6x and the 204.5x above — is a statement about a default and
**not** a statement about the goal, and reading it as one is the specific
mistake this section exists to prevent. A ratio above 1.00 is a loss only when
no shipped combination reaches the floor for that task.

`packages/bench/src/price/pricePairsSweep.ts` holds nine rows: three tasks, one
floor per task, and every arm of a task run against that one floor.

**The output each task owes is one sentence** — *"the closest combination was X,
and it did / did not reach the floor"* — and the file's header carries the rule
for reading it off the report, because a table of ratios that does not produce
that sentence has missed the point of the sweep. In short: select one task
(`--only sweep.grouped-column`), read the LAST row of the printed prices
(`formatPriceReport` sorts worst ratio first), and compare its ratio against
1.00 **plus that row's own `noise`**.

### Why no row declares `isolate`, which is not the obvious answer

`TPricePair.isolate` exists for exactly the hazard a sweep has: every arm here
enters one compiled body whose inline caches belong to that body —
`OIMEntityCollection.prototype.upsert` / `.update` — and reaches its
strategies through `this.writer`, an `IOIMEntityWriter` from
`createOIMEntityWriterInPlace` or `createOIMEntityWriterReplacing`, reached
through `OIMEntityCollection`'s own `fillSlot` and `mutateSlot` forwarders, and
through `bucketSlotsService`. A write reaches no index. The hazard is a property
of one shared compiled body and not of which strategies hang off it. Two arms in one process would measure the second
through caches the first made polymorphic, and a reading of 1.00 would then be
indistinguishable from cache pollution.

**Two arms are never in one process, and that is a property of the runner, not
of the rows.** `runPricePairs.ts` measures one pair at a time and every timing
goes through `runWorker`, which is `execFileSync(process.execPath, …)` — a fresh
Node process per pair — and `price-worker.ts` calls `build` on that pair only;
every other pair in the catalogue is an object whose `build` closure is never
invoked. So the isolation is already there, structurally, at no extra process.
`isolate` could not have supplied it anyway: it splits one pair across
processes and has no reach across two.

**What that obliges every `build` in the file to do**, and it is the one rule a
new arm must not break: construct exactly ONE strategy of each kind. That is why
`priceFixture` gained a `write` parameter rather than the replacing arms
building a second population beside a default-strategy fixture — the fixture's
own load would otherwise put the default strategy through `fillSlot` and
`mutateSlot` before the arm under test ever ran.

The remaining question `isolate` answers — does our side share a compiled body
with the floor — is `no` on all nine: every floor is hand-written `Map`, `Set`
and plain objects, entering `@oimdb/core` nowhere.

### The axis that is fixed in all three tasks, and where "not a choice" holds

The plan for this work listed *identity store:
`OIMSlotByKeyStoreMapDriven` / `OIMSlotByKeyStoreTreeDriven`* as a sweepable
axis. **Re-derived against the two store services and two key walks that ship
today, the answer is not one answer.** Those four compose into three arms, and
two of the three pairs they make are not a sweep, for two DIFFERENT reasons;
the third is a sweep, and nothing in this suite runs it.

The three are TWO store services and the key walk one of them is handed —
`packages/core/src/engine/store/` and `packages/core/src/engine/key/`:

| arm | key type | what keeps a branch |
|---|---|---|
| `OIMSlotStoreServiceMapDriven` | `TOIMStoreKey` = `string \| number` — one scalar (`packages/core/src/engine/store/OIMSlotStoreServiceMapDriven.ts`) | one `Map`; there is no branch |
| `OIMSlotStoreServiceTreeDriven` + `OIMKeyTreeWalkScalar` | `readonly TOIMStoreKey[]` — a chain of VALUES (`packages/core/src/engine/key/OIMKeyTreeWalkScalar.ts`) | the subtree under an edge and nothing else; `holdSegment` and `unholdSegment` both return, so no hold is taken |
| `OIMSlotStoreServiceTreeDriven` + `OIMKeyTreeWalkComposite` | `readonly TOIMEntitySlot[]` — a chain of IDENTITIES (`packages/core/src/engine/key/OIMKeyTreeWalkComposite.ts`) | a counted hold per edge (`segment.owner.hold`), given back at the prune |

**What a segment IS belongs to the walk and not to the store**: there is no
branch on a key's kind anywhere in `OIMSlotStoreServiceTreeDriven`
(`packages/core/src/engine/store/README.md`), which is why the two tree arms are
one class with two injections rather than two classes.

**The store IS a constructor argument, and a consumer does pass one.**
`OIMEntityCollection`'s constructor is public, takes one options object, and
`entitySlotStoreService` is a REQUIRED key of it with no default
(`packages/core/src/facade/entity/types/TOIMEntityCollectionOptions.ts`); and
`packages/core/src/index.ts` exports both store services and both key walks. So
whatever keeps this off the sweep list, it is not that the arm cannot be
constructed.

What is left is the key type, and it does different work in each pair:

- **map against identity-tree — not a sweep.** A task keyed by a string cannot
  be handed to the identity tree without the caller first resolving that string
  to a `TOIMEntitySlot` that some other collection already owns. That
  resolution is a `Map` lookup — the very thing the choice was supposed to be
  about, moved from the store to the caller. Two arms doing unequal work are not
  two arms.
- **scalar-tree against identity-tree — not a sweep, and for a stronger
  reason.** The same resolution stands between them, and underneath it the two
  arms do not compute the same thing: the identity arm takes a counted hold per
  segment, so a row keyed by `[user, card]` keeps that user resolvable for as
  long as the row is addressable, and the value arm holds nothing, so removing
  `u1` is invisible to a row filed at `['u1', …]`
  (`packages/core/src/engine/key/OIMKeyTreeWalkScalar.ts`;
  `packages/core/src/index.ts`). That is a fork about LIFETIME. A pair
  whose arms leave different state is not a measurement of one task.
- **map against scalar-tree — this IS a sweep, and it is unswept.** For a
  population keyed by ONE scalar both arms accept the task with no resolution
  moved anywhere: the selector is `row => row.id` against `row => [row.id]`, and
  a one-segment chain is legal — `mintNodeAt` refuses only
  an EMPTY key (`packages/core/src/engine/key/OIMKeyTreeWalk.ts`) —
  and takes no hold at one segment any more than at three. What the second arm
  costs over the first is countable in the source and nothing else: per
  resolution one caller-allocated array plus one `Map.get` on the root node and
  one field read (`packages/core/src/engine/key/OIMKeyTreeWalk.ts`) against the map store's
  single `Map.get`; per insert a `parts.slice()` and a `Set.add`
  (`packages/core/src/engine/store/OIMSlotStoreServiceTreeDriven.ts`) against one `Map.set`. **No
  adapter in `src/adapters/` constructs the scalar store**, so the arm is
  shipped and unmeasured.
  That is a gap in this report, not a property of the engine.

A real pair also exists for the identity tree and it is a **different task**: a
population keyed by a combination, against a floor of nested maps.

### Task 1 — `sweep.insert-then-read`

Insert a population, read one row back by key. **One axis varies: the write
strategy**, and the sweep's job is to find out whether the fork is *free* here
rather than to find a winner. `createOIMEntityWriterInPlace.ts` and
`createOIMEntityWriterReplacing.ts` both default `entityInsertStrategy` to the same
strategy (the copying one when this was measured; `oimInsertEntityWithoutCopy` since 2026-10-21), and `upsert`'s insert branch calls
`fillSlot` and no other method of the strategy
(`packages/core/src/facade/entity/OIMEntityCollection.ts`, `upsert`). The two arms should be the
same machine code on this path; the row turns that source claim into a reading.

Fixed: the three index axes are **absent**, not fixed — the task declares no
index, and registering one would price a capability a `Map` has no counterpart
for.

Floor: `map.set(row.id, { ...row })` per row, then one `map.get`. It allocates
one copy and hashes one string per row. **Direction: inflates our ratio**, and
nothing on the swept axis can close it — ours mints an identity, copies through
`fillSlot`, refuses names a row may not carry, stamps the slot and the
collection, and records the row on the presence channel.

**Expected answer, stated in advance so a run can refute it:** no arm reaches
the floor, and the reason is an honest limit rather than a missing strategy —
the identity is the product. What would settle it: a gap decomposition against
`new-collection.vs-new-map` and `find.vs-map-get`, both already in the table.

### Task 2 — `sweep.grouped-column`

Write one column of one row, move the row between two groups, and read the
group.

A bucket's slots are the caller's, and a write reaches no index at all. No
reading has been recorded for any arm of this task: there is no `sweep` piece
under `packages/bench/measurements/`.

**What varies.** The *bucket-writing door*, two arms: `writeContent`, which takes a
whole bucket at a time; and the *position* writes (`removeBucketMemberSlotAt` +
`insertBucketMemberSlotAt`), which are `OIMBucketCollection`'s own and need
`OIMBucketSlotsServiceArrayDriven`.
Moving one row through `writeContent` rewrites both buckets end to end; moving it by
position finds it and splices it. Plus the *write strategy*, two arms, on the
position door.

Fixed, with what fixed each: **bucket service** at `OIMBucketSlotsServiceSetDriven` on
the `writeContent` arm, because the floor is a `Map` of `Set`s and keeps no order —
an ordered arm would be priced against a floor that does not sort, would lose,
and the losing would say nothing about ordering. The positional arm cannot use
the unordered service at all (a `Set` has no third element) and takes
`OIMBucketSlotsServiceArrayDriven`, which sorts nothing either; neither arm sorts. That
axis is measured where it can be measured honestly, in `alternativePairsMutator.ts`
and `alternativePairsIndex.ts`. **Identity store** is the one a bucket
collection is constructed with — `OIMSlotStoreServiceMapDriven` for a group named
by a column's value, because the address is a column's value; the tree store
(`OIMSlotStoreServiceTreeDriven`) would make the caller resolve the string to a
slot before every write.

Floor, written **once and shared by both arms** so that neither can be flattered
by a floor edited while thinking about the other: move the row between two
`Set`s, write the column, iterate one group. It does less: no identity outliving
the value, no frame stamp (so a row written twice between two reads is two units
of work rather than one), no hold count, and its groups can be read by iterating
them and by nothing else. **Direction: inflates our ratio.**

**ONE ITEM THAT LOOKS LIKE IT FLATTERS US RUNS THE OTHER WAY.** It is read as
the floor re-reading `row.group` to find the departure set where our side is
handed the bucket by a slot cell it already keeps. There is no slot cell. Both
arms resolve the departure bucket by address through `getSlotByKey`, and the
positional arm then finds the slot with an `indexOf` over that group, where the floor's `Set.delete` is a hash. That is now the largest single
term on the row and it is ours.

**That both manual arms file the same rows into the same buckets must be checked
before the rows are declared** — the construction and body replayed outside the harness, with every
bucket holding exactly the rows whose column names it after every pass. A fast
arm that filed the wrong rows is the failure mode here and nothing in the harness
would catch it. That check has NOT been performed for either arm.

**Expected answer, stated in advance:** the positional arm is the closer of the
two doors and is still above 1.00. If `writeContent` comes out closer, rewriting
two whole buckets is cheaper than finding one slot in one of them, which is a
finding about the `indexOf` rather than about either arm.

### Task 3 — `sweep.poll-unchanged`

Re-send a row unchanged — the shape a server poll produces, and **the one task
where the floor is genuinely reachable**, because the whole job is deciding that
nothing changed and a hand-written store has to decide it too.

Axes: the *write strategy* (both strategies walk the patch and return
`nothingChanged`; `createOIMEntityWriterReplacing.ts` allocates only on the branch where something
changed, which this arm turns into a reading), and *whether an index is held* —
not a strategy fork but the question a consumer asks before adding a grouping to
a polled population. A write reaches no index whatever it changes, so
the question is whether the links an index holds cost a write that changes
nothing, and the answer is structurally no. The index axes are fixed on that arm because a
write that moves nothing never reaches any of them; sweeping them would print
the same number under four names.

Floor: `map.get(id)` and four explicit comparisons. **This is the fairest floor
in the suite, and the task rather than the writing is why** — on an unchanged
poll the bare floor and the change-tracking floor are the same code, so there is
no second floor to print (contrast `upsert.insert-vs-tracked-store`, which needs
both). Where it still does less, both pushing our ratio up: it compares four
columns named at compile time where `mutateSlot` enumerates whatever the patch
carries, and it never looks for columns the stored row has that the new one does
not — where `upsert` walks the stored row with an own-property test per column
*before* it walks the patch at all. That walk is `leavingColumns`
(`packages/core/src/engine/entity/utils/leavingColumns.ts`) — `for (const name in
prevEntity)` over the stored record, each name probed against the incoming one
with `hasOwnProperty`: one own-property probe per stored column per polled row,
on every write, whether or not anything changed.

**That departed-column walk is the largest single item a reader should hold
against this ratio, and it is the one that names a candidate missing strategy**:
a population whose columns are declared could skip it. If the poll task turns
out to be the one that does not reach the floor, that is the fork to price
before calling the gap an honest limit.

---

Run per task, because the arms of one task are comparable and the arms of two
tasks are not:

```
npm run price -- --only sweep.insert-then-read --record measurements/<date>-sweep/insert-then-read
npm run price -- --only sweep.grouped-column   --record measurements/<date>-sweep/grouped-column
npm run price -- --only sweep.poll-unchanged   --record measurements/<date>-sweep/poll-unchanged
```

---

## subscription churn — nine rows added because NOTHING measured a mount

**Why they exist.** Every one of the fifteen older scripts measures WRITES and
DELIVERY with the subscriptions ALREADY STANDING: a binding is built once,
untimed, and no script adds or removes a subscriber.
So the two operations a component performs on the
way in and on the way out — what a route change, a list virtualisation and a
conditional render each pay — are what these rows price.

**What one cycle is.** `mount every churned subscriber → write one row → settle
→ unmount them, in this script's order → write that row again → settle`,
repeated `CHURN_CYCLES` (8) times. The frame either side is one write and one
settle, because the subject is the mounting. The mounted frame must deliver
exactly once, naming HOW MANY subscriber bodies ran and WHAT subscriber 0 read
out of the store (`harness/render.ts`, `deliverChurn`); the unmounted frame must
deliver NOTHING. That second assertion is what makes an `unmount` that unmounted
nothing a failure rather than a fast time, and the reference model states both
independently (`harness/oracle.ts`, `emitChurn`).

### The measurement

Scope, on every line below and not only in this header — engine
`@oimdb/core` 4.0.0 as it stands in `packages/core/src` (unpublished, imported
from the working tree); harness `packages/bench`, `src/worker.ts` invoked
directly in `time` mode, `BENCH_N=10000`, `BENCH_WINDOW=32` (default); Node
v24.16.0; Apple M1, 8 cores.

**EVERY FIGURE HERE IS AN UPPER BOUND AND MUST BE LABELLED ONE.** The harness's
own load gate is 0.5 foreign runnable processes and would have REFUSED all of
these: the 1-minute load average read 5.36 before the first sweep, 5.40 after,
3.91 before the second and 5.06 after. Two processes per pair, `min` of 9 samples
each, `repeat` per scenario chosen so one sample is ~30 ms for the slowest
participant, warmup 30 — the same estimator for every adapter in a column.

Per mount+unmount PAIR, best of the two processes (engine @oimdb/core 4.0.0
working tree; bench worker `time`; N=10000, window 32; Node v24.16.0; Apple M1;
load 3.9–5.4 — upper bounds):

| row | subs on one root | oimdb | baseline-array | jotai 2.20.2 |
|---|---|---|---|---|
| `churnShared` (oldest out first) | 32 | 126.7 ns | 73.6 ns | 516.2 ns |
| `churnSharedReversed` (newest first) | 32 | 132.9 ns | 80.0 ns | 506.0 ns |
| `churnSharedDeep` (oldest first) | 256 | 146.5 ns | 83.6 ns | 455.3 ns |
| `churnSharedDeepReversed` (newest first) | 256 | 164.8 ns | 97.1 ns | 483.5 ns |

**The divergence below is not confined to `tearDown`.** It holds on every row that
unmounts — the whole `churn` family as well — because the hand-written anchor keeps
a store and unmounts with `indexOf` plus `splice` while the engine removes by
recorded position. On those rows the floor does asymptotically more work than we
do, so the gap there is partly the algorithm's rather than wholly the engine's.
Read them with that in front of you; it is in our favour.

### Is teardown of N subscribers sharing a root quadratic in N? YES, and it is not the engine's

**The assumption-free form.** A purely linear cost would grow by LESS than 8×
from 32 to 256 subscribers, because each cycle also carries a fixed two-frame
constant. Measured growth (same scope as the table; upper bounds; load
3.9–5.4):

- oimdb, oldest-out-first: 32.44 µs → 299.96 µs = **9.25×**
- oimdb, newest-out-first: 34.02 µs → 337.54 µs = **9.92×**
- baseline-array, oldest first: 18.85 → 171.30 = **9.09×**; newest first: 20.47 → 198.77 = **9.71×**
- jotai, oldest first: 132.16 → 932.48 = **7.06×**; newest first: 129.54 → 990.26 = **7.64×**

Between-process disagreement on those four rows was 0.3–10.7 %, so 9.25 against
8.00 is outside it and 9.92 is well outside it. **jotai is BELOW 8×**, which is
what an O(1) listener set looks like.

**The decomposition.** Fitting per-cycle cost to `F + a·N + b·N²` through the
three sizes this family measures (N = 1, 32, 256 on one root). It is an exact
interpolation through three points, not a regression — there is no residual to
report, and each coefficient carries the 0.3–10.7 % process spread of the points
it was solved from. Same scope as above; upper bounds; load 3.9–5.4:

| adapter | order | F ns/cycle | a ns/subscriber | b ns/N² | b·N² at 256 | share at 256 | share at 32 |
|---|---|---|---|---|---|---|---|
| oimdb | oldest first | 469 | 107.4 | 0.1454 | 9531 | 25.4 % | 3.7 % |
| oimdb | newest first | 465 | 112.0 | 0.1992 | 13053 | 30.9 % | 4.8 % |
| baseline-array | oldest first | 407 | 57.9 | 0.0944 | 6185 | 28.9 % | 4.1 % |
| baseline-array | newest first | 401 | 63.4 | 0.1253 | 8210 | 33.0 % | 5.0 % |
| jotai | oldest first | 1857 | 459.7 | −0.0453 | −2971 | −2.5 % | −0.3 % |
| jotai | newest first | 1873 | 443.4 | 0.1282 | 8399 | 6.8 % | 0.8 % |

**Where it came from — THE `b` COLUMN OF THE oimdb ROWS IS NOT A PROPERTY OF THE
SHIPPED ENGINE.** In the recorded run, `detach()` was an `indexOf` + `splice`
on `root.effects` per subscribed root: N subscribers sharing one root were N
searches of a shrinking array, leaving from the FRONT was one compare and a long
shift, leaving from the BACK a long scan and no shift — which is why the
newest-out-first coefficient came out 1.37× the oldest-out-first one (0.1992 vs
0.1454). **Every figure in the table above stays exactly as recorded.**

**What the engine does.**
`OIMEffect.detach` searches for nothing: each edge records WHERE it
was filed when it was filed (`rememberPosition`, into `positionInFirstSubscribedSlot` for the first edge
and `positionsInOtherSubscribedSlots` for the rest), and `unsubscribeFrom` removes by that position —
swap-with-tail, then `dependents.length = last`, with the vacated position
repaired on whichever effect got moved. No scan and no shift, so taking N
subscribers off one identity is linear in N. The whole of the argument, including
what the position bookkeeping costs, is in
`packages/core/src/engine/computed/README.md`
(`positionInFirstSubscribedSlot` / `positionsInOtherSubscribedSlots`, declared in
`packages/core/src/engine/computed/OIMEffect.ts`).

**THE FINDING IS THAT IT IS NOT THE ENGINE'S.** `baseline-array`'s hand-written
floor — a `Map<id, callback[]>`, push to mount, `indexOf` + `splice` to unmount —
carries the SAME quadratic, in the same proportion (28.9 % / 33.0 % of its cost
at 256, against oimdb's 25.4 % / 30.9 %) and with the same order asymmetry
(0.1253 / 0.0944 = 1.33×, against 1.37×). An array of subscribers is what has the
quadratic; the engine is paying the ordinary price of one. **Read as of the run
date only**: the floor unmounts with `indexOf` + `splice`
(`adapters/baseline-array.ts`) and our side does not, so the two `b`
columns do not measure the same shape and the equality above is a
statement about the recorded run, not about the engine that ships.

What separates the two is the LINEAR term: 107.4 ns against 57.9 ns per
subscriber, a 1.85× constant. The constructor allocates a `Set` only when more
than one derivation is named (`if (sourceComputeds.length > 1)`), and it skips the
root expansion — hence the two `Set`s inside `collectRootSlots` — entirely when
there are no derivations and at most one root. **A one-root row binding allocates
no `Set` at all**, so the 1.85× has to be decomposed against the effect object
and the position bookkeeping, and nothing has re-run it.

**Where it starts to show.** Below the run-to-run spread at 32 subscribers on one
root (3.7–5.0 % of the row, against a between-process disagreement of up to
10.7 % on those same rows — *not separated at that size*), and a quarter to a
third of the cost at 256.

### The other four rows

Same scope throughout — engine @oimdb/core 4.0.0 working tree; bench worker
`time`; N=10000, window 32; Node v24.16.0; Apple M1; load 3.9–5.4;
upper bounds.

- **`churnColumn` (32 subscribers on the `label` COLUMN of one row).** oimdb
  132.3 ns/pair against its own 126.7 ns/pair on the ROW at the same count and
  order. **The two are NOT separated**: the gap is 4.4 %, the between-process
  disagreement on those rows is 4.1 % and 8.0 %, and the in-process spread
  reaches 37.2 %. So `effectOnColumn`'s extra hop — minting the column identity
  inside the subscription (`OIMChannel.ts`, `effectOnColumn`) and giving it back
  on the detach — costs nothing this measurement can see at this size. The
  hand-written floor is the one that pays: 174.6 ns/pair against its own 73.6 on
  the row, because its column mount builds a `` `${id}|label` `` key and probes a
  second map.
- **`churnWide` (ONE subscriber over 64 sources).** oimdb 4184 ns/pair = 65.4 ns
  per source; baseline-array 2967 = 46.4 ns per source; jotai 65620 = 1025 ns per
  source. jotai's is not the same operation and the row says so: composing a
  derived atom over 64 row atoms and mounting it is a different object graph from
  registering one effect in 64 lists.
- **`churnChain` (32 subscribers, each building 4 derivations over 8 rows).**
  oimdb 797.2 ns/pair against 126.7 for the flat subscription at the same count —
  6.3×, and it is paid AT THE MOUNT: four `OIMSingleComputed`s allocated per subscriber
  plus `collectRootSlots` walking down to the roots
  (`packages/core/src/engine/computed/utils/collectRootSlots.ts`). baseline-array 639.6 ns/pair, and its chain costs
  NOTHING at mount — a person writing it by hand knows which rows the derived
  value reads, so there is no walk — it pays in the FRAME instead, `depth × count`
  reads per wake-up. The two land within 25 % of each other by opposite routes,
  which is the comparison the row exists to make.
- **`churnResident` (256 standing, 32 churned per cycle).** oimdb 489.6 ns/pair
  against 126.7 for the same 32 churned with nothing else standing — 3.86×;
  baseline-array 272.7 against 73.6 = 3.70×; jotai 2549.9 against 516.2 = 4.94×.
  **THIS ROW DOES NOT ISOLATE WHAT IT WAS BUILT TO ISOLATE, and the limitation is
  intrinsic to the shape rather than to the writing of it.** The resident
  subscribers must share the churned subscribers' root for the `effects` array to
  be long, and sharing the root means the proof frame wakes them too: a resident
  cycle runs 544 subscriber bodies where an isolated one runs 32. So the 3.86×
  contains both the longer `indexOf` per unmount AND 512 extra wake-ups per
  cycle, and nothing in the pair separates them. The only shape that would is a
  frame that writes a root the residents do not read — which is a root the
  churned subscribers do not share, and then the array is not long. Read this row
  as "what churn against a standing population costs end to end", never as "what
  a mount costs when 256 are standing".

### Direction — does this flatter `@oimdb/core` or count against it

**Against it, on the linear term, and that is the point of having the floor arm.**
The hand-written subscription is 1.85× cheaper per mount+unmount pair and the
quadratic is shared, so nothing about the shape of the curve is available as an
excuse for the constant.

**Neutral on the quadratic.** It reproduces, it is 25–31 % of the cost at 256
subscribers on one root, and the anchor has it too.

### The command

The runner has no churn table yet beyond `participantsOf` admitting the family;
these figures came from the worker directly, one process at a time:

```
node --import tsx src/worker.ts <adapter> <scenario> 10000 verify
node --import tsx src/worker.ts <adapter> <scenario> 10000 time <repeat> 9 30
```

with `<repeat>` 1500 / 230 / 235 / 33 / 33 / 60 / 35 / 7 / 46 for `churnOne`,
`churnShared`, `churnSharedReversed`, `churnSharedDeep`,
`churnSharedDeepReversed`, `churnWide`, `churnColumn`, `churnChain`,
`churnResident`. All 27 (adapter, churn scenario) pairs pass `verify`: digest
against the reference model, and the population audit.

---

## Every `oimdb` window row changed arm — from the bucket to the derivation

**What moved.** `packages/bench/src/adapters/oimdb.ts`, `bindViews`: each view's
shape subscription was `channel.effect([bucket], [], body)` and is now
`channel.effect([], [order], body)`, where `order` is the per-group derivation
`createOIMComputedCollectionBucketMemo` files
(`packages/core/src/factories/createOIMComputedCollectionBucketMemo.ts`). `resync`,
`refresh` and `groupOrder` read `order.value`, whose getter produces on read,
instead of iterating `byGroup.read(bucket)`.

**Why it is not tuning.** The engine's report is unconditional by design —
`OIMBucketCollection.write` ends in `this.channel.write(bucket)`
(`packages/core/src/facade/bucket/OIMBucketCollection.ts`, `write`), and the two-call
protocol for an in-place sort-key change ends the same way. The filter lives in
`oimRefreshComputedSlot`, which advances `changedAt*` only when its `held` says
the value changed (`packages/core/src/engine/computed/utils/oimRefreshComputedSlot.ts`), and
`OIMEffect.run` returns without calling the body when nothing it reads has moved
(`packages/core/src/engine/computed/OIMEffect.ts`, `run`). An effect over the raw bucket sits upstream of that
filter and receives every report. Measuring it compared sixteen libraries against
this engine's worst arm.

**What it changes, measured the day it landed** (`node --expose-gc --import tsx
src/worker.ts oimdb <script> 10000 verify`, this machine —
verification counters, not times):

| script | view A `d/n/r` | view B `d/n/r` |
|---|---|---|
| `patchColumn` | 32/32/0 | 0/0/0 |
| `sortKeyMove` | 8/8/0 | 0/0/0 |
| `resendUnchanged` | 0/0/0 | 0/0/0 |

`resendUnchanged` is the row the arm exists for. Every re-sent row is reported as
a possible mover, so the wake reaches the effect for all of them, and the
derivation refuses every one: nobody is woken at all.

**The figure this voids.** The adapter carried "1 delivery, 0 distinct, 1
redundant, at both 3 200 and 10 000 rows (worker `verify`)" for
`resendUnchanged`. That was taken through the DEFERRED ORDER VERDICT
(`settleOrderNow()`), a different shape, so it is void
rather than superseded and the 0/0/0 above is not the same measurement improved.
The 3 200-row point has no reading on this arm.

### Direction — does this flatter `@oimdb/core` or count against it

**It flatters it, and that is the reason to say where the gain comes from.** The
delivery counts improve because a filter that ships in `packages/core` is now
being exercised, and the row costs one computed slot plus one counted hold per
group, one `Array.from` + `sameSlots` pass per settle that finds the bucket
changed, and two integer comparisons per settle that does not. None of that is
free and all of it except the mint is inside the clock. One alternative is open
rather than argued away: shipping BOTH arms as two rows, the way the two anchors
are.

**Not the read wiring.** `bindReadViews` in the same file is still on the bucket
and says so in its header. It changes no counter in the three read scripts —
`readByKey` and `scrollTo` write nothing and `filterTwoAxes` moves rows between
groups, which every arm must deliver — but it means one adapter measures two arms
until somebody moves it.

---

## What a ratio in this report is a ratio OF — the participation line

A reader meeting `15.6×` thirty tables later needs beside it whether the number
came out of a field of seventeen or of two. `formatDuelReport` prints how many of
the seventeen are wired for the script, how many produced a number in that run,
and — named — how many declined in writing and which declaration the reason is in,
fed by `TDuelField` from `src/duel.ts`.

**Two absences, kept apart.** A
library with no wiring for a script is a finding about the LIBRARY. A library the
duel did not run is a fact about THE TOOL. Adding them into one number reports the
second as findings of the first kind, which is the thing worth refusing.

**What it says about `patchColumn` specifically:** nothing declines it. `bind` is
required on `TAdapter` (`src/harness/types.ts`, `TAdapter.bind`) — there is no `absent` half to
set — so all seventeen adapters and all three controls are wired, and all twenty
were run against the reference model and passed. A `patchColumn`
ratio is over the whole field.

---

## The settle fork: why depth 1 and depth 3 come out on opposite sides

**The rows.** `alt.settle.pull-at-the-getter-vs-push-at-the-write.depth-{1,2,3}` in
`src/price/alternativePairsSettle.ts`, run twice and recorded in
`measurements/2026-09-02-alternatives/settle`. 300 roots written per frame, 200
consumers reading, fan-in 3, only the number of levels between them moves.

| depth | run 1, noise 0.5% | run 2, noise 4% |
|---|---|---|
| 1 | 2.57 µs vs 4.75 µs — 0.54x | 2.80 µs vs 4.67 µs — 0.60x |
| 2 | 13.73 µs vs 12.07 µs — 1.14x | 12.60 µs vs 12.48 µs — 1.01x, UNSETTLED |
| 3 | 32.78 µs vs 19.45 µs — 1.69x | 33.09 µs vs 19.44 µs — 1.70x |

**Why the direction flips.** Ours costs nothing at the write and one comparison
per source at every read; push pays a walk of the whole cone at the write and
one boolean per node at the read. At depth 1 the sources under a consumer are
roots, which are current by definition, so push's mark has bought nothing and its
walk is pure cost — we are 1.7x cheaper. Each level added multiplies OUR read
(~2.4x per level across these rows) faster than it multiplies push's mark
(~1.6x per level), so the curves cross between depth 1 and depth 2 and push is
1.7x cheaper by depth 3.

**Which way the rows are tilted, and it is towards push in all three.** Every
root moves every frame, so `held` never cuts a chain and push is never
charged for a mark whose value did not change — the arrangement in which push is
at its best. Every node is read by exactly one consumer, so the sharing axis,
where a single settle answers ten readers, is not exercised either. Both are
named in each row's caveat. THE ARRANGEMENT WHERE PUSH IS AT ITS WORST IS NOT YET
MEASURED, and until it is, "push wins deep chains" is a statement about a graph
in which everything changes at once.

**What the rows do NOT settle.** Whether the fork is worth shipping. Push marks
at the WRITE, so it is not a strategy a derivation can choose in its own
constructor without the write path reading a `dependents` field on behalf of
consumers who took the other arm — which is the branch on the hot path that the
fork rule exists to avoid.

---

## Subscription and dispatch against 3.12.1: the wake is ours, the teardown is theirs

**The rows.** `alt.subscription.effect-vs-keyed-handler.*` in
`src/price/alternativePairsSubscription.ts`, recorded in
`measurements/2026-09-02-alternatives/subscription`. Both arms are the shipped
classes of both engines — `OIMChannel.effect`/`write`/`flush` against 3.12.1's
`OIMCarrierKeyedEmitter.subscribeOnKey`/`markUpdatedKey` and `OIMEventQueue.flush`
— with no adapter, no dataset and no consumer, and with the write path outside
the clock on both sides.

| row | ours | 3.12.1 | ratio |
|---|---|---|---|
| wake 256 identities, one subscriber each | 4.31 µs | 8.16 µs | 0.53x |
| wake 256 subscribers on one identity | 2.65 µs | 3.57 µs | 0.74x |
| mount 256 and release 256 | 32.83 µs | 18.45 µs | 1.78x AGAINST US |

**Where the mount row's cost is, measured phase by phase** (3000 passes after
300 of warm-up, an ad-hoc phase split with no artifact in the tree, load 2.2 on
8 cores):
ours mounts at 68 ns per subscriber against 57, and DETACHES at 60 ns against
19. The mount is near parity; the whole gap is the teardown.

**And the teardown did not scale.** Per-subscriber detach was 36 ns at 64
subscribers on one identity and 60 ns at 256, because `OIMEffect.detach` found
itself with `indexOf` and removed itself with `splice` on `root.effects`, so every removal
shifted the tail, and taking N subscribers off one identity was quadratic in N.
3.12.1 keeps a carrier's handlers in a `Set` and deletes in constant time
(`packages/core-legacy/src/core/OIMCarrierKeyedEmitter.ts`, `removeHandler`).

**The numbers above are the evidence, not a description of the shipped engine.** `OIMEffect` records the position
each edge was filed at (`positionInFirstSubscribedSlot` / `positionsInOtherSubscribedSlots`, written only by
`rememberPosition`) and `unsubscribeFrom` removes by that position with a swap-with-tail —
no search, no shift
(`packages/core/src/engine/computed/OIMEffect.ts`). The argument for that arm —
why the first edge is a field and only the rest get an array — is in
`packages/core/src/engine/computed/README.md`, which carries it without figures:
the three above, with the artifact
(`measurements/2026-09-02-alternatives/subscription`), and the 16 ns per
subscriber the mount charges against the 18 the teardown saves, have no source
in the engine tree and are sourced here and to that artifact only.

**Consequence for the table above, stated so nobody re-derives it wrongly**: the
`mount 256 and release 256` row — 32.83 µs against 18.45 µs, 1.78x against us —
was measured with the `indexOf` + `splice` detach in it, and its 60-ns-against-19 phase split
priced that detach. Neither figure has been re-run against the position-based
detach, so this row's verdict is UNSETTLED rather than either confirmed or
overturned. The other two rows do not touch the detach path.

`churnSharedDeep` is `wiring: 'row'` with 256 subscribers on one root
(`harness/scenarios.ts`), and nothing about it is a derivation depth. The measured
cause of a mount-heavy row going against us is the line above.

**A defect this file's own first run had, kept here because it is the shape of
the mistake.** The first version subscribed ONE function 256 times. 3.12.1 stores
handlers in a `Set`, so its arm mounted, woke and released ONCE against our 256,
and the row printed a ratio of fifteen. The equivalence check that missed it ran
at 8 subscribers with distinct closures. The check now runs at the real count and
asserts the wake counts and the handler counts on both sides.

---

## `write one value` and `re-write one value` — the shape of the explanation, before any number

**Nothing here has been run.** Every cell of both tables and of
`single-value lower bound` is blank below, deliberately: this entry is the
apparatus for reading the row, written before the measurement so that it cannot be
written *around* one. The rule this file opens with applies to it — a plausible
story with no line number is a guess — so what follows is only what can be read out
of the source today, plus named holes where a figure goes.

**What the scripts are.** `harness/scenarios.ts`, `singleWrite` and `singleResend`:
`SINGLE_STEPS` steps, each `writeSingle(v)` then `settle()`, against one value the
library holds and a second value beside it that nothing writes. View A renders the
first, view B the second. `write one value` writes a value the store does not hold
and demands `SINGLE_STEPS` distinct renders in A and none in B; `re-write one
value` writes the value the store already holds and demands none in either. The
audit afterwards reads BOTH values back through the library
(`firstSingleMismatch`, `harness/oracle.ts`), which is the only thing separating "the
store took the write and correctly woke nobody" from "the store dropped it".

### What each row does per write, read from source

| row | what one `writeSingle` + `settle` performs | where |
|---|---|---|
| `baseline-array` | assign a variable, set a flag; the settle runs one callback and delivers | `adapters/baseline-array.ts` (`writeSingle`) |
| `baseline-indexed` | **no row** — declined in writing; a single value has nothing to group | `adapters/baseline-array-indexed.ts` (`single.absent`) |
| `oimdb` | `OIMSingleEntity.update({ value })` → the write strategy compares, then marks the record's columns and the record, and `settle()` runs the frame | `adapters/oimdb.ts` (`writeSingle`) |
| `oimdb-3.12.1` | `OIMObject.setProperty` → write, then mark that key's carrier unconditionally; `queue.flush()` runs the frame | `adapters/oimdb-legacy.ts` (`writeSingle`) |
| `tinybase` | `store.setValue(name, v)` — a keyed scalar in the Values half of the store, its own transaction, its listeners run as it returns | `adapters/tinybase.ts` (`writeSingle`) |
| `signaldb` | `collection.updateOne({ id }, { $set: { value } })` — a **document** standing in for a value | `adapters/signaldb.ts` (`writeSingle`) |
| `tanstack-db` / `-eager` | `begin/write/commit` through the sync interface — a **row** standing in for a value | `adapters/tanstack-db.ts` (`writeSingle`) |
| `lokijs` | `by('id', name)`, assign, `update(doc)` — a **document**, and the emitter has no per-value granularity | `adapters/lokijs.ts` (`writeSingle`) |
| `mobx` | `runInAction(() => box.set(v))` | `adapters/mobx.ts` (`writeSingle`) |
| `jotai` | `store.set(atom, v)` on a vanilla store | `adapters/jotai.ts` (`writeSingle`) |
| `legend-state` | `observable.set(v)`, notifying before it returns | `adapters/legend-state.ts` (`writeSingle`) |
| `effector` | `valueWritten(v)` → `store.on` reducer `(_, next) => next` | `adapters/effector.ts` (`writeSingle`) |
| `nanostores` | `atom.set(v)`, notification queue drained inline | `adapters/nanostores.ts` (`writeSingle`) |
| `redux-toolkit` | `store.dispatch(writeSingle(v))` — one Immer producer, then **every** subscriber | `adapters/redux-toolkit.ts` (`writeSingle`) |
| `preact-signals` | `signal.value = v` | `adapters/preact-signals.ts` (`writeSingle`) |
| `alien-signals` | `signal(v)` | `adapters/alien-signals.ts` (`writeSingle`) |

### The three shapes a reader must keep apart, because the table above mixes them

1. **A scalar the library ships.** `tinybase` (Values), `mobx` (`observable.box`),
   `jotai`, `nanostores`, `preact-signals`, `alien-signals`, `legend-state`,
   `effector`, and the anchor. Nothing in the path but the value. **The anchor
   routes, and that is its position rather than a freebie**: the write marks the
   value it wrote and the settle wakes that value's subscriber alone. A library
   with one global change signal is not being compared against something
   unattainable — this is four lines — and its extra wake-ups reach the report as
   redundant deliveries beside its time.
2. **A keyed record standing in for a value**, because the library has no scalar at
   all: `signaldb` and `tanstack-db` hold a document/row, `lokijs` a document,
   `oimdb-3.12.1` one property of an `OIMReactiveObject`. Each carries a KEY the
   first group does not, and each says so in its own builder's comment. **This is
   an asymmetry on the row and it is not corrected for.** Which way it moves a
   number is not stated here, because nothing has measured it.
3. **A global change signal**: `redux-toolkit`, where `store.subscribe` carries no
   information about what changed, so the bystander's subscriber runs on every
   write. That is Redux's shape and not the adapter's; the react-redux bail-out
   that would suppress it is not installed, which this row's `departure` already
   says.

### What separates the two scripts, and what each is expected to expose

`re-write one value` asks one question: **does the library compare before it
notifies?** Read from source, without running anything:

- `oimdb` compares — `OIMSingleEntity`'s default write strategy is
  `WRITE_IN_PLACE` (`packages/core/src/facade/entity/OIMSingleEntity.ts`, its
  constructor default), and `update` returns early when no column changed.
- `oimdb-3.12.1` does **not** — `OIMObject.setProperty` writes and then marks,
  with no comparison (`packages/core-legacy/src/core/OIMObject.ts`, `setProperty`).
- Everything else: **not read yet.** Each library's own comparison (or absence of
  one) is what this row is for, and stating it from memory is exactly the failure
  this file exists to prevent. Fill this list in from the source, one line each,
  before quoting any number.

### The figure

|  | `single-value lower bound` | `write one value` | `re-write one value` |
|---|---|---|---|
| measured | — | — | — |
| artifact | — | — | — |

**No direction is predicted here, and none may be added without an artifact under
`packages/bench/measurements/`.** In particular: this row is *not* claimed to be
where `@oimdb/core` is fastest, nor where it is slowest.

**What is known about the floor before the run, and it is a property of the task:**
a correct store delivers exactly one `deliverSingle` per write, so `singleFloor` is
a *tight* bound rather than merely a lower one — the gap between a row and 1.00 is
that row's store and nothing else. Everywhere else in this report the floor
over-states nobody's consumer cost and under-states most.

---

## what three libraries pay on a read row, and one of them nothing at all

- **TinyBase's window is a property of the listener, not of the read.**
  `addResultSortedRowIdsListener` takes `(cellId, descending, offset, limit)` at
  REGISTRATION, so a scroll is a re-registration for that row rather than a
  re-query.
- **A scroll changes no document, so LokiJS's collection emitter does not fire and
  view B is not re-read at all.** That is very nearly free for that store, and it
  is the finding rather than a dodge.
- **tanstack-db's `toArray` allocates one array per timed render, and re-enriches
  only the rows that changed.** `toArray` is `Array.from(this.values())`
  (`@tanstack/db/src/collection/index.ts:1114-1116`); each row's enriched copy with
  `$synced`, `$origin`, `$key`, `$collectionId` comes out of `virtualPropsCache`,
  keyed by row key and reused while the stored row object is the same
  (`collection/state.ts:170-178`, `:336-345`), so a render after a one-row patch
  builds one new enriched object, not 32.

## three scripts whose direction is predicted from source, before any number

Stated here before they are measured, so that the prediction cannot be written
after the result.

**`drainGroup` and `deleteRows` are expected to go badly for us.** The ordered
bucket service opens its own documentation with "Removal is O(n)" and implements
removal as `indexOf` plus `splice`, so draining a bucket of `groupSize` rows is
quadratic in it — where a rescanning store deletes from a Map and filters.

**`growUnderSubscription` is expected to go badly for two separate reasons.** Every
batch is a full sort of every bucket it touches: a batch brings `GROWTH_FRACTION`-worth
of arrivals into each of the fifty buckets against a budget of about `2 · log₂ n`,
so each frame sorts a bucket LARGER than the one the previous frame sorted, eight
times over. And every arriving row mints an identity: a rescanning store puts a row
in a Map, where this engine allocates a slot per key and keeps it — the growth
script is exactly where that per-key constant is paid with no delivery to amortise
it against.

## chain depth and chain shape — depth is nearly free, the SPELLING is not

**Measured, artifact `measurements/2026-09-07-price/chain-depth/`** (the recorded run,
`BENCH_MAX_LOAD=3`, controls `control-resolution-2x` 2.02 and
`control-scale-same-body` 1.00), with three further unrecorded runs quoted for
run-to-run variation as C3 requires:

| row | recorded | three earlier runs | verdict |
|---|---|---|---|
| `chain.three-links-vs-the-shipped-two` | 1.00x | 1.00 / 1.00 / 1.00 | one extra link is at the noise floor |
| `chain.four-links-vs-the-shipped-two` | 1.09x | 1.05 / 1.10 / 1.09 | two extra links cost ~9% |
| `chain.next-as-a-parameter-vs-next-held-in-a-field` | 1.24x | 1.24 / 1.26 / 1.27 | the middleware spelling costs ~25% |
| `chain.three-link-classes-in-one-process-vs-one-class-three-times` | 0.93x | 1.41 / 1.31 / 1.38 | **NO READING — see below** |

**What the rows are.** At the time of the run the shipped chain was a DELEGATION:
`OIMEntityServiceWithChannel` held an `inner` and called `this.inner.mutateSlot`,
and the prose beside it said a further layer was the same construction again.
Neither the class nor that prose is in this tree. What ships is one class,
`OIMEntityCollection` (`packages/core/src/facade/entity/OIMEntityCollection.ts`),
with the channel built in — no chain at all. Every row times
`update` of one column over 1024 rows and differs from the chain as it then stood
in exactly one way; **nothing has re-recorded them against the single class.**

**The finding.** Depth is the cheap axis and the one everybody looks at; the
expensive axis is HOW the continuation is reached. Holding it in a field costs
two property loads and a call. Passing it as a parameter costs a closure
allocated per write, and that is 25% of a whole write — twenty-five times what a
second link costs. A layer API should therefore be a constructor-bound wrapper,
not a `next(…)` middleware, unless run-time composition is worth a quarter of
every write.

**The row that failed, kept because it failed.** The polymorphic-site row swung
1.41 / 1.31 / 1.38 / 0.93 across four runs, and its three high readings each
carried a floor spread of 48–53% — the pair times its floor twice, once before
our side and once after, and those two timings disagreed by half, reproducibly.
0.93 also violates the direction its own caveat states in advance (three shapes
at a call site cannot be faster than one), so by the file's own rule it is the
instrument.

**WHAT MADE 0.93 OUT OF THE SAME MEASUREMENT THAT MAKES 1.34, AND IT IS THE
DIVISOR.** In the stored record this row's floor is timed at `floorNs 64.13` and
again at `floorAgainNs 44.75`, and `ratio` divides by the FIRST of the two
(`packages/bench/src/price/runPricePairs.ts:129`, and the same line of
`price-worker.ts`). The `disagreement` whose call sits on the next line takes the
SMALLER of the two deliberately, and says in its own heading
(`runPricePairs.ts:59-63`) that this is "so the figure does not depend on which
reading was taken first — either was equally entitled to it". The quotient is the
one figure in the file that does depend on it. The same `oursNs 59.81` over the other floor
reading is **1.34x**, which is where all three unrecorded re-runs landed. The
three sibling rows of that same record read their floor at 43.81, 44.36 and
44.52 ns, so 44.75 is the value this body has in four of the five processes that
timed it and 64.13 is the one outlier — and the published 0.93 is that outlier
rather than anything about mixing link classes.

**THE OUTLIER IS NOT A BUSY MACHINE.** In the stored record this row's
`floorSpread` is 9.4% over nine samples and `floorWarmed` is 34 of 34 planned, so
inside each process the floor was stable and fully warmed; the 43.3% is BETWEEN
two processes running one body at one operation count. That narrows what is left
to find — it is a per-process difference, not scheduling noise inside a sample —
and it is still unfound.

**The printer prints no number for it.** A ratio whose floor or whose
own side disagreed with itself past `NOISE_VOIDS_THE_RATIO` prints `void` and
takes no place in the ranking, in both the price and the alternatives tables.

**The driver was the suspect, and it is not the cause.** The suspicion recorded
here was that the row counts a pass as `upTo * worlds.length` while taking `upTo`
from the whole remainder, so the prober's operation and the body's differ. The
overshoot was real, in the two lines of `sideOfThreeWorlds` that are now
`packages/bench/src/price/pricePairsChainDepth.ts:267` and `:282` (the `:288` /
`:298` recorded here pointed at the pre-fix file and point at nothing now),
and it is bounded: the round was quantised to `3 * ROWS`, so a pass
ran at most `2 * ROWS` = 2048 updates past the count the reading divides by.
For the stored run that is 402,432 updates performed against 400,514 charged on
our side and 626,688 against 625,872 on the floor — 0.48% and 0.13% — which
moves the stored 0.93 to 0.929. The floor's disagreement with itself on that
same record is 43.3%, two orders larger. **The count was wrong, it is fixed, and
it was not what ails the row.** Both arms always ran the same driver over the
same three worlds, so neither ever priced a different amount of work than the
other at an equal operation count.

**What the fix changed, and what it invalidates.** The round now
asks for `Math.ceil((times - done) / worlds.length)` rows per world, so a pass
overshoots by at most 2 updates; and the two property loads on `world` that the
sibling drivers hoist are hoisted here too. Both arms move, so every reading in
the table above for this row — the recorded 0.93 and the three earlier
1.41 / 1.31 / 1.38 — is from a different body and may not be put in one column
with anything measured since the fix. The other three rows in the file are
untouched.

**One difference between the arms that the caveat's stated direction does not
cover.** The many-classes arm has three forwarding bodies, each holding one
`writeInPlace` and so seeing one receiver at its own `this.inner.mutateSlot`;
the one-class arm has one forwarding body seeing the three `writeInPlace`
objects of the three worlds. The arms therefore differ at the link's own
delegating site as well as at the collection's, and in the opposite order.
Nothing here measures what that costs.

**No claim about the cost of mixing link classes may be quoted from this row.**
The question is still open and is the one that decides whether a consumer may
freely mix layer types.

**Direction.** Against `@oimdb/core` on the three rows that read: a forwarding
link and an allocated continuation cannot make any part of a write cheaper, so
any reading at or below 1.00 there is the instrument.

**What is inside every number and cancels.** `assertNotFlushing`,
`openSubframe`/`closeSubframe`, the column walk over a one-column patch, the
equality call, the store into `slot.entity`, the report to the channel, and one
frame per 1024 writes.

**Why depth was asked at all.** Nothing in this suite had measured what a link
costs, and the question is about to be asked for real: a TTL layer and an
inactivity layer are each one more link.

## `churnChain` — the oimdb spread is V8 collecting a hidden class, not the engine's work

Measured 2026-10-18 on the built core, in the real worker
(`node --expose-gc --import tsx src/worker.ts <adapter> churnChain 10000 time 40 30 20`):
oimdb min 262–298 µs, median 381–608 µs, spread 1.65–3.48; alien-signals min 196–202,
median 201–207, spread 0.10. Under `--trace-deopt` the oimdb worker logs 413 deopts with
reason `embedded weak objects cleared`; alien logs 0.

**Mechanism.** `OIMEffect` and `OIMSingleComputed` are classes whose fields are assigned
in the constructor, so each instance's hidden class is reached through map transitions,
and V8 holds those transitions weakly. `churnChain` unmounts every tile each cycle, so at
the `gc()` the harness runs between samples (`src/harness/measure.ts:74`) no instance is
alive, the hidden class is collected, and every optimized function that embedded it
(`OIMEffect`, `dispose`, `enlist`, `flush`, `oimRefreshComputedSlot`, `updateEmptiness`, …)
is deoptimized. The next sample runs before reoptimization — the slow mode of the spread.

**Evidence, deopt counts only.** The real adapter, the chain script, `gc()` every 400 runs:
nothing standing 329; one standing row effect 269 (the effect class survives, the computed
classes do not); one standing chain 0. Plain effects on rows: 93 without a standing effect,
0 with one. In isolation, a 5-field object made 32 at a time and dropped, `gc()` per batch:
class 26, `Object.create(proto)` plus assignments 18–19, a literal with a `__proto__` key 20,
a plain literal 0; any variant with one instance kept alive 0. alien-signals builds its nodes
as plain literals (`node_modules/alien-signals/esm/index.mjs`, `computed` and `effect`).

**The shape itself, with the hidden-class loss excluded.** `alt.effect-shape.class-vs-literal-and-service.*`
(`src/price/alternativePairsEffectShape.ts`, one resident effect per arm, `isolate`), recorded in
`measurements/2026-10-18-alternatives/effect-shape` and `…/effect-shape-create-rerun`: create 109 ns
class vs 93–95 ns literal (1.15–1.17×, flagged for foreign load both runs, floor spread up to 197%);
wake 2.04 µs vs 2.07 µs per frame (0.99×); dispose 93 ns vs 98 ns (0.95×). So with one instance
alive, the class costs ~15 ns more at creation and nothing on wake or dispose.

**After the fix (2026-10-18, task #334).** The effect is now a literal `TOIMEffect` driven by a
long-lived `OIMEffectService`, and `OIMSingleComputed` keeps one instance alive in a static field
(`packages/core/src/facade/computed/README.md`). Same worker command, 3 runs: oimdb min 241–274 µs,
median 279–281 µs, spread 0.22–0.28, 0 `embedded weak objects cleared` deopts (was 413);
alien-signals median 178–209 µs. The median gap went from 2.1–2.6× to 1.34–1.57×.

**What this row therefore reads.** On `min` the gap to alien is ~1.4×; the rest of the
median gap is this artefact of a script with no standing subscriber. Not yet decided: give
churn scripts a resident subscriber, change the engine's node construction, or state it here.

## one patch of one entity, and what it costs beside a signal set

**Probe, 2026-10-18, scratchpad only; machine load average 5, so read ratios, not ns.**
10 000 entities, one effect on the entity slot of `e5000`, a step is
`updateEntityByKey('e5000', { note })` + `db.flush()`; the floor is preact
`byId.get('e5000').note.value = note` with one `effect`. Ablation on a copy of
`packages/core/dist/index.js`, one step removed at a time, two runs, median of 31 samples ×
2000 steps.

| | ns/step |
|---|---|
| preact | 64–68 |
| oimdb, unchanged build | 136–140 |
| oimdb, every removable step off | 79–80 |

Removing one step at a time moves the median by: the generic patch walk
(`patchEntityColumns`: `for…in`, `oimIsProtoKey`, `oimIsPlain`, the guard) −22 to −26 ns; each of
assert, subframe open/close, `hasChangedColumnReaders`, column marking, `updateEmptiness`,
content-change listeners, the flush tail (collector + after-each-flush), the frame tail
(`cancelSchedule`, after-each-frame) and the effect gate (`oimRefreshSourceComputeds`,
`oimHasSourceChangedSinceLastRun`, `runCleanup`) between −9 and +11 ns, inside run-to-run noise.

**What this row therefore reads.** One write plus a frame is ~2.1× a signal set, ~70 ns
more. A third of it is the patch walk; the other two thirds has no owner and is spread over
nine steps of a few ns each. The 115× that `patchNote` printed and the 6.8 µs it prints now
are not the write path: they are what the view layer does per step.

The door that skips the walk already exists: `s.entity.note = note;
rows.markEntityChanged(s, ['note'])` (`OIMEntityCollection.ts:127`). Same probe, three runs:
preact 61–69, `updateEntityByKey` 127–144, `markEntityChanged` 107–114 ns/step. The bench
adapter patches through `entityService.markEntityChanged` (`adapters/oimdb.ts:253`, `260`,
`528`, `537`) and `entityService.updateEntityColumn` (`264`, `267`).

Since then: the adapter's label/note patches go through `markEntityChanged`, and
`markEntityChanged`/`updateEntity` no longer run `assertWritable` a second time through
`markContentChanged`. The same probe with what `patchNote` really has under the write — an
index on `group`, a sorted order on `rank, id`, the entity watched through a
`['rank', 'label']` column group (load average 7, two runs): preact 72–77, mark door alone
107–115, + column-group subscription 90–96, + index 155–165, + both 137–143,
`updateEntityByKey` + both 179–187 ns/step. The index costs ~45 ns per write of a column its
`keyOf` never reads: `OIMIndex.updateIndexKeyForSlot` calls `keyOf`, compares, and calls
`markBucketColumnsChanged`, because a `keyOf` function does not say which columns it reads.

Taking the index apart on the same probe (mark door + index + column-group subscription, load
average 4–5, three runs): as is 136–158; `keyOf` and the key compare skipped when `group`
is not among the changed columns 129–141; the whole `updateIndexKeyForSlot` skipped
114–117; no index at all 89–91 ns. So `keyOf` is ~8 ns, `markBucketColumnsChanged` (bucket
lookup, assert, a lookup per changed column) ~20 ns, and the remaining ~25 ns is the
content-change listener plumbing itself: the changed-names array, the three subframe arrays
pushed and popped, the delivery call.

After the index took `columns` (`{ columns: ['group'] }`, the key read again only when `group`
is among the changed columns), same probe, load average 8, three runs: `keyOf` index 136–139,
`columns` index 130–142, no index 88–94 ns. The ~8 ns `keyOf` share does not show above the
noise; the ~45 ns that remain are `markBucketColumnsChanged` and the listener plumbing.

Then `OIMIndex` keeps the names of the columns its bucket column slots were handed out for
(`bucketColumnNames`, replacing the `hasBucketColumnSlots` flag) and returns at once from a
write that changed none of its key columns and none of those names while no entities slot
stands (`isWriteUnread`). Same probe, load average 2.5–3, three runs: index 110–121, no index
90–96 ns, so the index tax on a `note` write went from ~45 to ~20 ns. Taken apart: the
listener body that is left ~6–10 ns (a no-op listener: 104–107), delivering at the door's
own subframe instead of buffering it ~0–6 ns (not adopted), the rest is the changed-names
array and the call itself.

**The empty frame was the largest single item.** A CPU profile of the `patchNote` cell
(worker, 5000 repeats; oimdb 129 ns/step against preact 32) put `OIMChannel.runFrame` at ~12%
of all samples for a frame that runs nothing. The cause is `effectsScheduledToRun.length = 0`
on an already empty array: V8 pays for the length store whether or not anything is cut. On the
probe (load average 4, three runs): 119–132 as it was, 95–97 with
`if (effectsScheduledToRun.length !== 0) effectsScheduledToRun.length = 0`; a size check before
iterating the empty `afterEachFlush` set moved nothing. The guard is now in `OIMChannel.runFrame`
and on the scratch arrays of `OIMBucketCollection`, `OIMBucketCommands` and
`OIMBucketSlotsServiceArrayDriven`.

**A read at index -1 cost ~40 ns a write.** `releaseSlotIfUnheldAfterListeners` compared
`subframeChangedSlots[subframeChangedSlots.length - 1]` with the slot, and on an empty buffer
that is the key `"-1"`: a named-property lookup through the prototype chain, not an element
load. Interleaved A/B, load average 2–2.7, four runs, ns/step: without the index 103–108 with
the read, 67–69 with `subframeChangedSlots.length !== 0 &&` before it (preact 61–63 on the
same probe); with index, sort and column-group subscription 121–135 against 83–93.

After both fixes the `patchNote` cell (worker, 5000 repeats, three runs) reads oimdb 85–95,
preact 28–34, alien 33–34 ns/step — it was 129. The GC share of the profile is not ours:
`--trace-gc` counts 21 scavenges for the oimdb run and 62 for preact's. What is left, one
step of `markEntityChanged` off at a time (index, sort and group subscription, load 5–6,
three runs; everything on 78–88, everything off 35–40): content-change listeners ~14 ns,
column marking (two `Map` lookups for `note`) ~12, emptiness and the release policy's
`onSlotWritten` ~12, the subframes ~8, the writability assert ~7.

## `churnDiamond` — a copy of a frozen array at every join's mount

A profile of the cell (oimdb 232 µs, alien 107) put `oimMergeRootSlots` at ~12% of all samples.
A diamond's join has no direct roots, so its `sourceSlots` is the frozen empty array, and
`sourceSlots.slice()` on a frozen array before two pushes was the cost. The copy is now a
loop of `push` into `[]`. A diamond probe (32 subscribers mounted, written, unmounted, written;
load 2.7, three runs): 24.0–24.6 → 20.1–21.3 µs a cycle. The cell, worker, three runs: oimdb
180–192 µs, alien 100–103 — 2.3× before, 1.8× after. What is left in the profile is the mount
itself: `oimRefreshComputedSlot`, `mintComputedSlot`, `createEffect`, `releaseSlot`,
`disposeEffect`, and the adapter's own closures — the "MOUNT is not comparable" of this row's B1.

## `singleResend` — `Object.getPrototypeOf` and a frame with nothing in it

A profile of the cell put `oimIsPlain` at 17% and `flush` at 18%. `oimIsPlain` was one
`Object.getPrototypeOf` per patch so that a plain source skipped the per-key own-property
check; measured, the check per key is cheaper than the one prototype read. Probe, one
`OIMSingleEntity.update` of the value it holds + `flush`, load 3.5, three runs: 32.2–33.3 ns as
it was, 17.7–18.7 with the per-key check and no `oimIsPlain`; a 10-column patch 134–136 → 123–125,
a 10-column put 160–166 → 149–155. `patchEntityColumns` and `putEntityColumns` now check
every key, and the two proxy-count tests that pinned "a plain source pays no own check" count
the extra descriptor reads. `OIMChannel.flush` skips `runFrame` when the clock has not moved
since the frame opened, no effect is queued, nobody listens after each frame and there is no
`onBeforeFlush`. Both together: 32 → 11.2–11.4 ns on the probe; the cell 1.8 µs in the full
run → 0.70 µs (alien 0.25 on the same run).

## `scrollWindow` / `deepScroll` — the window's resync in the adapter

A profile of both cells put the adapter's own code at 22–27% and GC at 18–22%, with the core's
column slot store (`createStore`, `set`, `remove`) at ~4%. The resync rebuilt a `Set` of visible
row slots and walked the `Map` of held group slots with `for (const [slot, columnGroupSlot] of …)`
on every scroll. It now keeps the window's row slots in an array and stamps each held group slot
with the resync that last saw it; the rows the new window no longer shows are the previous
array's entries with an older stamp. Same core build, worker: `deepScroll` 83–85 → 75–78 µs
(preact 45–46, alien 42–45), `scrollWindow` 53–54 → 51 µs (preact 39–41). The verify mode's
digests match the oracle on both and on `viewSwitch`.

One effect per row instead of one per window was tried and not kept: `scrollWindow` 47.7–49.2 →
44.6–47.0 µs, `deepScroll` 74.9–77.6 → 80.6–83.7 (interleaved, same core build). A deep jump
replaces the whole window, and 32 one-root effects cost more than one 32-root effect; the
signal adapters keep one effect per view as well.

What a jump costs in the core: a probe holding a `['rank','label']` group slot on 32 new rows,
one effect over them, and giving back the previous 32 (load 3, three runs): 3.46–3.68 µs a jump
with the default `Map` per row as the column slot store, 2.47–2.99 with an array searched
linearly, injected through `columnOwner`. The `Map` each row's first column slot creates is
most of the difference.

The shipped answer is `columns` on the collection (his decision: a `Map` without it, the
ordinal store `OIMColumnSlotStoreServiceOrdinalDriven` with it). Same jump probe, load 5.7,
three runs: `Map` 3.78–4.09, `columns` 3.12–3.18, the linear array 2.61–2.97 µs a jump — the
ordinal store still pays one name→number lookup per access. Per key count (separate probe):
lookup flat 5–8 ns from 1 to 50 slots per row, where the linear array reaches 81 ns at 50;
create, file and give back a row's store 26–32 ns against the `Map`'s 52. The bench adapter
declares `['rank', 'label', 'note']`; the cells' own gain (~0.8 µs a jump) was not visible at
that load.

## a column nobody reads, looked up once

Every collection now owns its column owner, and the owner keeps one map
`columnReadersByColumnName` (`hasColumnSlot`, `columnGroups`, `listenerCount`) in place of the
group map and the listener read counts. A column write on an entity that carries column slots
looks each changed name up once and, if none is there, skips both column marking and the
content-change delivery; an entity with no column slots skips the lookup altogether. The `note`
probe (mark door, index, sort, group subscription; interleaved with the build before, load 5–7):
71–80 → 54–69 ns. Cells against that build (now6), same adapter, dist swapped: `patchNote`
2.5–2.9 → 2.3–2.4 µs, `patchMostRows` 663–690 → 709–730 µs (+5%; the first version without the
"no column slots, no lookup" check read 750–842), `deepScroll` 75–79 → 72–76 µs.

## remove.vs-map-delete: 70.1 against 36.4 ns, read from code, not decomposed yet

Pair: `src/price/pricePairsWrite.ts:1059`. prices.json, 2026-10-21 landing run: 70.15 against
36.37 ns, noise 1.0%. Ours is `collection.clearContent(slot)` with the slot in hand: no lookup,
no index, subscriber, column or hold. The floor is `map.delete(id)`. Ours ALSO ends in the same
`Map.delete`, at `removeReleasedSlot → OIMSlotStoreServiceMapDriven.remove`. So the ~34 ns gap
is everything around that call:
- two nested subframes: `OIMSlotAggregate.clearContent` (`OIMSlotAggregate.ts:224`) and
  `OIMEntityCollection.clearContentImpl` (`OIMEntityCollection.ts:70`); each open and each close
  goes through the aggregate override and then the channel;
- one `channel.writeWithoutFlushCheck` (`OIMChannel.ts:143`);
- `entityWriter.clearEntity`, `slotEmptiness.isEmpty`,
  `slotReleasePolicy.isEmptySlotReleasable` / `cancelSlotRelease`, `onSlotReleased`: about five
  interface or virtual calls;
- `assertWritable`.
No share is measured yet. The proposed ladder (R1 store Map delete … R8 `clearContent`) is with
oimdb-1d.

### remove.vs-map-delete, decomposed and cut: 70 → 48 ns

The ladder `alt.ladder.remove.1…9` (`src/price/alternativePairsRemoveLadder.ts`) ran on 2026-10-21 at
BENCH_MAX_LOAD 2.5. System daemons held the one-minute load near 3, so the rows are flagged `~`; the
order repeated across two runs. Each rung against the one below it:
- store `Map.delete` through the slot's key: 38 against 37;
- store service: 38;
- writer clear + flags: 39;
- channel write: 43;
- asserts: 43;
- one subframe: 45;
- a nested second subframe: 51–53;
- the door `clearContent`: 76–79 against the same steps by hand at 50–51.
So the door's own machinery was the cost: two nested subframes through the aggregate overrides,
`updateEmptiness`, `contentChanged` and the release chain around them.
A flat candidate (assert, channel write, `clearEntity`, `markEmptiness`, `releaseSlotIfUnheld`, no
subframe) measured 45 against the door's 76. It shipped as `OIMEntityCollection.clearContent`
override, under the same guard as `updateEntity`'s one-channel path. After it:
`remove.vs-map-delete` reads 48 against 37 ns (1.28×, `~`). What is left over the Map is about
4–5 ns of channel write (the notification) and the release check through the injected policy.
Then the flat path stopped writing the channel for an unheld slot. Every stamp reader (effect,
computed source via `OIMComputedSourcesService`, bucket member, unused-slot collector) holds the
slot, so an unheld one is released in the same call. `remove.vs-map-delete`: 46 against 39 ns
(1.18×; `~±`, load 4.36 at start, and core was being edited by another session during the run).
What remains over the Map: the writer clear, the asserts and the release check through the
injected policy.
REVERTED the same night. Skipping the whole write for an unheld slot drops two readers that do
not hold it. (1) `OIMEffectService.createEffect` schedules a new effect's first run when the
CLOCK moved in the frame (`OIMEffectService.ts:61-62`). (2) The write's flush request is how
`subscribeAfterEachFrame` handlers get their frame (`OIMChannel.ts:215-218`,
`docs/core/channel.md:111-114`); redux-adapter and persist use them. The figure that stands
is the flat path with the write: 48 against 37 ns (1.28×). A stamp-only skip saves two field
stores, below this machine's noise.
Under his 0-holds rule (`OIMChannel.writeWithoutFlushCheck` returns at `holdCount === 0`, landed
by oimdb-1d): `remove.vs-map-delete` 49 against 39 ns, 1.24×, noise 5.1%, spread 57%/163%, load
4.73 at gate 3.0. That is not separable from the 48/37 and 46/39 runs before it, and it does not
yet show the ~4 ns the ladder's channel rung predicts. A quiet-machine run decides it.

## the column patch: megamorphic in a many-type process, monomorphic in every cell

`oimPatchEntityColumns` and `oimPatchEntityColumn` reach a column by name (`entity[name]`), and one
function serves every entity type, so in a process with many types the keyed load and store go
megamorphic. On a 6-field entity a one-column patch costs 27–28 ns there, 9.9 ns when the site saw one
shape, 8.4–9.4 ns with code generated per type (scratch microbench, 2026-10-21, deferred to the next
release by Andrey).

None of that is in the cell numbers. A cell worker holds one participant and one or two entity types,
and `node --log-ic` on the oimdb worker (2026-10-21, core/dist) shows these sites going 0→1 and never
further:
- batchPatch, patchMostRows: the patch functions are never compiled. A label or note write assigns
  `slot.entity` in place and calls `markEntityChanged` with that column (adapters/oimdb.ts:253, 260).
- moveGroup, sortKeyMove, relationWrite, singleWrite: `updateEntityColumn` →
  `oimPatchEntityColumn`, keyed load and store of `group`/`rank` monomorphic.
- batchInsert, resendUnchanged: `upsertEntities` → `oimPutEntityColumns` → `oimPatchEntityColumns`,
  monomorphic.

So the bench prices this path at its best case, and an application with dozens of entity types pays up
to about 19 ns per patch more than any cell shows.
