import {
    OIMDB,
    OIMSlotStoreServiceMapDriven,
    oimSameValueZeroGuard,
    createOIMComputedService,
    createOIMEntityService,
    createOIMEntityWriterInPlace,
} from '../../../core/src/index';
import type { OIMComputedService, TOIMColumnSlot, TOIMComputedColumnSlot, TOIMComputedSlot, TOIMComputedStoreSlot, TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot } from '../../../core/src/index';
import type { TPriceEntityService } from '../price/priceFixture';
import { ERetainedPath } from './ERetainedPath';
import type { TRetainedPair } from './TRetainedPair';
import type { TRetainedPopulation } from './TRetainedPopulation';

// Prose: ./README.md#retainedpairsderivations
//
// THE BYTE HALF OF THE CLOCK FORK: 2K numbers on the global arm against K×N on the
// per-slot one, for K derivations of fan-in N. `src/price/` yields a time ratio
// only. The per-slot arm is MODELLED, never forked — a second engine in this
// package would produce a figure for that copy.

type TDerivationRow = {
    id: string;
    group: string;
    rank: number;
    title: string;
    note: string;
};

type TRowSlot = TOIMEntitySlot<TDerivationRow, TOIMStoreKey>;

/** Matching the `changed-fields` family and the noise control. */
const ROWS = 100_000;

// K derivations pay 2K numbers on the global arm and K×N on the per-slot one.
const DERIVATIONS = 100_000;

/** N in that arithmetic. See `README.md#retainedpairsderivations`. */
const FAN_IN = 3;

/** Matching `priceDataset`. */
const GROUPS = 64;

// Built ONCE per arm: a template literal inside the loop would put a hundred
// thousand fresh strings in every arm's figure — V8 does not intern strings a
// program builds at run time.
const groupNames = (): readonly string[] => {
    const names: string[] = [];
    for (let i = 0; i < GROUPS; i++) names.push(`group-${i}`);
    return names;
};

const TITLES: readonly string[] = [
    'alpha', 'bravo', 'charlie', 'delta',
    'echo', 'foxtrot', 'golf', 'hotel',
];

// FLUSHED before anything is minted.
const populatedEntityService = (): {
    db: OIMDB;
    entityService: TPriceEntityService<TDerivationRow>;
    entityStoreSlot: TOIMStoreSlot<Map<TOIMStoreKey, TRowSlot>, TRowSlot, Partial<TDerivationRow>>;
    slots: TRowSlot[];
} => {
    const db = new OIMDB();
    const entityService: TPriceEntityService<TDerivationRow> = createOIMEntityService<TDerivationRow>(db, {
        keyOf: row => row.id,
        entityWriter: createOIMEntityWriterInPlace(),
        columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMColumnSlot>(),
    });
    const entityStoreSlot = entityService.createStoreSlot(db);
    const groups = groupNames();
    const slots: TRowSlot[] = new Array<TRowSlot>(ROWS);
    for (let i = 0; i < ROWS; i++) {
        const id = `row-${i}`;
        slots[i] = entityService.slotContentService.upsertEntity(entityStoreSlot, {
            id,
            group: groups[i % GROUPS],
            rank: i,
            title: TITLES[i % TITLES.length],
            note: 'note',
        });
    }
    db.flush();
    return { db, entityService, entityStoreSlot, slots };
};

type TRankSumStore = Map<number, TOIMComputedSlot<number, number>>;

type TDerivations = {
    readonly rankSumComputedService: OIMComputedService<number, number, TRankSumStore>;
    readonly rankSumComputedStoreSlot: TOIMComputedStoreSlot<TRankSumStore, number, number>;
    readonly rankSumSlots: readonly TOIMComputedSlot<number, number>[];
};

// EACH SETTLED ONCE — an unsettled computed slot is born with `value` undefined
// and `ranAt*` at `(-1, -1)`, which is not the steady state the fork is about.
// The source array is the derivation's own for life (assigned, not copied).
const derivationsOver = (slots: readonly TRowSlot[], db: OIMDB): TDerivations => {
    const rankSumComputedService = createOIMComputedService<number, number>({
        computedSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMComputedSlot<number, number>, number>(),
        sameValueGuard: oimSameValueZeroGuard,
        columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMComputedColumnSlot, string>(),
    });
    const rankSumComputedCollectionService = rankSumComputedService.computedCollectionService;
    const rankSumComputedStoreSlot = rankSumComputedService.createComputedStoreSlot(
        db,
        computedSlot => {
            let total = 0;
            for (let n = 0; n < FAN_IN; n++) {
                const entity = slots[(computedSlot.key + n) % slots.length].entity;
                if (entity !== undefined) total += entity.rank;
            }
            return total;
        },
        at => {
            const sources: TRowSlot[] = new Array<TRowSlot>(FAN_IN);
            for (let n = 0; n < FAN_IN; n++) sources[n] = slots[(at + n) % slots.length];
            return { sourceSlots: sources };
        },
    );
    const rankSumSlots: TOIMComputedSlot<number, number>[] = new Array<TOIMComputedSlot<number, number>>(DERIVATIONS);
    for (let i = 0; i < DERIVATIONS; i++) {
        const rankSumSlot = rankSumComputedCollectionService.holdSlotByKey(rankSumComputedStoreSlot, i);
        rankSumSlot.computedValueService.getValueForSlot(rankSumSlot);
        rankSumSlots[i] = rankSumSlot;
    }
    return { rankSumComputedService, rankSumComputedStoreSlot, rankSumSlots };
};

