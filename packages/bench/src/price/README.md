# price — what the price and alternatives catalogues cannot say in code

## alternativePairsClock

### The comparison these rows replace

THE COMPARISON WAS RUN AND NEVER WRITTEN DOWN. No script survived it and its figures meet none of this repository's standards. The question it asked — one `{revision, epoch}` pair for the whole channel, against one counter per slot — is still a question about the shipped engine: `OIMChannel.clock` is the one scale, and a computed slot (`TOIMComputedSlot`) is dated against it with `ranAt*` and `checkedAt*`.

### What the rows are built on now

Every arm is a derivation over N entity slots of `priceFixture`, summing their `rank`. Ours is one shipped `OIMComputedCollection`, one held computed slot per derivation, read through `getValueForSlot`; the rejected arm is a hand-written class that keeps one reading per source in an array. 1024 derivations per arm, each over its own N rows, so fan-in 8 uses every row of the 8192-row fixture once.

The quiet rows price the read when NOTHING was written: ours returns on `checkedAt` matching the clock without looking at a source, the rejected arm walks its readings. `read-after-an-unrelated-write.fan-in-3` is the other half — one write outside every source list per read, so the short-circuit misses and both arms walk their sources without re-deriving. Read the quiet rows only beside it.

### What no row here measures

NO ROW MEASURES BYTES. `retainedPairsDerivations.ts` in `src/retained` weighs a derivation and the readings array a per-slot arm would add.

### What the rejected arm is granted

A per-slot counter would have to be advanced two billion times on ONE slot to leave the SMI range, so the wrap `TOIMChannelClock` exists for has nothing to answer and the comparison is a bare `!==`. The arm reads each source's `changedAtRevision` as its own counter, which changes exactly when a per-slot counter would.

## alternativePairsComputedDedup

THE DERIVE BODIES ARE THE SAME FUNCTIONS on both arms, and deliberately so: both sides read the same `TOIMEntitySlot` shape, so one call site stays monomorphic and the body is not part of the difference.

## alternativePairsDispatch

### The remembered numbers these rows were built against

- `website/blog/dirty-flag-vs-set/index.md:38-45` — a `Set` batch at 778 ms / 43 ms against a flag on the carrier plus a plain array at 181 ms / 9 ms, quoted onward as "~4x cheaper marking (measured)". SETTLED ON THE ENGINE AS IT THEN STOOD: the four `alt.dirty-flag-*` rows came out between 3.6x and 4.2x, recorded in `packages/bench/measurements/2026-08-20-alternatives/dispatch/` — but read the note below before quoting it against a fresh run.
- the delivery list against scanning every subscriber, whose remembered table CROSSES OVER and must never be quoted as one ratio.
- coalescing against recomputing eagerly at the write, whose break-even is a number of writes per node per frame and not a speed-up at all.

### The rows as they are built now

Thirteen: `alt.dirty-flag-vs-set.*` (four — two populations, one or four marks per carrier per frame), `alt.dirty-list-vs-scan.*` (four — one, 32, 256 and all 1024 subscribers marked per frame), `alt.coalesce-vs-eager.*` (four — one, two, four and sixteen writes per node per frame) and `alt.column-subscription.by-column-vs-by-row.1024-rows`. The first twelve are hand-written transcriptions of `OIMChannel`'s effect-run scheduling (`addEffectScheduledToRun`) and its frame loop against the rejected shape; the last drives the shipped collection and channel and is isolated.

### What kept its id but not its body

The two per-channel stamps are one, so OUR ARM IN THE EIGHT BATCHING ROWS IS A SHORTER BODY THAN THE ONE THE RECORDED READING WAS TAKEN ON — one stamp compare and one stamp store fewer, and a `.length` read where a method call stood. Every `alt.dirty-flag-*` and `alt.dirty-list-vs-scan.*` number in `packages/bench/measurements/2026-08-20-alternatives/dispatch/` therefore prices a different operation from the one the same id builds today, and the two must not be put in one table or subtracted. The four `alt.coalesce-vs-eager.*` rows are the exception: both arms are plain objects.

### The instrument effect that flatters us on every row here

Three slot shapes reach `channel.write` in production, one below V8's four-way limit (`packages/core/tests/how-many-shapes-reach-the-write-door.test.ts`), so those field reads are polymorphic there. Isolated here, one shape reaches each arm. Our arms are built out of field reads and the rejected arms out of hash containers, so this is a systematic discount on our side only: every ratio is a LOWER BOUND on what the shipped design costs in production, and the margins are ceilings.

## alternativePairsEffectShape

What the rows compare, and what each arm leaves out, is stated in the pair's own caveat (`SHAPE_CAVEAT` in `alternativePairsEffectShape.ts`), which the report prints under every row.

## alternativePairsFrameDedup

### The figure these rows re-run

THE COMPARISON WAS RUN AND NEVER WRITTEN DOWN. The channel's source quoted it, and no longer does — "measured at 0.95 ns per arrival against 5.24 ns for a `Set` (200 consumers, fan-in 3, 300 roots, synthetic, loaded machine)" [NO RUN BEHIND THIS FIGURE]. The quoted figures are per arrival, so the unit is chosen to be directly comparable with them. Fan-in sets the mix the two designs disagree about: at fan-in 1 no arrival is a repeat and at fan-in 8 seven in eight are.

