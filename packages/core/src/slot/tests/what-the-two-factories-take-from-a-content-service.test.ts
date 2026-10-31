import { OIMDB } from '../../db/OIMDB';
import { createOIMSlotCollectionService } from '../createOIMSlotCollectionService';
import { createOIMSingleSlotService } from '../createOIMSingleSlotService';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { OIMSetBucketContentService } from '../../bucket/OIMSetBucketContentService';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';

type TCard = { id: string; title: string };
type TSettings = { theme: string };

describe('the collection factory', () => {
    it('takes the key, the slot and the content from the content service it is handed', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({
            slotContentService: createOIMEntityContentService<TCard, string>(),
        });
        const cards = cardsService.createStoreSlot(db);

        const cardSlot: TOIMEntitySlot<TCard, string> = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'Ace' });

        expect(cardSlot.key).toBe('c1');
        expect(cardSlot.entity?.title).toBe('Ace');
    });

    it('builds a collection of buckets from a bucket content service the same way', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({
            slotContentService: createOIMEntityContentService<TCard, string>(),
        });
        const cards = cardsService.createStoreSlot(db);
        const decksService = createOIMSlotCollectionService({
            slotContentService: new OIMSetBucketContentService<TOIMEntitySlot<TCard, string>, string>(),
        });
        const decks = decksService.createStoreSlot(db);
        const c1 = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'Ace' });

        const spades = decksService.writeSlotContentByKey(decks, 'spades', [c1]);

        expect([...decksService.slotContentService.getBucketMemberSlots(spades)]).toEqual([c1]);
    });
});

describe('the single slot factory', () => {
    it('takes the slot and the content from the content service it is handed', () => {
        const db = new OIMDB();
        const settingsService = createOIMSingleSlotService({
            slotContentService: createOIMEntityContentService<TSettings>(),
        });
        const settings = settingsService.createStoreSlot(db);

        settingsService.writeSingleSlotContent(settings, { theme: 'dark' });

        expect(settingsService.getSingleSlot(settings).entity?.theme).toBe('dark');
    });
});
