// Prose: ./README.md#alternativepairsclock
import { OIMSlotStoreServiceMapDriven, createOIMComputedService, oimSameValueZeroGuard } from '../../../core/src/index';
import type { OIMComputedService, OIMDB, TOIMComputedColumnSlot, TOIMComputedSlot, TOIMEntitySlot, TOIMStoreKey } from '../../../core/src/index';
import { EPricePath } from './EPricePath';
import { priceDataset } from './priceDataset';
import { priceFixture } from './priceFixture';
import { priceSink } from './priceSink';
import type { TPriceDataRow } from './TPriceDataRow';
import type { TPricePair } from './TPricePair';
import type { TPriceSide } from './TPriceSide';

type TRowSlot = TOIMEntitySlot<TPriceDataRow, TOIMStoreKey>;

const ROWS = priceDataset.batch;

const DERIVATIONS = 1024;

const sumOfRanks = (sources: readonly TRowSlot[]): number => {
    let sum = 0;
    for (let i = 0; i < sources.length; i++) sum += sources[i].entity?.rank ?? 0;
    return sum;
};

const sourcesOf = (slots: readonly TRowSlot[], derivation: number, fanIn: number): TRowSlot[] => {
    const sources: TRowSlot[] = [];
    for (let j = 0; j < fanIn; j++) sources.push(slots[derivation * fanIn + j]);
    return sources;
};

class PerSlotDerived {
    public value = 0;
    private readonly seen: number[];

    public constructor(private readonly sources: readonly TRowSlot[]) {
        this.seen = new Array<number>(sources.length).fill(-1);
    }

    public settle(): void {
        if (!this.anySourceChanged()) return;
        const sources = this.sources;
        const seen = this.seen;
        for (let i = 0; i < sources.length; i++) seen[i] = sources[i].changedAtRevision;
        this.value = sumOfRanks(sources);
    }

    private anySourceChanged(): boolean {
        const sources = this.sources;
        const seen = this.seen;
        for (let i = 0; i < sources.length; i++) {
            if (sources[i].changedAtRevision !== seen[i]) return true;
        }
        return false;
    }
}

type TOurDerivations = {
    readonly sumComputedService: OIMComputedService<number, number, Map<number, TOIMComputedSlot<number, number>>>;
    readonly sumSlots: readonly TOIMComputedSlot<number, number>[];
};

const ourDerivations = (
    db: OIMDB, slots: readonly TRowSlot[], fanIn: number,
): TOurDerivations => {
    const sourcesByDerivation: TRowSlot[][] = [];
    for (let k = 0; k < DERIVATIONS; k++) sourcesByDerivation.push(sourcesOf(slots, k, fanIn));
    const sumComputedService = createOIMComputedService<number, number>({
        computedSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMComputedSlot<number, number>, number>(),
        sameValueGuard: oimSameValueZeroGuard,
        initialValue: 0,
        columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMComputedColumnSlot, string>(),
    });
    const sumComputedCollectionService = sumComputedService.computedCollectionService;
    const sumComputedStoreSlot = sumComputedService.createComputedStoreSlot(
        db,
        computedSlot => sumOfRanks(sourcesByDerivation[computedSlot.key]),
        k => ({ sourceSlots: sourcesByDerivation[k] }),
    );
    const sumSlots: TOIMComputedSlot<number, number>[] = [];
    for (let k = 0; k < DERIVATIONS; k++) {
        const sumSlot = sumComputedCollectionService.holdSlotByKey(sumComputedStoreSlot, k);
        priceSink.number = sumComputedCollectionService.slotContentService.getValueForSlot(sumSlot);
        sumSlots.push(sumSlot);
    }
    return { sumComputedService, sumSlots };
};

