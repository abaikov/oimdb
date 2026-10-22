import { OIMSlotContentBucketServiceArrayDriven } from '../OIMSlotContentBucketServiceArrayDriven';
import { OIMSlotContentBucketServiceSetDriven } from '../OIMSlotContentBucketServiceSetDriven';
import { OIMBucketCommands } from '../OIMBucketCommands';
import { OIMDB } from '../../../factories/OIMDB';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { OIM_NOTHING_WAS_REMOVED } from '../../../engine/bucket/constants/OIM_NOTHING_WAS_REMOVED';
import { OIM_REMOVED_WITHOUT_A_POSITION } from '../../../engine/bucket/constants/OIM_REMOVED_WITHOUT_A_POSITION';
import type { TOIMBucketSlot } from '../../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../engine/store/types/TOIMStoreKey';
import type { TOIMBucketSlotsArrayStore } from '../../../engine/bucket/array/types/TOIMBucketSlotsArrayStore';
import type { TOIMBucketSlotsSetStore } from '../../../engine/bucket/types/TOIMBucketSlotsSetStore';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard>;
type TOrderedSlots = TOIMBucketSlotsArrayStore<TCardSlot>;
type TUnorderedSlots = TOIMBucketSlotsSetStore<TCardSlot>;

class OIMSlotContentBucketServiceArrayDrivenCounted extends OIMSlotContentBucketServiceArrayDriven<TCardSlot> {
    public positionsAsked = 0;

    public override getBucketMemberSlotPosition(
        bucketSlot: TOIMBucketSlot<TOrderedSlots>, slot: TOIMEntitySlot<TCard>,
    ): number {
        this.positionsAsked++;
        return super.getBucketMemberSlotPosition(bucketSlot, slot);
    }

    public override removeSlot(bucketSlot: TOIMBucketSlot<TOrderedSlots>, slot: TCardSlot): number {
        return super.removeSlot(bucketSlot, slot);
    }
}

class OIMSlotContentBucketServiceSetDrivenExposed extends OIMSlotContentBucketServiceSetDriven<TCardSlot> {
    public override removeSlot(bucketSlot: TOIMBucketSlot<TUnorderedSlots>, slot: TCardSlot): number {
        return super.removeSlot(bucketSlot, slot);
    }
}

const buildOrdered = (withCommands: boolean) => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const membersService = new OIMSlotContentBucketServiceArrayDrivenCounted({
        bucketCommands: withCommands ? new OIMBucketCommands({}) : undefined,
    });
    const listService = createOIMBucketService(db, { slotContentService: membersService });
    const list = listService.createStoreSlot(db);
    const bucket = listService.holdSlotByKey(list, 'deck');
    const slotOf = (id: string): TOIMEntitySlot<TCard> => {
        cardsService.slotContentService.upsertEntity(cards, { id, title: id });
        const holding = cardsService.holdSlotByKey(cards, id);
        holding.owner.unholdSlot(holding);
        return holding;
    };
    const filled = (ids: readonly string[]): TOIMEntitySlot<TCard>[] => {
        const slots = ids.map(slotOf);
        membersService.addBucketMemberSlots(bucket, slots);
        db.flush();
        return slots;
    };
    return { db, membersService, bucket, slotOf, filled };
};

const buildUnordered = () => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const membersService = new OIMSlotContentBucketServiceSetDrivenExposed({ bucketCommands: new OIMBucketCommands({}) });
    const bagService = createOIMBucketService<
        TCardSlot, TOIMStoreKey, TUnorderedSlots, OIMSlotContentBucketServiceSetDrivenExposed
    >(db, { slotContentService: membersService });
    const bag = bagService.createStoreSlot(db);
    const bucket = bagService.holdSlotByKey(bag, 'deck');
    const filled = (ids: readonly string[]): TOIMEntitySlot<TCard>[] => {
        const slots = ids.map(id => {
            cardsService.slotContentService.upsertEntity(cards, { id, title: id });
            const holding = cardsService.holdSlotByKey(cards, id);
            holding.owner.unholdSlot(holding);
            return holding;
        });
        membersService.addBucketMemberSlots(bucket, slots);
        db.flush();
        return slots;
    };
    return { db, membersService, bucket, filled };
};

