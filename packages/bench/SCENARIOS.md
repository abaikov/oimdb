# Scenarios

Every script in `harness/scenarios.ts`, in the order `SCENARIOS` presents them —
which is the order they appear in the report, and is itself argued: a pair of
rows that are read against each other sit next to each other, and **a floor sits
beside the table it scales** rather than pages away from it.

Grouped here by **the wiring each is driven through**, which is the code's own
division (`wiringNameOf`, `harness/types.ts`): a wiring is the builder an adapter
supplies, and *the unit in which a library may decline*. A declined wiring means
no row rather than a failed one, and the written reason is printed above the
table.

| wiring | builder | what the store looks like |
|---|---|---|
| *(none)* | `adapter.bind` / `adapter.bindPerGroup` | the whole screen: population, two windowed views (or fifty), subscriptions standing. **No adapter may decline it.** |
| `churn.<shape>` | `adapter.churn[shape]` | the same store with **nothing subscribed**; the script mounts and unmounts inside the clock |
| `reads.<shape>` | `adapter.reads[shape]` | the same store, asked to **read** |
| `relations` | `adapter.relations` | **two entity types**, plus a record keyed by one identity of each |
| `single` | `adapter.single` | **one value and one bystander. No rows at all** |

**Six scripts run no store and no library.** They are the floors, measured in one
process rather than seventeen, and are marked **▪ floor** below.

### How a row is judged

| the script | the criterion |
|---|---|
| settles after **every** write | the **sequence** of both views' renders, against a plain-`Map` reference model (`oracle.ts`) — "a scenario that writes 32 distinct states demands 32 distinct renders, so a store that deferred them into one is FAILED rather than fast" |
| settles **once** after several (`finalStateOnly`) | the **ending state** of both views, "because the render count is the STORE's answer rather than the script's" — plus a floor on the delivery count |
| leaves the store torn down (`populationDestroyed`) | the population audit is skipped; a **proof frame** writes the whole population back afterwards and demands that **nothing** is delivered |

On top of the criterion, **every** script runs the population audit — every write
must have landed, including the ones no view renders — and every row prints its
`deliveries` and `redundant` counters separately. For the silent scripts, those
counters *are* the result.

---

## Driven through `adapter.bind` — the whole screen

### Lifecycle

| key | label | what one timed run does | judged on |
|---|---|---|---|
| `batchInsert` | batch insert | every row written into an **empty** store in one batch, then settled; both views go from empty to a full window | one new state per consumer; store rebuilt before every sample |
| `insertIntoPopulated` | insert into a populated store | rows whose keys the store does **not** hold, written in one batch into the full population and settled once — "no row measured an insert into a store with ten thousand rows, fifty ordered buckets and a live subscription per visible row in it" | final state of both views |
| `growUnderSubscription` | the population keeps growing | eight batches of brand-new keys, **nothing removed between frames**, so the run ends with the store 40% larger — "a store BULK-LOADED to this size is not a store GROWN to it" | final state, and at least one delivery per frame |
| `coldStart` | cold start to first render | "the ONLY row where constructing the store is inside the clock": build, subscribe, write everything, deliver. Read against `batchInsert`, which is this script with the construction removed | final state; opens from nothing |
| `tearDown` | tear the screen down | the whole binding — store, both derivations, every subscription over a full population — **disposed inside the clock** | nothing delivered by the teardown; then the untimed **proof frame**, which is "what makes a `dispose` that disposed nothing a failure rather than the fastest row in the table" |
| `tearDownFloor` ▪ floor | teardown lower bound | a hand-written screen given back by dropping the one reference that reaches it. "NO STORE AND NO LIBRARY" | the proof frame; the teardown table is scaled by this and by nothing else |

### One frame of writes

