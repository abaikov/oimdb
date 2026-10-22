// Prose: ./README.md#alternativepairsslotshape
import { EPricePath } from './EPricePath';
import { priceSink } from './priceSink';
import type { TPricePair } from './TPricePair';
import type { TPriceSide } from './TPriceSide';
import { OIM_SLOT_FLAG_EMPTY } from '../../../core/src/engine/slot/constants/OIM_SLOT_FLAG_EMPTY';

const POOL = 1024;

type TStandingEffect = { ran: number };

type TWrittenSlot = {
    effects: TStandingEffect[] | undefined;
    changedAtRevision: number;
    changedAtEpoch: number;
};

const shapeClock = { revision: 0, epoch: 0 };

const inertSide: TPriceSide = { reset: () => undefined, run: () => undefined };

const writeEverySlot = (slot: TWrittenSlot): void => {
    shapeClock.revision++;
    const wroteBefore = slot.changedAtRevision > 0 || slot.changedAtEpoch > 0;
    slot.changedAtRevision = shapeClock.revision;
    slot.changedAtEpoch = shapeClock.epoch;
    if (!wroteBefore && slot.effects !== undefined) priceSink.number++;
};

const writeEntitySlot = (slot: TWrittenSlot): void => {
    shapeClock.revision++;
    const wroteBefore = slot.changedAtRevision > 0 || slot.changedAtEpoch > 0;
    slot.changedAtRevision = shapeClock.revision;
    slot.changedAtEpoch = shapeClock.epoch;
    if (!wroteBefore && slot.effects !== undefined) priceSink.number++;
};

const writeBucketSlot = (slot: TWrittenSlot): void => {
    shapeClock.revision++;
    const wroteBefore = slot.changedAtRevision > 0 || slot.changedAtEpoch > 0;
    slot.changedAtRevision = shapeClock.revision;
    slot.changedAtEpoch = shapeClock.epoch;
    if (!wroteBefore && slot.effects !== undefined) priceSink.number++;
};

const writeColumnSlot = (slot: TWrittenSlot): void => {
    shapeClock.revision++;
    const wroteBefore = slot.changedAtRevision > 0 || slot.changedAtEpoch > 0;
    slot.changedAtRevision = shapeClock.revision;
    slot.changedAtEpoch = shapeClock.epoch;
    if (!wroteBefore && slot.effects !== undefined) priceSink.number++;
};

const writeUnifiedSlot = (slot: TWrittenSlot): void => {
    shapeClock.revision++;
    const wroteBefore = slot.changedAtRevision > 0 || slot.changedAtEpoch > 0;
    slot.changedAtRevision = shapeClock.revision;
    slot.changedAtEpoch = shapeClock.epoch;
    if (!wroteBefore && slot.effects !== undefined) priceSink.number++;
};

const entitySlot = (key: string): TWrittenSlot => ({
    effects: undefined, changedAtRevision: 0, changedAtEpoch: 0, effectEdges: undefined, holdCount: 0,
    releaseDueAfterWriteMs: -1, releaseDueAfterIdleMs: -1, releaseDueAfterUnholdMs: -1, slotFlags: OIM_SLOT_FLAG_EMPTY,
    owner: null, key, entity: undefined, columnSlotStore: undefined, storeSlot: undefined,
    data: undefined, indexKeys: undefined,
} as TWrittenSlot);

const bucketSlot = (key: string): TWrittenSlot => ({
    effects: undefined, changedAtRevision: 0, changedAtEpoch: 0, effectEdges: undefined, holdCount: 0,
    releaseDueAfterWriteMs: -1, releaseDueAfterIdleMs: -1, releaseDueAfterUnholdMs: -1, slotFlags: OIM_SLOT_FLAG_EMPTY,
    columnSlotStore: undefined, storeSlot: undefined, owner: null, key, indexKeys: undefined,
    bucketSlotsStore: undefined, commands: undefined, isWholeListRecorded: false, commandsStartedAtRevision: 0,
    commandsStartedAtEpoch: 0, wasEmptyBeforeChange: undefined, isChangedAgainInSubframe: false,
} as TWrittenSlot);

