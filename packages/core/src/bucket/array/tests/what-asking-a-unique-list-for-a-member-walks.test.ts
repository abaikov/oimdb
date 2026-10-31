import { OIMDB } from '../../../db/OIMDB';
import { OIMSlotContentPositionalArrayBucketService } from '../../OIMSlotContentPositionalArrayBucketService';
import { OIMBucketUniqueMemberSlotsArrayService } from '../OIMBucketUniqueMemberSlotsArrayService';
import type { TOIMEntitySlot } from '../../../entity/types/TOIMEntitySlot';
import { createOIMSlotContentEntityService } from '../../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../../slot/createOIMSlotCollectionService';

type TCard = { id: string };
type TCardSlot = TOIMEntitySlot<TCard>;

const createFixture = (membersService: OIMSlotContentPositionalArrayBucketService<TCardSlot>) => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard>() });
    const cards = cardsService.createStoreSlot(db);
    const decksService = createOIMSlotCollectionService({ slotContentService: membersService });
    const decks = decksService.createStoreSlot(db);
    const bucketSlot = decksService.holdSlotByKey(decks, 'deck');
    const memberSlots: TCardSlot[] = [];
    for (let i = 0; i < 100; i++) memberSlots.push(cardsService.writeSlotContentByKey(cards, `c${i}`, { id: `c${i}` }));
    for (let i = 0; i < memberSlots.length; i++) membersService.addBucketMemberSlot(bucketSlot, memberSlots[i]);
    const stranger = cardsService.writeSlotContentByKey(cards, 'stranger', { id: 'stranger' });
    return { membersService, bucketSlot, memberSlots, stranger };
};

describe('what asking a list for a member walks', () => {
    it('a unique list answers from its set and walks no array', () => {
        const { membersService, bucketSlot, memberSlots, stranger } = createFixture(
            new OIMSlotContentPositionalArrayBucketService<TCardSlot>({ bucketMemberSlotsArrayService: new OIMBucketUniqueMemberSlotsArrayService() }) as OIMSlotContentPositionalArrayBucketService<TCardSlot>,
        );
        const indexOf = jest.spyOn(Array.prototype, 'indexOf');

        const hasLast = membersService.hasBucketMemberSlot(bucketSlot, memberSlots[99]);
        const hasStranger = membersService.hasBucketMemberSlot(bucketSlot, stranger);
        const indexOfCount = indexOf.mock.calls.length;
        indexOf.mockRestore();

        expect({ hasLast, hasStranger, indexOfCount }).toEqual({ hasLast: true, hasStranger: false, indexOfCount: 0 });
    });

    it('a list that may hold a member twice still answers by walking the array', () => {
        const { membersService, bucketSlot, memberSlots, stranger } = createFixture(new OIMSlotContentPositionalArrayBucketService<TCardSlot>());

        expect(membersService.hasBucketMemberSlot(bucketSlot, memberSlots[99])).toBe(true);
        expect(membersService.hasBucketMemberSlot(bucketSlot, stranger)).toBe(false);
    });
});
