import type { TOIMDisposer } from '@oimdb/core';
import type { IOIMPersistSnapshotSource, IOIMPersistSourceChangeMark } from '../src';
import {
    OIMPersistCodecIdentity,
    OIMPersistResourceSnapshot,
    OIMPersistSchedulerMicrotaskDriven,
    OIMPersistSourceChangeMarkSubscriptionDriven,
    OIMPersistor,
} from '../src';
import { OIMTestPersistBackend } from './shared/OIMTestPersistBackend';

type TValue = { n: number };

const tick = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0); });

class VariableSnapshotSource implements IOIMPersistSnapshotSource<TValue> {
    private value: TValue;
    private onSnapshotChanged: () => void = () => undefined;
    private readonly sourceChangedListeners = new Set<() => void>();

    public constructor(value: TValue) {
        this.value = value;
    }

    public readSnapshot(): TValue {
        return this.value;
    }

    public writeSnapshot(value: TValue): void {
        this.value = value;
    }

    public subscribeSnapshotChanged(onSnapshotChanged: () => void): TOIMDisposer {
        this.onSnapshotChanged = onSnapshotChanged;
        onSnapshotChanged();
        return () => { this.onSnapshotChanged = () => undefined; };
    }

    public markSourceChanges(): IOIMPersistSourceChangeMark {
        return new OIMPersistSourceChangeMarkSubscriptionDriven({
            subscribeSourceChanged: onSourceChanged => {
                this.sourceChangedListeners.add(onSourceChanged);
                return () => { this.sourceChangedListeners.delete(onSourceChanged); };
            },
        });
    }

    public changeValue(value: TValue): void {
        this.value = value;
        this.onSnapshotChanged();
        for (const onSourceChanged of this.sourceChangedListeners) onSourceChanged();
    }
}

function buildGatedPersistor(storedValue?: TValue) {
    const testPersistBackend = new OIMTestPersistBackend();
    testPersistBackend.closeGate();
    const persistor = new OIMPersistor({
        persistBackend: testPersistBackend,
        persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
    });
    const addVariableResource = (name: string) => {
        const variableSnapshotSource = new VariableSnapshotSource({ n: 0 });
        const testPersistSnapshotStrategy = testPersistBackend.createSnapshotStrategy<TValue>({ storageKey: name, storedSnapshot: storedValue });
        persistor.addPersistResource(new OIMPersistResourceSnapshot({
            persistSnapshotSource: variableSnapshotSource,
            persistSnapshotStrategy: testPersistSnapshotStrategy,
            persistCodec: new OIMPersistCodecIdentity<TValue>(),
        }));
        return { variableSnapshotSource, testPersistSnapshotStrategy };
    };
    return { testPersistBackend, persistor, addVariableResource };
}