const floorDerivations = (slots: readonly TRowSlot[], fanIn: number): PerSlotDerived[] => {
    const derivations: PerSlotDerived[] = [];
    for (let k = 0; k < DERIVATIONS; k++) {
        const derived = new PerSlotDerived(sourcesOf(slots, k, fanIn));
        derived.settle();
        derivations.push(derived);
    }
    return derivations;
};

const assertSameAnswers = (ours: TOurDerivations, floor: readonly PerSlotDerived[]): void => {
    const { sumComputedService, sumSlots } = ours;
    for (let k = 0; k < sumSlots.length; k++) {
        const ourSum = sumComputedService.computedCollectionService.slotContentService.getValueForSlot(sumSlots[k]);
        if (ourSum === floor[k].value) continue;
        throw new Error(
            `alternativePairsClock: derivation ${k} reads ${ourSum} on the shipped clock ` +
                `and ${floor[k].value} on the per-slot one; the two arms are not doing the same job.`,
        );
    }
};

const buildRead = (fanIn: number, writesUnrelatedRow: boolean) => {
    const ourFixture = priceFixture(ROWS);
    const floorFixture = priceFixture(ROWS);
    const ours = ourDerivations(ourFixture.db,ourFixture.slots, fanIn);
    const floor = floorDerivations(floorFixture.slots, fanIn);
    assertSameAnswers(ours, floor);
    const mask = DERIVATIONS - 1;
    const firstUnrelated = DERIVATIONS * fanIn;
    const patches = priceDataset.titles.map(title => ({ title }));

    const pass = (
        fixture: ReturnType<typeof priceFixture>,
        settleAndRead: (at: number) => number,
    ): ((times: number) => void) => {
        let atRow = firstUnrelated;
        let sweep = 1;
        return (times: number): void => {
            const slots = fixture.slots;
            const entityService = fixture.entityService;
            let sunk = 0;
            for (let i = 0; i < times; i++) {
                if (writesUnrelatedRow) {
                    entityService.slotContentService.updateEntity(slots[atRow], patches[(atRow + sweep) & 7]);
                    if (++atRow === slots.length) { atRow = firstUnrelated; sweep++; }
                }
                sunk += settleAndRead(i & mask);
            }
            priceSink.number = sunk;
        };
    };

    const { sumComputedService, sumSlots } = ours;
    const computedValueService = sumComputedService.computedCollectionService.slotContentService;
    const oursSide: TPriceSide = {
        reset: () => undefined,
        run: pass(ourFixture, at => computedValueService.getValueForSlot(sumSlots[at])),
    };
    const floorSide: TPriceSide = {
        reset: () => undefined,
        run: pass(floorFixture, at => {
            const derived = floor[at];
            derived.settle();
            return derived.value;
        }),
    };
    return { ours: oursSide, floor: floorSide };
};

const SHARED_RESIDUALS =
    'RESIDUALS. Both arms derive the same sum over the same entity slots of two fixtures built ' +
    'alike, and the build throws unless every derivation answers the same on both. AGAINST US: ' +
    'our comparison is a CALL to `oimIsRevisionAfter` and walks an EMPTY `sourceComputeds` array ' +
    'first, where the rejected arm compares inline with `!==` — a per-slot counter cannot wrap ' +
    'inside a process and needs no epoch, which is the one structural advantage that design has ' +
    'and it is granted in full. AGAINST THE REJECTED ARM: its readings are an array object per ' +
    'derivation, so every settle chases one more pointer than our two inline fields. OURS IS ' +
    'READ THROUGH ITS OWNER: the 1024 derivations are the held slots of one ' +
    '`OIMComputedService` store slot keyed by derivation, and each read is `getValueForSlot`, which pays ' +
    '`assertNotReleased` and a call into `oimRefreshComputedSlot` before the clock compare — charged ' +
    'to us. A derive looks its source list up by the slot\'s key, which only a write that lands ' +
    'in a source list would reach, and no row here makes one. ' +
    'NO ROW MEASURES BYTES; `src/retained/retainedPairsDerivations.ts` is where that half lives.';

