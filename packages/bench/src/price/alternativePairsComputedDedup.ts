import { OIMSlotStoreServiceMapDriven, createOIMComputedService } from '../../../core/src/index';
import type { TOIMComputedColumnSlot, TOIMComputedSlot, TOIMEntitySlot, TOIMStoreKey } from '../../../core/src/index';
import { EPricePath } from './EPricePath';
import { priceFixture } from './priceFixture';
import { priceSink } from './priceSink';
import type { TPriceDataRow } from './TPriceDataRow';
import type { TPricePair } from './TPricePair';

/**
 * WHERE A DERIVATION IS DEDUPED: at the GETTER, which is what ships, or in the
 * CHANNEL, which is the design refused.
 *
 * THE QUESTION, stated so a reader cannot take the row for a different one: a
 * frame writes to some roots and something reads some derivations. Each derivation
 * must recompute AT MOST ONCE for that frame however many of its roots moved and
 * however many readers ask. Two places can enforce that.
 *
 *   THE GETTER (ours, shipped) — the write path knows nothing about derivations.
 *   `getValueForSlot` is called by the read, and `oimHasSourceChangedSinceLastRun`
 *   compares each source's `changedAt{Revision,Epoch}` against the computed slot's own
 *   `ranAt*`. A second read in the same frame stops on its `checkedAt` pair. What it
 *   costs: one comparison PER SOURCE PER FRAME READ, whether or not anything
 *   moved. What it buys: a derivation nobody reads costs NOTHING — no walk on the
 *   write, no recompute, no entry in a queue.
 *
 *   THE CHANNEL (floor, refused) — the write walks the root's dependents and
 *   stamps each derivation with the frame number, skipping one already stamped,
 *   and the frame recomputes what it queued. A read is then a field load with no
 *   question asked. What it costs: a walk PER WRITE over every dependent, and a
 *   recompute for every derivation touched THIS FRAME WHETHER OR NOT ANYBODY READS
 *   IT. What it buys: reads are free, and the recompute happens once by
 *   construction rather than by a comparison repeated per read.
 *
 * SO THE ANSWER IS A CROSSOVER AND NOT A SPEED-UP, which is why this is two rows
 * and not one. The getter wins where derivations outnumber the ones actually read
 * in a frame; the channel wins where nearly everything derived is read and read
 * more than once. A single headline multiple for "dedup" would be the same error
 * `alt.coalesce-vs-eager.*` exists to refuse — and the error already made once
 * here, in a scratch script that compared three arms whose dedup was IDENTICAL
 * (an integer stamp on the node in all three) and whose real difference was the
 * traversal. Both arms below dedup, and they dedup in DIFFERENT PLACES; that is
 * the whole content of the pair.
 *
 * WHICH ARM IS THE REAL CODE. Ours is: the slots are a real entity service's (`createOIMEntityService`),
 * the writes go through the shipped `OIMChannelService.write` by way of `entityService.slotContentService.updateEntity`,
 * and the derivations are held slots of a real `OIMComputedService` store slot. The
 * floor arm writes THROUGH THE SAME COLLECTION AND CHANNEL — so the write path is
 * common to both and cancels — and adds only what the refused design would add: a
 * dependent list per root, a frame stamp per derivation, one reused queue, and a
 * recompute at the end of the frame.
 *
 * THE DERIVE BODY IS THE SAME FUNCTION on both sides, and it is deliberately CHEAP
 * — a sum over four `rank` fields. A costlier body would enlarge whatever the
 * channel arm wastes on unread derivations and shrink the getter's per-read
 * comparison to nothing, so a cheap body is the arrangement least flattering to
 * the shipped arm.
 */

/** Roots per derivation, and derivations per fixture. Fixed for both arms. */
const SOURCES_PER_DERIVATION = 4;
const DERIVATIONS = 256;
/** Roots written per frame, over which the derivations are spread. */
const WRITES_PER_FRAME = 16;

type TRow = TPriceDataRow;
type TSlot = TOIMEntitySlot<TRow, TOIMStoreKey>;

/** The value both arms compute, so the body is not part of the difference. */
const sumOfRanks = (sources: readonly TSlot[]): number => {
    let total = 0;
    for (let i = 0; i < sources.length; i++) total += sources[i].entity?.rank ?? 0;
    return total;
};