### Why the frame's own walk is on both arms

The container IS the frame's list on both designs, so what it costs to walk it and to empty it afterwards belongs to the design that chose it. Leaving the walk out would let a container be judged on its insert alone, and `Set.clear()` against `leaves.length = 0` is a real difference between them that only shows at the frame boundary.

The write that produced the arrival, and the walk of `slot.effects` that carried it here, are on neither arm: both arms owe exactly the same write path, and a constant added to both halves of a ratio only pulls it toward 1.

## alternativePairsIdentityStore

### One map or two: where the row lives

Four rows for one question. A keyed store can hold a row and its identity
together — one `Map<key, slot>`, the row on the slot — or apart: a
`Map<key, row>` for the data and a second `Map<key, slot>` whose identities are
minted only when something needs one.

Apart is the cheaper first load, and that is the whole case for it. These rows
exist because a first load is not the only thing a store does.

### Why four rows and not one

The two arms do not differ by a constant. They differ by axis, and the axes
disagree:

| row | what it times | which arm it favours |
|---|---|---|
| `write-with-nobody-subscribed` | a first load into an empty store | two maps |
| `read-the-row-by-key` | handing a row back to a caller | two maps |
| `overwrite-while-one-subscriber-stands` | a write once anything is watching | one map |
| `resolve-a-key-to-an-identity` | a subscription turning a key into an identity | one map |

Pricing only the first row is how the two-map shape looks free. The third row is
where the bill arrives: an identity map that is no longer empty cannot be
skipped, so **every** write pays a second hash to learn whether this key is one
somebody watches. One map never asks, because the write already resolved the
slot and the subscriber list is a field on it.

### Both arms are hand-written, and that is deliberate

Neither arm is `OIMEntityCollection`. The subject is the shape, and the shape
only shows with the change window, the column slots, the emptiness check and the
collector taken out of both sides. So these numbers must not be quoted as a
reading of the library — the library's own figures are in the timing report.

What the arms do share with the engine is the slot object: the fields minted here
are the shipped slot's, because a narrower object would post a mint the engine
cannot match, and the mint is half of what the first and fourth rows decide.

### The trap in the third row

The subscriber is mounted before the clock starts and never touched inside it,
and exactly one of the writes in a pass lands on its row. That is on purpose:
what separates the two arms there must be the per-row **probe**, not the one
delivery. A row that mounted its subscriber inside the clock, or that wrote only
the watched key, would measure delivery and answer a different question.

The values alternate between two prepared sets, so no pass writes what the store
already holds — a store asked to write the value it has can short-circuit, and
then the row measures the short-circuit.

## alternativePairsIndex

### How a rejected design is measured here

A REJECTED DESIGN IS NOT MEASURED BY REIMPLEMENTING OURS. Every pair runs the SHIPPED engine on both halves and swaps exactly one strategy object, written here as a subclass of a shipped strategy with the disputed method replaced.

THE COMMON PATH IS INSIDE BOTH NUMBERS — the structural edit, the bucket collection's epilogue and the read are identical on the two halves, so every ratio is pulled toward 1.00 hardest where the disputed step is cheapest. Each ratio is therefore a LOWER BOUND, and the figures our own sources remember, measured on the disputed step alone, are necessarily larger than what `alternativePairsIndex.ts` prints. A reader comparing a pair here against a number in `website/docs` has to be told which of the two is the wider measurement.

### What the rejected arm is not asked

A LAZY variant is a third design and is NOT priced here: renumber on the first position asked after an edit rather than at the edit, which takes the cost out of the prepend and puts a full pass on the first `getBucketMemberSlotPosition` after every write. Nothing here refutes it.

### What the rejected arm is built on

The positions map is `OIMBucketSlotsServiceArrayDriven` over a hand-written `IOIMBucketArrayMembership` whose store carries a `Map` to positions, renumbered on every structural edit, `moveToPosition` and `moveRangeToPosition` included. Ours is the shipped service over `OIMBucketArrayMembershipUnique`. Nothing in the timed bodies subscribes to the bucket.

## alternativePairsLegacyPosts

### The four withdrawn tables these rows stand in for

Eight published posts under `website/blog/**` carried measurement tables; none can be
reproduced from this branch, and in one case the suite the post credits could not have
produced the table it printed. Every post has been marked in place. Four name a
decision that CAN still be measured:

- `website/blog/handlers-on-carrier/index.md:44` — the carrier emitter against a
  `Map<key, handlers>` emitter, withdrawn at "55–68% faster per key". No suite here
  ever built the `Map` arm. HALF of this is measured: the mark, not the delivery.
- `website/blog/enqueue-without-closures/index.md:45` — enqueue by reference against a
  disposer closure per call, withdrawn at 0.116/0.135 µs against 0.067 µs.
