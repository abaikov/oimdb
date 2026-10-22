import {
    OIMDB,
    OIM_FROZEN_EMPTY_SLOTS,
    createOIMSingleEntityService,
    oimIsSlotReleased,
} from '../../../index';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';

type TCard = { id: string; title: string };

describe('a held column is given back through the same door that held it', () => {
    it('an entity collection hands back the column it held', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one' });
        const titleColumn = cardsService.holdColumn(card, 'title');
        expect(titleColumn.holdCount).toBe(1);
        cardsService.unholdColumn(titleColumn);
        expect(oimIsSlotReleased(titleColumn)).toBe(true);
    });

    it('a single entity hands back the column it held', () => {
        const db = new OIMDB();
        const settingsService = createOIMSingleEntityService<{ theme: string }>(db);
        const settings = settingsService.createStoreSlot(db);
        settingsService.slotContentService.upsertEntity(settings, { theme: 'dark' });
        const themeColumn = settingsService.holdColumn(settingsService.getSingleSlot(settings), 'theme');
        expect(themeColumn.holdCount).toBe(1);
        settingsService.unholdColumn(themeColumn);
        expect(oimIsSlotReleased(themeColumn)).toBe(true);
    });

    it('the frozen empty slot list is exported, and frozen', () => {
        expect(OIM_FROZEN_EMPTY_SLOTS).toEqual([]);
        expect(Object.isFrozen(OIM_FROZEN_EMPTY_SLOTS)).toBe(true);
    });
});
