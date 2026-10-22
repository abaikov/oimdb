// Prose: ./README.md#alternativepairsindex
import {
    OIMBucketArrayMembershipUnique,
    OIMSlotContentBucketServiceArrayDriven,
    OIMSlotStoreServiceMapDriven,
    OIM_NOTHING_WAS_REMOVED,
    createOIMBucketService,
} from '../../../core/src/index';
import type {
    IOIMBucketArrayMembership,
    TOIMBucketSlotsArrayUniqueStore,
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

type TRowSlot = TOIMEntitySlot<TPriceDataRow>;

type TPositionedSlots = TOIMBucketSlotsArrayStore<TRowSlot> & { positions: Map<TRowSlot, number> };

class OIMBucketArrayMembershipByPositions implements IOIMBucketArrayMembership<TRowSlot, TPositionedSlots> {
    public createStore(): TPositionedSlots {
        return {
            bucketMemberSlots: [],
            positions: new Map<TRowSlot, number>(),
        };
    }

    public addSlot(positionedSlots: TPositionedSlots, slot: TRowSlot): boolean {
        return !positionedSlots.positions.has(slot);
    }

    public hasSlot(positionedSlots: TPositionedSlots, slot: TRowSlot): boolean {
        return positionedSlots.positions.has(slot);
    }

    public removeSlot(positionedSlots: TPositionedSlots, slot: TRowSlot): boolean {
        return positionedSlots.positions.delete(slot);
    }

    public clearSlots(positionedSlots: TPositionedSlots): void {
        positionedSlots.positions.clear();
    }

    public containsTheSameSequence(positionedSlots: TPositionedSlots, slots: readonly TRowSlot[]): boolean {
        const list = positionedSlots.bucketMemberSlots;
        if (list.length !== slots.length) return false;
        for (let i = 0; i < list.length; i++) if (list[i] !== slots[i]) return false;
        return true;
    }
}

class OIMSlotContentBucketServiceArrayDrivenByPositionsMap
    extends OIMSlotContentBucketServiceArrayDriven<TRowSlot, TPositionedSlots> {
    public constructor() {
        super({ bucketArrayMembership: new OIMBucketArrayMembershipByPositions() });
    }

    private renumberFrom(positionedSlots: TPositionedSlots, at: number): void {
        const list = positionedSlots.bucketMemberSlots;
        const positions = positionedSlots.positions;
        for (let i = at < 0 ? 0 : at; i < list.length; i++) positions.set(list[i], i);
    }

    protected override addSlot(bucketSlot: TOIMBucketSlot<TPositionedSlots>, slot: TRowSlot): boolean {
        if (!super.addSlot(bucketSlot, slot)) return false;
        const positionedSlots = bucketSlot.bucketSlotsStore;
        positionedSlots.positions.set(slot, positionedSlots.bucketMemberSlots.length - 1);
        return true;
    }

    protected override removeSlot(bucketSlot: TOIMBucketSlot<TPositionedSlots>, slot: TRowSlot): number {
        const positionedSlots = bucketSlot.bucketSlotsStore;
        const at = positionedSlots.positions.get(slot);
        if (at === undefined) return OIM_NOTHING_WAS_REMOVED;
        positionedSlots.positions.delete(slot);
        positionedSlots.bucketMemberSlots.splice(at, 1);
        this.renumberFrom(positionedSlots, at);
        return at;
    }

    public override hasBucketMemberSlot(bucketSlot: TOIMBucketSlot<TPositionedSlots>, slot: TRowSlot): boolean {
        return bucketSlot.bucketSlotsStore.positions.has(slot);
    }

    public override getBucketMemberSlotPosition(bucketSlot: TOIMBucketSlot<TPositionedSlots>, slot: TRowSlot): number {
        const at = bucketSlot.bucketSlotsStore.positions.get(slot);
        return at === undefined ? -1 : at;
    }

    public override insertBucketMemberSlotAt(bucketSlot: TOIMBucketSlot<TPositionedSlots>, at: number, slot: TRowSlot): void {
        const positionedSlots = bucketSlot.bucketSlotsStore;
        const length = positionedSlots.bucketMemberSlots.length;
        super.insertBucketMemberSlotAt(bucketSlot, at, slot);
        if (positionedSlots.bucketMemberSlots.length !== length) this.renumberFrom(positionedSlots, Math.min(at, length));
    }

    public override removeBucketMemberSlotAt(bucketSlot: TOIMBucketSlot<TPositionedSlots>, at: number): TRowSlot | undefined {
        const removedSlot = super.removeBucketMemberSlotAt(bucketSlot, at);
        if (removedSlot === undefined) return undefined;
        this.renumberFrom(bucketSlot.bucketSlotsStore, at);
        return removedSlot;
    }

    public override removeBucketMemberSlotRange(
        bucketSlot: TOIMBucketSlot<TPositionedSlots>, at: number, count: number,
    ): readonly TRowSlot[] {
        const removedSlots = super.removeBucketMemberSlotRange(bucketSlot, at, count);
        if (removedSlots.length > 0) this.renumberFrom(bucketSlot.bucketSlotsStore, at);
        return removedSlots;
    }

    public override moveBucketMemberSlotToPosition(
        bucketSlot: TOIMBucketSlot<TPositionedSlots>, from: number, to: number,
    ): TRowSlot | undefined {
        const movedSlot = super.moveBucketMemberSlotToPosition(bucketSlot, from, to);
        if (movedSlot !== undefined) this.renumberFrom(bucketSlot.bucketSlotsStore, from < to ? from : to);
        return movedSlot;
    }

    public override moveBucketMemberSlotRangeToPosition(
        bucketSlot: TOIMBucketSlot<TPositionedSlots>, from: number, count: number, to: number,
    ): void {
        super.moveBucketMemberSlotRangeToPosition(bucketSlot, from, count, to);
        this.renumberFrom(bucketSlot.bucketSlotsStore, from < to ? from : to);
    }
}

const LIST_SIZE = 1024;

type TListWorld<TSlots extends TOIMBucketSlotsArrayStore<TRowSlot>> = {
    readonly fixture: ReturnType<typeof priceFixture>;
    readonly slotContentService: OIMSlotContentBucketServiceArrayDriven<TRowSlot, TSlots>;
    readonly bucket: TOIMBucketSlot<TSlots, TOIMStoreKey>;
    spare: TRowSlot;
};

const listWorld = <TSlots extends TOIMBucketSlotsArrayStore<TRowSlot>>(
    slotContentService: OIMSlotContentBucketServiceArrayDriven<TRowSlot, TSlots>,
): TListWorld<TSlots> => {
    const fixture = priceFixture(LIST_SIZE + 1);
    const bucketService = createOIMBucketService<
        TRowSlot, TOIMStoreKey, TSlots, OIMSlotContentBucketServiceArrayDriven<TRowSlot, TSlots>
    >(fixture.db, {
        bucketSlotStoreService: new OIMSlotStoreServiceMapDriven(),
        slotContentService,
        columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMColumnSlot>(),
    });
    const bucketStoreSlot = bucketService.createStoreSlot(fixture.db);
    const bucket = bucketService.holdSlotByKey(bucketStoreSlot, 'list');
    for (let i = 0; i < LIST_SIZE; i++) slotContentService.insertBucketMemberSlotAt(bucket, i, fixture.slots[i]);
    fixture.db.flush();
    const spare: TRowSlot = fixture.slots[LIST_SIZE];
    return { fixture, slotContentService, bucket, spare };
};

const assertSamePositions = <
    TOurSlots extends TOIMBucketSlotsArrayStore<TRowSlot>, TFloorSlots extends TOIMBucketSlotsArrayStore<TRowSlot>,
>(
    ourWorld: TListWorld<TOurSlots>,
    floorWorld: TListWorld<TFloorSlots>,
): void => {
    for (let i = 0; i < LIST_SIZE; i++) {
        const ours = ourWorld.slotContentService.getBucketMemberSlotPosition(ourWorld.bucket, ourWorld.fixture.slots[i]);
        const floor = floorWorld.slotContentService.getBucketMemberSlotPosition(floorWorld.bucket, floorWorld.fixture.slots[i]);
        if (ours === floor) continue;
        throw new Error(`alternativePairsIndex: member ${i} sits at ${ours} on ours and ${floor} on the floor.`);
    }
};

const prependSide = <TSlots extends TOIMBucketSlotsArrayStore<TRowSlot>>(world: TListWorld<TSlots>) => ({
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

const positionSide = <TSlots extends TOIMBucketSlotsArrayStore<TRowSlot>>(world: TListWorld<TSlots>) => ({
    reset: () => undefined,
    run: (times: number): void => {
        const slotContentService = world.slotContentService;
        const bucket = world.bucket;
        const members = world.fixture.slots;
        const mask = LIST_SIZE - 1;
        for (let i = 0; i < times; i++) priceSink.number = slotContentService.getBucketMemberSlotPosition(bucket, members[i & mask]);
    },
});

const uniqueService = () => new OIMSlotContentBucketServiceArrayDriven<TRowSlot, TOIMBucketSlotsArrayUniqueStore<TRowSlot>>({
    bucketArrayMembership: new OIMBucketArrayMembershipUnique<TRowSlot>(),
});

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
            'design. Ours is `OIMSlotContentBucketServiceArrayDriven` over `OIMBucketArrayMembershipUnique`; ' +
            'the floor is the same service subclassed to keep a positions map. ' +
            'DIRECTION: the bucket collection\'s own epilogue — the hold, the unhold, the ' +
            '`OIMChannelService.writeWithoutFlushCheck` and the emptiness update — is identical on both halves ' +
            'and inside both numbers, which pulls this toward 1.00. A LAZY positions map is a third ' +
            'design and this row does not refute it. The reading in ' +
            '`packages/bench/measurements/2026-08-20-alternatives/positions` was taken on a ' +
            'positional index and bucket mutator that are gone and is not re-attributed here.',
        build: () => {
            const ourWorld = listWorld(uniqueService());
            const floorWorld = listWorld(new OIMSlotContentBucketServiceArrayDrivenByPositionsMap());
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
            const floorWorld = listWorld(new OIMSlotContentBucketServiceArrayDrivenByPositionsMap());
            assertSamePositions(ourWorld, floorWorld);
            return { ours: positionSide(ourWorld), floor: positionSide(floorWorld) };
        },
    },
];

export const alternativePairsIndex: readonly TPricePair[] = [
    ...listPairs,
];
