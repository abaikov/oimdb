import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { createOIMInPlaceEntityWriter } from '../createOIMInPlaceEntityWriter';
import { oimInsertEntityWithCopy } from '../utils/oimInsertEntityWithCopy';
import { oimInsertEntityWithSanitizedCopy } from '../utils/oimInsertEntityWithSanitizedCopy';
import { createOIMSlotContentEntityService } from '../createOIMSlotContentEntityService';
import { createOIMSingleSlotService } from '../../slot/createOIMSingleSlotService';

type TSettings = { theme: string; sidebar: boolean };

describe('the object a caller hands a single entity, by default', () => {
    it('is the stored one, so mutating it afterwards changes what is stored', () => {
        const db = new OIMDB();
        const mine: TSettings = { theme: 'dark', sidebar: true };
        const settingsService = createOIMSingleSlotService(db, { slotContentService: createOIMSlotContentEntityService<TSettings>(db) });
        const settings = settingsService.createStoreSlot(db);
        settingsService.writeSingleSlotContent(settings, mine);

        expect(settingsService.getSingleSlot(settings).entity).toBe(mine);

        mine.theme = 'light';

        expect(settingsService.getSingleSlot(settings).entity?.theme).toBe('light');
    });

    it('is the stored one, so a mutation behind the engine wakes nobody', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const mine: TSettings = { theme: 'dark', sidebar: true };
        const settingsService = createOIMSingleSlotService(db, { slotContentService: createOIMSlotContentEntityService<TSettings>(db) });
        const settings = settingsService.createStoreSlot(db);
        settingsService.writeSingleSlotContent(settings, mine);

        let woken = 0;
        effectService.createEffect(db, () => { woken++; }, [settingsService.getSingleSlot(settings)]);
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
        const settingsService = createOIMSingleSlotService(db, { slotContentService: createOIMSlotContentEntityService<TSettings>(db) });
        const settings = settingsService.createStoreSlot(db);
        settingsService.writeSingleSlotContent(settings, payload);

        expect(settingsService.getSingleSlot(settings).entity).toBe(payload);
    });
});

describe('the object a caller hands a single entity built with oimInsertEntityWithCopy', () => {
    it('is copied, so mutating it afterwards changes nothing stored', () => {
        const db = new OIMDB();
        const mine: TSettings = { theme: 'dark', sidebar: true };
        const settingsService = createOIMSingleSlotService(db, { slotContentService: createOIMSlotContentEntityService<TSettings>(db, { entityWriter: createOIMInPlaceEntityWriter({ entityInserter: oimInsertEntityWithCopy }) }) });
        const settings = settingsService.createStoreSlot(db);
        settingsService.writeSingleSlotContent(settings, mine);

        expect(settingsService.getSingleSlot(settings).entity).not.toBe(mine);

        mine.theme = 'light';

        expect(settingsService.getSingleSlot(settings).entity?.theme).toBe('dark');
    });

    it('is copied, so a mutation behind the engine wakes nobody and changes nothing', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const mine: TSettings = { theme: 'dark', sidebar: true };
        const settingsService = createOIMSingleSlotService(db, { slotContentService: createOIMSlotContentEntityService<TSettings>(db, { entityWriter: createOIMInPlaceEntityWriter({ entityInserter: oimInsertEntityWithCopy }) }) });
        const settings = settingsService.createStoreSlot(db);
        settingsService.writeSingleSlotContent(settings, mine);

        let woken = 0;
        effectService.createEffect(db, () => { woken++; }, [settingsService.getSingleSlot(settings)]);
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
        const settingsService = createOIMSingleSlotService(db, { slotContentService: createOIMSlotContentEntityService<TSettings>(db, { entityWriter: createOIMInPlaceEntityWriter({ entityInserter: oimInsertEntityWithSanitizedCopy }) }) });
        const settings = settingsService.createStoreSlot(db);
        settingsService.writeSingleSlotContent(settings, payload);

        const stored = settingsService.getSingleSlot(settings).entity as object;
        expect(Object.prototype.hasOwnProperty.call(stored, '__proto__')).toBe(false);
    });
});
