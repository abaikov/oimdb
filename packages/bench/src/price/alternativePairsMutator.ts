import {
    OIMSlotContentBucketServiceArrayDriven,
    OIMSlotContentBucketServiceSetDriven,
} from '../../../core/src/index';
import type {
    OIMSlotContentBucketService,
    TOIMBucketSlotsArrayStore,
    TOIMBucketSlot,
    TOIMEntitySlot,
    TOIMStoreKey,
} from '../../../core/src/index';
import { EPricePath } from './EPricePath';
import { priceDataset } from './priceDataset';
import { priceFixture } from './priceFixture';
import { priceGroupIndex } from './priceGroupIndex';
import { priceSink } from './priceSink';
import type { TPriceDataRow } from './TPriceDataRow';
import type { TPricePair } from './TPricePair';

/**
 * THE TWO SHIPPED BUCKET SERVICES, PRICED AGAINST EACH OTHER — the table four
 * documents carry to the nanosecond and no directory holds a line of.
 *
 * `website/docs/guides/performance.md`, `website/docs/core/indexes.md`,
 * `packages/core/README.md` and `/llms.txt` all print this, and it is the whole
 * basis on which a reader is told which container to pick:
 *
 *     members   unordered   ordered
 *        100      51 ns      95 ns
 *      1 000      28 ns     132 ns
 *     10 000      44 ns   1 749 ns
 *     50 000      63 ns   4 723 ns
 *
 * plus "Both iterate at around 2 ns per element". NO SCRIPT, NO LOG, NO ARTIFACT
 * stands behind any of it, and `packages/core` is not tracked by git, so there is
 * nothing to recover. This file was the measurement those numbers never had. IT
 * IS NOT THAT MEASUREMENT ANY MORE: since 2026-08-23 the operation the four rows
 * were stated about — one `remove` and one `add`, driven by a derived membership
 * source — has no door in the shipped surface, and `writeBucketMemberSlots` (whole-bucket, on
 * BOTH halves) is what is left. `REMOVAL_CAVEAT` states that in full. The
 * iteration sentence is still checked, unchanged, by the fifth row.
 *
 * ANY READING RECORDED UNDER `alt.remove-member.unordered-vs-ordered.*` BEFORE
 * 2026-08-23 — `packages/bench/measurements/2026-08-20-alternatives/mutator`
 * holds one for the 100, 1k and 10k rows — PRICED THAT OTHER OPERATION and must
 * not be read as a reading of this one.
 *
 * NEITHER SIDE OF THESE ROWS IS A REJECTED DESIGN, unlike every other pair in the
 * alternatives catalogue. Both services are exported and documented, and each is
 * recommended for a different reason — only the ordered one answers "which member
 * is third". So a ratio here is a PRICE and never a verdict.
 *
 * OURS IS THE UNORDERED SERVICE on all five rows and the floor is the ordered
 * one, so a row at 0.05x reads "the order costs twenty times what going without
 * it does" and sorts to the bottom of a worst-first table rather than to the top,
 * where it would read as a regression.
 *
 * HOW A BUCKET SERVICE IS PRICED: through the SHIPPED engine on both halves — one
 * database, one collection, one index, one membership write and one frame each
 * side, with exactly one strategy object swapped. Nothing here reimplements a
 * container. The consequence is the caveat every row shares: `assertBucketMemberSlotsNotReleased`,
 * `recordWholeList`, the mark, the flush and the read are IDENTICAL IN SHAPE on the two
 * sides and inside both numbers, so every ratio is pulled toward 1.00 and is a
 * LOWER BOUND. The pair of absolute nanosecond figures printed beside it is not
 * pulled anywhere; their DIFFERENCE is the container difference.
 */

type TRowSlot = TOIMEntitySlot<TPriceDataRow>;

/**
 * HOW MANY PLACES IN THE LIST A SWEEP VISITS. An ordered removal's cost is a
 * function of position, so the schedule has to visit positions spread over the
 * list — and the sweep must REPEAT QUICKLY, because the estimator is the minimum
 * of the samples: a sweep of all fifty thousand places would give each sample a
 * different slice and the minimum would report the cheapest slice rather than the
 * average. Sixteen evenly spaced stops put hundreds of whole cycles, all
 * positions in equal number, into every sample of every size.
 *
 * A power of two, so the cycle wraps with a mask — an integer division charged
 * identically to both halves still moves a ratio toward 1.00 (`priceDataset.batch`
 * gives that argument at length).
 */
