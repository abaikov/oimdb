import { OIMDB } from '../../../factories/OIMDB';
import { createOIMSingleEntityService } from '../../../factories/createOIMSingleEntityService';

type TSettings = { theme: string };

const createFixture = () => {
    const db = new OIMDB();
    const settingsService = createOIMSingleEntityService<TSettings>(db);
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
        const slot = settingsService.slotContentService.upsertEntity(settings, { theme: 'dark' });
        db.flush();

        expect(settingsService.hasSingleSlotContent(settings)).toBe(true);

        settingsService.slotContentService.deleteEntity(slot);
        db.flush();

        expect(settingsService.hasSingleSlotContent(settings)).toBe(false);
    });
});
