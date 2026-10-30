import { OIMDB } from '../../db/OIMDB';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { OIMSlotContentPositionalArrayBucketService } from '../OIMSlotContentPositionalArrayBucketService';
import { OIMSlotContentSortedArrayBucketService } from '../OIMSlotContentSortedArrayBucketService';
import { OIMBucketUniqueMemberSlotsArrayService } from '../array/OIMBucketUniqueMemberSlotsArrayService';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';

type TCard = { id: string; rank: number };
type TCardSlot = TOIMEntitySlot<TCard, string>;

function setUp() {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService(db, {
        slotContentService: createOIMSlotContentEntityService<TCard, string>(db),
    });
    const cards = cardsService.createStoreSlot(db);
    const ace = cardsService.writeSlotContentByKey(cards, 'ace', { id: 'ace', rank: 1 });
    const king = cardsService.writeSlotContentByKey(cards, 'king', { id: 'king', rank: 13 });
    return { db, ace, king };
}

describe('a positional array bucket', () => {
    it('keeps every mention when handed nothing', () => {
        const { db, ace } = setUp();
        const decksService = createOIMSlotCollectionService(db, { slotContentService: new OIMSlotContentPositionalArrayBucketService<TCardSlot, string>() });
        const decks = decksService.createStoreSlot(db);

        const spades = decksService.writeSlotContentByKey(decks, 'spades', [ace, ace]);

        expect(decksService.slotContentService.getBucketMemberSlotCount(spades)).toBe(2);
    });

    it('keeps each slot once when handed the unique member slots service', () => {
        const { db, ace, king } = setUp();
        const decksService = createOIMSlotCollectionService(db, { slotContentService: new OIMSlotContentPositionalArrayBucketService<TCardSlot, string>({
            bucketMemberSlotsArrayService: new OIMBucketUniqueMemberSlotsArrayService(),
        }) });
        const decks = decksService.createStoreSlot(db);

        const spades = decksService.writeSlotContentByKey(decks, 'spades', [ace, king, ace]);
        decksService.slotContentService.insertBucketMemberSlotAt(spades, 0, king);

        expect([...decksService.slotContentService.getBucketMemberSlots(spades)]).toEqual([ace, king]);
        expect(decksService.slotContentService.hasBucketMemberSlot(spades, king)).toBe(true);
    });
});

describe('a sorted array bucket', () => {
    it('is unique and sorted at once when handed the unique member slots service', () => {
        const { db, ace, king } = setUp();
        const decksService = createOIMSlotCollectionService(db, { slotContentService: new OIMSlotContentSortedArrayBucketService<TCardSlot, string>({
            compareBucketMemberSlots: (left, right) => (right.entity?.rank ?? 0) - (left.entity?.rank ?? 0),
            bucketMemberSlotsArrayService: new OIMBucketUniqueMemberSlotsArrayService(),
        }) });
        const decks = decksService.createStoreSlot(db);

        const spades = decksService.writeSlotContentByKey(decks, 'spades', [ace, king, ace]);

        expect([...decksService.slotContentService.getBucketMemberSlots(spades)]).toEqual([king, ace]);
    });
});
