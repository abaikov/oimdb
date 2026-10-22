import type { TOIMDisposer, TOIMStoreKey } from '@oimdb/core';
import type { IOIMPersistSnapshotSource, IOIMPersistSourceChangeMark, TOIMPersistOperation } from '../src';
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

type TValue = { n: number };
type TCard = { id: string; title: string };

const tick = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0); });

class VariableSnapshotSource implements IOIMPersistSnapshotSource<TValue> {
    private value: TValue = { n: 0 };
    private onSnapshotChanged: (() => void) | undefined = undefined;
    private readonly sourceChangedListeners = new Set<() => void>();
    private subscribeError: Error | undefined = undefined;

    public get isWatched(): boolean {
        return this.onSnapshotChanged !== undefined;
    }

    public readSnapshot(): TValue {
        return this.value;
    }

    public writeSnapshot(value: TValue): void {
        this.value = value;
    }

    public subscribeSnapshotChanged(onSnapshotChanged: () => void): TOIMDisposer {
        const subscribeError = this.subscribeError;
        if (subscribeError !== undefined) {
            this.subscribeError = undefined;
            throw subscribeError;
        }
        this.onSnapshotChanged = onSnapshotChanged;
        return () => { this.onSnapshotChanged = undefined; };
    }

    public markSourceChanges(): IOIMPersistSourceChangeMark {
        return new OIMPersistSourceChangeMarkSubscriptionDriven({
            subscribeSourceChanged: onSourceChanged => {
                this.sourceChangedListeners.add(onSourceChanged);
                return () => { this.sourceChangedListeners.delete(onSourceChanged); };
            },
        });
    }

    public refuseNextSubscribe(subscribeError: Error): void {
        this.subscribeError = subscribeError;
    }

    public changeValue(value: TValue): void {
        this.value = value;
        this.onSnapshotChanged?.();
        for (const onSourceChanged of this.sourceChangedListeners) onSourceChanged();
    }
}

function buildPersistor() {
    const persistOperations: TOIMPersistOperation[] = [];
    const testPersistBackend = new OIMTestPersistBackend<TOIMStoreKey, TCard>();
    const persistor = new OIMPersistor({
        persistBackend: testPersistBackend,
        persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
        onPersistError: (_error, persistErrorContext) => { persistOperations.push(persistErrorContext.persistOperation); },
    });
    const testPersistSnapshotStrategy = testPersistBackend.createSnapshotStrategy<TValue>({ storageKey: 'value' });
    const addVariableResource = () => {
        const variableSnapshotSource = new VariableSnapshotSource();
        persistor.addPersistResource(new OIMPersistResourceSnapshot({
            persistSnapshotSource: variableSnapshotSource,
            persistSnapshotStrategy: testPersistSnapshotStrategy,
            persistCodec: new OIMPersistCodecIdentity<TValue>(),
        }));
        return variableSnapshotSource;
    };
    const addCardsResource = () => {
        const {
            entityCollectionService: cardEntityService, entityStoreSlot: cardEntityStoreSlot, persistEntityWriter,
        } = createTestEntityCollection<TCard>();
        persistor.addPersistResource(new OIMPersistResourceRecords({
            persistRecordSource: new OIMPersistRecordSourceCollectionChangeDriven({
                entityCollectionService: cardEntityService, entityStoreSlot: cardEntityStoreSlot, persistEntityWriter,
            }),
            persistRecordsStrategy: testPersistBackend.createRecordsStrategy(),
        }));
        return { cardEntityService, cardEntityStoreSlot };
    };
    return { testPersistBackend, testPersistSnapshotStrategy, persistor, persistOperations, addVariableResource, addCardsResource };
}

