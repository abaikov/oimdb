import { OIMChannelService } from '../../../engine/channel/OIMChannelService';
import { OIMDB } from '../../../factories/OIMDB';
import { OIMSlotReleasePolicyAfterWrite } from '../../../engine/collector/OIMSlotReleasePolicyAfterWrite';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMSingleEntityService } from '../../../factories/createOIMSingleEntityService';
import { OIMContentChangeListenerService } from '../../../engine/slot/OIMContentChangeListenerService';
import type { TOIMChannelSlot } from '../../../engine/channel/types/TOIMChannelSlot';
import type { TOIMEntityColumnName } from '../../../engine/entity/types/TOIMEntityColumnName';
import type { TOIMSlot } from '../../../engine/slot/types/TOIMSlot';
import { oimIsSlotEmpty } from '../../../engine/slot/utils/oimIsSlotEmpty';
import { oimIsSlotReleased } from '../../../engine/slot/utils/oimIsSlotReleased';

type TRow = { id: string; n: number };

type TWindowLog = {
    opened: number;
    closed: number;
    depth: number;
    deepest: number;
    writes: number;
    writesOutsideAWindow: number;
};

type TChannelDoors = {
    openSubframe: (channelSlot: TOIMChannelSlot) => void;
    closeSubframe: (channelSlot: TOIMChannelSlot) => void;
    writeWithoutFlushCheck: (channelSlot: TOIMChannelSlot, slot: TOIMSlot) => void;
};

const restores: (() => void)[] = [];

afterEach(() => {
    while (restores.length !== 0) restores.pop()?.();
});

const countWindows = (ownChannelSlot: TOIMChannelSlot): TWindowLog => {
    const log: TWindowLog = {
        opened: 0, closed: 0, depth: 0, deepest: 0, writes: 0, writesOutsideAWindow: 0,
    };
    const channelService = OIMChannelService.INSTANCE;
    const doors = channelService as unknown as TChannelDoors;
    const openSubframe = doors.openSubframe;
    const closeSubframe = doors.closeSubframe;
    const write = doors.writeWithoutFlushCheck;
    doors.openSubframe = (channelSlot: TOIMChannelSlot): void => {
        if (channelSlot === ownChannelSlot) {
            log.opened++;
            log.depth++;
            if (log.depth > log.deepest) log.deepest = log.depth;
        }
        openSubframe.call(channelService, channelSlot);
    };
    doors.closeSubframe = (channelSlot: TOIMChannelSlot): void => {
        if (channelSlot === ownChannelSlot) {
            log.closed++;
            log.depth--;
        }
        closeSubframe.call(channelService, channelSlot);
    };
    doors.writeWithoutFlushCheck = (channelSlot: TOIMChannelSlot, slot: TOIMSlot): void => {
        if (channelSlot === ownChannelSlot) {
            log.writes++;
            if (log.depth === 0) log.writesOutsideAWindow++;
        }
        write.call(channelService, channelSlot, slot);
    };
    restores.push(() => {
        doors.openSubframe = openSubframe;
        doors.closeSubframe = closeSubframe;
        doors.writeWithoutFlushCheck = write;
    });
    return log;
};

const resetWindowLog = (log: TWindowLog): void => {
    log.opened = 0;
    log.closed = 0;
    log.deepest = 0;
    log.writes = 0;
    log.writesOutsideAWindow = 0;
};

const createRowsService = (db: OIMDB, options: { slotReleasePolicy?: OIMSlotReleasePolicyAfterWrite } = {}) =>
    createOIMEntityService<TRow, TOIMEntityColumnName<TRow>, string>(db, { keyOf: (row: TRow) => row.id, ...options });

type TRowsService = ReturnType<typeof createRowsService>;

const deleteEntitiesByKeysInOneWindow = (
    rowsService: TRowsService, rows: Parameters<TRowsService['findSlotByKey']>[0], keys: readonly string[],
): void => {
    const slots: ReturnType<TRowsService['getSlotByKey']>[] = [];
    for (const key of keys) {
        const slot = rowsService.findSlotByKey(rows, key);
        if (slot !== undefined) slots.push(slot);
    }
    rowsService.slotContentService.deleteEntities(rows, slots);
};

const openRows = () => {
    const db = new OIMDB();
    const rowsService = createRowsService(db);
    const rowsContentService = rowsService.slotContentService;
    const rows = rowsService.createStoreSlot(db);
    return { db, rowsService, rowsContentService, rows, log: countWindows(db.defaultChannelSlot) };
};