describe('OIMPersistor runs one ordered chain of storage work', () => {
    it('does not start a manual persist while an autosave commit is in flight', async () => {
        const { testPersistBackend, persistor, addVariableResource } = buildGatedPersistor();
        const { variableSnapshotSource } = addVariableResource('write');
        persistor.start();
        variableSnapshotSource.changeValue({ n: 1 });
        await tick();
        expect(testPersistBackend.backendLog).toEqual(['write1:start']);

        const persisting = persistor.persist();
        await tick();
        expect(testPersistBackend.backendLog).toEqual(['write1:start']);

        testPersistBackend.openGate();
        await persisting;
        expect(testPersistBackend.backendLog).toEqual(['write1:start', 'write1:end', 'write2:start', 'write2:end']);

        persistor.destroy();
    });

    it('resolves whenIdle() only once the in-flight commit has finished', async () => {
        const { testPersistBackend, persistor, addVariableResource } = buildGatedPersistor();
        const { variableSnapshotSource } = addVariableResource('write');
        persistor.start();
        variableSnapshotSource.changeValue({ n: 1 });
        await tick();

        let isIdle = false;
        void persistor.whenIdle().then(() => { isIdle = true; });
        await tick();
        expect(isIdle).toBe(false);
        expect(testPersistBackend.backendLog).toEqual(['write1:start']);

        testPersistBackend.openGate();
        await persistor.whenIdle();
        expect(isIdle).toBe(true);
        expect(testPersistBackend.backendLog).toEqual(['write1:start', 'write1:end']);

        persistor.destroy();
    });

    it('orders a hydrate issued before start() ahead of the write the start produces', async () => {
        const { testPersistBackend, persistor, addVariableResource } = buildGatedPersistor({ n: 9 });
        const { variableSnapshotSource, testPersistSnapshotStrategy } = addVariableResource('write');

        const hydrating = persistor.hydrate();
        persistor.start();
        await tick();
        expect(testPersistBackend.backendLog).toEqual(['read:start']);

        testPersistBackend.openGate();
        await hydrating;
        await tick();
        expect(testPersistBackend.backendLog).toEqual(['read:start', 'read:end', 'write1:start', 'write1:end']);
        expect(variableSnapshotSource.readSnapshot()).toEqual({ n: 9 });
        expect(testPersistSnapshotStrategy.writtenSnapshots).toEqual([{ n: 9 }]);

        variableSnapshotSource.changeValue({ n: 2 });
        await tick();
        expect(testPersistBackend.backendLog[testPersistBackend.backendLog.length - 1]).toBe('write2:end');
        expect(testPersistSnapshotStrategy.writtenSnapshots).toEqual([{ n: 9 }, { n: 2 }]);

        persistor.destroy();
    });

    it('runs a clearPersisted after the write that was already queued', async () => {
        const { testPersistBackend, persistor, addVariableResource } = buildGatedPersistor();
        const { variableSnapshotSource } = addVariableResource('write');
        persistor.start();
        variableSnapshotSource.changeValue({ n: 1 });
        await tick();

        const clearing = persistor.clearPersisted();
        await tick();
        expect(testPersistBackend.backendLog).toEqual(['write1:start']);

        testPersistBackend.openGate();
        await clearing;
        expect(testPersistBackend.backendLog).toEqual(['write1:start', 'write1:end', 'clear:start', 'clear:end']);

        persistor.destroy();
    });

    it('writes every resource dirty at one drain into one write batch, committed once', async () => {
        const { testPersistBackend, persistor, addVariableResource } = buildGatedPersistor();
        const first = addVariableResource('first');
        const second = addVariableResource('second');
        testPersistBackend.openGate();
        persistor.start();
        await tick();
        expect(testPersistBackend.backendLog).toEqual(['first1+second1:start', 'first1+second1:end']);

        first.variableSnapshotSource.changeValue({ n: 1 });
        second.variableSnapshotSource.changeValue({ n: 2 });
        await tick();
        expect(testPersistBackend.backendLog.slice(2)).toEqual(['first2+second2:start', 'first2+second2:end']);
        expect(first.testPersistSnapshotStrategy.writtenSnapshots).toEqual([{ n: 0 }, { n: 1 }]);
        expect(second.testPersistSnapshotStrategy.writtenSnapshots).toEqual([{ n: 0 }, { n: 2 }]);

        persistor.destroy();
    });

    it('queues a change made while a commit is in flight into the next commit, not into the running one', async () => {
        const { testPersistBackend, persistor, addVariableResource } = buildGatedPersistor();
        const { variableSnapshotSource, testPersistSnapshotStrategy } = addVariableResource('write');
        persistor.start();
        await tick();
        expect(testPersistBackend.backendLog).toEqual(['write1:start']);

        variableSnapshotSource.changeValue({ n: 1 });
        await tick();
        expect(testPersistBackend.backendLog).toEqual(['write1:start']);

        testPersistBackend.openGate();
        await persistor.whenIdle();
        await tick();
        expect(testPersistBackend.backendLog).toEqual(['write1:start', 'write1:end', 'write2:start', 'write2:end']);
        expect(testPersistSnapshotStrategy.writtenSnapshots).toEqual([{ n: 0 }, { n: 1 }]);

        persistor.destroy();
    });
});