describe('what a started resource reports to the persistor', () => {
    it('reports a change of a snapshot source, and the persistor writes the source as it is at the drain', async () => {
        const { testPersistBackend, testPersistSnapshotStrategy, persistor, addVariableResource } = buildPersistor();
        const variableSnapshotSource = addVariableResource();
        persistor.start();

        variableSnapshotSource.changeValue({ n: 1 });
        variableSnapshotSource.changeValue({ n: 2 });
        await tick();

        expect(testPersistBackend.commitCount).toBe(1);
        expect(testPersistSnapshotStrategy.writtenSnapshots).toEqual([{ n: 2 }]);

        persistor.destroy();
    });

    it('reports only the entity slots a records source changed, and autosave writes them as a delta', async () => {
        const { testPersistBackend, persistor, addCardsResource } = buildPersistor();
        const { cardEntityService, cardEntityStoreSlot } = addCardsResource();
        persistor.start();

        cardEntityService.slotContentService.upsertEntities(cardEntityStoreSlot, [
            { id: 'c1', title: 'alpha' },
            { id: 'c2', title: 'beta' },
        ]);
        await tick();
        cardEntityService.slotContentService.updateEntity(cardEntityService.getSlotByKey(cardEntityStoreSlot, 'c2'), { title: 'BETA' });
        await tick();

        expect(testPersistBackend.readWrittenDeltaKeys()).toEqual([['c1', 'c2'], ['c2']]);
        expect(testPersistBackend.writtenPersistRecordsList).toEqual([]);

        persistor.destroy();
    });

    it('writes the whole records on a manual persist, not a delta', async () => {
        const { testPersistBackend, persistor, addCardsResource } = buildPersistor();
        const { cardEntityService, cardEntityStoreSlot } = addCardsResource();
        cardEntityService.slotContentService.upsertEntities(cardEntityStoreSlot, [
            { id: 'c1', title: 'alpha' },
            { id: 'c2', title: 'beta' },
        ]);

        await persistor.persist();

        expect(testPersistBackend.readWrittenDeltaKeys()).toEqual([]);
        expect(testPersistBackend.writtenPersistRecordsList.map(cardPersistRecords =>
            cardPersistRecords.records.map(persistRecord => persistRecord.key))).toEqual([['c1', 'c2']]);
    });

    it('does not write a slot again that a manual persist already carried', async () => {
        const { testPersistBackend, persistor, addCardsResource } = buildPersistor();
        const { cardEntityService, cardEntityStoreSlot } = addCardsResource();
        persistor.start();

        cardEntityService.slotContentService.upsertEntity(cardEntityStoreSlot, { id: 'c1', title: 'alpha' });
        await persistor.persist();
        await tick();

        expect(testPersistBackend.writtenPersistRecordsList).toHaveLength(1);
        expect(testPersistBackend.readWrittenDeltaKeys()).toEqual([]);

        persistor.destroy();
    });
});

describe('when a resource reports nothing', () => {
    it('writes nothing, and does not watch the source, on a persistor that was never started', async () => {
        const { testPersistBackend, addVariableResource } = buildPersistor();
        const variableSnapshotSource = addVariableResource();

        variableSnapshotSource.changeValue({ n: 1 });
        await tick();

        expect(variableSnapshotSource.isWatched).toBe(false);
        expect(testPersistBackend.commitCount).toBe(0);
    });

    it('writes nothing, and stops watching the source, once the persistor is stopped', async () => {
        const { testPersistBackend, persistor, addVariableResource } = buildPersistor();
        const variableSnapshotSource = addVariableResource();
        persistor.start();
        expect(variableSnapshotSource.isWatched).toBe(true);

        persistor.stop();
        variableSnapshotSource.changeValue({ n: 1 });
        await tick();

        expect(variableSnapshotSource.isWatched).toBe(false);
        expect(testPersistBackend.commitCount).toBe(0);

        persistor.destroy();
    });

    it('does not run a drain that was scheduled before the persistor was stopped', async () => {
        const { testPersistBackend, persistor, addVariableResource } = buildPersistor();
        const variableSnapshotSource = addVariableResource();
        persistor.start();

        variableSnapshotSource.changeValue({ n: 1 });
        persistor.stop();
        await tick();

        expect(testPersistBackend.commitCount).toBe(0);

        persistor.destroy();
    });

    it('stops listening to a resource quarantined after three failed autosaves, and resumes after a manual persist', async () => {
        const { testPersistBackend, testPersistSnapshotStrategy, persistor, persistOperations, addVariableResource } = buildPersistor();
        const variableSnapshotSource = addVariableResource();
        testPersistBackend.failNextCommits(Number.POSITIVE_INFINITY);
        persistor.start();

        variableSnapshotSource.changeValue({ n: 1 });
        await tick();
        variableSnapshotSource.changeValue({ n: 2 });
        await tick();
        variableSnapshotSource.changeValue({ n: 3 });
        await tick();

        expect(testPersistBackend.commitCount).toBe(3);
        expect(persistOperations).toEqual(['persist', 'persist', 'quarantine']);
        expect(variableSnapshotSource.isWatched).toBe(false);

        variableSnapshotSource.changeValue({ n: 4 });
        await tick();
        expect(testPersistBackend.commitCount).toBe(3);

        testPersistBackend.failNextCommits(0);
        await persistor.persist();
        expect(testPersistSnapshotStrategy.writtenSnapshots).toEqual([{ n: 4 }]);
        expect(variableSnapshotSource.isWatched).toBe(true);

        variableSnapshotSource.changeValue({ n: 5 });
        await tick();
        expect(testPersistSnapshotStrategy.writtenSnapshots).toEqual([{ n: 4 }, { n: 5 }]);
        expect(persistOperations).toEqual(['persist', 'persist', 'quarantine']);

        persistor.destroy();
    });
});