- `website/blog/queue-double-buffer/index.md:45` — the double buffer against an
  `Array.from` snapshot, withdrawn at 0.037 µs against 0.057 µs on an EMPTY flush,
  −35%.
- `website/blog/in-place-vs-immutable/index.md:33` — writing in place against a merging
  updater, withdrawn at 0.25 µs against 0.34 µs.

THE ONE THING NO ROW HERE CAN DO: reproduce a withdrawn figure. All four posts
describe `@oimdb/core` 3.x, now `packages/core-legacy/`; what is measured is the
engine that ships today. Re-erecting a deleted class on BOTH arms would price
`alternativePairsLegacyPosts.ts`'s reading of an engine rather than an engine.

### The emitter rows

The frame's own drain inside `flush` runs the subscribers. THERE IS NO PER-CARRIER
DELIVERY CALL, so there is no `mark-and-deliver` row; and A MARK ENLISTS, so the
`.mark` row mirrors `OIMChannel.write`'s prefix instead of calling it.

### The enqueue row prices the shipped shape against the post's rejected one

`OIMChannel.addEffectScheduledToRun` pushes the effect itself and dedups on `effect.isRunScheduled`, so the by-reference arm is a transcription of shipped code again. The floor allocates a record and a disposer closure per enqueue.

The `.mark` row and the two `alt.double-buffer-vs-array-from-snapshot.*` rows are written against the same hand-built effect records, so all four rows share one shape of standing effect.

### The two double-buffer rows are one two-point line

THESE TWO ARE ONE ROW EACH OF A TWO-POINT LINE AND MUST BE READ TOGETHER.

The withdrawn figure was an EMPTY flush — 0.057 µs with `Array.from` against 0.037 µs
with the double buffer, −35% — which is the one point where the rejected design pays its
MINIMUM: it copies nothing. Published alone it invites both misreadings at once: as a
headline it is "a third off almost nothing", and as a size it makes the saving look
tiny, when the mechanism's claim is that the snapshot is PROPORTIONAL to the queue while
the swap is constant — a claim about a SLOPE, which no single point can carry.

Two points, at 0 and at 1024, are the fewest that show the shape: the relative margin is
largest at the empty end and the absolute saving largest at the loaded end. NEITHER ROW
MAY BE QUOTED WITHOUT THE OTHER.

`flush.empty-vs-noop` in `2026-08-20-price/frame/` is ADJACENT AND NOT THIS: it prices
the shipped `db.flush()` against a counter bump, at 33.768 ns. Different engine,
different floor, different question. What these rows measure is the list handling alone.

AND NEITHER ARM IS SHIPPED CODE. The engine has no double buffer:
`OIMChannel` keeps ONE list, `effectsScheduledToRun`, the frame walks it in place and
empties it with `effectsScheduledToRun.length = 0` — no spare list, no swap, and no
keep-at-most bound anywhere in `packages/core/src`. So "ours" in these rows is a design
the engine does not ship, and the two rows settle the swap-against-snapshot question
WITHOUT settling anything about the code that runs today.

WHAT MEASURES THE SHIPPED DRAIN NOW: nothing at this grain. The nearest live question is
whether one list walked in place beats the two these rows compare, and no pair asks it.
That is the gap, named here rather than left to be found.

## alternativePairsMemo

### The two axes, and the scenario that has neither

A memo pays for itself out of the product of what the body costs and how many reads fall between two writes. `churnChain` in `harness/scenarios.ts` has neither: its derive body reads one label, and its script writes once and reads once. A participant that builds no structure wins that row by not doing work the script never uses, which is why no verdict about derivation can be taken from it.

SHARING BETWEEN CONSUMERS IS THE SAME AXIS AS READS PER WRITE, measured once: sixteen consumers reading a derivation in one frame and one consumer reading it sixteen times both ask the node sixteen questions and the derive body once. The rows say "reads per write" because that is the honest name for what varies.

## alternativePairsMutator

### The published table with no artifact behind it

`website/docs/guides/performance.md`, `website/docs/core/indexes.md`, `packages/core/README.md` and `/llms.txt` all print this, and it is the whole basis on which a reader is told which container to pick:

          slots   unordered   ordered
           100      51 ns      95 ns
         1 000      28 ns     132 ns
        10 000      44 ns   1 749 ns
        50 000      63 ns   4 723 ns

plus "Both iterate at around 2 ns per element". NO SCRIPT, NO LOG, NO ARTIFACT stands behind any of it. `alternativePairsMutator.ts` was the measurement those numbers never had. IT IS NOT THAT MEASUREMENT ANY MORE: the operation the four rows were stated about — one `remove` and one `add` driven by a derived source — has no door in the shipped surface, and a whole-bucket `writeBucketMemberSlots` on BOTH halves is what is left. The iteration sentence is still checked, unchanged, by the fifth row. THE READINGS RECORDED UNDER `alt.remove-member.unordered-vs-ordered.*` IN `packages/bench/measurements/2026-08-20-alternatives/mutator` — for the 100, 1k and 10k rows — PRICED THAT OTHER OPERATION. The sizes are kept even though the table's "ours flat, the floor growing" shape is no longer checkable, because the container difference is still a function of the bucket and a single size would be a row that picked its own answer.

