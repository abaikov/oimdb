import { OIMDB } from '../../../factories/OIMDB';
import { createOIMSlotCollectionService } from '../../../factories/createOIMSlotCollectionService';
import { createOIMSingleSlotService } from '../../../factories/createOIMSingleSlotService';
import { createOIMSlotContentEntityService } from '../../../factories/createOIMSlotContentEntityService';
import { OIMSlotContentSetBucketService } from '../../bucket/OIMSlotContentSetBucketService';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';

type TCard = { id: string; title: string };
type TSettings = { theme: string };

describe('the collection factory', () => {
    it('takes the key, the slot and the content from the content service it is handed', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService(db, {
            slotContentService: createOIMSlotContentEntityService<TCard, string>(db),
        });
        const cards = cardsService.createStoreSlot(db);

        const cardSlot: TOIMEntitySlot<TCard, string> = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'Ace' });

        expect(cardSlot.key).toBe('c1');
        expect(cardSlot.entity?.title).toBe('Ace');
    });

    it('builds a collection of buckets from a bucket content service the same way', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService(db, {
            slotContentService: createOIMSlotContentEntityService<TCard, string>(db),
        });
        const cards = cardsService.createStoreSlot(db);
        const decksService = createOIMSlotCollectionService(db, {
            slotContentService: new OIMSlotContentSetBucketService<TOIMEntitySlot<TCard, string>, string>(),
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
        const settingsService = createOIMSingleSlotService(db, {
            slotContentService: createOIMSlotContentEntityService<TSettings>(db),
        });
        const settings = settingsService.createStoreSlot(db);

        settingsService.writeSingleSlotContent(settings, { theme: 'dark' });

        expect(settingsService.getSingleSlot(settings).entity?.theme).toBe('dark');
    });
});