describe('a resource whose source refuses the first subscribe', () => {
    it('stays restartable, and the second start watches the source', () => {
        const variableSnapshotSource = new VariableSnapshotSource();
        const persistResourceSnapshot = new OIMPersistResourceSnapshot({
            persistSnapshotSource: variableSnapshotSource,
            persistSnapshotStrategy: new OIMTestPersistBackend().createSnapshotStrategy<TValue>({ storageKey: 'value' }),
            persistCodec: new OIMPersistCodecIdentity<TValue>(),
        });
        let dirtyCount = 0;
        variableSnapshotSource.refuseNextSubscribe(new Error('subscribe refused'));

        expect(() => persistResourceSnapshot.start(() => { dirtyCount++; })).toThrow('subscribe refused');
        expect(variableSnapshotSource.isWatched).toBe(false);

        persistResourceSnapshot.start(() => { dirtyCount++; });
        variableSnapshotSource.changeValue({ n: 1 });

        expect(variableSnapshotSource.isWatched).toBe(true);
        expect(dirtyCount).toBe(1);
        expect(persistResourceSnapshot.hasPendingWrite()).toBe(true);

        persistResourceSnapshot.stop();
    });
});

describe('the consecutive-failure count', () => {
    it('is reset by a successful clearPersisted, so two more failed autosaves do not quarantine', async () => {
        const { testPersistBackend, persistor, persistOperations, addVariableResource } = buildPersistor();
        const variableSnapshotSource = addVariableResource();
        testPersistBackend.failNextCommits(2);
        persistor.start();

        variableSnapshotSource.changeValue({ n: 1 });
        await tick();
        variableSnapshotSource.changeValue({ n: 2 });
        await tick();
        expect(persistOperations).toEqual(['persist', 'persist']);

        await persistor.clearPersisted();

        testPersistBackend.failNextCommits(2);
        variableSnapshotSource.changeValue({ n: 3 });
        await tick();
        variableSnapshotSource.changeValue({ n: 4 });
        await tick();

        expect(persistOperations).toEqual(['persist', 'persist', 'persist', 'persist']);
        expect(variableSnapshotSource.isWatched).toBe(true);

        persistor.destroy();
    });
});

describe('a persistor started again after a stop', () => {
    it('does not restart a quarantined resource', async () => {
        const { testPersistBackend, persistor, persistOperations, addVariableResource } = buildPersistor();
        const variableSnapshotSource = addVariableResource();
        testPersistBackend.failNextCommits(Number.POSITIVE_INFINITY);
        persistor.start();
        for (let n = 1; n <= 3; n++) {
            variableSnapshotSource.changeValue({ n });
            await tick();
        }
        expect(persistOperations).toEqual(['persist', 'persist', 'quarantine']);

        persistor.stop();
        persistor.start();
        variableSnapshotSource.changeValue({ n: 4 });
        await tick();

        expect(variableSnapshotSource.isWatched).toBe(false);
        expect(testPersistBackend.commitCount).toBe(3);

        persistor.destroy();
    });

    it('writes a resource left dirty by a failed autosave before the stop, with no new change', async () => {
        const { testPersistBackend, testPersistSnapshotStrategy, persistor, persistOperations, addVariableResource } =
            buildPersistor();
        const variableSnapshotSource = addVariableResource();
        testPersistBackend.failNextCommits(1);
        persistor.start();
        variableSnapshotSource.changeValue({ n: 1 });
        await tick();
        expect(persistOperations).toEqual(['persist']);

        persistor.stop();
        persistor.start();
        await tick();

        expect(testPersistSnapshotStrategy.writtenSnapshots).toEqual([{ n: 1 }]);

        persistor.destroy();
    });
});

describe('a resource added twice', () => {
    it('is registered once, and a persist writes it once', async () => {
        const testPersistBackend = new OIMTestPersistBackend();
        const testPersistSnapshotStrategy = testPersistBackend.createSnapshotStrategy<TValue>({ storageKey: 'value' });
        const persistor = new OIMPersistor({
            persistBackend: testPersistBackend,
            persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
        });
        const persistResourceSnapshot = new OIMPersistResourceSnapshot({
            persistSnapshotSource: new VariableSnapshotSource(),
            persistSnapshotStrategy: testPersistSnapshotStrategy,
            persistCodec: new OIMPersistCodecIdentity<TValue>(),
        });

        expect(persistor.addPersistResource(persistResourceSnapshot)).toBe(persistResourceSnapshot);
        expect(persistor.addPersistResource(persistResourceSnapshot)).toBe(persistResourceSnapshot);
        await persistor.persist();

        expect(testPersistSnapshotStrategy.writtenSnapshots).toEqual([{ n: 0 }]);
        expect(testPersistBackend.backendLog).toEqual(['value1:start', 'value1:end']);
    });
});
