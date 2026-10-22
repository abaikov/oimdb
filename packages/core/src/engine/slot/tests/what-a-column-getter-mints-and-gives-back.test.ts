import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMIndexService } from '../../../factories/createOIMIndexService';
import { OIMSlotContentBucketServiceSetDriven } from '../../../facade/bucket/OIMSlotContentBucketServiceSetDriven';
import { oimIsSlotReleased } from '../utils/oimIsSlotReleased';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';

type TCard = { id: string; deck: string; rank: number };

describe('a column getter on an aggregate', () => {
    it('returns the column slot a hold files, and mints nothing new for it', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const ace = cardsService.slotContentService.upsertEntity(cards, { id: 'ace', deck: 'spades', rank: 1 });
        const heldRank = cardsService.holdColumn(ace, 'rank');

        expect(cardsService.getColumn(ace, 'rank')).toBe(heldRank);
    });

    it('gives back a column slot it minted at the end of the next flush', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const ace = cardsService.slotContentService.upsertEntity(cards, { id: 'ace', deck: 'spades', rank: 1 });
        const rank = cardsService.getColumn(ace, 'rank');
        db.flush();

        expect(oimIsSlotReleased(rank)).toBe(true);
        expect(cardsService.getColumn(ace, 'rank')).not.toBe(rank);
    });

    it('is the door an index reads its bucket column slots through', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createOIMIndexService(db, {
            entityService: cardsService,
            keyOf: (card: TCard) => card.deck,
            slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard>>(),
        });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        cardsService.slotContentService.upsertEntity(cards, { id: 'ace', deck: 'spades', rank: 1 });
        const heldRank = byDeckService.holdBucketColumnByKey(byDeck, 'spades', 'rank');

        expect(byDeckService.getBucketColumnByKey(byDeck, 'spades', 'rank')).toBe(heldRank);
    });
});