| key | label | what one timed run does | judged on |
|---|---|---|---|
| `patchColumn` | patch one column | one `label` — read by the consumer, indexed by nothing — per step, on a row **visible** in view A | A re-renders every step, B never; how often B was **woken anyway** is recorded |
| `patchOutsideWindow` | patch a row off screen | one `label` per step on a row of view A's **own group**, ranked just below its window — watched, not visible | **neither view may re-render.** "the cost a subscription scoped to the group pays and one scoped to the visible rows does not" |
| `patchNote` | patch an unread column | one `note` — "rendered by nothing, indexed by nothing, sorted by nothing" — per step, on a row **visible** in view A. Same rows, count and method shape as `patchColumn`, differing only in the column | neither view may re-render. "The gap between the two rows is what column-level routing is worth" |
| `batchPatch` | batch patch | one step: `label` patched on a stride through the **whole** population — a tenth of the rows — settled **once**. "The only scenario that writes many rows inside one frame, which is what a sync response or a bulk edit is" | final state of both views, because the render count "IS THE STORE'S ANSWER, not the script's" |
| `batchPatchNote` | batch patch an unread column | the same stride and count as `batchPatch`, writing `note` instead | neither view may produce new text; "The writes are proved by the population audit, not by the digest". Checked by **final state** although it settles once — its correct outcome is that nothing distinct is produced by anybody, so every correct store folds the identical empty sequence |
| `patchMostRows` | most rows change every frame | `label` on one row in every two of the whole population, settled once, twice over — "The only script that puts a store at the DENSE end of the dial" | final state, and at least one delivery per frame |
| `mixedFrame` | one frame, every kind of change | inserts at the head of the window, deletes at its tail, patches between, moves to group B and re-ranks — **all five before one settle**, on sets that are disjoint by construction. "a frame off a socket carries all five" | final state |

### Order and grouping

| key | label | what one timed run does | judged on |
|---|---|---|---|
| `moveGroup` | row moves between groups | each step moves one row from group A to group B or back; movers are ranked below everything, so each move is visible at the head of both windows | sequence: A loses a row and gains the one just outside it, B does the reverse |
| `moveAndReorder` | a row arrives mid-order | each step writes one row's `group` **and** its `rank` in the same frame, arriving **in the middle** of the target order. Read against `moveGroup`, where "every arrival is at POSITION 0 … the cheapest insertion a store keeping an ordered bucket can be given" | final state; both views change every step |
| `sortKeyMove` | sort key moves | each step moves one row's `rank` between two values both inside view A's window — "the window's ROWS never change and its ORDER changes every step" | sequence; view B must not change |
| `resortWindow` | the whole window re-sorted | each frame writes `rank` on **every** row of the window and settles once. Read against `sortKeyMove`, "which performs the same operation on ONE row: the pair says what an ordered index is worth as a function of how much of the order moved" | final state, and at least one delivery per frame |

### Fan-out

| key | label | what one timed run does | judged on |
|---|---|---|---|
| `consumerPerGroup` | a consumer per group | one step per group, with a consumer subscribed to **every** group at once (`bindPerGroup`). Each step moves a rank inside one group's own window | exactly one consumer may produce a new state per step. **"HOW MANY CONSUMERS WERE WOKEN ANYWAY IS THE ROW"**: perfect selectivity is 50 deliveries, one global change signal is 50 × 50 |

### Targeted column delivery

| key | label | what one timed run does | judged on |
|---|---|---|---|
| `cellDelivery` | targeted column delivery | rows **pinned** — resolved before the clock, thereafter addressed by position — with A driven by `label` and B by `note`, same rows. First half writes every pinned `label`, second every pinned `note` | one distinct render per pinned row per half, so "the answer is entirely in the DELIVERY and REDUNDANCY counters". It does **not** price the pin: both halves write through it |
| `cellFloor` ▪ floor | cell lower bound | the same two halves with the store taken out, delivered straight from an array of strings through the same `deliverCells` | "a store that routes by column delivers one of these a step and one that does not delivers two, so neither can come out below it" |

### Removal

| key | label | what one timed run does | judged on |
|---|---|---|---|
| `deleteRows` | delete the visible window | one step: every row view A is showing is removed in one batch | exactly one new state for A, refilled from the rows just outside the window; B unchanged |
| `drainGroup` | the group empties under the view | two steps: **every** row of group A removed and settled, then the identical rows written back as keys the store no longer holds. "no store in this report has ever been asked for an EMPTY selection, for a window larger than its group, or for a bucket to be given back and rebuilt" | final state, and at least two changes — "full, empty, full" |

### Redundancy

| key | label | what one timed run does | judged on |
|---|---|---|---|
| `resendUnchanged` | re-send unchanged list | one step: the visible rows written again with the values they already hold, from freshly allocated objects. **Page-sized**, "because that is the size a re-send arrives at". "No adapter pre-filters this write — a value check has to come from the library, not from the adapter" | no consumer may produce new text; how many times each was woken for nothing is recorded |

### The consumer floor