const SWEEP_STOPS = 16;

type TMutatorWorld<TSlots> = {
    readonly fixture: ReturnType<typeof priceFixture>;
    /** The one strategy object the two halves of a pair differ in. */
    readonly slotContentService: OIMSlotContentBucketService<TRowSlot, TSlots>;
    /** One per page, in page order, resolved once so no body asks for one. */
    readonly buckets: TOIMBucketSlot<TSlots, TOIMStoreKey>[];
    /**
     * THE MEMBERSHIP, AS THE CALLER'S OWN LIST — one array per page, in page
     * order, holding that page's members in band order. Membership is written and
     * not derived, so a caller who moves one member must be holding the list to
     * hand to `writeBucketMemberSlots`. The two array stores that swap a band between two of
     * these lists are caller-side bookkeeping the earlier body did not pay;
     * they are identical on both halves and inside both numbers.
     */
    readonly membersByPage: readonly TOIMEntitySlot<TPriceDataRow>[][];
};

/**
 * A population filed into `pageCount` buckets of exactly `bucketSize` members,
 * under whichever bucket service is handed in.
 *
 * THE LAYOUT IS THE MEASUREMENT'S PREMISE. `priceDataset` numbers row `i` with
 * `rank: i` and files it into group `i % 64`; every page count here divides 64
 * and the map is `g % pageCount`, so page `p` holds rows `p`, `p + pageCount`,
 * `p + 2·pageCount`, … — ascending rank, since rank is the row number. Call `m`
 * the BAND: row `p + m·pageCount` is the m-th member of page `p` and, once
 * ordered, sits at POSITION m.
 *
 * Pages are read in LANES of two, and every body here does exactly one thing:
 * swap the two members of one band between the lane's two pages. Each lands
 * between its new neighbours of bands m−1 and m+1 — which is what `C > 1` buys —
 * so each is again at position m. THE SWAP IS AN INVARIANT: every page holds one
 * member of every band, for ever, at the position the band is numbered with. That
 * is what lets a caveat state an operation count instead of an adjective, and it
 * is checked rather than argued — see {@link assertBandsSitAtTheirIndex}.
 *
 * THE FILING IS THE CALLER'S: `priceGroupIndex` writes every bucket's membership
 * out with `writeBucketMemberSlots` and the lists it hands back are `membersByPage`, in
 * population order and therefore in band order and ascending rank.
 */
const mutatorWorld = <TSlots>(
    pageCount: number,
    bucketSize: number,
    slotContentService: OIMSlotContentBucketService<TRowSlot, TSlots>,
): TMutatorWorld<TSlots> => {
    if (priceDataset.groups % pageCount !== 0 || pageCount % 2 !== 0) {
        throw new Error(
            `alternativePairsMutator: ${pageCount} pages cannot be laid over ` +
            `${priceDataset.groups} groups in lanes of two.`,
        );
    }
    const fixture = priceFixture(pageCount * bucketSize);
    const pageNames: TOIMStoreKey[] = [];
    for (let p = 0; p < pageCount; p++) pageNames.push(`page-${p}`);
    const pageOf = new Map<string, TOIMStoreKey>();
    const groupNames = priceDataset.groupNames();
    for (let i = 0; i < groupNames.length; i++) pageOf.set(groupNames[i], pageNames[i % pageCount]);
    // A group the lay-out missed would file its rows nowhere and every count
    // below would be short by a page's worth.
    const pageOfRow = (row: TPriceDataRow): TOIMStoreKey => {
        const page = pageOf.get(row.group);
        if (page === undefined) {
            throw new Error(`alternativePairsMutator: group ${row.group} was laid onto no page.`);
        }
        return page;
    };

    const { bucketOf, slotsByAddress } =
        priceGroupIndex<TSlots>(fixture.db, fixture.slots, slotContentService, pageOfRow);
    fixture.db.flush();

    const buckets: TOIMBucketSlot<TSlots, TOIMStoreKey>[] = [];
    const membersByPage: TOIMEntitySlot<TPriceDataRow>[][] = [];
    for (let p = 0; p < pageCount; p++) {
        const bucket = bucketOf.get(pageNames[p]);
        if (bucket === undefined) {
            throw new Error(`alternativePairsMutator: page ${p} was minted no bucket.`);
        }
        buckets.push(bucket);
        const members = slotsByAddress.get(pageNames[p]);
        if (members === undefined) {
            throw new Error(`alternativePairsMutator: page ${p} was filed with no members at all.`);
        }
        membersByPage.push(members);
    }
    // THE LOAD'S OWN FRAME, spent here, and neither number is meant to include it.
    // The walk doubles as the shape check — a fixture that quietly built buckets of
    // the wrong size would price a different claim under this row's name.
    for (let p = 0; p < buckets.length; p++) {
        let walked = 0;
        // It counted THROUGH `member.linkCount`, on the rule that a slot a
        // bucket holds owes a link. A slot has no link count now: a
        // membership is a counted hold (`holdCount`) and a slot may be held by
        // several things at once, so there is no per-bucket number left to check
        // a filing against.
        for (const member of slotContentService.getBucketMemberSlots(buckets[p])) {
            if (member !== undefined) walked++;
        }
        if (walked !== bucketSize || membersByPage[p].length !== bucketSize) {
            throw new Error(
                `alternativePairsMutator: page ${p} holds ${walked} members and its caller-side ` +
                `list holds ${membersByPage[p].length}, not the ${bucketSize} this pair is named for.`,
            );
        }
    }
    fixture.db.flush();
    return { fixture, slotContentService, buckets, membersByPage };
};

