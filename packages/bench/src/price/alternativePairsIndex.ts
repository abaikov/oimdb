import type { OIMBucketSlot } from '../../../core/src/bucket/OIMBucketSlot';
// Prose: ./README.md#alternativepairsindex
import { OIMBucketMemberSlotsArrayService, OIMBucketUniqueMemberSlotsArrayService, OIMPositionalArrayBucketContentService, OIMSlotMapStoreService, OIM_NOTHING_WAS_INSERTED, OIM_NOTHING_WAS_REMOVED } from '../../../core/src/index';
import type {
    OIMChannelQueue,
    TOIMSlot,
    TOIMBucketContentSlot,
    TOIMBucketSlotsArrayStore,
    TOIMBucketSlot,
    TOIMColumnSlot,
    TOIMEntitySlot,
    TOIMStoreKey,
} from '../../../core/src/index';
import { EPricePath } from './EPricePath';
import { priceFixture } from './priceFixture';
import { priceSink } from './priceSink';
import type { TPriceDataRow } from './TPriceDataRow';
import type { TPricePair } from './TPricePair';
import { createOIMSlotCollectionService } from '../../../core/src/index';

type TRowSlot = TOIMEntitySlot<TPriceDataRow>;

type TPositionedStore = TOIMBucketSlotsArrayStore<TRowSlot> & { positions: Map<TRowSlot, number> };

const positionsOf = (bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TRowSlot>): Map<TRowSlot, number> =>
    (bucketSlotsArrayStore as TPositionedStore).positions;

const renumberFrom = (bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TRowSlot>, at: number): void => {
    const list = bucketSlotsArrayStore.bucketMemberSlots;
    const positions = positionsOf(bucketSlotsArrayStore);
    for (let i = at < 0 ? 0 : at; i < list.length; i++) positions.set(list[i], i);
};

class PositionsMapMemberSlotsArrayService extends OIMBucketMemberSlotsArrayService<TRowSlot> {
    public override createBucketSlotsArrayStore(): TOIMBucketSlotsArrayStore<TRowSlot> {
        const positionedStore: TPositionedStore = {
            bucketMemberSlots: [], uniqueBucketMemberSlots: undefined, sortedCount: 0, positions: new Map<TRowSlot, number>(),
        };
        return positionedStore;
    }

    public override hasBucketMemberSlot(bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TRowSlot>, slot: TRowSlot): boolean {
        return positionsOf(bucketSlotsArrayStore).has(slot);
    }

    public override appendBucketMemberSlot(bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TRowSlot>, slot: TRowSlot): boolean {
        const positions = positionsOf(bucketSlotsArrayStore);
        if (positions.has(slot)) return false;
        super.appendBucketMemberSlot(bucketSlotsArrayStore, slot);
        positions.set(slot, bucketSlotsArrayStore.bucketMemberSlots.length - 1);
        return true;
    }

    public override insertBucketMemberSlotAt(bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TRowSlot>, at: number, slot: TRowSlot): number {
        if (positionsOf(bucketSlotsArrayStore).has(slot)) return OIM_NOTHING_WAS_INSERTED;
        const landing = super.insertBucketMemberSlotAt(bucketSlotsArrayStore, at, slot);
        renumberFrom(bucketSlotsArrayStore, landing);
        return landing;
    }

    public override removeBucketMemberSlot(bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TRowSlot>, slot: TRowSlot): number {
        const positions = positionsOf(bucketSlotsArrayStore);
        const at = positions.get(slot);
        if (at === undefined) return OIM_NOTHING_WAS_REMOVED;
        positions.delete(slot);
        bucketSlotsArrayStore.bucketMemberSlots.splice(at, 1);
        renumberFrom(bucketSlotsArrayStore, at);
        return at;
    }

    public override removeBucketMemberSlotAt(bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TRowSlot>, at: number): TRowSlot {
        const removedSlot = super.removeBucketMemberSlotAt(bucketSlotsArrayStore, at);
        positionsOf(bucketSlotsArrayStore).delete(removedSlot);
        renumberFrom(bucketSlotsArrayStore, at);
        return removedSlot;
    }

    public override removeBucketMemberSlotRange(bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TRowSlot>, at: number, count: number): TRowSlot[] {
        const removedSlots = super.removeBucketMemberSlotRange(bucketSlotsArrayStore, at, count);
        const positions = positionsOf(bucketSlotsArrayStore);
        for (let i = 0; i < removedSlots.length; i++) positions.delete(removedSlots[i]);
        if (removedSlots.length > 0) renumberFrom(bucketSlotsArrayStore, at);
        return removedSlots;
    }

