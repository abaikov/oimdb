import { OIMDB } from '../../db/OIMDB';
import { OIMSetBucketContentService } from '../../bucket/OIMSetBucketContentService';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import { createOIMSlotCollectionService } from '../createOIMSlotCollectionService';

type TCard = { id: string; title: string };

const createFixture =() => {
    const db = new OIMDB();
    const byDeckService = createOIMSlotCollectionService({ slotContentService: new OIMSetBucketContentService<TOIMEntitySlot<TCard, TOIMStoreKey>>() });
    const byDeck = byDeckService.createStoreSlot(db);
    return { db, byDeck, byDeckService };
};

describe('a write addressed by key, when what it writes lands empty', () => {
    it('and the slot door reaches the same state from the same content', () => {
        const { byDeck, byDeckService } = createFixture();
        const throughTheSlotDoor = byDeckService.holdSlotByKey(byDeck, 'deck');

        byDeckService.slotContentService.writeSlotContent(throughTheSlotDoor, []);
        throughTheSlotDoor.owner.unholdSlot(throughTheSlotDoor);

        expect(byDeckService.getSlotCount(byDeck)).toBe(0);
    });
});