// Pre-sized: `push` leaves capacity above length, and an overshoot inside the quantity
// in dispute is one nobody can subtract. Zero-filled, so the array is packed SMI.
const readingsPerSource = (): number[] => new Array<number>(FAN_IN).fill(0);

const perSlotReadingsFor = (derivationCount: number): number[][] => {
    const readings: number[][] = new Array<number[]>(derivationCount);
    for (let i = 0; i < derivationCount; i++) readings[i] = readingsPerSource();
    return readings;
};

export const retainedPairsDerivations: readonly TRetainedPair[] = [
    {
        id: 'retained.clock.derivation-as-shipped',
        path: ERetainedPath.PerDerivation,
        on:
            `${DERIVATIONS.toLocaleString('en-US')} settled, held computed slots of one ` +
            `\`OIMComputedService\` store slot, fan-in ${FAN_IN}, over ${ROWS.toLocaleString('en-US')} entities`,
        off: 'the same rows in the same entity service, and no derivations',
        caveat:
            'THE DENOMINATOR, AND THE ONLY ROW HERE THAT WEIGHS SHIPPED CODE. WHAT IS IN THE ' +
            'NUMBER: one `TOIMComputedSlot` per item — its fields, including the two SMI stamps ' +
            '`ranAtRevision` and `ranAtEpoch` THAT ARE THE GLOBAL ARM OF THE FORK, beside the ' +
            '`checkedAt*` pair, `isDeriving`, `key` and the slot fields every slot carries — the ' +
            'source array of three slot references it keeps for life, its entry in the ' +
            'computed service\'s `Map` store, one reference in the array of held slots, and the number ' +
            'its settled `value` holds. The empty `sourceComputeds` array and the `derive` closure ' +
            'are ONE per computed service, shared by every slot, and the service object itself is ' +
            'one amortised over the population. No figure taken when each derivation was its own ' +
            'class instance with its own closure attaches to this pair. WHAT IS NOT: ' +
            'the entities, the entity service, its store slot, the channel and the write layer, which are ' +
            'byte-identical on both arms and cancel; and the group names and titles, sixty-four ' +
            'and eight distinct strings built once per arm. WHAT THIS ROW IS NOT A FIGURE FOR: a ' +
            'derivation of a different fan-in — the source array is three references here and ' +
            'scales with N — or one whose value is a list, which is the common case in this ' +
            'engine (`createOIMComputedServiceBucketMemo` derives an ARRAY OF SLOTS per key) and ' +
            'would be dominated by that array. The value here is a number on purpose, so the ' +
            'row is about the derivation and not about what it holds.',
        build: arm => {
            const { db, entityService, entityStoreSlot, slots } = populatedEntityService();
            const root: TRetainedPopulation['root'] =
                arm === 'on'
                    ? { db, entityService, entityStoreSlot, slots, derivations: derivationsOver(slots, db) }
                    : { db, entityService, entityStoreSlot, slots };
            return { root, rows: DERIVATIONS };
        },
    },
    {
        id: 'retained.clock.per-slot-readings',
        path: ERetainedPath.PerDerivation,
        on:
            `the same ${DERIVATIONS.toLocaleString('en-US')} derivations, each with a pre-sized ` +
            `array of ${FAN_IN} source readings beside it — the per-slot arm of the clock fork, modelled`,
        off: 'the same derivations as shipped, settled against the two global stamps alone',
        caveat:
            'THE PER-SLOT ARM IS MODELLED, NOT FORKED: both arms build the shipped derivations ' +
            'byte for byte, and the `on` arm adds what a per-slot engine would have to keep and ' +
            'the shipped one does not — one array of N readings per derivation, the K×N of the ' +
            'fork against the 2K that `ranAtRevision`/`ranAtEpoch` already are inside the row ' +
            'above. WHAT IS IN THE DELTA: per derivation, one JSArray header, its backing store ' +
            'of three SMIs, and one reference in a pre-sized outer array that stands for the ' +
            'field a real per-slot derivation would carry the array in. WHAT IS NOT: anything ' +
            'the two global stamps cost, which is on both arms; and any epoch field, which a ' +
            'per-slot counter would not need — granted to it in full, as `alternativePairsClock` ' +
            'grants it. A real per-slot engine could inline the readings into the derivation ' +
            'object for a fixed fan-in and drop the header; this row is the array shape the ' +
            'timing alternative measures, so the two halves of the decision are about one design. ' +
            'Divide this row by the `derivation-as-shipped` row to read the fraction.',
        build: arm => {
            const { db, entityService, entityStoreSlot, slots } = populatedEntityService();
            const derivations = derivationsOver(slots, db);
            const root: TRetainedPopulation['root'] =
                arm === 'on'
                    ? { db, entityService, entityStoreSlot, slots, derivations, readings: perSlotReadingsFor(DERIVATIONS) }
                    : { db, entityService, entityStoreSlot, slots, derivations };
            return { root, rows: DERIVATIONS };
        },
    },
];
