import { OIMDB } from '../../../factories/OIMDB';
import { OIMEffectService } from '../../../engine/computed/OIMEffectService';
import { createOIMSingleEntityService } from '../../../factories/createOIMSingleEntityService';
import { createOIMEntityWriterInPlace } from '../../../factories/createOIMEntityWriterInPlace';
import { oimInsertEntityWithCopy } from '../../../engine/entity/utils/oimInsertEntityWithCopy';
import { oimInsertEntityWithSanitizedCopy } from '../../../engine/entity/utils/oimInsertEntityWithSanitizedCopy';

type TSettings = { theme: string; sidebar: boolean };

describe('the object a caller hands a single entity, by default', () => {
    it('is the stored one, so mutating it afterwards changes what is stored', () => {
        const db = new OIMDB();
        const mine: TSettings = { theme: 'dark', sidebar: true };
        const settingsService = createOIMSingleEntityService<TSettings>(db);
        const settings = settingsService.createStoreSlot(db);
        settingsService.slotContentService.upsertEntity(settings, mine);

        expect(settingsService.getSingleSlot(settings).entity).toBe(mine);

        mine.theme = 'light';

        expect(settingsService.getSingleSlot(settings).entity?.theme).toBe('light');
    });

    it('is the stored one, so a mutation behind the engine wakes nobody', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const mine: TSettings = { theme: 'dark', sidebar: true };
        const settingsService = createOIMSingleEntityService<TSettings>(db);
        const settings = settingsService.createStoreSlot(db);
        settingsService.slotContentService.upsertEntity(settings, mine);

        let woken = 0;
        effectService.createEffect(db, [settingsService.getSingleSlot(settings)], [], () => { woken++; });
        db.flush();
        const wokenAtRest = woken;

        mine.theme = 'light';
        db.flush();

        expect(woken).toBe(wokenAtRest);
        expect(settingsService.getSingleSlot(settings).entity?.theme).toBe('light');
    });

    it('is stored with its own __proto__ key, because no copy ran over it', () => {
        const db = new OIMDB();
        const payload = JSON.parse('{"theme":"dark","sidebar":true,"__proto__":{"polluted":true}}') as TSettings;
        const settingsService = createOIMSingleEntityService<TSettings>(db);
        const settings = settingsService.createStoreSlot(db);
        settingsService.slotContentService.upsertEntity(settings, payload);

        expect(settingsService.getSingleSlot(settings).entity).toBe(payload);
    });
});

describe('the object a caller hands a single entity built with oimInsertEntityWithCopy', () => {
    it('is copied, so mutating it afterwards changes nothing stored', () => {
        const db = new OIMDB();
        const mine: TSettings = { theme: 'dark', sidebar: true };
        const settingsService = createOIMSingleEntityService<TSettings>(db, {
            entityWriter: createOIMEntityWriterInPlace({ entityInsertStrategy: oimInsertEntityWithCopy }),
        });
        const settings = settingsService.createStoreSlot(db);
        settingsService.slotContentService.upsertEntity(settings, mine);

        expect(settingsService.getSingleSlot(settings).entity).not.toBe(mine);

        mine.theme = 'light';

        expect(settingsService.getSingleSlot(settings).entity?.theme).toBe('dark');
    });

    it('is copied, so a mutation behind the engine wakes nobody and changes nothing', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const mine: TSettings = { theme: 'dark', sidebar: true };
        const settingsService = createOIMSingleEntityService<TSettings>(db, {
            entityWriter: createOIMEntityWriterInPlace({ entityInsertStrategy: oimInsertEntityWithCopy }),
        });
        const settings = settingsService.createStoreSlot(db);
        settingsService.slotContentService.upsertEntity(settings, mine);

        let woken = 0;
        effectService.createEffect(db, [settingsService.getSingleSlot(settings)], [], () => { woken++; });
        db.flush();
        const wokenAtRest = woken;

        mine.theme = 'light';
        db.flush();

        expect(woken).toBe(wokenAtRest);
        expect(settingsService.getSingleSlot(settings).entity?.theme).toBe('dark');
    });
});

describe('the object a caller hands a single entity built with oimInsertEntityWithSanitizedCopy', () => {
    it('is filed without its own __proto__ key, exactly as a collection files one', () => {
        const db = new OIMDB();
        const payload = JSON.parse('{"theme":"dark","sidebar":true,"__proto__":{"polluted":true}}') as TSettings;
        const settingsService = createOIMSingleEntityService<TSettings>(db, {
            entityWriter: createOIMEntityWriterInPlace({ entityInsertStrategy: oimInsertEntityWithSanitizedCopy }),
        });
        const settings = settingsService.createStoreSlot(db);
        settingsService.slotContentService.upsertEntity(settings, payload);

        const stored = settingsService.getSingleSlot(settings).entity as object;
        expect(Object.prototype.hasOwnProperty.call(stored, '__proto__')).toBe(false);
    });
});
