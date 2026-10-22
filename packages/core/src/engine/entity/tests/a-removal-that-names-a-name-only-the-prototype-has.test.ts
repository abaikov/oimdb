import { OIMDB } from '../../../factories/OIMDB';
import { OIMEffectService } from '../../computed/OIMEffectService';
import { createOIMSingleEntityService } from '../../../factories/createOIMSingleEntityService';
import { createOIMEntityWriterReplacing } from '../../../factories/createOIMEntityWriterReplacing';

type Blob = Record<string, unknown>;

describe('a removal that names a name only the prototype has', () => {
    it('wakes nobody, because nothing was removed', () => {
        const db = new OIMDB();
        const settingsService = createOIMSingleEntityService<Blob>(db);
        const settings = settingsService.createStoreSlot(db);
        settingsService.slotContentService.upsertEntity(settings, { theme: 'dark', zoom: 1 });
        let runCount = 0;
        const effect = OIMEffectService.INSTANCE.createEffect(db, [settingsService.getSingleSlot(settings)], [], () => { runCount++; });
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
        const settingsService = createOIMSingleEntityService<Blob>(db, { entityWriter: createOIMEntityWriterReplacing() });
        const settings = settingsService.createStoreSlot(db);
        settingsService.slotContentService.upsertEntity(settings, { theme: 'dark', zoom: 1 });
        const before = settingsService.getSingleSlot(settings).entity;

        settingsService.slotContentService.deleteEntityColumns(settingsService.getSingleSlot(settings),['valueOf']);

        expect(settingsService.getSingleSlot(settings).entity).toBe(before);
    });
});
