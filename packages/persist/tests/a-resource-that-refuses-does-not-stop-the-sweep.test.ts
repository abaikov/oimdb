import type { IOIMPersistSnapshotSource, TOIMPersistErrorContext } from '../src';
import {
    OIMPersistCodecIdentity,
    OIMPersistResourceSnapshot,
    OIMPersistSchedulerMicrotaskDriven,
    OIMPersistSourceChangeMarkSubscriptionDriven,
    OIMPersistor,
} from '../src';
import { OIMTestPersistBackend } from './shared/OIMTestPersistBackend';

type TValue = { text: string };
type TTestPersistor = OIMPersistor<OIMTestPersistBackend, ReturnType<OIMTestPersistBackend['createWriteBatch']>>;

function createVariableSource(initialValue: TValue): {
    persistSnapshotSource: IOIMPersistSnapshotSource<TValue>;
    readCurrentValue: () => TValue;
} {
    let value = initialValue;
    return {
        persistSnapshotSource: {
            readSnapshot: () => value,
            writeSnapshot: snapshot => { value = snapshot; },
            subscribeSnapshotChanged: () => () => undefined,
            markSourceChanges: () => new OIMPersistSourceChangeMarkSubscriptionDriven({ subscribeSourceChanged: () => () => undefined }),
        },
        readCurrentValue: () => value,
    };
}

const tick = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0); });

function createAnnouncingVariableSource(initialValue: TValue, subscribeError?: Error): {
    persistSnapshotSource: IOIMPersistSnapshotSource<TValue>;
    changeValue: (value: TValue) => void;
} {
    let currentValue = initialValue;
    const snapshotChangedListeners = new Set<() => void>();
    return {
        persistSnapshotSource: {
            readSnapshot: () => currentValue,
            writeSnapshot: snapshot => { currentValue = snapshot; },
            subscribeSnapshotChanged: onSnapshotChanged => {
                if (subscribeError !== undefined) throw subscribeError;
                snapshotChangedListeners.add(onSnapshotChanged);
                return () => { snapshotChangedListeners.delete(onSnapshotChanged); };
            },
            markSourceChanges: () => new OIMPersistSourceChangeMarkSubscriptionDriven({ subscribeSourceChanged: () => () => undefined }),
        },
        changeValue: value => {
            currentValue = value;
            for (const onSnapshotChanged of snapshotChangedListeners) onSnapshotChanged();
        },
    };
}

function addSweepResource(
    persistor: TTestPersistor,
    testPersistBackend: OIMTestPersistBackend,
    persistSnapshotSource: IOIMPersistSnapshotSource<TValue>,
    name: string,
) {
    const testPersistSnapshotStrategy = testPersistBackend.createSnapshotStrategy<TValue>({
        storageKey: name,
        storedSnapshot: { text: `${name}-stored` },
    });
    persistor.addPersistResource(new OIMPersistResourceSnapshot({
        persistSnapshotSource,
        persistSnapshotStrategy: testPersistSnapshotStrategy,
        persistCodec: new OIMPersistCodecIdentity<TValue>(),
    }));
    return testPersistSnapshotStrategy;
}

function buildTwo(
    refusedOperation: 'read' | 'clear',
    onPersistErrorContext?: (persistErrorContext: TOIMPersistErrorContext) => void,
) {
    const testPersistBackend = new OIMTestPersistBackend();
    const persistor = new OIMPersistor({
        persistBackend: testPersistBackend,
        persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
        onPersistError: onPersistErrorContext === undefined
            ? undefined
            : (_error, persistErrorContext) => { onPersistErrorContext(persistErrorContext); },
    });
    const firstVariableSource = createVariableSource({ text: 'first-live' });
    const secondVariableSource = createVariableSource({ text: 'second-live' });
    const firstTestPersistSnapshotStrategy = addSweepResource(persistor, testPersistBackend, firstVariableSource.persistSnapshotSource, 'first');
    if (refusedOperation === 'read') firstTestPersistSnapshotStrategy.failReadSnapshot(new Error('storage is unreadable'));
    if (refusedOperation === 'clear') firstTestPersistSnapshotStrategy.failDeleteSnapshot(new Error('first is unwritable'));
    addSweepResource(persistor, testPersistBackend, secondVariableSource.persistSnapshotSource, 'second');
    return { persistor, testPersistBackend, readSecondValue: secondVariableSource.readCurrentValue };
}

