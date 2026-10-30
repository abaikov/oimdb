import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { oimIsSlotEmpty } from '../../slot/utils/oimIsSlotEmpty';
import { createOIMSlotContentEntityService } from '../createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; title: string };

const createFixture = () => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard, string>(db) });
    const cards = cardsService.createStoreSlot(db);
    return { db, effectService, cardsService, cards };
};

describe('a clear of an identity that holds nothing', () => {
    it('wakes nobody watching the row', () => {
        const { db, effectService, cardsService, cards } = createFixture();
        const card = cardsService.holdSlotByKey(cards, 'c1');

        let runCount = 0;
        const watching = effectService.createEffect(db, () => { runCount++; }, [card]);
        db.flush();
        const before = runCount;

        cardsService.slotContentService.clearSlotContent(card);
        db.flush();

        expect(runCount).toBe(before);
        expect(oimIsSlotEmpty(card)).toBe(true);
        effectService.disposeEffect(watching);
        card.owner.unholdSlot(card);
    });

    it('wakes once for the removal that took the value, and not again for the next', () => {
        const { db, effectService, cardsService, cards } = createFixture();
        const card = cardsService.holdSlotByKey(cards, 'c1');
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
        db.flush();

        let runCount = 0;
        const watching = effectService.createEffect(db, () => { runCount++; }, [card]);
        db.flush();
        const before = runCount;

        cardsService.slotContentService.clearSlotContent(card);
        db.flush();
        expect(runCount).toBe(before + 1);
        expect(cardsService.getSlotByKey(cards, 'c1')).toBe(card);
        expect(oimIsSlotEmpty(card)).toBe(true);

        cardsService.slotContentService.clearSlotContent(card);
        db.flush();

        expect(runCount).toBe(before + 1);
        effectService.disposeEffect(watching);
        card.owner.unholdSlot(card);
    });
});
