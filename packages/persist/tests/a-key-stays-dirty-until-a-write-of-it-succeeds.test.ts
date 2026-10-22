import type { TOIMStoreKey } from '@oimdb/core';
import type { TOIMPersistErrorContext, TOIMPersistErrorHandler } from '../src';
import {
    OIMPersistCodecIdentity,
    OIMPersistRecordSourceCollectionChangeDriven,
    OIMPersistResourceRecords,
    OIMPersistResourceSnapshot,
    OIMPersistSchedulerMicrotaskDriven,
    OIMPersistSourceChangeMarkSubscriptionDriven,
    OIMPersistor,
} from '../src';
import { OIMTestPersistBackend } from './shared/OIMTestPersistBackend';
import { createTestEntityCollection } from './shared/createTestEntityCollection';

type TCard = { id: string; title: string };

const tick = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0); });

function build(onPersistError?: TOIMPersistErrorHandler) {
    const { entityCollectionService, entityStoreSlot, persistEntityWriter } = createTestEntityCollection<TCard>();
    const testPersistBackend = new OIMTestPersistBackend<TOIMStoreKey, TCard>();
    const persistor = new OIMPersistor({
        persistBackend: testPersistBackend,
        persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
        onPersistError,
    });
    persistor.addPersistResource(new OIMPersistResourceRecords({
        persistRecordSource: new OIMPersistRecordSourceCollectionChangeDriven({
            entityCollectionService, entityStoreSlot, persistEntityWriter,
        }),
        persistRecordsStrategy: testPersistBackend.createRecordsStrategy(),
    }));
    persistor.start();
    let revision = 0;
    return {
        persistor,
        testPersistBackend,
        touchCards: (...keys: string[]): void => {
            revision++;
            for (const key of keys) entityCollectionService.slotContentService.upsertEntity(entityStoreSlot, { id: key, title: `${key}@${revision}` });
        },
    };
}

describe('a write that fails keeps the change', () => {
    it('re-writes the keys the failed write was carrying', async () => {
        const persistErrorContexts: TOIMPersistErrorContext[] = [];
        const { touchCards, testPersistBackend } = build((_error, persistErrorContext) => {
            persistErrorContexts.push(persistErrorContext);
        });

        testPersistBackend.failNextCommits(1);
        touchCards('k1');
        await tick();
        expect(testPersistBackend.readWrittenDeltaKeys()).toEqual([]);
        expect(persistErrorContexts).toHaveLength(1);
        expect(persistErrorContexts[0].persistOperation).toBe('persist');

        touchCards('k2');
        await tick();

        expect(testPersistBackend.readWrittenDeltaKeys()).toEqual([['k1', 'k2']]);
    });

    it('loses neither the failed key nor one dirtied while the write was in flight', async () => {
        const { touchCards, testPersistBackend } = build(() => undefined);

        testPersistBackend.failNextCommits(1);
        testPersistBackend.closeGate();
        touchCards('k1');
        await tick();
        expect(testPersistBackend.commitCount).toBe(1);

        touchCards('k2');
        await tick();
        testPersistBackend.openGate();
        await tick();
        await tick();

        expect(testPersistBackend.readWrittenDeltaKeys()).toEqual([['k1', 'k2']]);
    });

    it('reports through onPersistError on every failure, not only the first', async () => {
        const persistErrorContexts: TOIMPersistErrorContext[] = [];
        const { touchCards, testPersistBackend } = build((_error, persistErrorContext) => {
            persistErrorContexts.push(persistErrorContext);
        });

        testPersistBackend.failNextCommits(2);
        touchCards('k1');
        await tick();
        touchCards('k2');
        await tick();

        expect(persistErrorContexts.map(persistErrorContext => persistErrorContext.persistOperation)).toEqual([
            'persist',
            'persist',
        ]);
    });

    it('does not reject the autosave chain when no onPersistError is configured', async () => {
        const { persistor, touchCards, testPersistBackend } = build();

        testPersistBackend.failNextCommits(1);
        touchCards('k1');
        await tick();

        await expect(persistor.whenIdle()).resolves.toBeUndefined();

        touchCards('k2');
        await tick();
        expect(testPersistBackend.readWrittenDeltaKeys()).toEqual([['k1', 'k2']]);
    });

    it('still rejects an awaited persist() when no onPersistError is configured', async () => {
        const { persistor, testPersistBackend } = build();
        testPersistBackend.failNextCommits(1);
        await expect(persistor.persist()).rejects.toThrow('write failed');
    });

    it('keeps the keys that were pending when an awaited persist() failed', async () => {
        const { persistor, touchCards, testPersistBackend } = build(() => undefined);

        testPersistBackend.failNextCommits(1);
        touchCards('k1');
        await persistor.persist();
        expect(testPersistBackend.readWrittenRecordsKeys()).toEqual([]);
        await tick();

        expect(testPersistBackend.readWrittenDeltaKeys()).toEqual([['k1']]);
    });

    it('still reports the failure to a caller who has no onPersistError, having kept the keys', async () => {
        const { persistor, touchCards, testPersistBackend } = build();

        testPersistBackend.failNextCommits(1);
        touchCards('k1');
        await expect(persistor.persist()).rejects.toThrow('write failed');
        await tick();

        expect(testPersistBackend.readWrittenDeltaKeys()).toEqual([['k1']]);
        expect(testPersistBackend.readWrittenRecordsKeys()).toEqual([]);
    });

    it('writes the whole snapshot on a persist() that succeeds, and keeps nothing pending after it', async () => {
        const { persistor, touchCards, testPersistBackend } = build(() => undefined);

        touchCards('k1', 'k2');
        await persistor.persist();
        await tick();

        expect(testPersistBackend.readWrittenRecordsKeys()).toEqual([['k1', 'k2']]);
        expect(testPersistBackend.readWrittenDeltaKeys()).toEqual([]);
    });

    it('keeps nothing when autosave is off, because nothing would carry it', async () => {
        const { persistor, touchCards, testPersistBackend } = build(() => undefined);
        persistor.stop();

        testPersistBackend.failNextCommits(1);
        await persistor.persist();
        expect(testPersistBackend.readWrittenRecordsKeys()).toEqual([]);

        persistor.start();
        touchCards('k1');
        await tick();

        expect(testPersistBackend.readWrittenDeltaKeys()).toEqual([['k1']]);
        expect(testPersistBackend.readWrittenRecordsKeys()).toEqual([]);
    });
});

