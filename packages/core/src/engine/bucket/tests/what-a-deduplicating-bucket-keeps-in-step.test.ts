import { OIMDB, OIMSlotContentBucketServiceArrayDriven, createOIMBucketService, createOIMEntityService } from '../../../index';
import { OIMBucketArrayMembershipUnique } from '../array/OIMBucketArrayMembershipUnique';
import type { TOIMBucketSlot } from '../types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMBucketSlotsArrayUniqueStore } from '../array/types/TOIMBucketSlotsArrayUniqueStore';

type TCard = { id: string; deckId: string; day: string; tags: string[]; rank: number };
type TCardSlot = TOIMEntitySlot<TCard, string>;
type TSlots = TOIMBucketSlotsArrayUniqueStore<TCardSlot>;

const idsOf = (slots: Iterable<TOIMEntitySlot<TCard>>): string[] =>
    Array.from(slots).map(s => s.entity?.id ?? '?');

const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService(db, { keyOf: (card: TCard) => card.id });
    const cards = cardsService.createStoreSlot(db);
    const membersService = new OIMSlotContentBucketServiceArrayDriven<TCardSlot, TSlots>({
        bucketArrayMembership: new OIMBucketArrayMembershipUnique<TCardSlot>(),
    });
    const searchService = createOIMBucketService<
        TCardSlot, string, TSlots, OIMSlotContentBucketServiceArrayDriven<TCardSlot, TSlots>
    >(db, { slotContentService: membersService });
    const search = searchService.createStoreSlot(db);
    const bucketAt = (key: string): TOIMBucketSlot<TSlots, string> => searchService.holdSlotByKey(search, key);
    return { db, cardsService, cards, membersService, bucketAt };
};

describe('what a deduplicating bucket keeps in step', () => {
    it('removes a slot and keeps the rest addressable', () => {
        const { db, cardsService, cards, membersService, bucketAt } = createFixture();
        cardsService.slotContentService.upsertEntities(cards, ['c1', 'c2', 'c3'].map((id, i) =>
            ({ id, deckId: 'd1', day: '01', tags: [], rank: i })));
        db.flush();

        const bucket = bucketAt('q');
        const slots = ['c1', 'c2', 'c3'].map(id => cardsService.getSlotByKey(cards, id));
        membersService.writeBucketMemberSlots(bucket, slots);
        db.flush();
        expect(idsOf(membersService.getBucketMemberSlots(bucket))).toEqual(['c1', 'c2', 'c3']);

        // Evicting the MIDDLE one is the case that shifts the whole tail.
        membersService.writeBucketMemberSlots(bucket, [slots[0], slots[2]]);
        db.flush();
        expect(idsOf(membersService.getBucketMemberSlots(bucket))).toEqual(['c1', 'c3']);
        expect(membersService.getBucketMemberSlotCount(bucket)).toBe(2);
        expect(slots[1].holdCount).toBe(0);

        // And the survivors can still be evicted, which needs the list and the
        // set of slots to have stayed in step through that shift.
        membersService.writeBucketMemberSlots(bucket, [slots[2]]);
        db.flush();
        expect(idsOf(membersService.getBucketMemberSlots(bucket))).toEqual(['c3']);
    });

    it('keeps the set in step with the list through a reorder and a removal', () => {
        const { db, cardsService, cards, membersService, bucketAt } = createFixture();
        cardsService.slotContentService.upsertEntities(cards, [
            { id: 'c1', deckId: 'd1', day: '01', tags: [], rank: 3 },
            { id: 'c2', deckId: 'd1', day: '01', tags: [], rank: 1 },
            { id: 'c3', deckId: 'd1', day: '01', tags: [], rank: 2 },
        ]);
        db.flush();

        const bucket = bucketAt('q');
        const slots = ['c1', 'c2', 'c3'].map(id => cardsService.getSlotByKey(cards, id));
        membersService.writeBucketMemberSlots(bucket, slots);
        db.flush();
        membersService.writeBucketMemberSlots(bucket, [slots[1], slots[2], slots[0]]);
        db.flush();
        expect(idsOf(membersService.getBucketMemberSlots(bucket))).toEqual(['c2', 'c3', 'c1']);

        membersService.writeBucketMemberSlots(bucket, [slots[0], slots[1]]);
        db.flush();
        expect(idsOf(membersService.getBucketMemberSlots(bucket))).toEqual(['c1', 'c2']);
        expect(membersService.getBucketMemberSlotCount(bucket)).toBe(2);
        expect(bucket.bucketSlotsStore.uniqueBucketMemberSlots.size).toBe(2);
    });
});
