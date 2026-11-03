import type { TOIMStoreKey } from '@oimdb/core';
import { OIMChannelService, OIMDB, isOIMSlotReleased } from '@oimdb/core';
import {
    OIMPersistCollectionWriteRecordSource,
    OIMPersistRecordsResource,
    OIMPersistFrameScheduler,
    OIMPersistMicrotaskScheduler,
    OIMPersistor,
} from '../src';
import { OIMTestPersistBackend } from './shared/OIMTestPersistBackend';
import { createTestEntityCollection } from './shared/createTestEntityCollection';

type TCard = { id: string; title: string };

const reachMicrotask = (): Promise<void> => Promise.resolve();

function buildFrameDrivenPersistor(selfFlushingDb?: OIMDB) {
    const {
        db, entityCollectionService: cardEntityCollectionService, entityStoreSlot: cardEntityStoreSlot, persistEntityWriter,
    } = createTestEntityCollection<TCard>({ db: selfFlushingDb });
    const testPersistBackend = new OIMTestPersistBackend<TOIMStoreKey, TCard>();
    const persistor = new OIMPersistor({
        persistBackend: testPersistBackend,
        persistScheduler: new OIMPersistFrameScheduler({ channelSlot: db.defaultChannelSlot }),
    });
    persistor.addPersistResource(new OIMPersistRecordsResource({
        persistRecordSource: new OIMPersistCollectionWriteRecordSource<TOIMStoreKey, TCard>({
            entityCollectionService: cardEntityCollectionService, entityStoreSlot: cardEntityStoreSlot, persistEntityWriter,
        }),
        persistRecordsService: testPersistBackend.createRecordsStrategy(),
    }));
    persistor.start();
    return { db, cardEntityCollectionService, cardEntityStoreSlot, testPersistBackend, persistor };
}

function buildFrameDrivenScheduler() {
    const db = new OIMDB();
    const persistFrameScheduler = new OIMPersistFrameScheduler({ channelSlot: db.defaultChannelSlot });
    const drainLog: string[] = [];
    persistFrameScheduler.attachDrain(() => { drainLog.push('drain'); });
    return { db, persistFrameScheduler, drainLog };
}

describe('OIMPersistFrameScheduler', () => {
    it('drains after a frame only when a drain was requested', () => {
        const { db, persistFrameScheduler, drainLog } = buildFrameDrivenScheduler();
        persistFrameScheduler.start();

        db.flush();
        expect(drainLog).toEqual([]);

        persistFrameScheduler.requestDrain();
        persistFrameScheduler.requestDrain();
        expect(drainLog).toEqual([]);

        db.flush();
        expect(drainLog).toEqual(['drain']);

        db.flush();
        expect(drainLog).toEqual(['drain']);
    });

    it('re-subscribes on start, so a second start neither drains twice nor drains ahead of a later handler', () => {
        const { db, persistFrameScheduler, drainLog } = buildFrameDrivenScheduler();
        persistFrameScheduler.start();
        OIMChannelService.INSTANCE.subscribeAfterEachFrame(db.defaultChannelSlot, () => { drainLog.push('later handler'); });
        persistFrameScheduler.start();

        persistFrameScheduler.requestDrain();
        db.flush();

        expect(drainLog).toEqual(['later handler', 'drain']);
    });

    it('forgets a requested drain on stop, and drains again after the next start', () => {
        const { db, persistFrameScheduler, drainLog } = buildFrameDrivenScheduler();
        persistFrameScheduler.start();

        persistFrameScheduler.requestDrain();
        persistFrameScheduler.stop();
        db.flush();
        expect(drainLog).toEqual([]);

        persistFrameScheduler.start();
        db.flush();
        expect(drainLog).toEqual([]);

        persistFrameScheduler.requestDrain();
        db.flush();
        expect(drainLog).toEqual(['drain']);
    });

    it('refuses to start with no persistor attached', () => {
        const persistFrameScheduler = new OIMPersistFrameScheduler({ channelSlot: new OIMDB().defaultChannelSlot });
        expect(() => { persistFrameScheduler.start(); }).toThrow(/no persistor is attached/);
    });

    it('refuses a second persistor', () => {
        const persistFrameScheduler = new OIMPersistFrameScheduler({ channelSlot: new OIMDB().defaultChannelSlot });
        const testPersistBackend = new OIMTestPersistBackend();
        new OIMPersistor({
            persistBackend: testPersistBackend,
            persistScheduler: persistFrameScheduler,
        });
        expect(() => new OIMPersistor({
            persistBackend: testPersistBackend,
            persistScheduler: persistFrameScheduler,
        })).toThrow(/already drains another persistor/);
    });
});

