import { OIMDB, OIM_FROZEN_EMPTY_SLOTS, oimIsSlotReleased } from '../../index';
import { createOIMEntityContentService } from '../createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMSingleSlotService } from '../../slot/createOIMSingleSlotService';

type TCard = { id: string; title: string };

describe('a held column is given back through the same door that held it', () => {
    it('an entity collection hands back the column it held', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard, string>() });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
        const titleColumn = cardsService.columnSlotService.holdColumn(card, 'title');
        expect(titleColumn.holdCount).toBe(1);
        cardsService.columnSlotService.unholdColumn(titleColumn);
        expect(oimIsSlotReleased(titleColumn)).toBe(true);
    });

    it('a single entity hands back the column it held', () => {
        const db = new OIMDB();
        const settingsService = createOIMSingleSlotService({ slotContentService: createOIMEntityContentService<{ theme: string }>() });
        const settings = settingsService.createStoreSlot(db);
        settingsService.writeSingleSlotContent(settings, { theme: 'dark' });
        const themeColumn = settingsService.columnSlotService.holdColumn(settingsService.getSingleSlot(settings), 'theme');
        expect(themeColumn.holdCount).toBe(1);
        settingsService.columnSlotService.unholdColumn(themeColumn);
        expect(oimIsSlotReleased(themeColumn)).toBe(true);
    });

    it('the frozen empty slot list is exported, and frozen', () => {
        expect(OIM_FROZEN_EMPTY_SLOTS).toEqual([]);
        expect(Object.isFrozen(OIM_FROZEN_EMPTY_SLOTS)).toBe(true);
    });
});