    public override removeBucketMemberSlots(
        bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TRowSlot>, slots: readonly TRowSlot[],
        removedChannelQueue: OIMChannelQueue<TOIMSlot>, removedAtChannelQueue: OIMChannelQueue<number>,
    ): void {
        const removedBefore = removedChannelQueue.getEntryCount();
        super.removeBucketMemberSlots(bucketSlotsArrayStore, slots, removedChannelQueue, removedAtChannelQueue);
        const positions = positionsOf(bucketSlotsArrayStore);
        for (let i = removedBefore; i < removedChannelQueue.getEntryCount(); i++) positions.delete(removedChannelQueue.getEntryAt(i) as TRowSlot);
        renumberFrom(bucketSlotsArrayStore, 0);
    }

    public override moveBucketMemberSlotRange(
        bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TRowSlot>, from: number, count: number, landing: number,
    ): boolean {
        const isMoved = super.moveBucketMemberSlotRange(bucketSlotsArrayStore, from, count, landing);
        if (isMoved) renumberFrom(bucketSlotsArrayStore, from < landing ? from : landing);
        return isMoved;
    }

    public override sortBucketMemberSlots(
        bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TRowSlot>, compareBucketMemberSlots: (left: TRowSlot, right: TRowSlot) => number,
    ): void {
        super.sortBucketMemberSlots(bucketSlotsArrayStore, compareBucketMemberSlots);
        renumberFrom(bucketSlotsArrayStore, 0);
    }

    public override clearBucketMemberSlots(bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TRowSlot>): void {
        super.clearBucketMemberSlots(bucketSlotsArrayStore);
        positionsOf(bucketSlotsArrayStore).clear();
    }
}

class PositionsMapPositionalArrayBucketService extends OIMPositionalArrayBucketContentService<TRowSlot> {
    public constructor() {
        super({ bucketMemberSlotsArrayService: new PositionsMapMemberSlotsArrayService() });
    }

    public override getBucketMemberSlotPosition(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TRowSlot>>, slot: TRowSlot,
    ): number {
        const at = positionsOf((bucketSlot as unknown as OIMBucketSlot<TOIMBucketSlotsArrayStore<TRowSlot>>).bucketSlotsStore).get(slot);
        return at === undefined ? -1 : at;
    }
}

const LIST_SIZE = 1024;

type TListWorld = {
    readonly fixture: ReturnType<typeof priceFixture>;
    readonly slotContentService: OIMPositionalArrayBucketContentService<TRowSlot>;
    readonly bucket: TOIMBucketSlot<TOIMBucketSlotsArrayStore<TRowSlot>, TOIMStoreKey>;
    spare: TRowSlot;
};

const listWorld = (slotContentService: OIMPositionalArrayBucketContentService<TRowSlot>): TListWorld => {
    const fixture = priceFixture(LIST_SIZE + 1);
    const bucketService = createOIMSlotCollectionService({ slotContentService, slotStoreService: new OIMSlotMapStoreService<TOIMBucketSlot<TOIMBucketSlotsArrayStore<TRowSlot>, TOIMStoreKey>, TOIMStoreKey>(), columnSlotStoreService: new OIMSlotMapStoreService<TOIMColumnSlot>() });
    const bucketStoreSlot = bucketService.createStoreSlot(fixture.db);
    const bucket = bucketService.holdSlotByKey(bucketStoreSlot, 'list');
    for (let i = 0; i < LIST_SIZE; i++) slotContentService.insertBucketMemberSlotAt(bucket, i, fixture.slots[i]);
    fixture.db.flush();
    const spare: TRowSlot = fixture.slots[LIST_SIZE];
    return { fixture, slotContentService, bucket, spare };
};

const assertSamePositions = (ourWorld: TListWorld, floorWorld: TListWorld): void => {
    for (let i = 0; i < LIST_SIZE; i++) {
        const ours = ourWorld.slotContentService.getBucketMemberSlotPosition(ourWorld.bucket, ourWorld.fixture.slots[i]);
        const floor = floorWorld.slotContentService.getBucketMemberSlotPosition(floorWorld.bucket, floorWorld.fixture.slots[i]);
        if (ours === floor) continue;
        throw new Error(`alternativePairsIndex: member ${i} sits at ${ours} on ours and ${floor} on the floor.`);
    }
};

