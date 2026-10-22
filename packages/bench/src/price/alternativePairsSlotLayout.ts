import { EPricePath } from './EPricePath';
import { priceSink } from './priceSink';
import type { TPricePair } from './TPricePair';
import type { TPriceSide } from './TPriceSide';

const POOL = 1024;

type TStandingEffect = { ran: number };

type TStampedSlot = {
    effects: TStandingEffect[] | undefined;
    holdCount: number;
    changedAtRevision: number;
    changedAtEpoch: number;
};

type TSlotWithCommonPart = { common: TStampedSlot };

const layoutClock = { revision: 0, epoch: 0 };

const inertSide: TPriceSide = { reset: () => undefined, run: () => undefined };

const OWNER = {};

const shippedEntitySlot = (key: string): TStampedSlot => ({
    effects: undefined, changedAtRevision: 0, changedAtEpoch: 0, effectEdges: undefined, holdCount: 1,
    releaseDueAfterWriteMs: -1, releaseDueAfterIdleMs: -1, releaseDueAfterUnholdMs: -1, slotFlags: 0,
    owner: OWNER, key, entity: { id: key, rank: 1 }, columnSlotStore: undefined, storeSlot: undefined,
    data: undefined, indexKeys: undefined,
} as TStampedSlot);

const shippedBucketSlot = (key: string): TStampedSlot => ({
    effects: undefined, changedAtRevision: 0, changedAtEpoch: 0, effectEdges: undefined, holdCount: 1,
    releaseDueAfterWriteMs: -1, releaseDueAfterIdleMs: -1, releaseDueAfterUnholdMs: -1, slotFlags: 0,
    columnSlotStore: undefined, storeSlot: undefined, owner: OWNER, key, indexKeys: undefined, bucketSlotsStore: [],
    commands: undefined, isWholeListRecorded: false, commandsStartedAtRevision: 0, commandsStartedAtEpoch: 0,
    wasEmptyBeforeChange: undefined, isChangedAgainInSubframe: false,
} as TStampedSlot);

const shippedColumnSlot = (key: string): TStampedSlot => ({
    effects: undefined, changedAtRevision: 0, changedAtEpoch: 0, effectEdges: undefined, holdCount: 1,
    releaseDueAfterWriteMs: -1, releaseDueAfterIdleMs: -1, releaseDueAfterUnholdMs: -1, slotFlags: 0,
    columnSlotStore: undefined, storeSlot: undefined, owner: OWNER, key, carrierSlot: OWNER,
} as TStampedSlot);

const shippedComputedSlot = (key: string): TStampedSlot => ({
    effects: undefined, changedAtRevision: 0, changedAtEpoch: 0, effectEdges: undefined, holdCount: 1,
    releaseDueAfterWriteMs: -1, releaseDueAfterIdleMs: -1, releaseDueAfterUnholdMs: -1, slotFlags: 0,
    columnSlotStore: undefined, storeSlot: undefined, owner: OWNER, computedValueService: OWNER, key, indexKeys: undefined,
    sourceSlots: [], sourceComputeds: [], value: 0, ranAtRevision: -1, ranAtEpoch: -1, checkedAtRevision: -1,
    checkedAtEpoch: -1, isDeriving: false, allRootSlots: undefined,
} as TStampedSlot);

const oneShapeSlot = (key: string, content: unknown): TStampedSlot => ({
    effects: undefined, changedAtRevision: 0, changedAtEpoch: 0, effectEdges: undefined, holdCount: 1,
    releaseDueAfterWriteMs: -1, releaseDueAfterIdleMs: -1, releaseDueAfterUnholdMs: -1, slotFlags: 0,
    columnSlotStore: undefined, storeSlot: undefined, owner: OWNER, key, indexKeys: undefined, data: undefined, content,
} as TStampedSlot);

const oneShapeEntitySlot = (key: string): TStampedSlot => oneShapeSlot(key, { id: key, rank: 1 });

const oneShapeBucketSlot = (key: string): TStampedSlot => oneShapeSlot(key, {
    bucketSlotsStore: [], commands: undefined, isWholeListRecorded: false, commandsStartedAtRevision: 0,
    commandsStartedAtEpoch: 0, wasEmptyBeforeChange: undefined, isChangedAgainInSubframe: false,
});

const oneShapeColumnSlot = (key: string): TStampedSlot => oneShapeSlot(key, OWNER);