/**
 * The layout argument written ONCE, so the two checks below and the timed bodies
 * cannot drift apart in what they mean by a swap. Unswapped, page `p` holds row
 * `p` of the band; swapped, it holds its lane partner's.
 */
const rowOfBandIn = (page: number, swapped: boolean): number => {
    if (!swapped) return page;
    return page % 2 === 0 ? page + 1 : page - 1;
};

/**
 * THAT THE MEMBER THE SCHEDULE IS ABOUT TO MOVE IS A MEMBER OF THE BUCKET IT IS
 * MOVED OUT OF — asked of the engine, and asked of BOTH halves.
 *
 * A membership write that changes nothing is not a short row, it is a FAST one:
 * `writeBucketMemberSlots` RETURNS when `reconcileSlots` finds nothing arrived
 * and nothing departed, so both halves would time a frame in which the container
 * under test was never emptied and never refilled. This suite has already
 * published a wrong number that way.
 *
 * Two questions, each asked where it can be answered: the engine, through the
 * content service's own `getBucketMemberSlots`; then the LAYOUT, of that list — at each
 * stop, band `m` of page `p` must be the row the layout argument names, or every
 * operation count in every caveat below is stated about a different member.
 */
const assertBandsAreWhereTheyAreExpected = <TSlots>(
    world: TMutatorWorld<TSlots>, pageCount: number, stopStride: number, swappedStop: number,
): void => {
    const slots = world.fixture.slots;
    for (let p = 0; p < pageCount; p++) {
        const held = [...world.slotContentService.getBucketMemberSlots(world.buckets[p])];
        const members = world.membersByPage[p];
        if (held.length !== members.length || !members.every(member => held.includes(member))) {
            throw new Error(
                `alternativePairsMutator: page ${p} does not hold the members this file is ` +
                'holding for it, so a `writeBucketMemberSlots` of that list would either be refused as ' +
                'unchanged or would file a membership nothing here can account for.',
            );
        }
    }
    for (let stop = 0; stop < SWEEP_STOPS; stop++) {
        const band = stop * stopStride;
        const base = band * pageCount;
        for (let p = 0; p < pageCount; p++) {
            const row = base + rowOfBandIn(p, stop === swappedStop);
            if (world.membersByPage[p][band] !== slots[row]) {
                throw new Error(
                    `alternativePairsMutator: band ${band} of page ${p} is not row ${row}, so the ` +
                    'swap that this pair times would move a member other than the one every ' +
                    'operation count below is stated about.',
                );
            }
        }
    }
};

/**
 * WHERE EVERY MEMBER THE SCHEDULE TOUCHES ACTUALLY SITS, asked of the shipped
 * content service's own `getBucketMemberSlotPosition` rather than deduced from the layout above. A
 * wrong layout — a page count that does not divide the groups, a dataset
 * renumbered — would still print rows, and
 * would print the price of a different position under this name.
 *
 * Only the ordered half can be asked; an unordered bucket has no positions, and
 * that is the whole difference being priced. The check above is the part of this
 * one the unordered half CAN answer.
 */
