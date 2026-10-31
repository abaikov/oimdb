import { OIMDB } from '../../../db/OIMDB';
import { OIMBucketUniqueMemberSlotsArrayService } from '../OIMBucketUniqueMemberSlotsArrayService';
import { OIMPositionalArrayBucketContentService } from '../../OIMPositionalArrayBucketContentService';
import type { TOIMEntitySlot } from '../../../entity/types/TOIMEntitySlot';
import { createOIMEntityContentService } from '../../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../../slot/createOIMSlotCollectionService';
import { bucketSlotsStoreOf } from '../../../../tests/support/bucketSlotsStoreOf';

type TCard = { id: string; rank: number };
type TCardSlot = TOIMEntitySlot<TCard>;

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
    const cards = cardsService.createStoreSlot(db);
    const cardSlot = (id: string, rank: number): TCardSlot => cardsService.writeSlotContentByKey(cards, id, { id, rank });
    const service = new OIMPositionalArrayBucketContentService<TCardSlot>({ bucketMemberSlotsArrayService: new OIMBucketUniqueMemberSlotsArrayService() });
    const decksService = createOIMSlotCollectionService({ slotContentService: service });
    const decks = decksService.createStoreSlot(db);
    const bucket = decksService.holdSlotByKey(decks, 'deck');
    return { cardSlot, service, bucket, slots: bucketSlotsStoreOf<TCardSlot>(bucket) };
};

describe('a removal the storage has nothing to give up for', () => {
    it('does not scan the list for a slot the storage refused', () => {
        const fixture = createFixture();
        const held = fixture.cardSlot('c1', 1);
        fixture.service.addBucketMemberSlot(fixture.bucket, held);
        const stranger = fixture.cardSlot('c9', 9);
        const changedAtRevision = fixture.bucket.changedAtRevision;

        fixture.service.removeBucketMemberSlot(fixture.bucket, stranger);
        expect(fixture.bucket.changedAtRevision).toBe(changedAtRevision);
        const listed = Array.from(fixture.slots.bucketMemberSlots);
        expect(listed.length).toBe(1);
        expect(listed[0] === held).toBe(true);
        expect(fixture.slots.uniqueBucketMemberSlots!.has(held)).toBe(true);
    });

    it('leaves a departure it does hold exactly as it was', () => {
        const fixture = createFixture();
        const first = fixture.cardSlot('c1', 1);
        const second = fixture.cardSlot('c2', 2);
        fixture.service.addBucketMemberSlot(fixture.bucket, first);
        fixture.service.addBucketMemberSlot(fixture.bucket, second);

        expect(fixture.service.getBucketMemberSlotPosition(fixture.bucket, second)).toBe(1);
        fixture.service.removeBucketMemberSlot(fixture.bucket, second);
        const listed = Array.from(fixture.slots.bucketMemberSlots);
        expect(listed.length).toBe(1);
        expect(listed[0] === first).toBe(true);
        expect(fixture.slots.uniqueBucketMemberSlots!.has(second)).toBe(false);
    });
});