describe('a frame-driven persistor over the write-driven arm', () => {
    it('holds a changed slot until the frame that saves it, then gives the hold back', async () => {
        const { db, cardEntityCollectionService, cardEntityStoreSlot, testPersistBackend, persistor } = buildFrameDrivenPersistor();

        const cardSlot = cardEntityCollectionService.writeSlotContentByKey(cardEntityStoreSlot, 'c1', { id: 'c1', title: 'alpha' });
        expect(cardSlot.holdCount).toBe(1);
        await persistor.whenIdle();
        expect(testPersistBackend.entityByKey.has('c1')).toBe(false);

        db.flush();
        await persistor.whenIdle();
        expect(testPersistBackend.entityByKey.get('c1')).toEqual({ id: 'c1', title: 'alpha' });
        expect(cardSlot.holdCount).toBe(0);

        cardEntityCollectionService.slotContentService.updateEntity(cardSlot, { title: 'ALPHA' });
        expect(cardSlot.holdCount).toBe(1);
        db.flush();
        await persistor.whenIdle();
        expect(testPersistBackend.entityByKey.get('c1')).toEqual({ id: 'c1', title: 'ALPHA' });
        expect(cardSlot.holdCount).toBe(0);
        expect(testPersistBackend.commitCount).toBe(2);

        persistor.destroy();
    });

    it('writes an entity nobody else holds on a channel that flushes by itself', async () => {
        const selfFlushingDb = new OIMDB({ channelScheduler: run => { queueMicrotask(run); } });
        const { cardEntityCollectionService, cardEntityStoreSlot, testPersistBackend, persistor } =
            buildFrameDrivenPersistor(selfFlushingDb);

        cardEntityCollectionService.writeSlotContentByKey(cardEntityStoreSlot, 'c1', { id: 'c1', title: 'alpha' });
        await reachMicrotask();
        await persistor.whenIdle();

        expect(testPersistBackend.entityByKey.get('c1')).toEqual({ id: 'c1', title: 'alpha' });

        persistor.destroy();
    });

    it('keeps a deleted entity slot until the frame that writes the delete, then lets it go', async () => {
        const { db, cardEntityCollectionService, cardEntityStoreSlot, testPersistBackend, persistor } = buildFrameDrivenPersistor();
        const cardSlot = cardEntityCollectionService.writeSlotContentByKey(cardEntityStoreSlot, 'c1', { id: 'c1', title: 'alpha' });
        db.flush();
        await persistor.whenIdle();
        expect(testPersistBackend.entityByKey.has('c1')).toBe(true);

        cardEntityCollectionService.slotContentService.clearSlotContent(cardSlot);
        expect(isOIMSlotReleased(cardSlot)).toBe(false);

        db.flush();
        await persistor.whenIdle();
        expect(testPersistBackend.entityByKey.has('c1')).toBe(false);
        expect(isOIMSlotReleased(cardSlot)).toBe(true);

        persistor.destroy();
    });

    it('writes nothing for a change made before a stop, at the frame after it', async () => {
        const { db, cardEntityCollectionService, cardEntityStoreSlot, testPersistBackend, persistor } = buildFrameDrivenPersistor();
        const cardSlot = cardEntityCollectionService.writeSlotContentByKey(cardEntityStoreSlot, 'c1', { id: 'c1', title: 'alpha' });

        persistor.stop();
        db.flush();
        await persistor.whenIdle();

        expect(testPersistBackend.commitCount).toBe(0);
        expect(cardSlot.holdCount).toBe(1);

        persistor.destroy();
        expect(cardSlot.holdCount).toBe(0);
    });
});

describe('a persistor destroyed while a write is in flight', () => {
    it('gives the hold back even when that write then fails', async () => {
        const { db, cardEntityCollectionService, cardEntityStoreSlot, testPersistBackend, persistor } = buildFrameDrivenPersistor();
        const cardSlot = cardEntityCollectionService.writeSlotContentByKey(cardEntityStoreSlot, 'c1', { id: 'c1', title: 'alpha' });
        testPersistBackend.closeGate();
        db.flush();
        await reachMicrotask();
        expect(cardSlot.holdCount).toBe(1);

        persistor.destroy();
        testPersistBackend.failNextCommits(1);
        testPersistBackend.openGate();
        await persistor.whenIdle().catch(() => undefined);

        expect(cardSlot.holdCount).toBe(0);
    });
});

describe('OIMPersistMicrotaskScheduler', () => {
    function buildMicrotaskDrivenScheduler() {
        const persistMicrotaskScheduler = new OIMPersistMicrotaskScheduler();
        let drainCount = 0;
        persistMicrotaskScheduler.attachDrain(() => { drainCount++; });
        return { persistMicrotaskScheduler, readDrainCount: () => drainCount };
    }

    it('drains once at the next microtask however many drains were requested', async () => {
        const { persistMicrotaskScheduler, readDrainCount } = buildMicrotaskDrivenScheduler();
        persistMicrotaskScheduler.start();

        persistMicrotaskScheduler.requestDrain();
        persistMicrotaskScheduler.requestDrain();
        expect(readDrainCount()).toBe(0);
        await reachMicrotask();

        expect(readDrainCount()).toBe(1);
    });

    it('cancels a scheduled drain on stop', async () => {
        const { persistMicrotaskScheduler, readDrainCount } = buildMicrotaskDrivenScheduler();
        persistMicrotaskScheduler.start();

        persistMicrotaskScheduler.requestDrain();
        persistMicrotaskScheduler.stop();
        await reachMicrotask();

        expect(readDrainCount()).toBe(0);
    });

    it('schedules nothing for a drain requested before start', async () => {
        const { persistMicrotaskScheduler, readDrainCount } = buildMicrotaskDrivenScheduler();

        persistMicrotaskScheduler.requestDrain();
        persistMicrotaskScheduler.start();
        await reachMicrotask();

        expect(readDrainCount()).toBe(0);
    });

    it('refuses a second persistor', () => {
        const persistMicrotaskScheduler = new OIMPersistMicrotaskScheduler();
        const testPersistBackend = new OIMTestPersistBackend();
        new OIMPersistor({
            persistBackend: testPersistBackend,
            persistScheduler: persistMicrotaskScheduler,
        });
        expect(() => new OIMPersistor({
            persistBackend: testPersistBackend,
            persistScheduler: persistMicrotaskScheduler,
        })).toThrow(/already drains another persistor/);
    });
});
