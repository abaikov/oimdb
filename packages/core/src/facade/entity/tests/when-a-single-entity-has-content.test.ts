import { OIMDB } from '../../../factories/OIMDB';
import { createOIMSlotContentEntityService } from '../../../factories/createOIMSlotContentEntityService';
import { createOIMSingleSlotService } from '../../../factories/createOIMSingleSlotService';

type TSettings = { theme: string };

const createFixture = () => {
    const db = new OIMDB();
    const settingsService = createOIMSingleSlotService(db, { slotContentService: createOIMSlotContentEntityService<TSettings>(db) });
    const settings = settingsService.createStoreSlot(db);
    return { db, settingsService, settings };
};

describe('when a single entity has content', () => {
    it('has none before anything is written', () => {
        const { settingsService, settings } = createFixture();

        expect(settingsService.hasSingleSlotContent(settings)).toBe(false);
    });

    it('has none when its slot was only read, not written', () => {
        const { settingsService, settings } = createFixture();
        settingsService.getSingleSlot(settings);

        expect(settingsService.hasSingleSlotContent(settings)).toBe(false);
    });

    it('has content once written, and none again after a delete', () => {
        const { db, settingsService, settings } = createFixture();
        const slot = settingsService.writeSingleSlotContent(settings, { theme: 'dark' });
        db.flush();

        expect(settingsService.hasSingleSlotContent(settings)).toBe(true);

        settingsService.slotContentService.clearSlotContent(slot);
        db.flush();

        expect(settingsService.hasSingleSlotContent(settings)).toBe(false);
    });
});
