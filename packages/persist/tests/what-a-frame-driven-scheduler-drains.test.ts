import type { TOIMStoreKey } from '@oimdb/core';
import { OIMChannelService, OIMDB, oimIsSlotReleased } from '@oimdb/core';
import {
    OIMPersistRecordSourceCollectionWriteDriven,
    OIMPersistResourceRecords,
    OIMPersistSchedulerFrameDriven,
    OIMPersistSchedulerMicrotaskDriven,
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
        persistScheduler: new OIMPersistSchedulerFrameDriven({ channelSlot: db.defaultChannelSlot }),
    });
    persistor.addPersistResource(new OIMPersistResourceRecords({
        persistRecordSource: new OIMPersistRecordSourceCollectionWriteDriven<TOIMStoreKey, TCard>({
            entityCollectionService: cardEntityCollectionService, entityStoreSlot: cardEntityStoreSlot, persistEntityWriter,
        }),
        persistRecordsStrategy: testPersistBackend.createRecordsStrategy(),
    }));
    persistor.start();
    return { db, cardEntityCollectionService, cardEntityStoreSlot, testPersistBackend, persistor };
}

function buildFrameDrivenScheduler() {
    const db = new OIMDB();
    const persistSchedulerFrameDriven = new OIMPersistSchedulerFrameDriven({ channelSlot: db.defaultChannelSlot });
    const drainLog: string[] = [];
    persistSchedulerFrameDriven.attachDrain(() => { drainLog.push('drain'); });
    return { db, persistSchedulerFrameDriven, drainLog };
}

describe('OIMPersistSchedulerFrameDriven', () => {
    it('drains after a frame only when a drain was requested', () => {
        const { db, persistSchedulerFrameDriven, drainLog } = buildFrameDrivenScheduler();
        persistSchedulerFrameDriven.start();

        db.flush();
        expect(drainLog).toEqual([]);

        persistSchedulerFrameDriven.requestDrain();
        persistSchedulerFrameDriven.requestDrain();
        expect(drainLog).toEqual([]);

        db.flush();
        expect(drainLog).toEqual(['drain']);

        db.flush();
        expect(drainLog).toEqual(['drain']);
    });

    it('re-subscribes on start, so a second start neither drains twice nor drains ahead of a later handler', () => {
        const { db, persistSchedulerFrameDriven, drainLog } = buildFrameDrivenScheduler();
        persistSchedulerFrameDriven.start();
        OIMChannelService.INSTANCE.subscribeAfterEachFrame(db.defaultChannelSlot, () => { drainLog.push('later handler'); });
        persistSchedulerFrameDriven.start();

        persistSchedulerFrameDriven.requestDrain();
        db.flush();

        expect(drainLog).toEqual(['later handler', 'drain']);
    });

    it('forgets a requested drain on stop, and drains again after the next start', () => {
        const { db, persistSchedulerFrameDriven, drainLog } = buildFrameDrivenScheduler();
        persistSchedulerFrameDriven.start();

        persistSchedulerFrameDriven.requestDrain();
        persistSchedulerFrameDriven.stop();
        db.flush();
        expect(drainLog).toEqual([]);

        persistSchedulerFrameDriven.start();
        db.flush();
        expect(drainLog).toEqual([]);

        persistSchedulerFrameDriven.requestDrain();
        db.flush();
        expect(drainLog).toEqual(['drain']);
    });

    it('refuses to start with no persistor attached', () => {
        const persistSchedulerFrameDriven = new OIMPersistSchedulerFrameDriven({ channelSlot: new OIMDB().defaultChannelSlot });
        expect(() => { persistSchedulerFrameDriven.start(); }).toThrow(/no persistor is attached/);
    });

    it('refuses a second persistor', () => {
        const persistSchedulerFrameDriven = new OIMPersistSchedulerFrameDriven({ channelSlot: new OIMDB().defaultChannelSlot });
        const testPersistBackend = new OIMTestPersistBackend();
        new OIMPersistor({
            persistBackend: testPersistBackend,
            persistScheduler: persistSchedulerFrameDriven,
        });
        expect(() => new OIMPersistor({
            persistBackend: testPersistBackend,
            persistScheduler: persistSchedulerFrameDriven,
        })).toThrow(/already drains another persistor/);
    });
});