describe('what a removal asks the list for', () => {
    it('answers the position from the removal itself, asking the list for nothing more', () => {
        const { membersService, bucket, filled } = buildOrdered(true);
        const slots = filled(['a', 'b', 'c', 'd']);
        membersService.positionsAsked = 0;

        membersService.removeBucketMemberSlots(bucket, [slots[2]]);

        expect(membersService.positionsAsked).toBe(0);
        expect(bucket.commands ?? []).toEqual([{ type: 'remove', index: 2 }]);
    });

    it('names the position each of a batch of removals left, counting the list only once apiece', () => {
        const { membersService, bucket, filled } = buildOrdered(true);
        const slots = filled(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
        membersService.positionsAsked = 0;

        membersService.removeBucketMemberSlots(bucket, [slots[9], slots[0], slots[1]]);

        expect(membersService.positionsAsked).toBe(0);
        expect(bucket.commands ?? []).toEqual([
            { type: 'remove', index: 0 },
            { type: 'remove', index: 0 },
            { type: 'remove', index: 7 },
        ]);
    });

    it('records nothing for a slot the bucket never held, and keeps the list it has', () => {
        const { membersService, bucket, slotOf, filled } = buildOrdered(true);
        filled(['a', 'b']);
        const stranger = slotOf('z');
        membersService.positionsAsked = 0;

        membersService.removeBucketMemberSlots(bucket, [stranger]);

        expect(membersService.positionsAsked).toBe(0);
        expect(bucket.commands ?? []).toEqual([]);
        expect(membersService.getBucketMemberSlotCount(bucket)).toBe(2);
    });

    it('asks the list for no position when nobody is recording commands', () => {
        const { membersService, bucket, filled } = buildOrdered(false);
        const slots = filled(['a', 'b', 'c']);
        membersService.positionsAsked = 0;

        membersService.removeBucketMemberSlots(bucket, [slots[1]]);

        expect(membersService.positionsAsked).toBe(0);
        expect(membersService.getBucketMemberSlotCount(bucket)).toBe(2);
    });

    it('tells a recorder to re-read the whole bucket when the bucket keeps no order', () => {
        const { membersService, bucket, filled } = buildUnordered();
        const slots = filled(['a', 'b', 'c']);

        membersService.removeBucketMemberSlots(bucket, [slots[1]]);

        expect(bucket.isWholeListRecorded).toBe(true);
        expect(bucket.commands ?? []).toEqual([]);
        expect(membersService.getBucketMemberSlotCount(bucket)).toBe(2);
    });

    it('names where an insert LANDED, not where the copy the bucket already held sits', () => {
        const { membersService, bucket, filled } = buildOrdered(true);
        const slots = filled(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
        membersService.positionsAsked = 0;

        membersService.insertBucketMemberSlotAt(bucket, 6, slots[2]);

        const held = Array.from(membersService.getBucketMemberSlots(bucket));
        expect(held.indexOf(slots[2])).toBe(2);
        expect(held.lastIndexOf(slots[2])).toBe(6);
        expect(bucket.commands ?? []).toEqual([{ type: 'insert', index: 6, slot: slots[2] }]);
        expect(membersService.positionsAsked).toBe(0);
    });

    it('names the clamped landing when the caller asks past the end', () => {
        const { membersService, bucket, slotOf, filled } = buildOrdered(true);
        filled(['a', 'b', 'c']);
        const arriving = slotOf('z');

        membersService.insertBucketMemberSlotAt(bucket, 999, arriving);

        expect(bucket.commands ?? []).toEqual([{ type: 'insert', index: 3, slot: arriving }]);
        expect(Array.from(membersService.getBucketMemberSlots(bucket))[3]).toBe(arriving);
    });

    it('says which of the two refusals a service gave, and they are different numbers', () => {
        const { membersService: ordered, bucket: orderedBucket, slotOf, filled } = buildOrdered(true);
        const slots = filled(['a']);
        const stranger = slotOf('z');

        expect(ordered.removeSlot(orderedBucket, stranger)).toBe(OIM_NOTHING_WAS_REMOVED);
        expect(ordered.removeSlot(orderedBucket, slots[0])).toBe(0);

        const unordered = buildUnordered();
        const bagged = unordered.filled(['a']);
        expect(unordered.membersService.removeSlot(unordered.bucket, bagged[0]))
            .toBe(OIM_REMOVED_WITHOUT_A_POSITION);
        expect(unordered.membersService.removeSlot(unordered.bucket, bagged[0]))
            .toBe(OIM_NOTHING_WAS_REMOVED);
    });
});