/** Which slots feed derivation `d` — the same spread on both sides. */
const sourcesFor = (slots: readonly TSlot[], d: number): TSlot[] => {
    const sources: TSlot[] = [];
    for (let s = 0; s < SOURCES_PER_DERIVATION; s++) {
        sources.push(slots[(d * SOURCES_PER_DERIVATION + s * 97) % slots.length]);
    }
    return sources;
};

/**
 * `readsPerFrame` derivations are read each frame, `timesEachRead` times each.
 * Both dials matter and neither is guessable from the other: the first decides how
 * much of what the channel arm recomputes is wanted, the second decides how often
 * the getter arm asks its `checkedAt` pair.
 */
const buildDedupPlaceAgainstEachOther = (readsPerFrame: number, timesEachRead: number) => {
    const rowCount = 1024;

    /* ── ours: the getter decides, and it is the shipped mechanism ───────── */
    const oursFixture = priceFixture(rowCount);
    const oursSourcesByDerivation: TSlot[][] = [];
    for (let d = 0; d < DERIVATIONS; d++) oursSourcesByDerivation.push(sourcesFor(oursFixture.slots, d));
    const sumComputedService = createOIMComputedService<number, number>({
        computedSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMComputedSlot<number, number>, number>(),
        sameValueGuard: (previous, next) => previous === next,
        initialValue: 0,
        columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMComputedColumnSlot, string>(),
    });
    const sumComputedCollectionService = sumComputedService.computedCollectionService;
    const sumComputedStoreSlot = sumComputedService.createComputedStoreSlot(
        oursFixture.db,
        computedSlot => sumOfRanks(oursSourcesByDerivation[computedSlot.key]),
        d => ({ sourceSlots: oursSourcesByDerivation[d] }),
    );
    const sumSlots: TOIMComputedSlot<number, number>[] = [];
    for (let d = 0; d < DERIVATIONS; d++) sumSlots.push(sumComputedCollectionService.holdSlotByKey(sumComputedStoreSlot, d));
    const computedValueService = sumComputedCollectionService.slotContentService;

    /* ── floor: the channel decides ──────────────────────────────────────── */
    const floorFixture = priceFixture(rowCount);
    type TChannelDeduped = {
        readonly sources: readonly TSlot[];
        value: number;
        stampedInFrame: number;
    };
    const floorComputeds: TChannelDeduped[] = [];
    // The dependent list the refused design would keep on the root itself. Kept
    // beside the slots rather than on them because a bench may not add a field to
    // an engine type — the cost is the same array walk either way.
    const dependentsOf = new Map<TSlot, TChannelDeduped[]>();
    for (let d = 0; d < DERIVATIONS; d++) {
        const sources = sourcesFor(floorFixture.slots, d);
        const derived: TChannelDeduped = { sources, value: 0, stampedInFrame: -1 };
        floorComputeds.push(derived);
        for (let s = 0; s < sources.length; s++) {
            const listed = dependentsOf.get(sources[s]);
            if (listed === undefined) dependentsOf.set(sources[s], [derived]);
            else listed.push(derived);
        }
    }
    // ONE REUSED ARRAY, cleared by length: the refused design would not allocate a
    // queue per frame, and pricing it with one would be pricing my code.
    const queue: TChannelDeduped[] = [];
    let floorFrame = 0;

    let cursor = 0;

    return {
        ours: {
            reset: (): void => { cursor = 0; },
            operationsPerPass: WRITES_PER_FRAME + readsPerFrame * timesEachRead,
            run: (times: number): void => {
                for (let pass = 0; pass < times; pass++) {
                    const base = cursor++;
                    for (let w = 0; w < WRITES_PER_FRAME; w++) {
                        const slot = oursFixture.slots[(base * WRITES_PER_FRAME + w * 31) % rowCount];
                        oursFixture.entityService.slotContentService.updateEntity(slot, { rank: base + w });
                    }
                    oursFixture.db.flush();
                    // THE DEDUP IS HERE: the getter asks the sources, every read.
                    for (let r = 0; r < readsPerFrame; r++) {
                        const sumSlot = sumSlots[(base * readsPerFrame + r * 7) % DERIVATIONS];
                        for (let t = 0; t < timesEachRead; t++) {
                            priceSink.number += computedValueService.getValueForSlot(sumSlot);
                        }
                    }
                }
            },
        },
        floor: {
            reset: (): void => { cursor = 0; },
            operationsPerPass: WRITES_PER_FRAME + readsPerFrame * timesEachRead,
            run: (times: number): void => {
                for (let pass = 0; pass < times; pass++) {
                    const base = cursor++;
                    floorFrame++;
                    queue.length = 0;
                    for (let w = 0; w < WRITES_PER_FRAME; w++) {
                        const slot = floorFixture.slots[(base * WRITES_PER_FRAME + w * 31) % rowCount];
                        floorFixture.entityService.slotContentService.updateEntity(slot, { rank: base + w });
                        // THE DEDUP IS HERE: one integer compare per dependent, on
                        // the write path, and the derivation is queued once.
                        const dependents = dependentsOf.get(slot);
                        if (dependents !== undefined) {
                            for (let d = 0; d < dependents.length; d++) {
                                const derived = dependents[d];
                                if (derived.stampedInFrame === floorFrame) continue;
                                derived.stampedInFrame = floorFrame;
                                queue.push(derived);
                            }
                        }
                    }
                    floorFixture.db.flush();
                    // The frame recomputes what it queued — read or not.
                    for (let q = 0; q < queue.length; q++) {
                        const derived = queue[q];
                        derived.value = sumOfRanks(derived.sources);
                    }
                    // A read is a field load, with nothing asked.
                    for (let r = 0; r < readsPerFrame; r++) {
                        const derived = floorComputeds[(base * readsPerFrame + r * 7) % DERIVATIONS];
                        for (let t = 0; t < timesEachRead; t++) priceSink.number += derived.value;
                    }
                }
            },
        },
    };
};