const assertBandsSitAtTheirIndex = <TSlots>(
    world: TMutatorWorld<TSlots>,
    slotContentServiceArrayDriven: OIMSlotContentBucketServiceArrayDriven<TRowSlot>,
    pageCount: number,
    stopStride: number,
    swappedStop: number,
): void => {
    const slots = world.fixture.slots;
    for (let stop = 0; stop < SWEEP_STOPS; stop++) {
        const band = stop * stopStride;
        const base = band * pageCount;
        for (let p = 0; p < pageCount; p++) {
            const row = base + rowOfBandIn(p, stop === swappedStop);
            const at = slotContentServiceArrayDriven.getBucketMemberSlotPosition(
                world.buckets[p] as TOIMBucketSlot<TOIMBucketSlotsArrayStore<TRowSlot>>, slots[row]);
            if (at !== band) {
                throw new Error(
                    `alternativePairsMutator: band ${band} of page ${p} sits at position ${at}, ` +
                    `not at ${band}. The operation count on every row of this file is stated in ` +
                    'terms of that position, so it would be stated about the wrong member.',
                );
            }
        }
    }
};

/**
 * ONE FRAME OF THE SCHEDULE, RUN OUTSIDE THE CLOCK, so the invariant is checked
 * against what the engine does rather than against this file's reading of it.
 *
 * A SECOND COPY of the loop the timed bodies run, deliberately: a helper shared
 * with the timed path would be one compiled function reached with two different
 * bucket services — the inline-cache pollution `TPricePair.isolate` exists to
 * keep out of a ratio.
 *
 * Run on BOTH halves the same number of times: whatever the instrument does to
 * one side of a pair it must do to the other.
 */
const swapOneBandOutsideTheClock = <TSlots>(world: TMutatorWorld<TSlots>, pageCount: number, band: number): void => {
    const slotContentService = world.slotContentService;
    const buckets = world.buckets;
    const membersByPage = world.membersByPage;
    for (let p = 0; p < pageCount; p += 2) {
        const even = membersByPage[p];
        const odd = membersByPage[p + 1];
        const held = even[band];
        even[band] = odd[band];
        odd[band] = held;
        slotContentService.writeBucketMemberSlots(buckets[p], even);
        slotContentService.writeBucketMemberSlots(buckets[p + 1], odd);
    }
    world.fixture.db.flush();
    for (let p = 0; p < pageCount; p++) slotContentService.getBucketMemberSlots(buckets[p]);
    world.fixture.db.flush();
};

/* ── 1. what a member's departure costs, at four bucket sizes ──────────── */

/** Shared by every size; the factory puts the size-specific count in front. */
const REMOVAL_CAVEAT =
    'WHAT AN OPERATION IS: one member moves from one bucket to another, through the only door the '
    + 'engine offers for it — two array stores that exchange the member between the two lists this '
    + 'file holds, `slotContentService.writeBucketMemberSlots` of each of those lists, a flush, and a read of every '
    + 'bucket in the frame through `getBucketMemberSlots`. Both halves run the identical body; the only difference in '
    + 'the process is which slot content bucket service object the bucket service was created with.'
    + 'READINGS RECORDED BEFORE 2026-08-23 priced a re-file reached through a derived membership '
    + 'source and are not this operation. '
    + 'EVERY OPERATION REALLY MOVES A MEMBER, which is the failure this suite has already published '
    + 'a wrong number for: `writeBucketMemberSlots` RETURNS without a wake when `reconcileSlots` finds nothing arrived '
    + 'and nothing departed, and both halves would then time a frame in which no container was '
    + 'touched. Here the two lists handed in differ from what the buckets hold by exactly one '
    + 'member each, and `assertBandsAreWhereTheyAreExpected` checks each bucket holds exactly '
    + 'the members this file holds for it before the clock starts. The two rows of a swap are '
    + 'the two members of one band, one in each page of the lane, and the swap exchanges them — '
    + 'which is why this needs no `reset` at all: sizes, positions and the sweep are exactly what '
    + 'they were when the pass started, so an empty reset here is a steady state rather than a '
    + 'forgotten one. '
    + 'DIRECTION, three ways. (1) The two array stores, the mark, the flush and the read call are '
    + 'identical in SHAPE on both halves and inside both numbers, which pulls the RATIO toward '
    + '1.00, so the two printed nanosecond figures are the numbers to read. (2) ONLY THE SET HALF DIFFS: '
    + '`OIMSlotContentBucketServiceSetDriven.reconcileSlots` takes the set difference (one Set of the list '
    + 'handed in, one probe per held member) and moves one hold each way, while the ordered half\'s '
    + '`reconcileSlots` compares the two sequences up to the first mismatch, then drains the whole list '
    + 'and re-adds every member, so every member it holds is unheld and held again. READINGS '
    + 'RECORDED BEFORE 2026-10-17 timed a set half that drained and refilled the whole set and an '
    + 'ordered half that kept a rank sorter and took a multiset difference, and are not this '
    + 'operation. (3) Both containers are walked every frame and stay in '
    + 'cache, which flatters both. '
    + 'A PASS IS WHOLE FRAMES, because half a swap would leave both members of a band in one page '
    + 'and every position after it would be a lie; so a pass may overshoot the operation count the '
    + 'prober asked for by fewer operations than there are pages, out of the tens of thousands it '
    + 'asks for.';