### Neither side here is a rejected design, and every ratio is a lower bound

Both services are exported and documented, and only the ordered one answers "which slot is third". So a ratio here is a PRICE and never a verdict. OURS IS THE UNORDERED SERVICE on all five rows, so a row at 0.05x reads "the order costs twenty times what going without it does" and sorts to the bottom of a worst-first table rather than to the top, where it would read as a regression.

The reconciliation inside `writeBucketMemberSlots`, the mark, the flush and the read are IDENTICAL IN SHAPE on the two sides and inside both numbers, so every ratio is pulled toward 1.00 and is a LOWER BOUND. The two absolute nanosecond figures are not pulled anywhere; their DIFFERENCE is the container difference.

### Why the sweep repeats quickly, and what the counts rest on

An ordered removal's cost is a function of position, and the estimator is the minimum of the samples: a sweep of all fifty thousand places would give each sample a different slice and the minimum would report the cheapest slice rather than the average. Sixteen evenly spaced stops put hundreds of whole cycles, all positions in equal number, into every sample of every size.

THE SWAP IS AN INVARIANT: every page holds one slot of every band, for ever, at the position the band is numbered with. That is what lets a caveat state an operation count instead of an adjective, and it is checked rather than argued.

A slot-list write that changes nothing is not a short row, it is a FAST one: `writeBucketMemberSlots` returns `false` without marking when its reconciliation finds nothing arrived and nothing departed, so both halves would time a frame in which nothing moved. This suite has already published a wrong number that way.

## alternativePairsSettle

### The figure these rows replace, and the hole in it

THE COMPARISON WAS RUN AND NEVER WRITTEN DOWN. What is remembered of it: pull ahead everywhere by 4% to 64% [NO RUN BEHIND THIS FIGURE], with one hole in one sentence: CHAIN DEPTH THERE WAS ONE. A computed over a computed over a computed was not measured, and that is what could reverse the verdict.

### What "push" is here, because the word has three meanings

It is INVALIDATION push: the write walks the transitive dependents and sets a dirty flag, stopping wherever the flag is already set; the read then finds out in ONE BOOLEAN that it owes a derivation. Its read is CHEAPER than ours — that is the design's whole claim — and it pays for it at the write. A push that only stamped, and then walked its sources at the read to bring them current, would BE our arm with a boolean added, so the push arm's read descends by the flag.

### What the hand-written arm is given

As lean as the design allows, with the same two source lists, the same computeds-first order and the same "hold the value if it did not change" gate, and NOT ONE FIELD MORE. Every asymmetry that leaves is against us and is listed under each row.

BOTH ARMS ALLOCATE THE ROOT SHAPE, and our arm never reads `dependents`: two different shapes would be two different hidden classes reaching the two derive bodies, a difference the instrument introduced rather than one either design has. For the same reason the push arm's sum is written out inside its own settle — two arms summing through one compiled function would each be measured through inline caches the other had taught.

## alternativePairsSlotShape

### The shape that reaches `channel.write`

Three hidden classes arrive at one write site: three slot literals whose tails
diverge — entity, bucket, column — the set
`packages/core/tests/how-many-shapes-reach-the-write-door.test.ts` pins. V8's
inline cache goes megamorphic above four, so the site is polymorphic, one below
that ceiling. Two designs were proposed against the one that shipped, and these
three pairs price both.

### The two rejected designs, and why each looked right

**Split the site by slot kind.** Three monomorphic writers instead of one
polymorphic one. The pair `one-write-site-against-one-per-kind` prices it.

**Unify the slot shape.** Every kind minted with every field any kind needs, so
the site sees one hidden class. That one cannot be priced in a single pair,
because it moves cost from the write to the mint: `three-shapes-against-one-at-the-write`
is the half that favours it and `three-shapes-against-one-at-the-mint` is the
half that pays for it. **Neither pair decides anything alone, and a reader who
quotes one without the other has the answer backwards.**

### The break-even is a count of writes per slot

A unified slot saves on every write and costs once at the mint. Divide the mint
cost by the write saving and you have how many times one slot must be written
before the unified shape is ahead. A first load writes each row ONCE — so on
that shape of work the unified slot pays the whole difference and collects the
saving a single time. A patch-heavy frame writes the same slots again and again,
and there it is ahead.

The engine cannot be both. Which end of that dial matters is a question about
the rows this suite measures, not about the dial.

### One mistake these pairs exist to not repeat

Each arm gets its **own** write function, and each is its own function literal.
Two arms sharing one function make the site polymorphic for BOTH (up to four
shapes: the three shipped literals plus the unified one), and the arm
under test never sees a monomorphic site at all — it then posts a time for the
thing it was built to disprove. That exact error produced a reading in this
repository, in a scratch script whose write arms had to be thrown away while its
mint arms stood. A factory returning a fresh closure per arm does not escape it: closures minted from one literal share
their feedback, so the five writers are written out five times on purpose.