const columnSlot = (key: string): TWrittenSlot => ({
    effects: undefined, changedAtRevision: 0, changedAtEpoch: 0, effectEdges: undefined, holdCount: 0,
    releaseDueAfterWriteMs: -1, releaseDueAfterIdleMs: -1, releaseDueAfterUnholdMs: -1, slotFlags: OIM_SLOT_FLAG_EMPTY,
    columnSlotStore: undefined, storeSlot: undefined, owner: null, key, carrierSlot: undefined,
} as TWrittenSlot);

const unifiedSlot = (key: string): TWrittenSlot => ({
    effects: undefined, changedAtRevision: 0, changedAtEpoch: 0, effectEdges: undefined, holdCount: 0,
    releaseDueAfterWriteMs: -1, releaseDueAfterIdleMs: -1, releaseDueAfterUnholdMs: -1, slotFlags: OIM_SLOT_FLAG_EMPTY,
    owner: null, key, indexKeys: undefined, entity: undefined,
    columnSlotStore: undefined, storeSlot: undefined, data: undefined, bucketSlotsStore: undefined, commands: undefined,
    isWholeListRecorded: false, commandsStartedAtRevision: 0, commandsStartedAtEpoch: 0,
    wasEmptyBeforeChange: undefined, isChangedAgainInSubframe: false, carrierSlot: undefined,
} as TWrittenSlot);

type TThreeKinds = {
    readonly entities: TWrittenSlot[];
    readonly buckets: TWrittenSlot[];
    readonly columns: TWrittenSlot[];
};

const mintThreeKinds = (mint: {
    entity: (key: string) => TWrittenSlot;
    bucket: (key: string) => TWrittenSlot;
    column: (key: string) => TWrittenSlot;
}): TThreeKinds => {
    const kinds: TThreeKinds = { entities: [], buckets: [], columns: [] };
    for (let i = 0; i < POOL; i++) {
        const key = `slot-${i}`;
        kinds.entities.push(mint.entity(key));
        kinds.buckets.push(mint.bucket(key));
        kinds.columns.push(mint.column(key));
    }
    return kinds;
};

const assertEveryKindStamped = (kinds: TThreeKinds): void => {
    const all = [kinds.entities, kinds.buckets, kinds.columns];
    for (const list of all) {
        for (let i = 0; i < list.length; i++) {
            if (list[i].changedAtRevision > 0 || list[i].changedAtEpoch > 0) continue;
            throw new Error('price: a slot-shape arm left a slot it was handed unstamped.');
        }
    }
};

const oneSiteSide = (kinds: TThreeKinds): TPriceSide => {
    const side: TPriceSide = {
        reset: () => undefined,
        run: times => {
            const { entities, buckets, columns } = kinds;
            const mask = POOL - 1;
            for (let i = 0; i < times; i++) {
                const at = i & mask;
                writeEverySlot(entities[at]);
                writeEverySlot(buckets[at]);
                writeEverySlot(columns[at]);
            }
        },
    };
    side.run(POOL);
    assertEveryKindStamped(kinds);
    return side;
};