const removalPair = (pageCount: number, bucketSize: number, size: string): TPricePair => {
    const stopStride = Math.floor(bucketSize / SWEEP_STOPS);
    // Sixteen stops that all name a real, distinct band.
    if (stopStride < 1) {
        throw new Error(
            `alternativePairsMutator: a bucket of ${bucketSize} cannot be swept at ` +
            `${SWEEP_STOPS} stops.`,
        );
    }
    return {
        id: `alt.remove-member.unordered-vs-ordered.${size}`,
        path: EPricePath.PerRowPerWrite,
        ours:
            `a member leaves a bucket of ${bucketSize} and joins another, membership in a Set `
            + '(OIMSlotContentBucketServiceSetDriven)',
        floor: 'the same move, membership in a list kept in the caller\'s order (OIMSlotContentBucketServiceArrayDriven)',
        caveat:
            `A BUCKET OF ${bucketSize}, and the size is in the id because the answer is a function `
            + 'of it on BOTH halves. THE COUNT THIS PREDICTS, per member moved, through '
            + '`slotContentService.writeBucketMemberSlots`: on the ordered half, `reconcileSlots` compares the held '
            + 'list against the one handed in up to the swapped band, finds them unequal, drains all '
            + `${bucketSize} members and pushes all ${bucketSize} back, and the collection holds `
            + `${bucketSize} arrivals and unholds ${bucketSize} departures. On the unordered half: `
            + `\`reconcileSlots\` builds one Set of the ${bucketSize} `
            + `slots handed in, probes it once per held member, deletes the one departure and adds `
            + 'the one arrival, and one hold is taken and one given back. The ordered half\'s '
            + 'sequence comparison stops at the swapped band, '
            + `which is why the sweep over ${SWEEP_STOPS} positions (0, ${stopStride}, ${2 * stopStride}, … `
            + `${15 * stopStride}) exists: it averages that comparison length. `
            + `ONE FLUSH IS SPREAD OVER ${pageCount} OPERATIONS, since a frame swaps one band in `
            + 'every lane at once; `flush.empty-vs-noop` prices a flush directly, for a reader who '
            + `wants it out of the figure. ${REMOVAL_CAVEAT}`,
        build: () => {
            // Ours is the unordered service, the floor the ordered one — see the
            // head of this file for why that way round, and note that neither is
            // a rejected design.
            const ourWorld = mutatorWorld(pageCount, bucketSize, new OIMSlotContentBucketServiceSetDriven<TRowSlot>());
            const orderedMutator = new OIMSlotContentBucketServiceArrayDriven<TRowSlot>();
            const floorWorld = mutatorWorld(pageCount, bucketSize, orderedMutator);

            // THE PREMISE, CHECKED THREE TIMES AND OUTSIDE THE CLOCK: every band
            // is filed where the schedule will look for it and sits at its own
            // index; a swap moves both members to the other page and lands them at
            // that same index; and undoing the swap leaves the world exactly as
            // built, which is what lets both halves start at stop zero unswapped.
            //
            // The MIDDLE stop rather than the first, because a band at position
            // zero sits where an ordered list's first comparison lands whether or
            // not the layout is what this file claims.
            const middleStop = SWEEP_STOPS >> 1;
            const middleBand = middleStop * stopStride;
            assertBandsAreWhereTheyAreExpected(ourWorld, pageCount, stopStride, -1);
            assertBandsAreWhereTheyAreExpected(floorWorld, pageCount, stopStride, -1);
            assertBandsSitAtTheirIndex(floorWorld, orderedMutator, pageCount, stopStride, -1);
            swapOneBandOutsideTheClock(ourWorld, pageCount, middleBand);
            swapOneBandOutsideTheClock(floorWorld, pageCount, middleBand);
            assertBandsAreWhereTheyAreExpected(ourWorld, pageCount, stopStride, middleStop);
            assertBandsAreWhereTheyAreExpected(floorWorld, pageCount, stopStride, middleStop);
            assertBandsSitAtTheirIndex(floorWorld, orderedMutator, pageCount, stopStride, middleStop);
            swapOneBandOutsideTheClock(ourWorld, pageCount, middleBand);
            swapOneBandOutsideTheClock(floorWorld, pageCount, middleBand);
            assertBandsAreWhereTheyAreExpected(ourWorld, pageCount, stopStride, -1);
            assertBandsAreWhereTheyAreExpected(floorWorld, pageCount, stopStride, -1);
            assertBandsSitAtTheirIndex(floorWorld, orderedMutator, pageCount, stopStride, -1);

            // Which band each side is on. No flip flag: which way round a band's
            // two members sit IS the caller's membership list, and a swap is its
            // own inverse.
            let sweep = 0;
            let floorSweep = 0;
            return {
                ours: {
                    // Nothing to put back: a pass leaves every bucket the size it
                    // found it, every band at its own position and the sweep
                    // mid-cycle, which the next pass measures exactly as this one
                    // did.
                    reset: () => undefined,
                    run: times => {
                        const db = ourWorld.fixture.db;
                        const slotContentService = ourWorld.slotContentService;
                        const buckets = ourWorld.buckets;
                        const membersByPage = ourWorld.membersByPage;
                        let done = 0;
                        while (done < times) {
                            // Which band moves, decided once per FRAME: charged
                            // per operation the multiply and mask would be a
                            // shared cost pulling the ratio toward 1.00.
                            const stop = sweep & (SWEEP_STOPS - 1);
                            sweep++;
                            const band = stop * stopStride;
                            for (let p = 0; p < pageCount; p += 2) {
                                // The caller's own lists first, because those
                                // lists ARE the membership, then handed to the
                                // index one bucket at a time.
                                const even = membersByPage[p];
                                const odd = membersByPage[p + 1];
                                const held = even[band];
                                even[band] = odd[band];
                                odd[band] = held;
                                slotContentService.writeBucketMemberSlots(buckets[p], even);
                                slotContentService.writeBucketMemberSlots(buckets[p + 1], odd);
                            }
                            db.flush();
                            for (let p = 0; p < pageCount; p++) {
                                priceSink.ours = slotContentService.getBucketMemberSlots(buckets[p]);
                            }
                            done += pageCount;
                        }
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        const db = floorWorld.fixture.db;
                        const slotContentService = floorWorld.slotContentService;
                        const buckets = floorWorld.buckets;
                        const membersByPage = floorWorld.membersByPage;
                        let done = 0;
                        while (done < times) {
                            const stop = floorSweep & (SWEEP_STOPS - 1);
                            floorSweep++;
                            const band = stop * stopStride;
                            for (let p = 0; p < pageCount; p += 2) {
                                const even = membersByPage[p];
                                const odd = membersByPage[p + 1];
                                const held = even[band];
                                even[band] = odd[band];
                                odd[band] = held;
                                slotContentService.writeBucketMemberSlots(buckets[p], even);
                                slotContentService.writeBucketMemberSlots(buckets[p + 1], odd);
                            }
                            db.flush();
                            for (let p = 0; p < pageCount; p++) priceSink.floor = slotContentService.getBucketMemberSlots(buckets[p]);
                            done += pageCount;
                        }
                    },
                },
            };
        },
    };
};