describe('a frame-driven persistor over the write-driven arm', () => {
    it('holds a changed slot until the frame that saves it, then gives the hold back', async () => {
        const { db, cardEntityCollectionService, cardEntityStoreSlot, testPersistBackend, persistor } = buildFrameDrivenPersistor();

        const cardSlot = cardEntityCollectionService.slotContentService.upsertEntity(cardEntityStoreSlot, { id: 'c1', title: 'alpha' });
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

        cardEntityCollectionService.slotContentService.upsertEntity(cardEntityStoreSlot, { id: 'c1', title: 'alpha' });
        await reachMicrotask();
        await persistor.whenIdle();

        expect(testPersistBackend.entityByKey.get('c1')).toEqual({ id: 'c1', title: 'alpha' });

        persistor.destroy();
    });

    it('keeps a deleted entity slot until the frame that writes the delete, then lets it go', async () => {
        const { db, cardEntityCollectionService, cardEntityStoreSlot, testPersistBackend, persistor } = buildFrameDrivenPersistor();
        const cardSlot = cardEntityCollectionService.slotContentService.upsertEntity(cardEntityStoreSlot, { id: 'c1', title: 'alpha' });
        db.flush();
        await persistor.whenIdle();
        expect(testPersistBackend.entityByKey.has('c1')).toBe(true);

        cardEntityCollectionService.slotContentService.deleteEntity(cardSlot);
        expect(oimIsSlotReleased(cardSlot)).toBe(false);

        db.flush();
        await persistor.whenIdle();
        expect(testPersistBackend.entityByKey.has('c1')).toBe(false);
        expect(oimIsSlotReleased(cardSlot)).toBe(true);

        persistor.destroy();
    });

    it('writes nothing for a change made before a stop, at the frame after it', async () => {
        const { db, cardEntityCollectionService, cardEntityStoreSlot, testPersistBackend, persistor } = buildFrameDrivenPersistor();
        const cardSlot = cardEntityCollectionService.slotContentService.upsertEntity(cardEntityStoreSlot, { id: 'c1', title: 'alpha' });

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
        const cardSlot = cardEntityCollectionService.slotContentService.upsertEntity(cardEntityStoreSlot, { id: 'c1', title: 'alpha' });
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

describe('OIMPersistSchedulerMicrotaskDriven', () => {
    function buildMicrotaskDrivenScheduler() {
        const persistSchedulerMicrotaskDriven = new OIMPersistSchedulerMicrotaskDriven();
        let drainCount = 0;
        persistSchedulerMicrotaskDriven.attachDrain(() => { drainCount++; });
        return { persistSchedulerMicrotaskDriven, readDrainCount: () => drainCount };
    }

    it('drains once at the next microtask however many drains were requested', async () => {
        const { persistSchedulerMicrotaskDriven, readDrainCount } = buildMicrotaskDrivenScheduler();
        persistSchedulerMicrotaskDriven.start();

        persistSchedulerMicrotaskDriven.requestDrain();
        persistSchedulerMicrotaskDriven.requestDrain();
        expect(readDrainCount()).toBe(0);
        await reachMicrotask();

        expect(readDrainCount()).toBe(1);
    });

    it('cancels a scheduled drain on stop', async () => {
        const { persistSchedulerMicrotaskDriven, readDrainCount } = buildMicrotaskDrivenScheduler();
        persistSchedulerMicrotaskDriven.start();

        persistSchedulerMicrotaskDriven.requestDrain();
        persistSchedulerMicrotaskDriven.stop();
        await reachMicrotask();

        expect(readDrainCount()).toBe(0);
    });

    it('schedules nothing for a drain requested before start', async () => {
        const { persistSchedulerMicrotaskDriven, readDrainCount } = buildMicrotaskDrivenScheduler();

        persistSchedulerMicrotaskDriven.requestDrain();
        persistSchedulerMicrotaskDriven.start();
        await reachMicrotask();

        expect(readDrainCount()).toBe(0);
    });

    it('refuses a second persistor', () => {
        const persistSchedulerMicrotaskDriven = new OIMPersistSchedulerMicrotaskDriven();
        const testPersistBackend = new OIMTestPersistBackend();
        new OIMPersistor({
            persistBackend: testPersistBackend,
            persistScheduler: persistSchedulerMicrotaskDriven,
        });
        expect(() => new OIMPersistor({
            persistBackend: testPersistBackend,
            persistScheduler: persistSchedulerMicrotaskDriven,
        })).toThrow(/already drains another persistor/);
    });
});