describe('how many subframes a door opens', () => {
    it('opens none for an upsert that mints a row nobody hears, and files it', () => {
        const { rowsService, rowsContentService, rows, log } = openRows();

        const slot = rowsContentService.upsertEntity(rows,{ id: 'r1', n: 1 });

        expect(log.opened).toBe(0);
        expect(log.writes).toBe(1);
        expect(rowsService.getSlotByKey(rows,'r1')).toBe(slot);
        expect(slot.entity).toEqual({ id: 'r1', n: 1 });
        expect(oimIsSlotEmpty(slot)).toBe(false);
    });

    it('opens one for an upsert that mints a row a content listener hears', () => {
        const { rowsContentService, rows, log } = openRows();
        OIMContentChangeListenerService.INSTANCE.addContentChangeListener(rows,{ onContentChanged: () => undefined, onContentChangedMany: () => undefined }, undefined);

        rowsContentService.upsertEntity(rows,{ id: 'r1', n: 1 });

        expect(log.opened).toBe(1);
        expect(log.closed).toBe(1);
        expect(log.deepest).toBe(1);
        expect(log.depth).toBe(0);
        expect(log.writes).toBe(1);
        expect(log.writesOutsideAWindow).toBe(0);
    });

    it('opens none for an upsert that moves a column of a held entity nobody hears', () => {
        const { rowsContentService, rows, log } = openRows();
        rowsContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        resetWindowLog(log);

        rowsContentService.upsertEntity(rows,{ id: 'r1', n: 2 });

        expect(log.opened).toBe(0);
        expect(log.writes).toBe(1);
    });

    it('opens none for an upsert whose moved column no content listener reads', () => {
        const { rowsContentService, rows, log } = openRows();
        rowsContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        OIMContentChangeListenerService.INSTANCE.addContentChangeListener(rows,{ onContentChanged: () => undefined, onContentChangedMany: () => undefined }, []);
        resetWindowLog(log);

        rowsContentService.upsertEntity(rows,{ id: 'r1', n: 2 });

        expect(log.opened).toBe(0);
        expect(log.writes).toBe(1);
    });

    it('opens one for an upsert that moves a column of a held entity a content listener hears', () => {
        const { rowsContentService, rows, log } = openRows();
        rowsContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        OIMContentChangeListenerService.INSTANCE.addContentChangeListener(rows,{ onContentChanged: () => undefined, onContentChangedMany: () => undefined }, ['n']);
        resetWindowLog(log);

        rowsContentService.upsertEntity(rows,{ id: 'r1', n: 2 });

        expect(log.opened).toBe(1);
        expect(log.closed).toBe(1);
        expect(log.deepest).toBe(1);
        expect(log.writes).toBe(1);
        expect(log.writesOutsideAWindow).toBe(0);
    });

    it('opens none and writes nothing for an upsert that moves nothing', () => {
        const { rowsContentService, rows, log } = openRows();
        rowsContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        resetWindowLog(log);

        rowsContentService.upsertEntity(rows,{ id: 'r1', n: 1 });

        expect(log.opened).toBe(0);
        expect(log.writes).toBe(0);
    });

    it('opens none for an updateByKey whose one write nobody hears', () => {
        const { rowsService, rowsContentService, rows, log } = openRows();
        rowsContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        resetWindowLog(log);

        const slot = rowsService.findSlotByKey(rows, 'r1');
        if (slot !== undefined) rowsContentService.updateEntity(slot, { n: 2 });

        expect(log.opened).toBe(0);
        expect(log.writes).toBe(1);
    });

    it('opens none for an updateEntityColumn whose one write nobody hears', () => {
        const { rowsContentService, rows, log } = openRows();
        const slot = rowsContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        resetWindowLog(log);

        rowsContentService.updateEntityColumn(slot, 'n', 2);

        expect(log.opened).toBe(0);
        expect(log.writes).toBe(1);
        expect(slot.entity?.n).toBe(2);
    });

    it('opens one for an updateByKey a content listener hears', () => {
        const { rowsService, rowsContentService, rows, log } = openRows();
        rowsContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        OIMContentChangeListenerService.INSTANCE.addContentChangeListener(rows,{ onContentChanged: () => undefined, onContentChangedMany: () => undefined }, undefined);
        resetWindowLog(log);

        const slot = rowsService.findSlotByKey(rows, 'r1');
        if (slot !== undefined) rowsContentService.updateEntity(slot, { n: 2 });

        expect(log.opened).toBe(1);
        expect(log.closed).toBe(1);
        expect(log.writesOutsideAWindow).toBe(0);
    });

    it('opens one for an updateEntityColumn whose column is read, around both writes', () => {
        const { rowsService, rowsContentService, rows, log } = openRows();
        const slot = rowsContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        rowsService.holdColumn(slot, 'n');
        resetWindowLog(log);

        rowsContentService.updateEntityColumn(slot, 'n', 2);

        expect(log.opened).toBe(1);
        expect(log.writes).toBe(2);
        expect(log.writesOutsideAWindow).toBe(0);
    });

    it('opens one for a markChanged', () => {
        const { rowsContentService, rows, log } = openRows();
        const slot = rowsContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        resetWindowLog(log);

        rowsContentService.markEntityChanged(slot);

        expect(log.opened).toBe(1);
        expect(log.deepest).toBe(1);
        expect(log.writesOutsideAWindow).toBe(0);
    });

    it('opens none for a markChanged naming a column no listener reads, under a listener reading another', () => {
        const { rowsContentService, rows, log } = openRows();
        const slot = rowsContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        const heard: string[] = [];
        OIMContentChangeListenerService.INSTANCE.addContentChangeListener(rows,{ onContentChanged: () => { heard.push('one'); }, onContentChangedMany: () => { heard.push('many'); } }, ['id']);
        resetWindowLog(log);

        rowsContentService.markEntityChanged(slot, ['n']);

        expect(log.opened).toBe(0);
        expect(log.writes).toBe(1);
        expect(heard).toEqual([]);
    });

    it('opens one for a markChanged naming a column a listener reads, and the listener hears it', () => {
        const { rowsContentService, rows, log } = openRows();
        const slot = rowsContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        const heard: string[] = [];
        OIMContentChangeListenerService.INSTANCE.addContentChangeListener(rows,{ onContentChanged: () => { heard.push('one'); }, onContentChangedMany: () => { heard.push('many'); } }, ['n']);
        resetWindowLog(log);

        rowsContentService.markEntityChanged(slot, ['n']);

        expect(log.opened).toBe(1);
        expect(log.writesOutsideAWindow).toBe(0);
        expect(heard.length).toBe(1);
    });

    it('opens one for a markChanged naming a column a column slot reads, around both writes', () => {
        const { rowsService, rowsContentService, rows, log } = openRows();
        const slot = rowsContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        rowsService.holdColumn(slot, 'n');
        resetWindowLog(log);

        rowsContentService.markEntityChanged(slot, ['n']);

        expect(log.opened).toBe(1);
        expect(log.writes).toBe(2);
        expect(log.writesOutsideAWindow).toBe(0);
    });

    it('opens one for the whole of an insertMany, however many rows it carries', () => {
        const three = openRows();
        const five = openRows();

        three.rowsContentService.insertEntities(three.rows,[{ id: 'r1', n: 1 }, { id: 'r2', n: 2 }, { id: 'r3', n: 3 }]);
        five.rowsContentService.insertEntities(five.rows,[
            { id: 'r1', n: 1 }, { id: 'r2', n: 2 }, { id: 'r3', n: 3 },
            { id: 'r4', n: 4 }, { id: 'r5', n: 5 },
        ]);

        expect(three.log.opened).toBe(1);
        expect(five.log.opened).toBe(1);
        expect(three.log.deepest).toBe(1);
        expect(five.log.deepest).toBe(1);
        expect(three.log.writes).toBe(3);
        expect(five.log.writes).toBe(5);
        expect(three.log.writesOutsideAWindow).toBe(0);
        expect(five.log.writesOutsideAWindow).toBe(0);
    });

    it('opens one around the whole upsertMany and none per new row nobody hears', () => {
        const { rowsContentService, rows, log } = openRows();

        rowsContentService.upsertEntities(rows,[{ id: 'r1', n: 1 }, { id: 'r2', n: 2 }, { id: 'r3', n: 3 }]);

        expect(log.opened).toBe(1);
        expect(log.deepest).toBe(1);
        expect(log.writesOutsideAWindow).toBe(0);
        expect(log.writes).toBe(3);
    });

    it('opens one around the whole upsertMany and one per new row a content listener hears', () => {
        const { rowsContentService, rows, log } = openRows();
        OIMContentChangeListenerService.INSTANCE.addContentChangeListener(rows,{ onContentChanged: () => undefined, onContentChangedMany: () => undefined }, undefined);

        rowsContentService.upsertEntities(rows,[{ id: 'r1', n: 1 }, { id: 'r2', n: 2 }, { id: 'r3', n: 3 }]);

        expect(log.opened).toBe(4);
        expect(log.deepest).toBe(2);
        expect(log.writesOutsideAWindow).toBe(0);
        expect(log.writes).toBe(3);
    });

    it('opens one around the whole removeManyByKeys and none per row nobody hears', () => {
        const { rowsService, rowsContentService, rows, log } = openRows();
        rowsContentService.insertEntities(rows,[{ id: 'r1', n: 1 }, { id: 'r2', n: 2 }, { id: 'r3', n: 3 }]);
        resetWindowLog(log);

        deleteEntitiesByKeysInOneWindow(rowsService, rows, ['r1', 'r2', 'r3']);

        expect(log.opened).toBe(1);
        expect(log.closed).toBe(1);
        expect(log.deepest).toBe(1);
        expect(log.depth).toBe(0);
        expect(log.writes).toBe(3);
        expect(log.writesOutsideAWindow).toBe(0);
        expect(rowsService.getSlotCount(rows)).toBe(0);
    });

    it('opens one around the whole removeMany and none per row nobody hears', () => {
        const { rowsService, rowsContentService, rows, log } = openRows();
        rowsContentService.insertEntities(rows,[{ id: 'r1', n: 1 }, { id: 'r2', n: 2 }, { id: 'r3', n: 3 }]);
        const slots = [rowsService.getSlotByKey(rows,'r1'), rowsService.getSlotByKey(rows,'r2'), rowsService.getSlotByKey(rows,'r3')];
        resetWindowLog(log);

        rowsContentService.deleteEntities(rows, slots);

        expect(log.opened).toBe(1);
        expect(log.deepest).toBe(1);
        expect(log.writes).toBe(3);
        expect(log.writesOutsideAWindow).toBe(0);
        expect(rowsService.getSlotCount(rows)).toBe(0);
    });

    it('opens one around the whole removeMany and two per row a content listener hears', () => {
        const { rowsService, rowsContentService, rows, log } = openRows();
        rowsContentService.insertEntities(rows,[{ id: 'r1', n: 1 }, { id: 'r2', n: 2 }, { id: 'r3', n: 3 }]);
        const slots = [rowsService.getSlotByKey(rows,'r1'), rowsService.getSlotByKey(rows,'r2'), rowsService.getSlotByKey(rows,'r3')];
        OIMContentChangeListenerService.INSTANCE.addContentChangeListener(rows,{ onContentChanged: () => undefined, onContentChangedMany: () => undefined }, undefined);
        resetWindowLog(log);

        rowsContentService.deleteEntities(rows, slots);

        expect(log.opened).toBe(7);
        expect(log.deepest).toBe(3);
        expect(log.writes).toBe(3);
        expect(log.writesOutsideAWindow).toBe(0);
    });

    it('opens one for a removeManyByKeys that names no key it holds, and writes nothing', () => {
        const { rowsService, rowsContentService, rows, log } = openRows();
        rowsContentService.insertEntities(rows,[{ id: 'r1', n: 1 }]);
        resetWindowLog(log);

        deleteEntitiesByKeysInOneWindow(rowsService, rows, ['nope']);

        expect(log.opened).toBe(1);
        expect(log.closed).toBe(1);
        expect(log.writes).toBe(0);
    });

    it('opens none and writes once for a removal of a row nothing holds, and releases the row', () => {
        const { rowsService, rowsContentService, rows, log } = openRows();
        rowsContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        resetWindowLog(log);

        const slot = rowsService.findSlotByKey(rows, 'r1');
        if (slot !== undefined) rowsContentService.deleteEntity(slot);

        expect(log.opened).toBe(0);
        expect(log.writes).toBe(1);
        expect(rowsService.getSlotCount(rows)).toBe(0);
    });

    it('opens none and writes once for a removal of a row something holds', () => {
        const { rowsService, rowsContentService, rows, log } = openRows();
        rowsContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        const heldSlot = rowsService.holdSlotByKey(rows, 'r1');
        resetWindowLog(log);

        rowsContentService.deleteEntity(heldSlot);

        expect(log.opened).toBe(0);
        expect(log.writes).toBe(1);
        expect(heldSlot.entity).toBeUndefined();
        heldSlot.owner.unholdSlot(heldSlot);
        expect(rowsService.getSlotCount(rows)).toBe(0);
    });

    it('opens two for a removal a content listener hears: the door, and clearContent for the release that has no door', () => {
        const { rowsService, rowsContentService, rows, log } = openRows();
        rowsContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        OIMContentChangeListenerService.INSTANCE.addContentChangeListener(rows,{ onContentChanged: () => undefined, onContentChangedMany: () => undefined }, undefined);
        resetWindowLog(log);

        const slot = rowsService.findSlotByKey(rows, 'r1');
        if (slot !== undefined) rowsContentService.deleteEntity(slot);

        expect(log.opened).toBe(2);
        expect(log.closed).toBe(2);
        expect(log.deepest).toBe(2);
        expect(log.depth).toBe(0);
        expect(log.writes).toBe(1);
        expect(log.writesOutsideAWindow).toBe(0);
    });
});

