import { OIMDB, OIMSlotContentPositionalArrayBucketService, OIMBucketUniqueMemberSlotsArrayService } from '../../../index';
import type { TOIMBucketSlot } from '../types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMBucketSlotsArrayStore } from '../array/types/TOIMBucketSlotsArrayStore';
import { createOIMSlotContentEntityService } from '../../../factories/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../../factories/createOIMSlotCollectionService';

type TCard = { id: string; deckId: string; day: string; tags: string[]; rank: number };
type TCardSlot = TOIMEntitySlot<TCard, string>;
type TSlots = TOIMBucketSlotsArrayStore<TCardSlot>;

const idsOf = (slots: Iterable<TOIMEntitySlot<TCard>>): string[] =>
    Array.from(slots).map(s => s.entity?.id ?? '?');

const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard, string>(db) });
    const cards = cardsService.createStoreSlot(db);
    const membersService = new OIMSlotContentPositionalArrayBucketService<TCardSlot, string>({ bucketMemberSlotsArrayService: new OIMBucketUniqueMemberSlotsArrayService() });
    const searchService = createOIMSlotCollectionService(db, { slotContentService: membersService });
    const search = searchService.createStoreSlot(db);
    const bucketAt = (key: string): TOIMBucketSlot<TSlots, string> => searchService.holdSlotByKey(search, key);
    return { db, cardsService, cards, membersService, bucketAt };
};

describe('what a deduplicating bucket keeps in step', () => {
    it('removes a slot and keeps the rest addressable', () => {
        const { db, cardsService, cards, membersService, bucketAt } = createFixture();
        cardsService.writeInBatch(cards, () => (['c1', 'c2', 'c3'].map((id, i) =>
            ({ id, deckId: 'd1', day: '01', tags: [], rank: i }))).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));
        db.flush();

        const bucket = bucketAt('q');
        const slots = ['c1', 'c2', 'c3'].map(id => cardsService.getSlotByKey(cards, id));
        membersService.writeSlotContent(bucket, slots);
        db.flush();
        expect(idsOf(membersService.getBucketMemberSlots(bucket))).toEqual(['c1', 'c2', 'c3']);

        // Evicting the MIDDLE one is the case that shifts the whole tail.
        membersService.writeSlotContent(bucket, [slots[0], slots[2]]);
        db.flush();
        expect(idsOf(membersService.getBucketMemberSlots(bucket))).toEqual(['c1', 'c3']);
        expect(membersService.getBucketMemberSlotCount(bucket)).toBe(2);
        expect(slots[1].holdCount).toBe(0);

        // And the survivors can still be evicted, which needs the list and the
        // set of slots to have stayed in step through that shift.
        membersService.writeSlotContent(bucket, [slots[2]]);
        db.flush();
        expect(idsOf(membersService.getBucketMemberSlots(bucket))).toEqual(['c3']);
    });

    it('keeps the set in step with the list through a reorder and a removal', () => {
        const { db, cardsService, cards, membersService, bucketAt } = createFixture();
        cardsService.writeInBatch(cards, () => ([
            { id: 'c1', deckId: 'd1', day: '01', tags: [], rank: 3 },
            { id: 'c2', deckId: 'd1', day: '01', tags: [], rank: 1 },
            { id: 'c3', deckId: 'd1', day: '01', tags: [], rank: 2 },
        ]).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));
        db.flush();

        const bucket = bucketAt('q');
        const slots = ['c1', 'c2', 'c3'].map(id => cardsService.getSlotByKey(cards, id));
        membersService.writeSlotContent(bucket, slots);
        db.flush();
        membersService.writeSlotContent(bucket, [slots[1], slots[2], slots[0]]);
        db.flush();
        expect(idsOf(membersService.getBucketMemberSlots(bucket))).toEqual(['c2', 'c3', 'c1']);

        membersService.writeSlotContent(bucket, [slots[0], slots[1]]);
        db.flush();
        expect(idsOf(membersService.getBucketMemberSlots(bucket))).toEqual(['c1', 'c2']);
        expect(membersService.getBucketMemberSlotCount(bucket)).toBe(2);
        expect(bucket.bucketSlotsStore.uniqueBucketMemberSlots!.size).toBe(2);
    });
});