The other rule in the same family: the alternating objects, the pass count and
the loop order are identical on both arms of every row here, so each pair differs
in one thing and that thing is the shape.

### What these rows are not

Not a reading of `OIMChannel`. Both arms are hand-written, with the clock bound,
the frame guard, the scheduler and the effect walk all absent — a shape only
shows once they are. The engine's own figures are in the timing report.

## alternativePairsSubscription

### Why this is not the churn table again

The churn scenarios time a subscription THROUGH AN ADAPTER, and the two adapters do
not do the same work on every shape — `churnChain` is the case where they
demonstrably do not. Here both arms are called directly, in one process, with no
adapter, no consumer, no render and no dataset.

A row that wrote through `upsertOneByPk` would be timing the old write stack against
ours and calling the result a subscription cost.

## alternativePairsWritePath

### The write path's rejected designs

Every row hands a writer (`IOIMEntityWriter`) or a subclass to the SHIPPED
`OIMEntityCollection`, so the rejected design is driven through the same
`updateEntity` or `upsertEntity` as the one it lost to. Each floor holds the shipped walk's
own helpers — `oimIsProtoKey`, `oimIsPlain`, `oimOwnedColumnNames`,
`OIM_FROZEN_EMPTY_COLUMN_NAMES` — imported from `packages/core/src/engine/entity/`, so
a row differs by the one thing it is named after. `changedColumns`, the detection half
of the spreading arm, is no longer shipped and lives beside it in `./changedColumns.ts`. The equality every floor uses is
`oimSameValueZeroGuard`, the shipped default, for the same reason.

Each update side is primed and then checked (`assertWideRowsHold`) to hold the
patch it was handed, and each removal population is checked to have lost `c15`
and kept `c07`: an arm that did not do the job throws before it is timed.

## checkCaveatFigures

### What pays for a figure in a caveat

A caveat is the worst place for an unsourced figure, because the report prints it under its row beside a number this process just took, with nothing to tell the reader which came out of a clock and which out of a memory.

Three things pay, and the scope is THE SENTENCE THE FIGURE IS IN — not the caveat. A caveat here runs four hundred words and routinely states a remembered figure in one sentence and a prediction in the next; one acknowledgement covering the paragraph would let the first hide behind the second.

1. A DIRECTORY THAT IS THERE, resolved against `packages/bench/measurements`. A directory never recorded, or deleted after the sentence was written, throws: a figure whose artifact is gone is in the same position as one that never had an artifact.
2. `[NO RUN BEHIND THIS FIGURE]` — the figure is QUOTED from a site the sentence names, and that site named no run. Most alternatives rows exist for precisely this: the caveat repeats the unsupported claim so the row replacing it can be read against it. Marking it is the point, not an excuse for it.
3. `[FIGURE STATED IN ADVANCE]` — a prediction, written before the run so a reading can refute it. It earns its place by being falsifiable; what it must not do is look like a result.

### The hole this check narrows and does not close

WHAT IS NOT CAUGHT. A figure spelled in words — `forty thousand calls`, and there is one — passes, as does a stale sentence with no number in it at all.

## formatPriceReport

### Why a tenth is where a side's disagreement with itself voids the ratio

The ratio divides by the FIRST of two floor timings, and the second was just as entitled to the denominator, so the ratio carries `noise` as a straight multiplicative uncertainty — whatever its size, and independently of it. The numerator is the first of two timings of OUR side on the same terms, and carries `oursNoise` the same way.

A VOIDED RATIO PRINTS `void` AND TAKES NO PLACE IN THE RANKING, rather than printing a number beside a marker. The marker was the earlier arm of this and it failed in the one way that matters: `chain.three-link-classes-in-one-process-vs-one-class-three-times` in `measurements/2026-09-07-price/chain-depth` has `floorNs 64.13`, `floorAgainNs 44.75` — 43.3% apart, marked `≠` — and the `0.93x` it printed beside that marker is the figure that got quoted onward. Dividing the same `oursNs 59.81` by the other, equally entitled floor reading gives `1.34x`, which is where the three later re-runs of that row landed (1.41, 1.31, 1.38). The sibling rows of the same file all read their floor at ~44 ns, so 64.13 is one bad process and the quotient was that process. A ranking is also a claim: sorted by a void number, that row sat at a place it had not earned.

### What voids the numerator, and why it is not a cross-row check

`oursNoise` was recorded before anything read it. The corpus shows it has to be read: `read.members-vs-set-iteration` and `read.members-vs-array-iteration` in `2026-08-20-price/read-2` have a byte-identical `ours` body over the same `groupedFixture()`, their recorded `oursNs` are 3.2703 and 3.4344 — 5.02% apart — against printed noise of 0.16% and 2.68%, and both rows printed bare. Six more recorded groups share an `ours` body and disagree by 1.54%, 2.49%, 4.49%, 7.73%, 8.47% and 10.01%.

A CROSS-ROW CHECK IS THE WRONG INSTRUMENT for that even though `reading.ours` makes one mechanically possible: it would key a voided row on PROSE, and it can only fire where the catalogue holds two rows with the same `ours` — 15 of the 76 recorded rows. The disagreement is BETWEEN PROCESSES, so a fourth timing inside one process would not catch it either. What catches it is the second process for our side, `oursAgainNs` / `oursNoise` in `runPricePairs.ts`, which both tables now gate on.

