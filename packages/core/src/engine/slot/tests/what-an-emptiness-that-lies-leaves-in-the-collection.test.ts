import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';

import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { OIMUnusedSlotCollectorService } from '../../collector/OIMUnusedSlotCollectorService';
import { oimIsSlotEmpty } from '../utils/oimIsSlotEmpty';
import { oimIsSlotReleased } from '../utils/oimIsSlotReleased';

type TCard = { id: string; title: string };

const collectionCalling = (isEmpty: (slot: TOIMEntitySlot<TCard, TOIMStoreKey>) => boolean) => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, {
        keyOf: (card: TCard) => card.id,
        slotEmptiness: { isEmpty },
    });
    const cards = cardsService.createStoreSlot(db);
    return { db, cardsService, cards };
};

describe('an emptiness the collection was handed', () => {
    it('marks a row it calls empty as empty, while the store still files it', () => {
        const { cardsService, cards } = collectionCalling(() => true);

        const slot = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'alpha' });

        expect(oimIsSlotEmpty(slot)).toBe(true);
        expect(cardsService.getSlotByKey(cards, 'c1')).toBe(slot);
    });

    it('leaves nothing filed for a released row, whatever it calls empty', () => {
        const { db, cardsService, cards } = collectionCalling(() => true);

        const slot = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'alpha' });
        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);

        expect(oimIsSlotReleased(slot)).toBe(true);
        expect(cardsService.getSlotCount(cards)).toBe(0);
        expect(Array.from(cardsService.getSlots(cards))).not.toContain(slot);
    });

    it('calls the row full when it answers on the stored record, and lets it go on the removal', () => {
        const { cardsService, cards } = collectionCalling(slot => slot.entity === undefined);

        const slot = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'alpha' });

        expect(cardsService.getSlotByKey(cards, 'c1')).toBe(slot);
        expect(oimIsSlotEmpty(slot)).toBe(false);

        cardsService.slotContentService.deleteEntity(slot);

        expect(oimIsSlotReleased(slot)).toBe(true);
        expect(oimIsSlotEmpty(slot)).toBe(true);
        expect(cardsService.getSlotCount(cards)).toBe(0);
    });
});