| key | label | what one timed run does | judged on |
|---|---|---|---|
| `consumerFloor` ▪ floor | consumer lower bound | window-sized deliveries through `deliver` itself, alternating two prepared windows, "driven straight from arrays of PLAIN objects with no store underneath" | **"A LOWER BOUND … not a constant to subtract"** — it drives one consumer per step where most scripts have two. The adapter shapes it is a bound for are audited in the description, mobx named as the exception |

---

## Driven through `adapter.churn[shape]` — mount and unmount inside the clock

Nine tables. Every one is scaled by `mountFloor`, and each is read against
another of them: the two sizes against each other, the two orders against each
other, and the column and chain rows against the row-shaped subscription **at the
same count**.

| key | shape | label | what one timed run does | judged on |
|---|---|---|---|---|
| `mountFloor` ▪ floor | — | mount lower bound | mount the largest subscriber count in the family on **one plain object**, write, run every body, deliver one line, unmount all, write again, deliver nothing. "an array of closures, a recorded position per subscriber, and an O(1) swap-remove to leave" | a lower bound, and explicitly **not** the hand-written anchor, "which keeps a store and unmounts with `indexOf` plus `splice`" |
| `churnOne` | `row` | mount and unmount one subscriber | cycles of: subscribe one consumer to one row, write, settle, unsubscribe, write, settle | "THE FLOOR OF THE OPERATION" — the mounted frame delivers exactly once, the unmounted frame not at all |
| `churnShared` | `row` | N subscribers on one root, oldest out first | `CHURN_SUBSCRIBERS` on the **same** row, unmounted first-mounted-first. "What a list of components bound to one store object costs to build and to tear down" | delivery counts per cycle |
| `churnSharedReversed` | `row` | N subscribers on one root, newest out first | the same script, unmounted **last-mounted-first**, differing in nothing else | "The gap between the two rows is what the ORDER of an unmount is worth" |
| `churnSharedDeep` | `row` | N×8 subscribers on one root, oldest out first | the same at eight times the count. **"THE PAIR IS THE MEASUREMENT: a linear mount and a linear unmount cost eight times more per cycle here, and a quadratic unmount costs sixty-four times more"** | as `churnShared` |
| `churnSharedDeepReversed` | `row` | N×8 subscribers on one root, newest out first | "The fourth corner of the size × order square, and the one that says whether an order effect grows with the population or is a constant" | as above |
| `churnWide` | `wide` | one subscriber over many sources | one subscriber reading `CHURN_WIDE` rows at once. "the shared-root rows vary how many SUBSCRIBERS a source has, and this varies how many SOURCES a subscriber has" | "where a subscription pays for its source list — deduplicating it, expanding it, and registering in each source on the way in" |
| `churnColumn` | `column` | N subscribers on one column | the same count, root row and order as `churnShared`, on **one column** instead of the row. **Two libraries decline this shape by name** — see [PARTICIPANTS.md](PARTICIPANTS.md) | "the gap between the two rows is what addressing a column rather than a whole row costs" |
| `churnChain` | `chain` | N subscribers over a derivation chain | each subscriber **builds its own chain** of derivations over several rows. "The chain is built by the mount because a component's selectors are" | "reaching the roots underneath a stack of derived values, and taking the stack apart again" |
| `chainFrameWrite` | `chain` | a write through standing chains | the same chains **already mounted** before the clock; each step writes the first root and settles. Nothing is mounted or unmounted inside the clock | "the pair separates what a chain costs to BUILD from what it costs to RUN" |
| `diamondFrameWrite` | `diamond` | a write through standing diamonds | the same diamonds over row 0 **already mounted** before the clock; each step writes row 0 and settles, waking all 32 joins once. Nothing is mounted or unmounted inside the clock | "the pair separates what a diamond costs to BUILD from what it costs to RUN" |
| `churnResident` | `row` | churn against a standing population | a large resident set mounted before the clock, then cycles that churn a small fraction of it. **"THE QUADRATIC ASKED THE WAY AN APPLICATION ASKS IT"** | both frames of a cycle deliver, and "the second one naming the resident count rather than the full one is the proof that the churned subscribers left" |

`CHURN_ROWS` was 64 until this family was written, and nothing measured moved with
the change: the rows it sizes are held in `prepare`, which is untimed, and no timed
step of any churn script indexes past `CHURN_WIDE`. No stored piece was voided by
it.

---

## Driven through `adapter.reads[shape]` — reading