const oneShapeComputedSlot = (key: string): TStampedSlot => oneShapeSlot(key, {
    sourceSlots: [], sourceComputeds: [], value: 0, ranAtRevision: -1, ranAtEpoch: -1, checkedAtRevision: -1,
    checkedAtEpoch: -1, isDeriving: false, allRootSlots: undefined,
});

const commonPart = (): TStampedSlot => ({
    effects: undefined, changedAtRevision: 0, changedAtEpoch: 0, effectEdges: undefined, holdCount: 1,
    releaseDueAfterWriteMs: -1, releaseDueAfterIdleMs: -1, releaseDueAfterUnholdMs: -1, slotFlags: 0,
    columnSlotStore: undefined, storeSlot: undefined, owner: OWNER,
} as TStampedSlot);

const commonPartEntitySlot = (key: string): TSlotWithCommonPart => ({
    common: commonPart(), key, indexKeys: undefined, entity: { id: key, rank: 1 }, data: undefined,
} as TSlotWithCommonPart);

const commonPartBucketSlot = (key: string): TSlotWithCommonPart => ({
    common: commonPart(), key, indexKeys: undefined, bucketSlotsStore: [], commands: undefined, isWholeListRecorded: false,
    commandsStartedAtRevision: 0, commandsStartedAtEpoch: 0, wasEmptyBeforeChange: undefined,
    isChangedAgainInSubframe: false,
} as TSlotWithCommonPart);

const commonPartColumnSlot = (key: string): TSlotWithCommonPart => ({
    common: commonPart(), key, carrierSlot: OWNER,
} as TSlotWithCommonPart);

const commonPartComputedSlot = (key: string): TSlotWithCommonPart => ({
    common: commonPart(), key, indexKeys: undefined, sourceSlots: [], sourceComputeds: [], value: 0, ranAtRevision: -1,
    ranAtEpoch: -1, checkedAtRevision: -1, checkedAtEpoch: -1, isDeriving: false, allRootSlots: undefined,
} as TSlotWithCommonPart);

const writeShippedSlot = (slot: TStampedSlot): void => {
    if (slot.holdCount === 0) return;
    layoutClock.revision++;
    if (slot.effects !== undefined) priceSink.number++;
    slot.changedAtRevision = layoutClock.revision;
    slot.changedAtEpoch = layoutClock.epoch;
};

const writeOneShapeSlot = (slot: TStampedSlot): void => {
    if (slot.holdCount === 0) return;
    layoutClock.revision++;
    if (slot.effects !== undefined) priceSink.number++;
    slot.changedAtRevision = layoutClock.revision;
    slot.changedAtEpoch = layoutClock.epoch;
};

const writeCommonPart = (slot: TSlotWithCommonPart): void => {
    const common = slot.common;
    if (common.holdCount === 0) return;
    layoutClock.revision++;
    if (common.effects !== undefined) priceSink.number++;
    common.changedAtRevision = layoutClock.revision;
    common.changedAtEpoch = layoutClock.epoch;
};

type TMint<TSlot> = (key: string) => TSlot;

const mintFourKinds = <TSlot>(mints: readonly TMint<TSlot>[]): TSlot[] => {
    const slots: TSlot[] = [];
    for (let i = 0; i < POOL; i++) slots.push(mints[i & 3](`slot-${i}`));
    return slots;
};

const writeSide = <TSlot>(slots: readonly TSlot[], write: (slot: TSlot) => void): TPriceSide => {
    const side: TPriceSide = {
        reset: () => undefined,
        run: times => {
            const mask = POOL - 1;
            for (let i = 0; i < times; i++) write(slots[i & mask]);
        },
    };
    side.run(POOL * 4);
    return side;
};

const mintThreeKinds = <TSlot>(mints: readonly TMint<TSlot>[]): TSlot[] => {
    const slots: TSlot[] = [];
    for (let i = 0; i < POOL; i++) slots.push(mints[i % 3](`slot-${i}`));
    return slots;
};

const holdShippedSlot = (slot: TStampedSlot): void => {
    slot.holdCount++;
};

const holdOneShapeSlot = (slot: TStampedSlot): void => {
    slot.holdCount++;
};

const SHIPPED_DOOR_MINTS: readonly TMint<TStampedSlot>[] = [shippedEntitySlot, shippedBucketSlot, shippedColumnSlot];
const ONE_SHAPE_DOOR_MINTS: readonly TMint<TStampedSlot>[] = [oneShapeEntitySlot, oneShapeBucketSlot, oneShapeColumnSlot];

