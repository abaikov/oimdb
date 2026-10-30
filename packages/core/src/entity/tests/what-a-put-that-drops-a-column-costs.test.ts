import { OIMChannelService } from '../../channel/OIMChannelService';
import { OIMDB } from '../../db/OIMDB';
import { createOIMInPlaceEntityWriter } from '../createOIMInPlaceEntityWriter';
import { createOIMReplacingEntityWriter } from '../createOIMReplacingEntityWriter';
import type { IOIMEntityWriter } from '../interfaces/IOIMEntityWriter';
import type { TOIMChannelSlot } from '../../channel/types/TOIMChannelSlot';
import type { TOIMEntitySlot } from '../types/TOIMEntitySlot';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import { createOIMSlotContentEntityService } from '../createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMSingleSlotService } from '../../slot/createOIMSingleSlotService';

type TRow = { id: string; a?: number; b?: number; c?: number; d?: number };

const restores: (() => void)[] = [];

afterEach(() => {
    while (restores.length !== 0) restores.pop()?.();
});

const countNewEntityObjects = (slot: TOIMEntitySlot): (() => number) => {
    let entityObjects = 0;
    let stored = slot.entity;
    Object.defineProperty(slot, 'entity', {
        get: () => stored,
        set: (next: object | undefined) => {
            if (next !== stored) entityObjects++;
            stored = next;
        },
        configurable: true,
    });
    return () => entityObjects;
};

const countChannelWritesOf = (slot: TOIMSlot): (() => number) => {
    const channelService = OIMChannelService.INSTANCE;
    const doors = channelService as unknown as { writeWithoutFlushCheck: (channelSlot: TOIMChannelSlot, written: TOIMSlot) => void };
    const write = doors.writeWithoutFlushCheck;
    let writes = 0;
    doors.writeWithoutFlushCheck = (channelSlot, written) => {
        if (written === slot) writes++;
        write.call(channelService, channelSlot, written);
    };
    restores.push(() => { doors.writeWithoutFlushCheck = write; });
    return () => writes;
};

const writers: [string, () => IOIMEntityWriter, number, string[]][] = [
    ['replacing', createOIMReplacingEntityWriter, 1, ['id', 'a', 'b', 'c', 'd']],
    ['in place', createOIMInPlaceEntityWriter, 0, ['id', 'a', 'b', 'c', 'd']],
];

const createRow = (entityWriter: IOIMEntityWriter) => {
    const db = new OIMDB();
    const rowsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TRow, string>(db, { entityWriter }) });
    const rows = rowsService.createStoreSlot(db);
    rowsService.writeSlotContentByKey(rows, 'r', { id: 'r', a: 1, b: 2, c: 3, d: 4 });
    const slot = rowsService.holdSlotByKey(rows, 'r');
    db.flush();
    return { db, rowsService, rows, slot };
};

describe('what an upsert that drops columns costs', () => {
    it.each(writers)('%s: one entity object at most and one channel write for the row', (_, createWriter, objects, keys) => {
        const { rowsService, rows, slot } = createRow(createWriter());
        const newEntityObjects = countNewEntityObjects(slot);
        const channelWrites = countChannelWritesOf(slot);

        rowsService.writeSlotContentByKey(rows, 'r', { id: 'r', a: 10, b: 2 });

        expect(slot.entity).toEqual({ id: 'r', a: 10, b: 2 });
        expect(Object.keys(slot.entity as object)).toEqual(keys);
        expect(newEntityObjects()).toBe(objects);
        expect(channelWrites()).toBe(1);
    });

    it.each(writers)('%s: wakes the columns that changed or left, and not the one that stayed', (_, createWriter) => {
        const { db, rowsService, rows, slot } = createRow(createWriter());
        const a = rowsService.columnSlotService.holdColumn(slot, 'a');
        const b = rowsService.columnSlotService.holdColumn(slot, 'b');
        const c = rowsService.columnSlotService.holdColumn(slot, 'c');
        const before = [a.changedAtRevision, b.changedAtRevision, c.changedAtRevision];

        rowsService.writeSlotContentByKey(rows, 'r', { id: 'r', a: 10, b: 2 });
        db.flush();

        expect(a.changedAtRevision).not.toBe(before[0]);
        expect(b.changedAtRevision).toBe(before[1]);
        expect(c.changedAtRevision).not.toBe(before[2]);
    });

    it.each(writers)('%s: an upsert of the same columns and values writes nothing', (_, createWriter) => {
        const { rowsService, rows, slot } = createRow(createWriter());
        const entity = slot.entity;
        const channelWrites = countChannelWritesOf(slot);

        rowsService.writeSlotContentByKey(rows, 'r', { id: 'r', a: 1, b: 2, c: 3, d: 4 });

        expect(channelWrites()).toBe(0);
        expect(slot.entity === entity).toBe(true);
    });

    it.each(writers)('%s: a column that only arrives is added after the ones that stayed', (_, createWriter) => {
        const { rowsService, rows, slot } = createRow(createWriter());

        rowsService.writeSlotContentByKey(rows, ({ id: 'r', d: 4, a: 1, c: 30, b: 2 } as TRow).id, { id: 'r', d: 4, a: 1, c: 30, b: 2 } as TRow);

        expect(Object.keys(slot.entity as object)).toEqual(['id', 'a', 'b', 'c', 'd']);
        expect(slot.entity).toEqual({ id: 'r', a: 1, b: 2, c: 30, d: 4 });
    });

    it.each(writers)('%s: a single entity replaced with a column gone writes once', (_, createWriter) => {
        const db = new OIMDB();
        const settingsService = createOIMSingleSlotService(db, { slotContentService: createOIMSlotContentEntityService<{ theme: string; volume?: number }>(db, { entityWriter: createWriter() }) });
        const settings = settingsService.createStoreSlot(db);
        settingsService.writeSingleSlotContent(settings, { theme: 'dark', volume: 5 });
        const channelWrites = countChannelWritesOf(settingsService.getSingleSlot(settings));

        settingsService.slotContentService.writeSlotContent(settingsService.getSingleSlot(settings), { theme: 'light' });

        expect(settingsService.getSingleSlot(settings).entity).toEqual({ theme: 'light' });
        expect(channelWrites()).toBe(1);
    });
});
