import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import { OIMDB } from '../../db/OIMDB';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionStoreAggregate } from '../../slot/createOIMSlotCollectionStoreAggregate';
import { createOIMSlotCollectionIndexService } from '../createOIMSlotCollectionIndexService';
import { createOIMSlotCollectionIndexStoreAggregate } from '../createOIMSlotCollectionIndexStoreAggregate';
import { OIMSetBucketContentService } from '../../bucket/OIMSetBucketContentService';
import { OIMSlotCollectionIndexStoreAggregate } from '../OIMSlotCollectionIndexStoreAggregate';

type TCard = { id: string; deck: string };

const createFixture = () => {
    const db = new OIMDB();
    const cardStoreAggregate = createOIMSlotCollectionStoreAggregate(db, {
        slotContentService: createOIMEntityContentService<TCard>(),
    });
    cardStoreAggregate.writeSlotContentByKey('c1', { id: 'c1', deck: 'spades' });
    cardStoreAggregate.writeSlotContentByKey('c2', { id: 'c2', deck: 'spades' });
    cardStoreAggregate.writeSlotContentByKey('c3', { id: 'c3', deck: 'clubs' });
    db.flush();
    const byDeckService = createOIMSlotCollectionIndexService({ entityService: cardStoreAggregate.slotService, columns: ['deck'] });
    const byDeckStoreSlot = byDeckService.createIndexStoreSlot(cardStoreAggregate.storeSlot);
    const byDeckStoreAggregate = byDeckService.createStoreAggregate(byDeckStoreSlot);
    return { db, cardStoreAggregate, byDeckService, byDeckStoreSlot, byDeckStoreAggregate };
};

describe('what an index store aggregate reads', () => {
    it('reads the buckets of its index store slot', () => {
        const { byDeckService, byDeckStoreSlot, byDeckStoreAggregate } = createFixture();

        expect(byDeckStoreAggregate).toBeInstanceOf(OIMSlotCollectionIndexStoreAggregate);
        expect(byDeckStoreAggregate.storeSlot).toBe(byDeckStoreSlot);
        expect(byDeckStoreAggregate.getEntitiesByKey('spades').map(card => card?.id).sort()).toEqual(['c1', 'c2']);
        expect(byDeckStoreAggregate.getSlotByKey('clubs')).toBe(byDeckService.getSlotByKey(byDeckStoreSlot, 'clubs'));
        expect(byDeckStoreAggregate.getSlotsByKeys(['spades', 'clubs'])).toEqual([
            byDeckService.getSlotByKey(byDeckStoreSlot, 'spades'), byDeckService.getSlotByKey(byDeckStoreSlot, 'clubs'),
        ]);
    });

    it('follows a write to the source collection after the flush', () => {
        const { db, cardStoreAggregate, byDeckStoreAggregate } = createFixture();
        const clubs = byDeckStoreAggregate.holdSlotByKey('clubs');

        cardStoreAggregate.writeSlotContentByKey('c4', { id: 'c4', deck: 'clubs' });
        db.flush();

        expect(byDeckStoreAggregate.getEntitiesByKey('clubs').map(card => card?.id).sort()).toEqual(['c3', 'c4']);
        expect(byDeckStoreAggregate.slotContentService.getBucketMemberSlotCount(clubs)).toBe(2);
    });

    it('disposes its index store slot', () => {
        const { byDeckStoreAggregate } = createFixture();

        byDeckStoreAggregate.disposeIndexStoreSlot();

        expect(byDeckStoreAggregate.storeSlot.isDisposed).toBe(true);
        expect(() => byDeckStoreAggregate.getSlotByKey('spades')).toThrow();
    });

    it('holds buckets and their columns through the same doors as the service', () => {
        const { byDeckService, byDeckStoreSlot, byDeckStoreAggregate } = createFixture();

        const held = byDeckStoreAggregate.holdSlotsByKeys(['spades', 'clubs']);
        const anyColumn = byDeckStoreAggregate.holdAnyBucketColumnSlotByKey('spades');
        const idColumn = byDeckStoreAggregate.holdBucketColumnSlotByKey('spades', 'id');

        expect(held).toEqual([byDeckService.getSlotByKey(byDeckStoreSlot, 'spades'), byDeckService.getSlotByKey(byDeckStoreSlot, 'clubs')]);
        expect(held.map(bucketSlot => bucketSlot.holdCount > 0)).toEqual([true, true]);
        expect(byDeckStoreAggregate.getAnyBucketColumnSlotByKey('spades')).toBe(anyColumn);
        expect(byDeckStoreAggregate.getBucketColumnSlotByKey('spades', 'id')).toBe(idColumn);
    });

    it('is built over a collection store aggregate in one call, with selectKey typed from the collection', () => {
        const { db, cardStoreAggregate } = createFixture();

        const byDeckStoreAggregate = createOIMSlotCollectionIndexStoreAggregate(cardStoreAggregate, { selectKey: (card) => card.deck });
        cardStoreAggregate.writeSlotContentByKey('c4', { id: 'c4', deck: 'clubs' });
        db.flush();

        expect(byDeckStoreAggregate).toBeInstanceOf(OIMSlotCollectionIndexStoreAggregate);
        expect(byDeckStoreAggregate.storeSlot.sourceStoreSlot).toBe(cardStoreAggregate.storeSlot);
        expect(byDeckStoreAggregate.getEntitiesByKey('spades').map(card => card?.id).sort()).toEqual(['c1', 'c2']);
        expect(byDeckStoreAggregate.getEntitiesByKey('clubs').map(card => card?.id).sort()).toEqual(['c3', 'c4']);
    });

    it('takes the bucket content service it is given', () => {
        const { cardStoreAggregate } = createFixture();
        const setBucketContentService = new OIMSetBucketContentService<TOIMEntitySlot<TCard>, string>();

        const byDeckStoreAggregate = createOIMSlotCollectionIndexStoreAggregate(cardStoreAggregate, {
            columns: ['deck'],
            slotContentService: setBucketContentService,
        });

        expect(byDeckStoreAggregate.slotContentService).toBe(setBucketContentService);
        expect(byDeckStoreAggregate.getSlotByKey('spades').getBucketMemberSlotCount()).toBe(2);
    });
});
