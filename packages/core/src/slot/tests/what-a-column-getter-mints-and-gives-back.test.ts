import { OIMDB } from '../../db/OIMDB';
import { createOIMSlotCollectionIndexService } from '../../index/createOIMSlotCollectionIndexService';
import { OIMSlotContentSetBucketService } from '../../bucket/OIMSlotContentSetBucketService';
import { oimIsSlotReleased } from '../utils/oimIsSlotReleased';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../createOIMSlotCollectionService';

type TCard = { id: string; deck: string; rank: number };

describe('a column getter on an aggregate', () => {
    it('returns the column slot a hold files, and mints nothing new for it', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        const ace = cardsService.writeSlotContentByKey(cards, 'ace', { id: 'ace', deck: 'spades', rank: 1 });
        const heldRank = cardsService.columnSlotService.holdColumn(ace, 'rank');

        expect(cardsService.columnSlotService.getColumn(ace, 'rank')).toBe(heldRank);
    });

    it('gives back a column slot it minted at the end of the next flush', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        const ace = cardsService.writeSlotContentByKey(cards, 'ace', { id: 'ace', deck: 'spades', rank: 1 });
        const rank = cardsService.columnSlotService.getColumn(ace, 'rank');
        db.flush();

        expect(oimIsSlotReleased(rank)).toBe(true);
        expect(cardsService.columnSlotService.getColumn(ace, 'rank')).not.toBe(rank);
    });

    it('is the door an index reads its bucket column slots through', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createOIMSlotCollectionIndexService({
            entityService: cardsService,
            keyOf: (card: TCard) => card.deck,
            slotContentService: new OIMSlotContentSetBucketService<TOIMEntitySlot<TCard>>(),
        });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        cardsService.writeSlotContentByKey(cards, 'ace', { id: 'ace', deck: 'spades', rank: 1 });
        const heldRank = byDeckService.holdBucketColumnByKey(byDeck, 'spades', 'rank');

        expect(byDeckService.getBucketColumnByKey(byDeck, 'spades', 'rank')).toBe(heldRank);
    });
});
