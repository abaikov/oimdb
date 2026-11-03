import { OIMDB } from '../../db/OIMDB';
import { createOIMSlotCollectionIndexService } from '../../index/createOIMSlotCollectionIndexService';
import { OIMSetBucketContentService } from '../../bucket/OIMSetBucketContentService';
import { isOIMSlotReleased } from '../utils/isOIMSlotReleased';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../createOIMSlotCollectionService';

type TCard = { id: string; deck: string; rank: number };

describe('a column getter on an aggregate', () => {
    it('returns the column slot a hold files, and mints nothing new for it', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        const ace = cardsService.writeSlotContentByKey(cards, 'ace', { id: 'ace', deck: 'spades', rank: 1 });
        const heldRank = cardsService.columnSlotService.holdColumnSlot(ace, 'rank');

        expect(cardsService.columnSlotService.getColumnSlot(ace, 'rank')).toBe(heldRank);
    });

    it('gives back a column slot it minted at the end of the next flush', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        const ace = cardsService.writeSlotContentByKey(cards, 'ace', { id: 'ace', deck: 'spades', rank: 1 });
        const rank = cardsService.columnSlotService.getColumnSlot(ace, 'rank');
        db.flush();

        expect(isOIMSlotReleased(rank)).toBe(true);
        expect(cardsService.columnSlotService.getColumnSlot(ace, 'rank')).not.toBe(rank);
    });

    it('is the door an index reads its bucket column slots through', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createOIMSlotCollectionIndexService({
            entityService: cardsService,
            selectKey: (card: TCard) => card.deck,
            slotContentService: new OIMSetBucketContentService<TOIMEntitySlot<TCard>>(),
        });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        cardsService.writeSlotContentByKey(cards, 'ace', { id: 'ace', deck: 'spades', rank: 1 });
        const heldRank = byDeckService.holdBucketColumnSlotByKey(byDeck, 'spades', 'rank');

        expect(byDeckService.getBucketColumnSlotByKey(byDeck, 'spades', 'rank')).toBe(heldRank);
    });
});