export const alternativePairsSlotShape: readonly TPricePair[] = [
    {
        id: 'alt.slot-shape.one-write-site-against-one-per-kind',
        path: EPricePath.PerWrite,
        ours: 'one write function handed three slot shapes — entity, bucket, column',
        floor: 'three write functions, one per slot kind, each handed only its own shape',
        caveat:
            'ONE OPERATION IS THREE WRITES, one slot of each kind, in the same order on both arms ' +
            'over the same pool of literals. The bodies are byte-identical and are SEPARATE ' +
            'FUNCTION LITERALS — closures minted from one literal share their feedback, so a ' +
            'factory would make the rejected arm polymorphic too and the row would price ' +
            'nothing. These three are the literals `how-many-shapes-reach-the-write-door.test.ts` ' +
            'pins at `OIMChannel.writeWithoutFlushCheck`, so our arm is as polymorphic as ' +
            'production. `isolate` keeps the two arms from sharing a heap history.',
        isolate: true,
        build: wanted => ({
            ours: wanted === 'floor'
                ? inertSide
                : oneSiteSide(mintThreeKinds({ entity: entitySlot, bucket: bucketSlot, column: columnSlot })),
            floor: wanted === 'ours'
                ? inertSide
                : (() => {
                    const kinds = mintThreeKinds({ entity: entitySlot, bucket: bucketSlot, column: columnSlot });
                    const side: TPriceSide = {
                        reset: () => undefined,
                        run: times => {
                            const { entities, buckets, columns } = kinds;
                            const mask = POOL - 1;
                            for (let i = 0; i < times; i++) {
                                const at = i & mask;
                                writeEntitySlot(entities[at]);
                                writeBucketSlot(buckets[at]);
                                writeColumnSlot(columns[at]);
                            }
                        },
                    };
                    side.run(POOL);
                    assertEveryKindStamped(kinds);
                    return side;
                })(),
        }),
    },

    {
        id: 'alt.slot-shape.three-shapes-against-one-at-the-write',
        path: EPricePath.PerWrite,
        ours: 'one write function handed the three shipped slot shapes',
        floor: 'one write function handed three slots minted with one unified shape',
        caveat:
            'THE HALF OF THE UNIFIED-SHAPE ARGUMENT THAT FAVOURS IT, and it must be read with ' +
            '`alt.slot-shape.three-shapes-against-one-at-the-mint`, which is the half that pays for ' +
            'it. One operation is three writes in the same order over the same pool size on both ' +
            'arms; the only difference is whether the site sees three hidden classes or one. The ' +
            'unified literal carries every field any kind needs, in one order, so it is one map. ' +
            'Above one is the shipped design losing at the write.',
        isolate: true,
        build: wanted => ({
            ours: wanted === 'floor'
                ? inertSide
                : oneSiteSide(mintThreeKinds({ entity: entitySlot, bucket: bucketSlot, column: columnSlot })),
            floor: wanted === 'ours'
                ? inertSide
                : (() => {
                    const kinds = mintThreeKinds({ entity: unifiedSlot, bucket: unifiedSlot, column: unifiedSlot });
                    const side: TPriceSide = {
                        reset: () => undefined,
                        run: times => {
                            const { entities, buckets, columns } = kinds;
                            const mask = POOL - 1;
                            for (let i = 0; i < times; i++) {
                                const at = i & mask;
                                writeUnifiedSlot(entities[at]);
                                writeUnifiedSlot(buckets[at]);
                                writeUnifiedSlot(columns[at]);
                            }
                        },
                    };
                    side.run(POOL);
                    assertEveryKindStamped(kinds);
                    return side;
                })(),
        }),
    },

    {
        id: 'alt.slot-shape.three-shapes-against-one-at-the-mint',
        path: EPricePath.PerRowPerWrite,
        ours: 'mint one slot of each of the three shipped shapes',
        floor: 'mint three slots of the one unified shape',
        caveat:
            'THE HALF OF THE UNIFIED-SHAPE ARGUMENT THAT PAYS FOR IT. One operation mints three ' +
            'literals; the unified one carries every field of every kind, so it is larger than ' +
            'every shipped kind, and a first load pays that once per entity. Both ' +
            'arms allocate inside the clock and the young-generation collections that follow are ' +
            'charged to whichever arm allocated more, which is the honest direction. Divide this ' +
            'pair\'s difference by the write pair\'s difference to get the writes per slot at which ' +
            'the unified shape breaks even.',
        build: () => {
            const mintShipped: TPriceSide = {
                reset: () => undefined,
                run: times => {
                    for (let i = 0; i < times; i++) {
                        priceSink.ours = entitySlot('k');
                        priceSink.ours = bucketSlot('k');
                        priceSink.ours = columnSlot('k');
                    }
                },
            };
            const mintUnified: TPriceSide = {
                reset: () => undefined,
                run: times => {
                    for (let i = 0; i < times; i++) {
                        priceSink.floor = unifiedSlot('k');
                        priceSink.floor = unifiedSlot('k');
                        priceSink.floor = unifiedSlot('k');
                    }
                },
            };
            return { ours: mintShipped, floor: mintUnified };
        },
    },
];