const SHIPPED_MINTS: readonly TMint<TStampedSlot>[] = [shippedEntitySlot, shippedBucketSlot, shippedColumnSlot, shippedComputedSlot];
const ONE_SHAPE_MINTS: readonly TMint<TStampedSlot>[] = [oneShapeEntitySlot, oneShapeBucketSlot, oneShapeColumnSlot, oneShapeComputedSlot];
const COMMON_PART_MINTS: readonly TMint<TSlotWithCommonPart>[] = [
    commonPartEntitySlot, commonPartBucketSlot, commonPartColumnSlot, commonPartComputedSlot,
];

const mintShippedSide: TPriceSide = {
    reset: () => undefined,
    run: times => {
        for (let i = 0; i < times; i++) priceSink.ours = SHIPPED_MINTS[i & 3]('k');
    },
};

const mintOneShapeSide: TPriceSide = {
    reset: () => undefined,
    run: times => {
        for (let i = 0; i < times; i++) priceSink.floor = ONE_SHAPE_MINTS[i & 3]('k');
    },
};

const mintCommonPartSide: TPriceSide = {
    reset: () => undefined,
    run: times => {
        for (let i = 0; i < times; i++) priceSink.floor = COMMON_PART_MINTS[i & 3]('k');
    },
};

export const alternativePairsSlotLayout: readonly TPricePair[] = [
    {
        id: 'alt.slot-layout.write-door-three-shapes-against-one-shape',
        path: EPricePath.PerWrite,
        ours: 'the channel write door handed the three slot shapes that reach it today (entity, bucket, push column) in turn',
        floor: 'the same door handed the same three kinds minted with ONE shape: the 15-key header plus one `content` field',
        caveat:
            'One operation is one write; the pool cycles entity, bucket, push column, the only kinds whose slots reach '
            + 'OIMChannel.writeWithoutFlushCheck (how-many-shapes-reach-the-write-door.test.ts pins three). The literals '
            + 'copy the key order of createOIMEntitySlot, createOIMBucketSlot and OIMColumnOwnerPushDriven.createColumnSlot. '
            + 'Three shapes are still under the polymorphic ceiling of four, which is what this pair asks about. Every '
            + 'slot is held, so the gate never returns early.',
        isolate: true,
        build: wanted => ({
            ours: wanted === 'floor' ? inertSide : writeSide(mintThreeKinds(SHIPPED_DOOR_MINTS), writeShippedSlot),
            floor: wanted === 'ours' ? inertSide : writeSide(mintThreeKinds(ONE_SHAPE_DOOR_MINTS), writeOneShapeSlot),
        }),
    },
    {
        id: 'alt.slot-layout.hold-four-shapes-against-one-shape',
        path: EPricePath.PerWrite,
        ours: 'a hold on the four slot shapes the hold door sees (entity, bucket, push column, computed) in turn',
        floor: 'the same hold on the four kinds minted with ONE shape: the 15-key header plus `content`',
        caveat:
            'One operation is one holdCount increment, the body of OIMSlotOwner.holdSlot; an unhold is left out because '
            + 'an increment and a decrement of one field in one body can be folded away by the compiler. The hold door sees four '
            + 'shapes today (how-many-shapes-reach-the-write-door.test.ts), the pull column sharing the computed literal, '
            + 'which here carries computedValueService as createOIMComputedSlot does. Four shapes is the megamorphic edge.',
        isolate: true,
        build: wanted => ({
            ours: wanted === 'floor' ? inertSide : writeSide(mintFourKinds(SHIPPED_MINTS), holdShippedSlot),
            floor: wanted === 'ours' ? inertSide : writeSide(mintFourKinds(ONE_SHAPE_MINTS), holdOneShapeSlot),
        }),
    },
    {
        id: 'alt.slot-layout.write-door-four-shapes-against-one-shape',
        path: EPricePath.PerWrite,
        ours: 'the channel write door handed the four shipped slot shapes (entity, bucket, column, computed) in turn',
        floor: 'the same door handed four kinds minted with ONE shape: common fields plus one `content` field',
        caveat:
            'One operation is one write; the pool cycles entity, bucket, column, computed. The door reads holdCount and '
            + 'effects and stamps two fields, as OIMChannel.writeWithoutFlushCheck does. Every slot is held, so the gate '
            + 'never returns early. Bodies are separate function literals so the two arms keep separate feedback.',
        isolate: true,
        build: wanted => ({
            ours: wanted === 'floor' ? inertSide : writeSide(mintFourKinds(SHIPPED_MINTS), writeShippedSlot),
            floor: wanted === 'ours' ? inertSide : writeSide(mintFourKinds(ONE_SHAPE_MINTS), writeOneShapeSlot),
        }),
    },
    {
        id: 'alt.slot-layout.write-door-four-shapes-against-common-part',
        path: EPricePath.PerWrite,
        ours: 'the channel write door handed the four shipped slot shapes in turn',
        floor: 'the same door reaching the common fields through one shared sub-object `slot.common`',
        caveat:
            'As the one-shape pair, but the candidate keeps four kind shapes and moves the fields the door touches into '
            + 'one sub-object of one shape: one extra load per write buys a monomorphic one.',
        isolate: true,
        build: wanted => ({
            ours: wanted === 'floor' ? inertSide : writeSide(mintFourKinds(SHIPPED_MINTS), writeShippedSlot),
            floor: wanted === 'ours' ? inertSide : writeSide(mintFourKinds(COMMON_PART_MINTS), writeCommonPart),
        }),
    },
    {
        id: 'alt.slot-layout.mint-four-shapes-against-one-shape',
        path: EPricePath.PerRowPerWrite,
        ours: 'mint one slot, cycling the four shipped shapes',
        floor: 'mint one slot of the one shape; bucket and computed also allocate their content object',
        caveat:
            'Both arms allocate inside the clock; the candidate allocates a second object for a bucket or a computed slot '
            + '(two of every four mints), which is the price the one-shape layout pays.',
        build: () => ({ ours: mintShippedSide, floor: mintOneShapeSide }),
    },
    {
        id: 'alt.slot-layout.mint-four-shapes-against-common-part',
        path: EPricePath.PerRowPerWrite,
        ours: 'mint one slot, cycling the four shipped shapes',
        floor: 'mint one slot whose common fields live in a sub-object (every mint allocates two objects)',
        caveat: 'Both arms allocate inside the clock; the candidate allocates the common sub-object on every mint.',
        build: () => ({ ours: mintShippedSide, floor: mintCommonPartSide }),
    },
    {
        id: 'alt.slot-layout.read-entity-field-against-content-field',
        path: EPricePath.PerRead,
        ours: 'map.get(key).entity on shipped entity slots',
        floor: 'map.get(key).content on one-shape slots',
        caveat:
            'The find path: a key lookup and one field load. Same keys; only the slot layout and the field name differ. '
            + 'Every key hits.',
        build: () => {
            const keys: string[] = [];
            const shipped = new Map<string, TStampedSlot>();
            const oneShape = new Map<string, TStampedSlot>();
            for (let i = 0; i < POOL; i++) {
                const key = `slot-${i}`;
                keys.push(key);
                shipped.set(key, shippedEntitySlot(key));
                oneShape.set(key, oneShapeEntitySlot(key));
            }
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        const mask = POOL - 1;
                        for (let i = 0; i < times; i++) {
                            priceSink.ours = (shipped.get(keys[i & mask]) as unknown as { entity: object }).entity;
                        }
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        const mask = POOL - 1;
                        for (let i = 0; i < times; i++) {
                            priceSink.floor = (oneShape.get(keys[i & mask]) as unknown as { content: object }).content;
                        }
                    },
                },
            };
        },
    },
    {
        id: 'alt.slot-layout.read-bucket-store-direct-against-content',
        path: EPricePath.PerRead,
        ours: 'slot.bucketSlotsStore on shipped bucket slots',
        floor: 'slot.content.bucketSlotsStore on one-shape slots (one extra load)',
        caveat: 'The bucket hot read: every bucket door reads its store first. One operation is one read.',
        build: () => {
            const shipped: TStampedSlot[] = [];
            const oneShape: TStampedSlot[] = [];
            for (let i = 0; i < POOL; i++) {
                shipped.push(shippedBucketSlot(`b${i}`));
                oneShape.push(oneShapeBucketSlot(`b${i}`));
            }
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        const mask = POOL - 1;
                        for (let i = 0; i < times; i++) priceSink.ours = (shipped[i & mask] as unknown as { bucketSlotsStore: object }).bucketSlotsStore;
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        const mask = POOL - 1;
                        for (let i = 0; i < times; i++) {
                            priceSink.floor = (oneShape[i & mask] as unknown as { content: { bucketSlotsStore: object } }).content.bucketSlotsStore;
                        }
                    },
                },
            };
        },
    },
];