const withResiduals = (caveat: string): string => `${caveat} ${SHARED_RESIDUALS}`;

export const alternativePairsClock: readonly TPricePair[] = [
    {
        id: 'alt.clock.global-pair-vs-per-slot.quiet-read.fan-in-1',
        path: EPricePath.PerRead,
        ours: 'getValueForSlot on a computed slot over 1 source slot, refreshed against the channel clock — nothing written since',
        floor: 'settle it against one reading per source, held in an array beside the source list',
        caveat: withResiduals(
            'THE QUIET READ, AND ON THE SHIPPED ENGINE IT DOES NOT WALK THE SOURCES AT ALL. ' +
            '`oimRefreshComputedSlot` returns on the slot\'s `checkedAt` pair matching the channel clock, ' +
            'which is only possible because the clock is ONE scale: nothing was written anywhere, so ' +
            'nothing a derivation reads can have moved. The per-slot arm has no such question to ask ' +
            'and must compare every source reading. At one source that walk is one element, so this ' +
            'row is the narrowest the gap can be. 1024 derivations are settled before the clock ' +
            'starts and read in rotation.',
        ),
        build: () => buildRead(1, false),
    },

    {
        id: 'alt.clock.global-pair-vs-per-slot.quiet-read.fan-in-3',
        path: EPricePath.PerRead,
        ours: 'getValueForSlot on a computed slot over 3 source slots, refreshed against the channel clock — nothing written since',
        floor: 'settle it against three readings, held in an array beside the source list',
        caveat: withResiduals(
            'THE QUIET READ AT THREE SOURCES. Ours still returns on the two-field `checkedAt` ' +
            'comparison whatever the fan-in; the rejected arm walks three readings. The recovered ' +
            'table put fan-in 3 at 1.14x to 1.18x in our favour [NO RUN BEHIND THIS FIGURE], measured ' +
            'on an engine that walked the sources on every settle, so it is not a prediction for ' +
            'this row.',
        ),
        build: () => buildRead(3, false),
    },

    {
        id: 'alt.clock.global-pair-vs-per-slot.quiet-read.fan-in-8',
        path: EPricePath.PerRead,
        ours: 'getValueForSlot on a computed slot over 8 source slots, refreshed against the channel clock — nothing written since',
        floor: 'settle it against eight readings, held in an array beside the source list',
        caveat: withResiduals(
            'THE WIDE END. 1024 derivations of eight sources use all 8192 rows of the fixture, so ' +
            'every row is a source of exactly one derivation. Ours compares two inline fields; the ' +
            'rejected arm indexes eight elements off a heap array it allocated per derivation. ' +
            'IF THIS ROW COMES BACK NEAR 1.00 THE QUIET-READ CLAIM IS DEAD [FIGURE STATED IN ADVANCE].',
        ),
        build: () => buildRead(8, false),
    },

    {
        id: 'alt.clock.global-pair-vs-per-slot.read-after-an-unrelated-write.fan-in-3',
        path: EPricePath.PerRead,
        ours: 'write an entity no derivation reads, then getValueForSlot on a computed slot over 3 source slots',
        floor: 'the same write, then settle against three per-source readings',
        caveat: withResiduals(
            'THE QUIET ROWS\' OTHER HALF, AND THE ONE TO READ BESIDE THEM. Any write anywhere moves ' +
            'the channel clock, so the `checkedAt` short-circuit misses and ours walks its three ' +
            'sources through `oimIsRevisionAfter` exactly as the rejected arm walks its readings — ' +
            'neither re-derives, because the written row is outside every source list. The write is ' +
            'the shipped `entityService.slotContentService.updateEntity` on BOTH arms and moves `title` on every call, so it is ' +
            'in both numbers alike. Without this row the quiet rows would price the short-circuit ' +
            'as if every frame were silent.',
        ),
        build: () => buildRead(3, true),
    },
];
