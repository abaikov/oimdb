import type { TOIMColumnSlot } from '../../../engine/column/types/TOIMColumnSlot';
import { OIMDB } from '../../../factories/OIMDB';
import { OIMEffectService } from '../../../engine/computed/OIMEffectService';
import { createOIMSingleEntityService } from '../../../factories/createOIMSingleEntityService';
import { createOIMEntityWriterReplacing } from '../../../factories/createOIMEntityWriterReplacing';

type Settings = { theme: string; zoom: number; label?: string };

describe('a singleton is written through the same strategy as an entity slot', () => {
    it('is read back under the undefined key after an upsert, through the same doors as a collection', () => {
        const db = new OIMDB();
        const settingsService = createOIMSingleEntityService<Settings>(db);
        const settings = settingsService.createStoreSlot(db);
        settingsService.slotContentService.upsertEntity(settings, { theme: 'dark', zoom: 1 });
        expect(settingsService.getSingleSlot(settings).entity?.theme).toBe('dark');
    });

    it('wakes a subscriber when a field it reads moves', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const settingsService = createOIMSingleEntityService<Settings>(db);
        const settings = settingsService.createStoreSlot(db);
        settingsService.slotContentService.upsertEntity(settings, { theme: 'dark', zoom: 1 });

        let seen = '';
        effectService.createEffect(db, [settingsService.getSingleSlot(settings)], [], () => { seen = settingsService.getSingleSlot(settings).entity?.theme ?? ''; });
        settingsService.slotContentService.updateEntity(settingsService.getSingleSlot(settings),{ theme: 'light' });
        db.flush();
        expect(seen).toBe('light');
        expect(settingsService.getSingleSlot(settings).entity?.zoom).toBe(1);
    });

    it('takes a column away, and the taking counts as a move', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const settingsService = createOIMSingleEntityService<Settings>(db);
        const settings = settingsService.createStoreSlot(db);
        settingsService.slotContentService.upsertEntity(settings, { theme: 'dark', zoom: 1, label: 'mine' });

        let runs = 0;
        effectService.createEffect(db, [settingsService.getSingleSlot(settings)], [], () => { runs++; });
        db.flush();
        const born = runs;

        settingsService.slotContentService.deleteEntityColumns(settingsService.getSingleSlot(settings), ['label']);
        db.flush();
        expect(runs).toBe(born + 1);
        expect((settingsService.getSingleSlot(settings).entity as { label?: string }).label).toBeUndefined();
    });
});

describe('a singleton has columns, and they are the same identities an entity slot has', () => {
    it('files nothing until a column is watched, and gives the map back after', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const settingsService = createOIMSingleEntityService<Settings>(db);
        const settings = settingsService.createStoreSlot(db);
        settingsService.slotContentService.upsertEntity(settings, { theme: 'dark', zoom: 1 });
        expect(settingsService.getSingleSlot(settings).columnSlotStore).toBeUndefined();

        const column = settingsService.holdColumn(settingsService.getSingleSlot(settings), 'theme');
        const theme = effectService.createEffect(db, [column], [], () => { /* nothing */ });
        expect((settingsService.getSingleSlot(settings).columnSlotStore as Map<string, TOIMColumnSlot> | undefined)?.size).toBe(1);

        effectService.disposeEffect(theme);
        settingsService.unholdColumn(column);
        expect(settingsService.getSingleSlot(settings).columnSlotStore).toBeUndefined();
    });

    it('wakes a column subscriber for its own field and for no other', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const settingsService = createOIMSingleEntityService<Settings>(db);
        const settings = settingsService.createStoreSlot(db);
        settingsService.slotContentService.upsertEntity(settings, { theme: 'dark', zoom: 1 });

        let runs = 0;
        effectService.createEffect(db, [settingsService.holdColumn(settingsService.getSingleSlot(settings), 'theme')], [], () => { runs++; });
        db.flush();
        const born = runs;

        settingsService.slotContentService.updateEntity(settingsService.getSingleSlot(settings),{ zoom: 2 });
        db.flush();
        expect(runs).toBe(born);

        settingsService.slotContentService.updateEntity(settingsService.getSingleSlot(settings),{ theme: 'light' });
        db.flush();
        expect(runs).toBe(born + 1);
    });
});

describe('the write strategy is the caller\'s, here as everywhere', () => {
    /**
     * `createOIMEntityWriterReplacing` allocates a new stored object per changed slot per frame,
     * which is what a consumer comparing by reference needs. The default writes
     * in place and keeps the identity — the same fork a collection is given, and
     * the same one value carries it.
     */
    it('replaces the stored object when the replacing strategy is passed', () => {
        const db = new OIMDB();
        const settingsService = createOIMSingleEntityService<Settings>(db, { entityWriter: createOIMEntityWriterReplacing() });
        const settings = settingsService.createStoreSlot(db);
        settingsService.slotContentService.upsertEntity(settings, { theme: 'dark', zoom: 1 });
        const before = settingsService.getSingleSlot(settings).entity;
        settingsService.slotContentService.updateEntity(settingsService.getSingleSlot(settings),{ theme: 'light' });
        expect(settingsService.getSingleSlot(settings).entity).not.toBe(before);
        expect(settingsService.getSingleSlot(settings).entity?.theme).toBe('light');
    });

    it('keeps the stored object under the default, in-place strategy', () => {
        const db = new OIMDB();
        const settingsService = createOIMSingleEntityService<Settings>(db);
        const settings = settingsService.createStoreSlot(db);
        settingsService.slotContentService.upsertEntity(settings, { theme: 'dark', zoom: 1 });
        const before = settingsService.getSingleSlot(settings).entity;
        settingsService.slotContentService.updateEntity(settingsService.getSingleSlot(settings),{ theme: 'light' });
        expect(settingsService.getSingleSlot(settings).entity).toBe(before);
    });
});