### The bar is not calibrated for a CONTROL's numerator

The figures below are the corpus of FLOOR disagreements on PRICED rows. `control-resolution-2x` in the chain-depth run has `oursNoise` 23.9% (38.95 vs 31.44 ns) against a `noise` of 1.8% — a self-disagreement on the instrument's own attestation row, which no part of that corpus covers. The report prints a banner naming it and does NOT void the table for it: what a tenth means applied to a control is unmeasured, and voiding the attestation would suppress a run on a bar placed for something else. Whether the resolution control's own ratio should gate the report is open and needs a run on an idle machine to settle — the arbiter is which estimator puts `control-resolution-2x` nearest its stated ~1.9 and `control-scale-same-body` nearest 1.00.

Every recorded row was read to place it: 76 priced rows over fifteen runs under `measurements/` — median noise 1.6%, 90th percentile 5.4%, 95th 7.7%. The 30 control rows, identical code by construction, never exceed 4.8%. Past the 95th percentile the values are 11.4%, 11.9%, 366.9% and 47082.5%, with nothing between 7.7% and 11.4%. A tenth sits inside that empty band at roughly twice the worst any control produced, and voids four rows of seventy-six rather than a slice of the catalogue.

IT IS DELIBERATELY NOT THE 30% THE SPREAD BAR USES. Spread is the range within one timing, where a scheduling hit widens the max and leaves the minimum this harness reports untouched. Noise is two MINIMA of byte-identical code disagreeing, which a busy machine does not explain away. A row can be clean on either bar and hopeless on the other.

## priceControls

### Why the resolution control performs sixteen steps and not one

`ours` performs two units per iteration and `floor` one, so the measured ratio is `(2u + L) / (u + L)` with `L` the driving loop. At one arithmetic step that is barely above 1 and the control attests nothing; at sixteen it is close enough to 2 that a reading far below 2 means the machine. The bar is 1.5: the true ratio is a little under 2, so a process reading a deliberate doubling as less than 1.5 could not resolve the one difference it was told about in advance.

### Why the scale control banners the run at five per cent

Every recorded run under `measurements/` was read to place it — fifteen with controls, and their departures from 1.00, ascending: 0.19, 0.20, 0.23, 0.26, 0.54, 0.63, 0.63, 0.90, 1.11, 1.47, 2.38, 2.95, 6.28, 6.60, 8.17 (%). The widest empty band is the 3.33 points between 2.95% and 6.28% — every other neighbouring pair is within 1.6 points. A bar of 5% falls inside it, banners three runs out of fifteen (`2026-08-20-price/read` 8.17%, `2026-08-20-alternatives/reposition-2` 6.60%, `2026-08-20-price/write` 6.28%) and leaves the twelve-run cluster alone.

IT DOES NOT VOID, deliberately. `2026-08-20-price/write` reports 38.7x on `upsert.whole-row-vs-five-stores`; a 6.28% instrument error is a six-hundredth of that claim, and voiding it would be a worse lie than printing it.

### Why a claim must outrun its run's own error three times over

`find.vs-map-get` in `2026-08-20-price/read` reports 1.19x on a run whose scale control was 8.17% out: 42.4% of that row's 19.3-point gap is the machine, printed bare. The same seventy-six recorded rows, by the share of each row's gap that its run's own error accounts for, descending: 53.4, 42.4 | 27.7, 18.0, 15.6, 12.3, 10.2, 9.7, 9.4, 8.4, 7.7, 7.4, 7.3, 7.1, 6.8, 6.8, 6.3, 4.6, 3.5, 3.1 … (%). The widest empty band is the 14.7 points between 42.4% and 27.7% — no other neighbouring pair is more than 11 points apart. A share of 33.3% is a multiple of three and falls inside it.

It marks two rows of the seventy-six: `alt.one-class-vs-four-subclasses-on-update` in `2026-08-20-alternatives/shape-2` (2.76% claimed against a 1.47% error) and `find.vs-map-get` in `2026-08-20-price/read` (19.28% against 8.17%). The corpus contains no row at all that `=` catches on the scale control, so this is the marker doing the work the noise floor was supposed to do.

## priceDataset

### Why nothing is built inside the clock

Values a timed body writes come out of `titles` rather than being built per write — a `` `title ${i}` `` inside the clock charges every write path for a concatenation and an allocation neither the call nor the floor is responsible for.

### Why the batch size is a power of two

`i % count` is an integer division charged IDENTICALLY to both sides — which is not harmless: the same constant added to numerator and denominator pulls a ratio toward 1, hardest on the cheapest pairs. A power of two makes the wrap `i & (count - 1)`, one instruction.

### Why there are eight titles

So consecutive frames always write a value the store does not already hold — `createOIMEntityWriterInPlace` gates on the value guard (`oimSameValueZeroGuard`) and returns early on a re-send, which is a DIFFERENT price with its own row (`update.unchanged-vs-store`).