export const alternativePairsComputedDedup: readonly TPricePair[] = [
    {
        id: 'alt.computed-dedup.getter-vs-channel.few-read-once',
        path: EPricePath.PerWrite,
        ours: 'a frame of 16 writes; 16 of 256 derivations read once each — deduped at the getter',
        floor: 'the same frame — deduped in the channel, by a dependent walk and a frame stamp',
        caveat:
            'THE SHAPE AN APPLICATION USUALLY HAS, and the one the shipped arm is built for: far ' +
            'more derivations exist than any one frame reads. Ours settles 16 derivations and ' +
            'touches nothing else; the channel arm walks every dependent of all 16 written roots ' +
            'and recomputes each queued derivation whether or not it is read. ABOVE 1.0x HERE ' +
            'WOULD BE THE FINDING [FIGURE STATED IN ADVANCE], because it would mean the per-read source ' +
            'comparison costs more than recomputing derivations nobody wants. Both arms write ' +
            'through the same entity service and `OIMDB`, so the write path is common ' +
            'and cancels; what differs is only where the "already done this frame" question is ' +
            'asked. What no ratio here prices: the getter arm is what makes a derivation nobody ' +
            'reads cost nothing at all, which is a property of the whole engine and not of this ' +
            'frame.',
        build: () => buildDedupPlaceAgainstEachOther(16, 1),
    },
    {
        id: 'alt.computed-dedup.getter-vs-channel.all-read-four-times',
        path: EPricePath.PerWrite,
        ours: 'a frame of 16 writes; all 256 derivations read 4 times each — deduped at the getter',
        floor: 'the same frame — deduped in the channel, by a dependent walk and a frame stamp',
        caveat:
            'THE OTHER END, AND THE ONE THAT SHOULD GO AGAINST US: everything derived is wanted, ' +
            'and wanted repeatedly. Ours walks the four sources on the FIRST read of each of the ' +
            '256 derivations — 1024 comparisons a frame — and answers the other three reads of each ' +
            'from the slot\'s `checkedAt` pair against the channel clock, through `getValueForSlot` ' +
            'and its `assertNotReleased` every time; the channel arm asks nothing on a read and ' +
            'recomputes only what the writes touched. BELOW 1.0x HERE IS ' +
            'EXPECTED [FIGURE STATED IN ADVANCE]; a row that came out above 1.0x at BOTH ends would mean ' +
            'one arm is not written in its best form and the pair must not be quoted. Read with ' +
            'the row above and never alone: the pair IS the answer, and either row by itself ' +
            'reads as a verdict on "dedup" that neither one supports.',
        build: () => buildDedupPlaceAgainstEachOther(DERIVATIONS, 4),
    },
];
