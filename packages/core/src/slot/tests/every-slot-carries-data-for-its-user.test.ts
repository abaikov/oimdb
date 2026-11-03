import {
    OIMDB, OIMSetBucketContentService, createOIMEntitySlotCollectionStoreAggregate, createOIMSingleComputedService,
    createOIMSlotCollectionService,
} from '@oimdb/core';

type TCard = { id: string; title: string };

describe('every slot carries data for its user', () => {
    it('starts empty on an entity, a bucket, a computed and a column slot, and keeps what the user put there across writes', () => {
        const db = new OIMDB();
        const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
        const card = cards.holdSlotByKey('c');
        const bucketsService = createOIMSlotCollectionService({ slotContentService: new OIMSetBucketContentService() });
        const buckets = bucketsService.createStoreSlot(db);
        const bucket = bucketsService.holdSlotByKey(buckets, 'b');
        const titleService = createOIMSingleComputedService<string>();
        const title = titleService.createStoreSlot(db, () => card.entity?.title ?? '', () => ({ sourceSlots: [card] }));
        const titleSlot = titleService.holdSingleSlot(title);
        const titleColumn = card.holdColumnSlot('title');

        const slots = [card, bucket, titleSlot, titleColumn];
        expect(slots.map(slot => slot.data)).toEqual([undefined, undefined, undefined, undefined]);

        for (const slot of slots) slot.data = ['cached'];
        card.writeSlotContent({ id: 'c', title: 'Ace' });
        bucket.addBucketMemberSlot(card);
        db.flush();
        void titleSlot.value;
        expect(slots.map(slot => slot.data)).toEqual([['cached'], ['cached'], ['cached'], ['cached']]);
    });
});