describe('how many subframes a single entity door opens', () => {
    const openSession = () => {
        const db = new OIMDB();
        const sessionService = createOIMSingleEntityService<{ theme: string; locale: string }>(db);
        const session = sessionService.createStoreSlot(db);
        sessionService.slotContentService.upsertEntity(session, { theme: 'dark', locale: 'en' });
        db.flush();
        return { sessionService, sessionContentService: sessionService.slotContentService, session, log: countWindows(db.defaultChannelSlot) };
    };

    it('opens none for an update, an updateColumn and a replace whose one write nobody reads by column', () => {
        const { sessionService, sessionContentService, session, log } = openSession();

        sessionContentService.updateEntity(sessionService.getSingleSlot(session), { theme: 'light' });
        sessionContentService.updateEntityColumn(sessionService.getSingleSlot(session), 'locale', 'de');
        sessionContentService.writeEntity(sessionService.getSingleSlot(session), { theme: 'dark', locale: 'fr' });

        expect(log.opened).toBe(0);
        expect(log.writes).toBe(3);
    });

    it('opens one for a deleteEntityColumns, which always names the columns it took', () => {
        const { sessionService, sessionContentService, session, log } = openSession();

        sessionContentService.deleteEntityColumns(sessionService.getSingleSlot(session), ['locale']);

        expect(log.opened).toBe(1);
        expect(log.writesOutsideAWindow).toBe(0);
    });

    it('opens one around both writes when a column of it is read', () => {
        const { sessionService, sessionContentService, session, log } = openSession();
        sessionService.holdColumn(sessionService.getSingleSlot(session), 'theme');
        resetWindowLog(log);

        sessionContentService.updateEntityColumn(sessionService.getSingleSlot(session), 'theme', 'light');

        expect(log.opened).toBe(1);
        expect(log.writes).toBe(2);
        expect(log.writesOutsideAWindow).toBe(0);
    });
});

