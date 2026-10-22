import { OIMDB } from '../../../../factories/OIMDB';
import { createOIMEntityService } from '../../../../factories/createOIMEntityService';
import { createOIMBucketService } from '../../../../factories/createOIMBucketService';
import { OIMSlotContentBucketServiceArrayDriven } from '../../../../facade/bucket/OIMSlotContentBucketServiceArrayDriven';
import { OIMBucketArrayMembershipUnique } from '../OIMBucketArrayMembershipUnique';
import type { TOIMEntitySlot } from '../../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../store/types/TOIMStoreKey';
import type { TOIMBucketSlotsArrayUniqueStore } from '../types/TOIMBucketSlotsArrayUniqueStore';

type TCard = { id: string; rank: number };
type TCardSlot = TOIMEntitySlot<TCard>;
type TCardSlots = TOIMBucketSlotsArrayUniqueStore<TCardSlot>;

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const cardSlot = (id: string, rank: number): TCardSlot => cardsService.slotContentService.upsertEntity(cards, { id, rank });
    const service = new OIMSlotContentBucketServiceArrayDriven<TCardSlot, TCardSlots>({
        bucketArrayMembership: new OIMBucketArrayMembershipUnique<TCardSlot>(),
    });
    const decksService = createOIMBucketService<
        TCardSlot, TOIMStoreKey, TCardSlots, OIMSlotContentBucketServiceArrayDriven<TCardSlot, TCardSlots>
    >(db, { slotContentService: service });
    const decks = decksService.createStoreSlot(db);
    const bucket = decksService.holdSlotByKey(decks, 'deck');
    return { cardSlot, service, bucket, slots: bucket.bucketSlotsStore };
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
        expect(fixture.slots.uniqueBucketMemberSlots.has(held)).toBe(true);
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
        expect(fixture.slots.uniqueBucketMemberSlots.has(second)).toBe(false);
    });
});