Three shapes, each declared separately, "so a library can decline the shape it
cannot answer and keep the two it can".

| key | shape | label | what one timed run does | judged on |
|---|---|---|---|---|
| `readByKey` | `byKey` | read a page by key | a disjoint page of a stride through the whole population, asked for **by key**, rendering `id rank label`. **"THE ONLY TIMED READ IN THIS SUITE, and the only script whose delivery is a PULL rather than a change signal: nothing is written and nothing settles"** | **no adapter may resolve these keys in advance** — "the lookup is what the row measures". The floor answers the same page with one map read per key |
| `scrollWindow` | `byWindow` | scroll the window | each step moves view A's **offset** into group A and settles. **Nothing is written** — the order at the end is the order at the start, which the population audit confirms | every step produces a new window; view B, at a fixed offset, must not change. Read against `resortWindow`: "there the data moved under a fixed window, here the window moved over fixed data" |
| `filterTwoAxes` | `byTwoAxes` | a view filtered on two axes | two views over the same group: A selects on `group` alone, B on `group` **and** a second axis derived from the key. Four steps move a row that is on the second axis out, then one that is not, then both back | A changes on all four, B on exactly two. **"HOW OFTEN VIEW B WAS WOKEN ANYWAY IS THE ROW"** |

---

## Driven through `adapter.relations` — two entity types

The only two scripts over two entity types, and the second exists only because
the first brings the second collection its key's segments come from.

| key | label | what one timed run does | judged on |
|---|---|---|---|
| `relationFloor` ▪ floor | relation lower bound | the two relation scripts with the store taken out, delivered from arrays of strings through the same `deliverRelation`. **"THE JOIN IS NOT IN IT"** — owner and pair record are resolved outside the clock | "what every participant pays alike, and neither relation script can come out below it" |
| `relationWrite` | a write to a related entity | each step writes **one owner's** `name` — a record of the second type — and settles; **no row is written at all**. View A renders one line per row carrying that row's owner's name | A changes every step; **B must not change at all** — "a delivery there is a store that cannot tell a write to an owner from a write to something keyed by that owner". "THE RELATIONSHIP IS IMMUTABLE: nothing here re-parents a row" |
| `compositeKeyWrite` | a record keyed by two identities | each step addresses the record for one (owner, row) pair — "a key COMPOSED per call out of two identities the binding already holds, **never cached**" — and writes its `mark` | B changes every step, A never. **"THE COMPOSITION IS THE MEASUREMENT"**, and which shape a row builds is a fact about that row: `oimdb-3.12.1` keys by a tuple of two **scalars**, `oimdb` by a chain of two collection **slots** |

---

## Driven through `adapter.single` — one value, no rows

"the task with all of that taken out, which is the only way the number is about
the notification and not about what surrounds it". The harness's untimed load
does not run: there is no population, and the row-store methods of this binding
throw.

| key | label | what one timed run does | judged on |
|---|---|---|---|
| `singleFloor` ▪ floor | single-value lower bound | one formatted line delivered through `deliverSingle` itself, each carrying a different prepared value, "with no store underneath and no value held anywhere" | **"this bound is TIGHT and not merely a floor — the gap between a row here and 1.00 is that row's store and nothing else"** |
| `singleWrite` | write one value | each step writes a **new** value to a single value the library holds — "no key, no collection, no window, no grouping, no rows anywhere in the path" — and settles. The address is resolved once before the clock | A produces new text every step; the bystander value beside it "must not change at all, and how often it was WOKEN anyway is recorded" |
| `singleResend` | re-write one value | each step writes the value **it already holds**. "No adapter pre-filters it — a value check has to come from the library, not from the adapter" | no consumer may produce new text. **The wake count is the answer**: "a library that compares before it notifies delivers nothing, one that does not delivers … the same line every time" |

---

## Where to go next

- the scripts themselves, with their `check` and `oracle`: `harness/scenarios.ts`
- the constants every count above is derived from (`MOVER_COUNT`,
  `CHURN_SUBSCRIBERS`, `READ_PAGES`, `RELATION_ROWS`, `SINGLE_STEPS`, …):
  `harness/dataset.ts`
- what each script signs against the standard, item by item, and what nothing
  currently meets: `harness/standard.ts` and `BENCHMARKING.md §3`
- why a given row came out where it did: [WHY-EACH-ROW.md](WHY-EACH-ROW.md)