const prependSide = (world: TListWorld) => ({
    reset: () => undefined,
    run: (times: number): void => {
        const slotContentService = world.slotContentService;
        const bucket = world.bucket;
        let spare = world.spare;
        for (let i = 0; i < times; i++) {
            slotContentService.insertBucketMemberSlotAt(bucket, 0, spare);
            const tail = slotContentService.getBucketMemberSlotAt(bucket, LIST_SIZE);
            if (tail === undefined) break;
            slotContentService.removeBucketMemberSlotAt(bucket, LIST_SIZE);
            spare = tail;
        }
        world.spare = spare;
        priceSink.number = slotContentService.getBucketMemberSlotCount(bucket);
    },
});

const positionSide = (world: TListWorld) => ({
    reset: () => undefined,
    run: (times: number): void => {
        const slotContentService = world.slotContentService;
        const bucket = world.bucket;
        const members = world.fixture.slots;
        const mask = LIST_SIZE - 1;
        for (let i = 0; i < times; i++) priceSink.number = slotContentService.getBucketMemberSlotPosition(bucket, members[i & mask]);
    },
});

const uniqueService = () => new OIMPositionalArrayBucketContentService<TRowSlot>({ bucketMemberSlotsArrayService: new OIMBucketUniqueMemberSlotsArrayService<TRowSlot>() });

const listPairs: readonly TPricePair[] = [
    {
        id: 'alt.prepend-list-vs-positions-map',
        path: EPricePath.PerWrite,
        ours: `slotContentService.insertBucketMemberSlotAt(bucket, 0, slot) into a list of ${LIST_SIZE}, membership kept in a Set`,
        floor: 'the same prepend, membership kept in a Map to positions',
        caveat:
            'THE OPERATION COUNT IS NOT IN DISPUTE. A prepend splices one member in at the front, ' +
            'which invalidates every position after it: the renumber is exactly ' +
            `\`list.length - at\` map writes, so ${LIST_SIZE + 1} of them here, against one memmove ` +
            'and one `Set.add` on our side. EACH OPERATION IS A PREPEND AND A REMOVAL OF THE TAIL, ' +
            'so the list stays the length it is named for; the removal renumbers nothing on either ' +
            'design. Ours is `OIMPositionalArrayBucketContentService` with `OIMBucketUniqueMemberSlotsArrayService`; ' +
            'the floor is the same bucket with a member slots service that keeps a positions map. ' +
            'DIRECTION: the bucket collection\'s own epilogue — the hold, the unhold, the ' +
            '`OIMChannelService.writeWithoutFlushCheck` and the emptiness update — is identical on both halves ' +
            'and inside both numbers, which pulls this toward 1.00. A LAZY positions map is a third ' +
            'design and this row does not refute it. The reading in ' +
            '`packages/bench/measurements/2026-08-20-alternatives/positions` was taken on a ' +
            'positional index and bucket mutator that are gone and is not re-attributed here.',
        build: () => {
            const ourWorld = listWorld(uniqueService());
            const floorWorld = listWorld(new PositionsMapPositionalArrayBucketService());
            assertSamePositions(ourWorld, floorWorld);
            return { ours: prependSide(ourWorld), floor: prependSide(floorWorld) };
        },
    },

    {
        id: 'alt.position-of-a-member-vs-positions-map',
        path: EPricePath.PerRead,
        ours: `slotContentService.getBucketMemberSlotPosition(bucket, member) in a list of ${LIST_SIZE} — a scan`,
        floor: 'the same question answered by a Map to positions — one hash',
        caveat:
            'THE ONE ROW IN THIS FILE WHERE THE DESIGN WE REJECTED WINS, and it should: a hash ' +
            'against a scan of five hundred on average. It is here because a pair that only shows ' +
            'a rejected design losing is an argument and not a measurement. WHAT IT DOES NOT SHOW ' +
            'is the call site: `remove` asks for a position and splices with it immediately, and ' +
            'that splice is the same memmove for both designs, so the row above is what it costs ' +
            'to have the hash at all. The members are cycled through with a mask so the scan ' +
            'length is uniform over the list, and the build throws unless both designs place every ' +
            'member at the same position. The reading in ' +
            '`packages/bench/measurements/2026-08-20-alternatives/positions` was taken on the ' +
            'removed positional index and is not re-attributed here.',
        build: () => {
            const ourWorld = listWorld(uniqueService());
            const floorWorld = listWorld(new PositionsMapPositionalArrayBucketService());
            assertSamePositions(ourWorld, floorWorld);
            return { ours: positionSide(ourWorld), floor: positionSide(floorWorld) };
        },
    },
];

export const alternativePairsIndex: readonly TPricePair[] = [
    ...listPairs,
];
