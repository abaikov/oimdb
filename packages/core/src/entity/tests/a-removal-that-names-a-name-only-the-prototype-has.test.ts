import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { createOIMReplacingEntityWriter } from '../createOIMReplacingEntityWriter';
import { createOIMSlotContentEntityService } from '../createOIMSlotContentEntityService';
import { createOIMSingleSlotService } from '../../slot/createOIMSingleSlotService';

type Blob = Record<string, unknown>;

describe('a removal that names a name only the prototype has', () => {
    it('wakes nobody, because nothing was removed', () => {
        const db = new OIMDB();
        const settingsService = createOIMSingleSlotService(db, { slotContentService: createOIMSlotContentEntityService<Blob>(db) });
        const settings = settingsService.createStoreSlot(db);
        settingsService.writeSingleSlotContent(settings, { theme: 'dark', zoom: 1 });
        let runCount = 0;
        const effect = OIMEffectService.INSTANCE.createEffect(db, () => { runCount++; }, [settingsService.getSingleSlot(settings)]);
        db.flush();
        runCount = 0;

        settingsService.slotContentService.deleteEntityColumns(settingsService.getSingleSlot(settings),['toString']);
        db.flush();

        expect(settingsService.getSingleSlot(settings).entity).toEqual({ theme: 'dark', zoom: 1 });
        expect(runCount).toBe(0);
        OIMEffectService.INSTANCE.disposeEffect(effect);
    });

    it('does not hand a reference-comparing reader a new record for a removal that removed nothing', () => {
        const db = new OIMDB();
        const settingsService = createOIMSingleSlotService(db, { slotContentService: createOIMSlotContentEntityService<Blob>(db, { entityWriter: createOIMReplacingEntityWriter() }) });
        const settings = settingsService.createStoreSlot(db);
        settingsService.writeSingleSlotContent(settings, { theme: 'dark', zoom: 1 });
        const before = settingsService.getSingleSlot(settings).entity;

        settingsService.slotContentService.deleteEntityColumns(settingsService.getSingleSlot(settings),['valueOf']);

        expect(settingsService.getSingleSlot(settings).entity).toBe(before);
    });
});
