import { OIMDB } from '../../../../factories/OIMDB';
import { createOIMEntityService } from '../../../../factories/createOIMEntityService';
import { createOIMBucketService } from '../../../../factories/createOIMBucketService';
import { OIMSlotContentBucketServiceArrayDriven } from '../../../../facade/bucket/OIMSlotContentBucketServiceArrayDriven';
import { OIMBucketArrayMembershipUnique } from '../OIMBucketArrayMembershipUnique';
import { OIMBucketArrayMembershipNonUnique } from '../OIMBucketArrayMembershipNonUnique';
import type { IOIMBucketArrayMembership } from '../interfaces/IOIMBucketArrayMembership';
import type { TOIMBucketSlotsArrayStore } from '../types/TOIMBucketSlotsArrayStore';
import type { TOIMEntitySlot } from '../../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../store/types/TOIMStoreKey';

type TCard = { id: string };
type TCardSlot = TOIMEntitySlot<TCard>;
type TSlots = TOIMBucketSlotsArrayStore<TCardSlot>;

const createFixture = (bucketArrayMembership: IOIMBucketArrayMembership<TCardSlot, TSlots>) => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const membersService = new OIMSlotContentBucketServiceArrayDriven<TCardSlot, TSlots>({ bucketArrayMembership });
    const decksService = createOIMBucketService<
        TCardSlot, TOIMStoreKey, TSlots, OIMSlotContentBucketServiceArrayDriven<TCardSlot, TSlots>
    >(db, { slotContentService: membersService });
    const decks = decksService.createStoreSlot(db);
    const bucketSlot = decksService.holdSlotByKey(decks, 'deck');
    const memberSlots: TCardSlot[] = [];
    for (let i = 0; i < 100; i++) memberSlots.push(cardsService.slotContentService.upsertEntity(cards, { id: `c${i}` }));
    for (let i = 0; i < memberSlots.length; i++) membersService.addBucketMemberSlot(bucketSlot, memberSlots[i]);
    const stranger = cardsService.slotContentService.upsertEntity(cards, { id: 'stranger' });
    return { membersService, bucketSlot, memberSlots, stranger };
};

describe('what asking a list for a member walks', () => {
    it('a unique list answers from its set and walks no array', () => {
        const { membersService, bucketSlot, memberSlots, stranger } = createFixture(new OIMBucketArrayMembershipUnique());
        const indexOf = jest.spyOn(Array.prototype, 'indexOf');

        const hasLast = membersService.hasBucketMemberSlot(bucketSlot, memberSlots[99]);
        const hasStranger = membersService.hasBucketMemberSlot(bucketSlot, stranger);
        const indexOfCount = indexOf.mock.calls.length;
        indexOf.mockRestore();

        expect({ hasLast, hasStranger, indexOfCount }).toEqual({ hasLast: true, hasStranger: false, indexOfCount: 0 });
    });

    it('a list that may hold a member twice still answers by walking the array', () => {
        const { membersService, bucketSlot, memberSlots, stranger } = createFixture(new OIMBucketArrayMembershipNonUnique());

        expect(membersService.hasBucketMemberSlot(bucketSlot, memberSlots[99])).toBe(true);
        expect(membersService.hasBucketMemberSlot(bucketSlot, stranger)).toBe(false);
    });
});
