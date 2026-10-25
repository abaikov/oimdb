import { OIMDB } from '../../../../factories/OIMDB';
import { OIMSlotContentPositionalArrayBucketService } from '../../../../facade/bucket/OIMSlotContentPositionalArrayBucketService';
import type { TOIMEntitySlot } from '../../../entity/types/TOIMEntitySlot';
import { createOIMSlotContentEntityService } from '../../../../factories/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../../../factories/createOIMSlotCollectionService';

type Card = { id: string };
type TCardSlot = TOIMEntitySlot<Card>;

const REFUSAL = 'a position must be a whole number';

const openBucket = () => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<Card>(db) });
    const cards = cardsService.createStoreSlot(db);
    const cardSlot = (id: string): TCardSlot => cardsService.writeSlotContentByKey(cards, id, { id });
    const membersService = new OIMSlotContentPositionalArrayBucketService<TCardSlot>();
    const pageService = createOIMSlotCollectionService(db, { slotContentService: membersService });
    const page = pageService.createStoreSlot(db);
    const bucketSlot = pageService.holdSlotByKey(page, 'page');
    for (const id of ['a', 'b', 'c']) membersService.addBucketMemberSlot(bucketSlot, cardSlot(id));
    const ids = (): string[] => [...membersService.getBucketMemberSlots(bucketSlot)].map(slot => slot.entity!.id);
    return { db, cardSlot, membersService, bucketSlot, ids };
};

describe('what a position that is not a whole number does', () => {
    it.each([NaN, 1.5])('refuses removeAt(%p) and leaves the list as it was', at => {
        const { membersService, bucketSlot, ids } = openBucket();

        expect(() => membersService.removeBucketMemberSlotAt(bucketSlot, at)).toThrow(REFUSAL);

        expect(ids()).toEqual(['a', 'b', 'c']);
    });

    it.each([NaN, 1.5])('refuses insertAt(%p) and leaves the list as it was', at => {
        const { cardSlot, membersService, bucketSlot, ids } = openBucket();

        expect(() => membersService.insertBucketMemberSlotAt(bucketSlot, at, cardSlot('d'))).toThrow(REFUSAL);

        expect(ids()).toEqual(['a', 'b', 'c']);
    });

    it.each([[NaN, 1], [1.5, 1], [1, 0.5]])('refuses removeRange(%p, %p) and leaves the list as it was', (at, count) => {
        const { membersService, bucketSlot, ids } = openBucket();

        expect(() => membersService.removeBucketMemberSlotRange(bucketSlot, at, count)).toThrow(REFUSAL);

        expect(ids()).toEqual(['a', 'b', 'c']);
    });

    it.each([[NaN, 2], [0.5, 2], [0, 1.5]])('refuses moveToPosition(%p, %p) and leaves the list as it was', (from, to) => {
        const { membersService, bucketSlot, ids } = openBucket();

        expect(() => membersService.moveBucketMemberSlotToPosition(bucketSlot, from, to)).toThrow(REFUSAL);

        expect(ids()).toEqual(['a', 'b', 'c']);
    });

    it.each([[NaN, 1, 2], [0, 1.5, 2], [0, 1, 1.5]])(
        'refuses moveRangeToPosition(%p, %p, %p) and leaves the list as it was',
        (from, count, to) => {
            const { membersService, bucketSlot, ids } = openBucket();

            expect(() => membersService.moveBucketMemberSlotRangeToPosition(bucketSlot, from, count, to)).toThrow(REFUSAL);

            expect(ids()).toEqual(['a', 'b', 'c']);
        },
    );

    it('still clamps an infinite position to the end of the list', () => {
        const { cardSlot, membersService, bucketSlot, ids } = openBucket();

        membersService.insertBucketMemberSlotAt(bucketSlot, Infinity, cardSlot('d'));

        expect(ids()).toEqual(['a', 'b', 'c', 'd']);
    });

    it('keeps the row, its hold and the bucket untouched when a collection door is refused', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<Card>(db) });
        const cards = cardsService.createStoreSlot(db);
        const membersService = new OIMSlotContentPositionalArrayBucketService<TCardSlot>();
        const pageService = createOIMSlotCollectionService(db, { slotContentService: membersService });
        const page = pageService.createStoreSlot(db);
        const bucket = pageService.holdSlotByKey(page, 'p');
        const first = cardsService.writeSlotContentByKey(cards, 'a', { id: 'a' });
        membersService.insertBucketMemberSlotAt(bucket, 0, first);
        db.flush();
        const holdsBefore = first.holdCount;

        expect(() => membersService.removeBucketMemberSlotAt(bucket, NaN)).toThrow(REFUSAL);
        db.flush();

        expect(membersService.getBucketMemberSlotAt(bucket, 0)).toBe(first);
        expect(first.holdCount).toBe(holdsBefore);
        bucket.owner.unholdSlot(bucket);
    });
});