describe('a clearPersisted whose wipe fails', () => {
    function buildClearable(onPersistError?: TOIMPersistErrorHandler) {
        const testPersistBackend = new OIMTestPersistBackend();
        const persistor = new OIMPersistor({
            persistBackend: testPersistBackend,
            persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
            onPersistError,
        });
        const testPersistSnapshotStrategyByName = new Map(['a', 'b', 'c'].map(name => [
            name,
            testPersistBackend.createSnapshotStrategy<TCard[]>({ storageKey: name }),
        ] as const));
        const persistResourceByName = new Map(Array.from(testPersistSnapshotStrategyByName, ([name, testPersistSnapshotStrategy]) => [
            name,
            persistor.addPersistResource(new OIMPersistResourceSnapshot({
                persistSnapshotSource: {
                    readSnapshot: (): TCard[] => [],
                    writeSnapshot: () => undefined,
                    subscribeSnapshotChanged: () => () => undefined,
                    markSourceChanges: () => new OIMPersistSourceChangeMarkSubscriptionDriven({ subscribeSourceChanged: () => () => undefined }),
                },
                persistSnapshotStrategy: testPersistSnapshotStrategy,
                persistCodec: new OIMPersistCodecIdentity<TCard[]>(),
            })),
        ] as const));
        return {
            persistor,
            testPersistBackend,
            persistResourceByName,
            refuseClearOf: (name: string): void => {
                testPersistSnapshotStrategyByName.get(name)?.failDeleteSnapshot(new Error(`clear of ${name} failed`));
            },
        };
    }

    it('clears every resource in ONE write batch when none refuses', async () => {
        const { persistor, testPersistBackend } = buildClearable();

        await persistor.clearPersisted();

        expect(testPersistBackend.clearedStorageKeys).toEqual(['a', 'b', 'c']);
        expect(testPersistBackend.commitCount).toBe(1);
    });

    it('finishes the sweep instead of stopping at the resource that failed', async () => {
        const { persistor, testPersistBackend, refuseClearOf } = buildClearable(() => undefined);
        refuseClearOf('b');

        await persistor.clearPersisted();

        expect(testPersistBackend.clearedStorageKeys).toEqual(['a', 'c']);
    });

    it('hands the failure to onPersistError instead of rejecting past it', async () => {
        const persistErrorContexts: TOIMPersistErrorContext[] = [];
        const { persistor, persistResourceByName, refuseClearOf } = buildClearable((_error, persistErrorContext) => {
            persistErrorContexts.push(persistErrorContext);
        });
        refuseClearOf('b');

        await expect(persistor.clearPersisted()).resolves.toBeUndefined();

        expect(persistErrorContexts).toHaveLength(1);
        expect(persistErrorContexts[0].persistOperation).toBe('clear');
        expect(persistErrorContexts[0].persistResource).toBe(persistResourceByName.get('b'));
    });

    it('still rejects for a caller with no onPersistError, having swept the rest', async () => {
        const { persistor, testPersistBackend, refuseClearOf } = buildClearable();
        refuseClearOf('b');

        await expect(persistor.clearPersisted()).rejects.toThrow('clear of b failed');

        expect(testPersistBackend.clearedStorageKeys).toEqual(['a', 'c']);
    });

    it('reports every failure, not only the first', async () => {
        const persistErrorContexts: TOIMPersistErrorContext[] = [];
        const { persistor, testPersistBackend, refuseClearOf } = buildClearable((_error, persistErrorContext) => {
            persistErrorContexts.push(persistErrorContext);
        });
        refuseClearOf('a');
        refuseClearOf('b');

        await persistor.clearPersisted();

        expect(testPersistBackend.clearedStorageKeys).toEqual(['c']);
        expect(persistErrorContexts.map(persistErrorContext => persistErrorContext.persistOperation)).toEqual(['clear', 'clear']);
    });
});