describe('what a release reaching clearContent without a door is inside', () => {
    const openRowsOnADeadline = () => {
        let nowMs = 0;
        const db = new OIMDB({ getNowMs: () => nowMs, releaseTimer: () => () => undefined });
        const rowsService = createRowsService(db, { slotReleasePolicy: new OIMSlotReleasePolicyAfterWrite({ keepAfterWriteMs: 100 }) });
        const rows = rowsService.createStoreSlot(db);
        return { rowsService, rowsContentService: rowsService.slotContentService, rows, log: countWindows(db.defaultChannelSlot), setNowMs: (ms: number): void => { nowMs = ms; } };
    };

    it('keeps the row while the deadline is ahead', () => {
        const { rowsContentService, rows, setNowMs } = openRowsOnADeadline();

        const slot = rowsContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        setNowMs(50);
        slot.owner.releaseSlotIfUnheld(slot);

        expect(slot.entity).toEqual({ id: 'r1', n: 1 });
        expect(oimIsSlotReleased(slot)).toBe(false);
    });

    it('clears inside exactly one window once the deadline has passed', () => {
        const { rowsContentService, rows, log, setNowMs } = openRowsOnADeadline();
        const slot = rowsContentService.upsertEntity(rows,{ id: 'r1', n: 1 });
        resetWindowLog(log);

        setNowMs(1000);
        slot.owner.releaseSlotIfUnheld(slot);

        expect(slot.entity).toBeUndefined();
        expect(oimIsSlotReleased(slot)).toBe(true);
        expect(log.opened).toBe(1);
        expect(log.closed).toBe(1);
        expect(log.deepest).toBe(1);
        expect(log.writes).toBe(1);
        expect(log.writesOutsideAWindow).toBe(0);
    });
});