## priceFixture

### Why the floor's rows are copies

`upsertEntity` copies what it is handed, and a floor holding the caller's own object would be one allocation per row cheaper for a reason unrelated to either design.

### Why every fixture has a channel

`OIMEntityCollection` always reports: every write marks what moved through `builtColumnOwner.markColumnsChanged` and `channel.writeWithoutFlushCheck`. There is no silent collection to price against.

The channel has NO SCHEDULER, so nothing flushes behind a timed body's back.

## priceGroupIndex

### What this setup leaves to the pair

THE HOLDS ARE KEPT FOR THE LIFE OF THE PROCESS, because a bucket is released the moment nothing holds it — so a pair that empties a group would otherwise have its bucket unfiled under the handle it is reading through.

A bucket's slots built here are a SNAPSHOT — correct until something writes `group`, and nothing re-files it afterwards. A pair that writes `group` inside its timed body and reads the bucket back must maintain those slots in that body, in the open, and say so.

## pricePairs

### Where the catalogue is checked against the public surface

ENUMERATED FROM `packages/core/src/index.ts` AND NOT FROM MEMORY — that is where a reviewer checks it. Everything exported as a TYPE only is named rather than called, and has no price of its own.

### What is deliberately not priced, so the absence is a decision

- The ordered bucket service has no primitive floor here, but IS measured in the ALTERNATIVES catalogue against the unordered service at four bucket sizes — the comparison the documentation asks a reader to make.

The controls are NOT part of `priced` and are never sorted with it. A control ranked among prices would be a price.

## pricePairsGrouped

### What the file holds

Two rows: `order.resort-within-a-bucket-vs-sorted-array-splice` (on
`createOIMComputedCollectionSorted` over an `OIMIndex` by group, columns `rank`
ascending) and `chain-address.resolve-vs-nested-map-get` (a bucket addressed by two
segment identities through `OIMSlotStoreServiceTreeDriven`, against nested string
maps).

### The three rules against timing an empty frame

A pair in this suite once wrote a value that, after one pass, equalled the value the row already held, so nothing was marked and it timed an EMPTY FRAME — all three timings agreed, the drift check passed, and the row was published as a design verdict. Three rules follow:

1. WHAT IS WRITTEN IS CHOSEN BY A FLIP FLAG FLIPPED AS THE ROW IS WRITTEN, never by a round counter shared across the pass — a counter repeats itself the moment a pass stops part way through the population, which is the ordinary case because the prober picks the length.
2. `reset` IS EMPTY BECAUSE THE PASS IS SELF-INVERSE. Where that is NOT true — the index-fill rows, which consume an index per operation — the operation gives it back inside the timed body.
3. EVERY CAVEAT CARRIES THE OPERATION COUNT IT PREDICTS, so a reader can multiply it against the printed nanoseconds and find out whether the row is a measurement or an empty loop.

### Where the stated operation counts come from

THE LAYOUT IS THE OPERATION COUNT'S PREMISE. `priceDataset` numbers row `i` with `rank: i` and files it into group `i % 64`, so group `q` holds rows `q`, `64 + q`, `128 + q`, … in ascending rank. Call `m` the BAND: row `m·64 + q` is the m-th slot of group `q` and, the list being sorted by rank, sits at POSITION m. A frame SWAPS THE RANKS of band `m` and band `m + 64` inside every group at once, for four values of `m` — so the pass is SELF-INVERSE and the invariant "band m sits at position m, or its partner does" holds for ever.

FOUR SWAPS RATHER THAN EVERYTHING, because the floor's cost grows with the number of movers and ours does not: the sorted computed re-sorts the whole group once per frame whatever moved, so eight movers in a group of 128 is the case where the floor's per-mover splice should be cheapest against it.

An entity at the wrong POSITION would still print under a caveat stated in terms of that position. That is not visible in a nanosecond, so the invariant is checked rather than argued at the pair's `build`, where every group's sorted computed is compared against its floor list entity by entity.

## pricePairsSweep

### The grouped-column task, against the current engine

`OIMIndex` listens to its source collection's content changes and re-files a row
on every write; the arm is `sweep.grouped-column.index-in-place` and
`…index-replacing`. The writer is swept on the index arm, where `keyOf` reads the
entity the writer produced.

The shipped `OIMIndex` takes one `keyOf` returning one key, so there is no
several-address source to price.

Every manual arm reads `stored.group` before `updateEntity`, and the replacing
writer leaves that object untouched, so both writers give the caller the old group
for free.

### Where the poll task's floor does less than the call

It compares four columns named at compile time where `patchEntity` enumerates
whatever the patch carries, and it never asks which columns the stored row has that
the new one does not, where the writer's `putEntity` (`oimPutEntityColumns`) walks
the stored row after it walks the patch. Both push our ratio UP, and the second is a
whole extra walk of the row.

## priceReportCells

### Why a rounding here may not be changed

NOTHING HERE MAY CHANGE ITS BEHAVIOUR WITHOUT A REASON THAT IS ABOUT THE NUMBERS. `report.txt` inside every recorded run directory was printed by these functions, and a rounding changed here silently invalidates the diff between an old artifact and a new one.