describe('a hydrate sweep in which one resource fails', () => {
    it('reads every OTHER resource, and still raises the failure to the caller', async () => {
        const { persistor, readSecondValue } = buildTwo('read');

        await expect(persistor.hydrate()).rejects.toThrow('storage is unreadable');

        expect(readSecondValue()).toEqual({ text: 'second-stored' });
    });

    it('and does exactly that when an onPersistError is configured, which is the same call', async () => {
        const persistErrorContexts: TOIMPersistErrorContext[] = [];
        const { persistor, readSecondValue } = buildTwo('read', persistErrorContext => {
            persistErrorContexts.push(persistErrorContext);
        });

        await expect(persistor.hydrate()).resolves.toBeUndefined();

        expect(persistErrorContexts.map(persistErrorContext => persistErrorContext.persistOperation)).toEqual(['hydrate']);
        expect(readSecondValue()).toEqual({ text: 'second-stored' });
    });

    it('clearPersisted, the sibling sweep, finishes and reports with no onPersistError either', async () => {
        const { persistor, testPersistBackend } = buildTwo('clear');

        await expect(persistor.clearPersisted()).rejects.toThrow('first is unwritable');

        expect(testPersistBackend.clearedStorageKeys).toEqual(['second']);
    });

    it('with TWO failing and no onPersistError, every failure reaches the caller, not just the first', async () => {
        const testPersistBackend = new OIMTestPersistBackend();
        const persistor = new OIMPersistor({
            persistBackend: testPersistBackend,
            persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
        });
        for (const name of ['first', 'second']) {
            addSweepResource(persistor, testPersistBackend, createVariableSource({ text: `${name}-live` }).persistSnapshotSource, name)
                .failDeleteSnapshot(new Error(`${name} is unwritable`));
        }

        const raised = await persistor.clearPersisted().then(
            () => undefined,
            (error: unknown) => error,
        );

        expect(raised).toBeInstanceOf(AggregateError);
        expect((raised as AggregateError).errors.map(error => (error as Error).message))
            .toEqual(['first is unwritable', 'second is unwritable']);
        expect(testPersistBackend.clearedStorageKeys).toEqual([]);
    });

    it('hydrates both when neither fails', async () => {
        const { persistor, readSecondValue } = buildTwo('clear');

        await expect(persistor.hydrate()).resolves.toBeUndefined();

        expect(readSecondValue()).toEqual({ text: 'second-stored' });
    });
});

describe('a start in which one resource refuses', () => {
    function buildRefusingFirst(onPersistErrorContext?: (persistErrorContext: TOIMPersistErrorContext) => void) {
        const testPersistBackend = new OIMTestPersistBackend();
        const persistor = new OIMPersistor({
            persistBackend: testPersistBackend,
            persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
            onPersistError: onPersistErrorContext === undefined
                ? undefined
                : (_error, persistErrorContext) => { onPersistErrorContext(persistErrorContext); },
        });
        const firstAnnouncingVariableSource = createAnnouncingVariableSource({ text: 'first-live' }, new Error('first refuses to start'));
        const secondAnnouncingVariableSource = createAnnouncingVariableSource({ text: 'second-live' });
        const firstTestPersistSnapshotStrategy =
            addSweepResource(persistor, testPersistBackend, firstAnnouncingVariableSource.persistSnapshotSource, 'first');
        const secondTestPersistSnapshotStrategy =
            addSweepResource(persistor, testPersistBackend, secondAnnouncingVariableSource.persistSnapshotSource, 'second');
        return { persistor, firstTestPersistSnapshotStrategy, secondTestPersistSnapshotStrategy, secondAnnouncingVariableSource };
    }

    it('starts every other resource and the scheduler, and hands the refusal to onPersistError as a start', async () => {
        const persistErrorContexts: TOIMPersistErrorContext[] = [];
        const { persistor, firstTestPersistSnapshotStrategy, secondTestPersistSnapshotStrategy, secondAnnouncingVariableSource } =
            buildRefusingFirst(persistErrorContext => { persistErrorContexts.push(persistErrorContext); });

        expect(() => { persistor.start(); }).not.toThrow();
        expect(persistErrorContexts.map(persistErrorContext => persistErrorContext.persistOperation)).toEqual(['start']);

        secondAnnouncingVariableSource.changeValue({ text: 'second-edited' });
        await tick();

        expect(secondTestPersistSnapshotStrategy.writtenSnapshots).toEqual([{ text: 'second-edited' }]);
        expect(firstTestPersistSnapshotStrategy.writtenSnapshots).toEqual([]);

        persistor.destroy();
    });

    it('raises every refusal as one AggregateError with no onPersistError, having started the rest', async () => {
        const { persistor, secondTestPersistSnapshotStrategy, secondAnnouncingVariableSource } = buildRefusingFirst();

        let raised: unknown;
        try {
            persistor.start();
        } catch (error) {
            raised = error;
        }

        expect(raised).toBeInstanceOf(AggregateError);
        expect((raised as AggregateError).errors.map(error => (error as Error).message)).toEqual(['first refuses to start']);

        secondAnnouncingVariableSource.changeValue({ text: 'second-edited' });
        await tick();

        expect(secondTestPersistSnapshotStrategy.writtenSnapshots).toEqual([{ text: 'second-edited' }]);

        persistor.destroy();
    });
});

describe('a resource registered on a started persistor whose start throws', () => {
    it('is not registered, and the throw reaches the caller', async () => {
        const testPersistBackend = new OIMTestPersistBackend();
        const persistor = new OIMPersistor({
            persistBackend: testPersistBackend,
            persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
        });
        persistor.start();
        const firstTestPersistSnapshotStrategy = testPersistBackend.createSnapshotStrategy<TValue>({ storageKey: 'first' });
        const persistResourceSnapshot = new OIMPersistResourceSnapshot({
            persistSnapshotSource: createAnnouncingVariableSource({ text: 'first-live' }, new Error('first refuses to start'))
                .persistSnapshotSource,
            persistSnapshotStrategy: firstTestPersistSnapshotStrategy,
            persistCodec: new OIMPersistCodecIdentity<TValue>(),
        });

        expect(() => persistor.addPersistResource(persistResourceSnapshot)).toThrow('first refuses to start');
        const secondTestPersistSnapshotStrategy = addSweepResource(
            persistor, testPersistBackend, createAnnouncingVariableSource({ text: 'second-live' }).persistSnapshotSource, 'second',
        );
        await persistor.persist();

        expect(firstTestPersistSnapshotStrategy.writtenSnapshots).toEqual([]);
        expect(secondTestPersistSnapshotStrategy.writtenSnapshots).toEqual([{ text: 'second-live' }]);

        persistor.destroy();
    });
});
