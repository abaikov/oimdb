import type { IOIMPersistSnapshotSource, TOIMPersistErrorContext } from '../src';
import {
    OIMPersistCodecIdentity,
    OIMPersistResourceSnapshot,
    OIMPersistSchedulerMicrotaskDriven,
    OIMPersistSourceChangeMarkSubscriptionDriven,
    OIMPersistor,
} from '../src';
import { OIMTestPersistBackend } from './shared/OIMTestPersistBackend';

type TValue = { n: number; self?: unknown };
type TTestPersistor = OIMPersistor<OIMTestPersistBackend, ReturnType<OIMTestPersistBackend['createWriteBatch']>>;

const tick = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0); });

function createVariableSource(): {
    persistSnapshotSource: IOIMPersistSnapshotSource<TValue>;
    moveValue: (nextValueOf?: (value: TValue) => TValue) => void;
} {
    let value: TValue = { n: 0 };
    let onSnapshotChanged: () => void = () => undefined;
    const sourceChangedListeners = new Set<() => void>();
    return {
        persistSnapshotSource: {
            readSnapshot: () => value,
            writeSnapshot: snapshot => { value = snapshot; },
            subscribeSnapshotChanged: onChanged => {
                onSnapshotChanged = onChanged;
                return () => { onSnapshotChanged = () => undefined; };
            },
            markSourceChanges: () => new OIMPersistSourceChangeMarkSubscriptionDriven({
                subscribeSourceChanged: onSourceChanged => {
                    sourceChangedListeners.add(onSourceChanged);
                    return () => { sourceChangedListeners.delete(onSourceChanged); };
                },
            }),
        },
        moveValue: nextValueOf => {
            value = nextValueOf === undefined ? { n: value.n + 1 } : nextValueOf(value);
            onSnapshotChanged();
            for (const onSourceChanged of sourceChangedListeners) onSourceChanged();
        },
    };
}

function addVariableResource(persistor: TTestPersistor, testPersistBackend: OIMTestPersistBackend, storageKey: string) {
    const { persistSnapshotSource, moveValue } = createVariableSource();
    const persistResource = persistor.addPersistResource(new OIMPersistResourceSnapshot({
        persistSnapshotSource,
        persistSnapshotStrategy: testPersistBackend.createSnapshotStrategy<TValue>({ storageKey }),
        persistCodec: new OIMPersistCodecIdentity<TValue>(),
    }));
    return { persistResource, moveValue };
}

describe('one value the serializer cannot handle', () => {
    it('does not stop the resources that shared the write batch with it', async () => {
        const testPersistBackend = new OIMTestPersistBackend();
        const persistor = new OIMPersistor({
            persistBackend: testPersistBackend,
            persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
            onPersistError: () => undefined,
        });
        const goodVariableResource = addVariableResource(persistor, testPersistBackend, 'good');
        const badVariableResource = addVariableResource(persistor, testPersistBackend, 'bad');
        persistor.start();

        goodVariableResource.moveValue();
        badVariableResource.moveValue(value => {
            const cyclicValue: TValue = { n: value.n + 1 };
            cyclicValue.self = cyclicValue;
            return cyclicValue;
        });
        await tick();

        expect(testPersistBackend.itemByStorageKey.get('good')).toBe('{"n":1}');
        expect(testPersistBackend.itemByStorageKey.has('bad')).toBe(false);

        persistor.destroy();
    });

    it('gives up on the change after three flushes and says so', async () => {
        const persistErrorContexts: TOIMPersistErrorContext[] = [];
        let attemptCount = 0;
        const testPersistBackend = new OIMTestPersistBackend({
            serializeValue: () => {
                attemptCount++;
                throw new TypeError('Do not know how to serialize a BigInt');
            },
        });
        const persistor = new OIMPersistor({
            persistBackend: testPersistBackend,
            persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
            onPersistError: (_error, persistErrorContext) => { persistErrorContexts.push(persistErrorContext); },
        });
        const { persistResource, moveValue } = addVariableResource(persistor, testPersistBackend, 'value');
        persistor.start();

        moveValue();
        await tick();
        moveValue();
        await tick();
        moveValue();
        await tick();
        expect(attemptCount).toBe(3);
        expect(persistErrorContexts.map(persistErrorContext => persistErrorContext.persistOperation)).toEqual([
            'persist',
            'persist',
            'quarantine',
        ]);
        expect(persistErrorContexts[2].persistResource).toBe(persistResource);

        moveValue();
        await tick();
        moveValue();
        await tick();
        expect(attemptCount).toBe(3);
        expect(persistErrorContexts).toHaveLength(3);

        persistor.destroy();
    });

    it('tells a caller who configured no onPersistError, exactly once', async () => {
        const testPersistBackend = new OIMTestPersistBackend({
            serializeValue: () => {
                throw new TypeError('Converting circular structure to JSON');
            },
        });
        const persistor = new OIMPersistor({
            persistBackend: testPersistBackend,
            persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
        });
        const loggedArguments: unknown[][] = [];
        const consoleError = jest
            .spyOn(console, 'error')
            .mockImplementation((...consoleArguments: unknown[]) => { loggedArguments.push(consoleArguments); });
        const { moveValue } = addVariableResource(persistor, testPersistBackend, 'value');
        persistor.start();

        for (let i = 0; i < 6; i++) {
            moveValue();
            await tick();
        }

        expect(loggedArguments).toHaveLength(1);
        expect(String(loggedArguments[0][0])).toContain('[OIMPersist]');

        consoleError.mockRestore();
        persistor.destroy();
    });

    it('resumes the resource when a manual persist() of it succeeds', async () => {
        let isBroken = true;
        const testPersistBackend = new OIMTestPersistBackend({
            serializeValue: value => {
                if (isBroken) throw new TypeError('Converting circular structure to JSON');
                return JSON.stringify(value);
            },
        });
        const persistor = new OIMPersistor({
            persistBackend: testPersistBackend,
            persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
            onPersistError: () => undefined,
        });
        const { moveValue } = addVariableResource(persistor, testPersistBackend, 'value');
        persistor.start();

        for (let i = 0; i < 4; i++) {
            moveValue();
            await tick();
        }
        expect(testPersistBackend.itemByStorageKey.has('value')).toBe(false);

        isBroken = false;
        await persistor.persist();
        expect(testPersistBackend.itemByStorageKey.get('value')).toBe('{"n":4}');

        moveValue();
        await tick();

        expect(testPersistBackend.itemByStorageKey.get('value')).toBe('{"n":5}');

        persistor.destroy();
    });

    it('leaves a resource that recovers on its own with a clean slate', async () => {
        let failuresLeft = 0;
        let successCount = 0;
        const testPersistBackend = new OIMTestPersistBackend({
            serializeValue: value => {
                if (failuresLeft > 0) {
                    failuresLeft--;
                    throw new Error('storage was busy');
                }
                successCount++;
                return JSON.stringify(value);
            },
        });
        const persistor = new OIMPersistor({
            persistBackend: testPersistBackend,
            persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
            onPersistError: () => undefined,
        });
        const { moveValue } = addVariableResource(persistor, testPersistBackend, 'value');
        persistor.start();

        for (let round = 0; round < 4; round++) {
            failuresLeft = 2;
            moveValue();
            await tick();
            moveValue();
            await tick();
            moveValue();
            await tick();
        }

        expect(successCount).toBe(4);

        persistor.destroy();
    });
});