### Binary units in the retention report

BINARY UNITS AND THE SUFFIX SAYS SO. The claims this formats are written in decimal MB, so a table printing `1.53 MB` for `1.6 MB` would look like a disagreement rather than another unit. `MiB` cannot be mistaken for `MB`, and the per-row detail prints the exact byte count beside it.

The sign is kept: a NEGATIVE delta — the arm WITH the mechanism holding less — is a real outcome and usually means the row is inside the noise. Unsigned printing would hide the one thing that says so.

## priceSink

### Why both halves sink through one object with two fields

A floor optimised away to zero makes every ratio infinite. Ours sinks a slot or an observable, the floor a plain row; through ONE field it would be monomorphic while the first side was measured and polymorphic by the second — a systematic difference between the halves of the ratio, introduced by the instrument.

## runPricePairs

### Why the second timing of our side is not optional

It is the only figure the row has about its own numerator, and a run-wide substitute does not work: in `2026-08-20-price/read-2` the scale control was 0.63% out while two rows sharing an `ours` body disagreed by 5.02%, and in `2026-08-20-price/write` the control was 6.28% out while two such rows disagreed by 10.01% and two others by 1.54%. One number per run cannot stand in for a quantity that moves by 8x between rows of that run.

A FAILED RE-CHECK FAILS THE PAIR, through the same `catch` as any dead worker. A record with the field absent is a row that looks measured and is not.

THE PLAN IS THE ONE THAT WAS USED, CARRIED OUT OF THE FIRST PROCESS AND HANDED STRAIGHT BACK — never recomputed. The probe sizes a pass by doubling until it clears 25 ms and stops wherever the machine puts it, so a second process left to size itself runs a different number of operations, and two timings over different amounts of work are not a disagreement about anything.

### Why the collector is exposed to every worker

The heap a `reset` dropped must be collected between the reset and the clock, or it lands inside the next timed pass in an amount that differs between the two sides.

### What the load gate must allow for

ONE PAIR AT A TIME IS NOT ONE PROCESS IN THE AVERAGE. A pair's two-to-six processes are still decaying inside `loadavg()[0]` when the NEXT pair reads it, so the gate allows for what the pair about to run will spend. An allowance of ONE charges a chain of pairs for its own workers from the second pair onwards; every record under `measurements/2026-09-02-alternatives` was taken with `selfAllowance` 1 and the gate raised to 3.50.

Nothing here is parallel: two pairs at once put each in the other's noise, and the run would be quicker and worth nothing.

### Why an isolated pair's second ours timing goes last

So the two readings of our side straddle a floor timing as the two floor readings straddle ours. Neither bracket can then agree with itself merely by having happened twice in the same second.

## TPricePair

### When the two sides of a pair need separate processes

One process is the stronger measurement — one heap, one dataset, the floor timed
twice around our side so drift shows on the row. That holds because a floor is
hand-written JavaScript that never enters `@oimdb/core`; the sides share a machine
but not a code path.

IT STOPS WORKING WHEN BOTH SIDES GO THROUGH THE SAME LIBRARY CODE WITH DIFFERENT
OBJECT SHAPES. Inline caches belong to the compiled body, not to the receiver, so
our side would be measured through caches the other arm already made megamorphic.
That is undetectable from the row: a 1.00 is equally consistent with "the shape is
free" and "the floor spoiled the caches ours ran through".

### Why no pair may leave its caveat blank

No pair in this suite has two exactly equal sides, and a floor that does LESS than
the call is a lie in our favour. The number is honest only if the reader is told
which way the difference pushes it.

## TPriceReading

### How a row's two error figures combine

THE DENOMINATOR'S HALF of the row's error is the floor timed before and after our
side, identical code. THE NUMERATOR'S HALF is our body, the same plan, a second
process. Neither is inferred from the other.

HOW A READER COMBINES THE TWO, and it is not the larger of them: the ratio is a
quotient, so relative errors ADD. Kept apart because which one is large is the
whole diagnosis.

WHAT IT DOES NOT CATCH. The second process rebuilds the same fixture from the same
builder under the same plan, so it cannot see a difference living in the fixture or
in the operation count the probe chose.

### Old artifacts do not carry the second ours timing

ARTIFACTS RECORDED BEFORE THE OURS BRACKET EXISTED DO NOT CARRY IT. Everything
under `measurements/` up to and including `2026-08-21-price` has `noise` and no
`oursAgainNs` — so a reader of an old artifact gets `undefined` from either new
field and must check for it before quoting it.

## writePriceRun

### Why the stored report is not the price formatter's by default

`format` DEFAULTS TO THE PRICE REPORT AND MUST BE PASSED FOR ANYTHING ELSE. The alternatives catalogue produces the same `TPriceRecord`s and reads the opposite way — below 1.00 is a win there — so `formatPriceReport` would sort its `report.txt` best-first under the heading "worst ratio first". The artifact outlives the terminal, so it is the copy that must not read backwards.
