import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSingleSlotService } from '../../slot/createOIMSingleSlotService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type Settings = { theme: string; sidebar: string; zoom: number };
type Row = { id: string; theme: string; sidebar?: string; zoom: number };

/** The host that flushes on the same tick — an ordinary thing for a caller to write. */
const syncDb = (): OIMDB => new OIMDB({ channelScheduler: (run): void => { run(); } });

const effectService = OIMEffectService.INSTANCE;

describe('a replace is one change and not two', () => {
    it('tells a subscriber once, with the record the caller asked for', () => {
        const db = syncDb();
        const settingsService = createOIMSingleSlotService({ slotContentService: createOIMSlotContentEntityService<Settings>() });
        const settings = settingsService.createStoreSlot(db);
        settingsService.writeSingleSlotContent(settings, { theme: 'dark', sidebar: 'open', zoom: 1 });
        const seen: Partial<Settings>[] = [];
        const effect = effectService.createEffect(db, () => {
            seen.push({ ...(settingsService.getSingleSlot(settings).entity as Settings) });
        }, [settingsService.getSingleSlot(settings)]);
        db.flush();
        seen.length = 0;

        settingsService.slotContentService.writeSlotContent(settingsService.getSingleSlot(settings), { theme: 'light', zoom: 2 } as Settings);

        // Today: [{ theme: 'dark', zoom: 1 }, { theme: 'light', zoom: 2 }].
        expect(seen).toEqual([{ theme: 'light', zoom: 2 }]);
        effectService.disposeEffect(effect);
    });

    it('never shows a state the caller did not write', () => {
        const db = syncDb();
        const settingsService = createOIMSingleSlotService({ slotContentService: createOIMSlotContentEntityService<Settings>() });
        const settings = settingsService.createStoreSlot(db);
        settingsService.writeSingleSlotContent(settings, { theme: 'dark', sidebar: 'open', zoom: 1 });
        const seen: Partial<Settings>[] = [];
        const effect = effectService.createEffect(db, () => {
            seen.push({ ...(settingsService.getSingleSlot(settings).entity as Settings) });
        }, [settingsService.getSingleSlot(settings)]);
        db.flush();
        seen.length = 0;

        settingsService.slotContentService.writeSlotContent(settingsService.getSingleSlot(settings), { theme: 'light', zoom: 2 } as Settings);

        // Every delivered reading is one of the two the caller named.
        for (const reading of seen) {
            expect(reading).toEqual({ theme: 'light', zoom: 2 });
        }
        effectService.disposeEffect(effect);
    });

    /** THE CONTROL — the collection's own whole-row write, which does bracket its pair. */
    it('is what the collection already does with the same pair of writes', () => {
        const db = syncDb();
        const rowsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<Row, string>() });
        const rows = rowsService.createStoreSlot(db);
        const slot = rowsService.writeSlotContentByKey(rows, 's', { id: 's', theme: 'dark', sidebar: 'open', zoom: 1 });
        const seen: Partial<Row>[] = [];
        const effect = effectService.createEffect(db, () => { seen.push({ ...(slot.entity as Row) }); }, [slot]);
        db.flush();
        seen.length = 0;

        rowsService.writeSlotContentByKey(rows, 's', { id: 's', theme: 'light', zoom: 2 });

        expect(seen).toEqual([{ id: 's', theme: 'light', zoom: 2 }]);
        effectService.disposeEffect(effect);
    });
});
