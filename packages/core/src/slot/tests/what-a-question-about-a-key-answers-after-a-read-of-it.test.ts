import { OIMDB } from '../../db/OIMDB';
import { OIMSlotContentSetBucketService } from '../../bucket/OIMSlotContentSetBucketService';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../createOIMSlotCollectionService';

type TCard = { id: string; title: string };

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard, string>(db) });
    const cards = cardsService.createStoreSlot(db);
    return { db, cardsService, cards };
};

describe('what a question about a key answers after a read of it', () => {
    it('says a key is not there when nothing was ever written under it', () => {
        const { cardsService, cards } = createFixture();

        expect(cardsService.hasSlotContentByKey(cards, 'c1')).toBe(false);
    });

    it('says a key is not there after a read minted an identity under it', () => {
        const { cardsService, cards } = createFixture();

        cardsService.getSlotByKey(cards, 'c1');

        expect(cardsService.hasSlotContentByKey(cards, 'c1')).toBe(false);
    });

    it('says a key is not there after a hold minted an identity under it', () => {
        const { cardsService, cards } = createFixture();

        cardsService.holdSlotByKey(cards, 'c1');

        expect(cardsService.hasSlotContentByKey(cards, 'c1')).toBe(false);
    });

    it('says a key is there once a value was written under it', () => {
        const { cardsService, cards, db } = createFixture();

        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'A' });
        db.flush();

        expect(cardsService.hasSlotContentByKey(cards, 'c1')).toBe(true);
    });

    it('says a key is not there once the value was taken away', () => {
        const { cardsService, cards, db } = createFixture();
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'A' });
        db.flush();

        const held = cardsService.holdSlotByKey(cards, 'c1');
        cardsService.slotContentService.clearSlotContent(held);
        db.flush();

        expect(cardsService.hasSlotContentByKey(cards, 'c1')).toBe(false);
        held.owner.unholdSlot(held);
    });

    it('says a bucket is not there while it carries no slot', () => {
        const { db, cardsService, cards } = createFixture();
        const bucketsService = createOIMSlotCollectionService(db, { slotContentService: new OIMSlotContentSetBucketService<TOIMEntitySlot<TCard, string>>() });
        const buckets = bucketsService.createStoreSlot(db);
        const card = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'A' });

        const bucket = bucketsService.holdSlotByKey(buckets, 'b1');
        expect(bucketsService.hasSlotContentByKey(buckets, 'b1')).toBe(false);

        bucketsService.slotContentService.addBucketMemberSlots(bucket, [card]);
        expect(bucketsService.hasSlotContentByKey(buckets, 'b1')).toBe(true);
    });
});