/* ── 2. the other half of the published claim: what a walk costs ───────── */

/**
 * Ten thousand, so everything a pass pays once — the bucket service call, the
 * iterator — is one part in ten thousand, which is
 * what makes a per-ELEMENT number out of a per-pass measurement. It is also the
 * third row of the published table, so both claims are checked at one size.
 */
const ITERATE_MEMBERS = 10_000;

const iteratePair: TPricePair = {
    id: 'alt.iterate-members.unordered-vs-ordered',
    path: EPricePath.PerRead,
    ours: `for (const slot of slotContentService.getBucketMemberSlots(bucket)) slot.entity — a Set of ${ITERATE_MEMBERS}, per member`,
    floor: 'the same walk of the same members, kept as a list, per member',
    caveat:
        'THE SENTENCE UNDER TEST is the one printed above the published removal table: "Both '
        + 'iterate at around [NO RUN BEHIND THIS FIGURE] 2 ns per element, and the difference between them is a fraction of '
        + 'that." It is the half of the bucket service argument that says the choice is NOT an '
        + 'iteration question, and it had no measurement behind it either. '
        + 'THE BODY IS THE SAME ON BOTH HALVES, character for character: one `getBucketMemberSlots`, one '
        + 'for-of, one field load and one store into the sink per member. The only difference in '
        + 'the process is what `getBucketMemberSlots` hands back — a `Set` on ours, the service\'s own array on the '
        + 'floor — so this row is a property of two JavaScript containers reached through one '
        + 'library, which is exactly what the sentence claims to be about. '
        + 'NOTHING IS WRITTEN, NO MEMBERSHIP IS SET AND NO FRAME IS CLOSED, and neither service '
        + 'orders anything on a read: the list hands back the array `priceGroupIndex` filled, in '
        + 'the order it was written. What a pass pays outside the walk is one service call and '
        + `one iterator, spread over ${ITERATE_MEMBERS} members. `
        + 'DIRECTION, three ways: (1) ours is measured on a set that was FILLED and never deleted '
        + 'from, so its entry table has no tombstones to walk — a bucket that has churned iterates '
        + 'worse, and this row therefore flatters the unordered half; (2) `slot.entity` is loaded '
        + 'per member on both halves, because a reader that visits members without looking at them '
        + 'is not a reader, and it is the same monomorphic field load on each side; (3) a pass is a '
        + 'whole walk of the bucket, so the operation count may overshoot what the prober asked for '
        + `by fewer than ${ITERATE_MEMBERS} members out of the millions a [NO RUN BEHIND THIS FIGURE] 25 ms pass visits.`,
    build: () => {
        // Two pages, because the builder lays pages out in lanes; only the first
        // is walked.
        const ourWorld = mutatorWorld(2, ITERATE_MEMBERS, new OIMSlotContentBucketServiceSetDriven<TRowSlot>());
        const floorWorld = mutatorWorld(2, ITERATE_MEMBERS, new OIMSlotContentBucketServiceArrayDriven<TRowSlot>());
        return {
            ours: {
                reset: () => undefined,
                run: times => {
                    const slotContentService = ourWorld.slotContentService;
                    const bucket = ourWorld.buckets[0];
                    let visited = 0;
                    // A bucket that came back empty would not advance `visited`,
                    // and a benchmark that hangs the machine is worse than one
                    // reporting a short pass. One increment per PASS.
                    let guard = 0;
                    const mostPasses = times + 1;
                    while (visited < times && guard++ < mostPasses) {
                        for (const slot of slotContentService.getBucketMemberSlots(bucket)) {
                            priceSink.ours = slot.entity;
                            visited++;
                        }
                    }
                },
            },
            floor: {
                reset: () => undefined,
                run: times => {
                    const slotContentService = floorWorld.slotContentService;
                    const bucket = floorWorld.buckets[0];
                    let visited = 0;
                    let guard = 0;
                    const mostPasses = times + 1;
                    while (visited < times && guard++ < mostPasses) {
                        for (const slot of slotContentService.getBucketMemberSlots(bucket)) {
                            priceSink.floor = slot.entity;
                            visited++;
                        }
                    }
                },
            },
        };
    },
};

/**
 * THE PUBLISHED BUCKET SERVICE TABLE, MEASURED — its four sizes and the iteration
 * sentence above it. The sizes are kept even though the table's "ours flat, the
 * floor growing" shape is no longer checkable (see the head of this file), because
 * the container difference is still a function of the bucket and a single size
 * would be a row that picked its own answer.
 *
 * The page counts trade as
 * many pages as the population affords, so a frame's flush is spread over as many
 * operations as possible, and fewer as the buckets grow — both halves live in one
 * process, and fifty thousand at eight pages would be eight hundred thousand rows
 * of fixture. The top size is one lane and two operations a frame, affordable
 * because an operation there costs microseconds.
 */
export const alternativePairsMutator: readonly TPricePair[] = [
    removalPair(64, 100, '100'),
    removalPair(64, 1000, '1k'),
    removalPair(8, 10000, '10k'),
    removalPair(2, 50000, '50k'),
    iteratePair,
];
