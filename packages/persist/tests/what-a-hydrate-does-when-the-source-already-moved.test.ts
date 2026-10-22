import type { TOIMBucketSlotsSetStore, TOIMDisposer, TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';
import {
    OIMDB,
    OIMSlotContentBucketServiceSetDriven,
    createOIMBucketService,
    createOIMEntityService,
    createOIMSingleEntityService,
} from '@oimdb/core';
import type {
    IOIMPersistSnapshotSource, IOIMPersistSourceChangeMark, TOIMPersistHydrateReconcile, TOIMPersistOperation,
} from '../src';
import {
    OIMPersistCodecIdentity,
    OIMPersistRecordSourceBucketDriven,
    OIMPersistResourceRecords,
    OIMPersistResourceSnapshot,
    OIMPersistSchedulerMicrotaskDriven,
    OIMPersistSnapshotSourceSingleEntityDriven,
    OIMPersistSourceChangeMarkSubscriptionDriven,
    OIMPersistor,
} from '../src';
import { OIMTestPersistBackend } from './shared/OIMTestPersistBackend';

type TValue = { text: string };
type TSettings = { theme: string };
type TUser = { id: string; name: string };
type TUserSlot = TOIMEntitySlot<TUser, TOIMStoreKey>;
type TUserSlots = TOIMBucketSlotsSetStore<TUserSlot>;

const tick = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0); });

class SingleListenerSnapshotSource implements IOIMPersistSnapshotSource<TValue> {
    private value: TValue = { text: 'live' };
    private onSnapshotChanged: (() => void) | undefined = undefined;
    private readonly sourceChangedListeners = new Set<() => void>();
    private readonly reportsAtSubscribe: boolean;

    public constructor(reportsAtSubscribe: boolean) {
        this.reportsAtSubscribe = reportsAtSubscribe;
    }

    public get isWatched(): boolean {
        return this.onSnapshotChanged !== undefined;
    }

    public get isMarked(): boolean {
        return this.sourceChangedListeners.size !== 0;
    }

    public readSnapshot(): TValue {
        return this.value;
    }

    public writeSnapshot(value: TValue): void {
        this.value = value;
    }

    public subscribeSnapshotChanged(onSnapshotChanged: () => void): TOIMDisposer {
        this.onSnapshotChanged = onSnapshotChanged;
        if (this.reportsAtSubscribe) onSnapshotChanged();
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

    public edit(text: string): void {
        this.value = { text };
        this.onSnapshotChanged?.();
        for (const onSourceChanged of this.sourceChangedListeners) onSourceChanged();
    }
}

type TBuildOptions = {
    readonly reportsAtSubscribe?: boolean;
    readonly persistHydrateReconcile?: TOIMPersistHydrateReconcile<TValue>;
};

function build(storedValue: TValue, buildOptions: TBuildOptions = {}) {
    const persistOperations: TOIMPersistOperation[] = [];
    const testPersistBackend = new OIMTestPersistBackend();
    testPersistBackend.closeGate();
    const persistor = new OIMPersistor({
        persistBackend: testPersistBackend,
        persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
        onPersistError: (_error, persistErrorContext) => { persistOperations.push(persistErrorContext.persistOperation); },
    });
    const singleListenerSnapshotSource = new SingleListenerSnapshotSource(buildOptions.reportsAtSubscribe ?? false);
    persistor.addPersistResource(new OIMPersistResourceSnapshot({
        persistSnapshotSource: singleListenerSnapshotSource,
        persistSnapshotStrategy: testPersistBackend.createSnapshotStrategy<TValue>({ storageKey: 'value', storedSnapshot: storedValue }),
        persistCodec: new OIMPersistCodecIdentity<TValue>(),
        persistHydrateReconcile: buildOptions.persistHydrateReconcile,
    }));
    const readStoredValue = (): unknown => {
        const item = testPersistBackend.itemByStorageKey.get('value');
        return item === undefined ? undefined : JSON.parse(item);
    };
    return { persistor, singleListenerSnapshotSource, testPersistBackend, persistOperations, readStoredValue };
}

const joinTexts: TOIMPersistHydrateReconcile<TValue> = (currentValue, incomingValue) => ({
    text: `${currentValue.text}+${incomingValue.text}`,
});

describe('hydrate against a started resource whose source changed while the read was in flight', () => {
    it('skips the snapshot and reports it, rather than reverting the change', async () => {
        const { persistor, singleListenerSnapshotSource, testPersistBackend, persistOperations } =
            build({ text: 'stored' });
        persistor.start();

        const hydrating = persistor.hydrate();
        await tick();
        singleListenerSnapshotSource.edit('edited');
        testPersistBackend.openGate();
        await hydrating;

        expect(singleListenerSnapshotSource.readSnapshot()).toEqual({ text: 'edited' });
        expect(persistOperations).toEqual(['hydrate']);

        persistor.destroy();
    });

    it('still autosaves the change the refused snapshot would have reverted', async () => {
        const { persistor, singleListenerSnapshotSource, testPersistBackend, readStoredValue } =
            build({ text: 'stored' });
        persistor.start();

        const hydrating = persistor.hydrate();
        await tick();
        singleListenerSnapshotSource.edit('edited');
        testPersistBackend.openGate();
        await hydrating;
        await persistor.whenIdle();

        expect(readStoredValue()).toEqual({ text: 'edited' });

        persistor.destroy();
    });

    it('applies the snapshot when nothing moved during the read', async () => {
        const { persistor, singleListenerSnapshotSource, testPersistBackend, persistOperations } =
            build({ text: 'stored' });
        persistor.start();

        const hydrating = persistor.hydrate();
        await tick();
        testPersistBackend.openGate();
        await hydrating;

        expect(singleListenerSnapshotSource.readSnapshot()).toEqual({ text: 'stored' });
        expect(persistOperations).toEqual([]);

        persistor.destroy();
    });

    it('applies the reconcile instead of skipping, when one is set', async () => {
        const { persistor, singleListenerSnapshotSource, testPersistBackend, persistOperations } =
            build({ text: 'stored' }, { persistHydrateReconcile: joinTexts });
        persistor.start();

        const hydrating = persistor.hydrate();
        await tick();
        singleListenerSnapshotSource.edit('edited');
        testPersistBackend.openGate();
        await hydrating;

        expect(singleListenerSnapshotSource.readSnapshot()).toEqual({ text: 'edited+stored' });
        expect(persistOperations).toEqual([]);

        persistor.destroy();
    });

    it('does not count a change made before the read started', async () => {
        const { persistor, singleListenerSnapshotSource, testPersistBackend, persistOperations } =
            build({ text: 'stored' });
        persistor.start();
        singleListenerSnapshotSource.edit('earlier');

        const hydrating = persistor.hydrate();
        await tick();
        testPersistBackend.openGate();
        await hydrating;

        expect(singleListenerSnapshotSource.readSnapshot()).toEqual({ text: 'stored' });
        expect(persistOperations).toEqual([]);

        persistor.destroy();
    });

    it('does not mount a second watch on a resource that is already started', async () => {
        const { persistor, singleListenerSnapshotSource, testPersistBackend, persistOperations, readStoredValue } =
            build({ text: 'stored' });
        persistor.start();

        const hydrating = persistor.hydrate();
        await tick();
        testPersistBackend.openGate();
        await hydrating;

        expect(singleListenerSnapshotSource.isWatched).toBe(true);
        singleListenerSnapshotSource.edit('after');
        await tick();

        expect(readStoredValue()).toEqual({ text: 'after' });
        expect(persistOperations).toEqual([]);

        persistor.destroy();
    });

    it('rejects the hydrate with the refusal when no onPersistError is given', async () => {
        const singleListenerSnapshotSource = new SingleListenerSnapshotSource(false);
        const testPersistBackend = new OIMTestPersistBackend();
        testPersistBackend.closeGate();
        const persistor = new OIMPersistor({
            persistBackend: testPersistBackend,
            persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
        });
        persistor.addPersistResource(new OIMPersistResourceSnapshot({
            persistSnapshotSource: singleListenerSnapshotSource,
            persistSnapshotStrategy: testPersistBackend.createSnapshotStrategy<TValue>({ storageKey: 'value', storedSnapshot: { text: 'stored' } }),
            persistCodec: new OIMPersistCodecIdentity<TValue>(),
        }));
        persistor.start();

        const hydrating = persistor.hydrate();
        await tick();
        singleListenerSnapshotSource.edit('edited');
        testPersistBackend.openGate();

        await expect(hydrating).rejects.toBeInstanceOf(AggregateError);
        expect(singleListenerSnapshotSource.readSnapshot()).toEqual({ text: 'edited' });

        persistor.destroy();
    });
});

describe('hydrate issued before start()', () => {
    it('refuses to clobber a change made while the read was in flight', async () => {
        const { persistor, singleListenerSnapshotSource, testPersistBackend, persistOperations } =
            build({ text: 'stored' });

        const hydrating = persistor.hydrate();
        await tick();
        singleListenerSnapshotSource.edit('edited');
        testPersistBackend.openGate();
        await hydrating;

        expect(singleListenerSnapshotSource.readSnapshot()).toEqual({ text: 'edited' });
        expect(persistOperations).toEqual(['hydrate']);
    });

    it('merges instead of refusing when a reconcile is set', async () => {
        const { persistor, singleListenerSnapshotSource, testPersistBackend, persistOperations } =
            build({ text: 'stored' }, { persistHydrateReconcile: joinTexts });

        const hydrating = persistor.hydrate();
        await tick();
        singleListenerSnapshotSource.edit('edited');
        testPersistBackend.openGate();
        await hydrating;

        expect(singleListenerSnapshotSource.readSnapshot()).toEqual({ text: 'edited+stored' });
        expect(persistOperations).toEqual([]);
    });

    it('applies the snapshot when nothing moved during the read', async () => {
        const { persistor, singleListenerSnapshotSource, testPersistBackend, persistOperations } =
            build({ text: 'stored' });

        const hydrating = persistor.hydrate();
        await tick();
        testPersistBackend.openGate();
        await hydrating;
        persistor.start();

        expect(singleListenerSnapshotSource.readSnapshot()).toEqual({ text: 'stored' });
        expect(persistOperations).toEqual([]);

        persistor.destroy();
    });

    it('does not mistake the report a watch makes at subscribe, during the read, for a change', async () => {
        const { persistor, singleListenerSnapshotSource, testPersistBackend, persistOperations } =
            build({ text: 'stored' }, { reportsAtSubscribe: true });

        const hydrating = persistor.hydrate();
        await tick();
        persistor.start();
        testPersistBackend.openGate();
        await hydrating;

        expect(singleListenerSnapshotSource.readSnapshot()).toEqual({ text: 'stored' });
        expect(persistOperations).toEqual([]);

        persistor.destroy();
    });

    it('closes the mark it opened, on the applying path and the refusing one, and opens no watch', async () => {
        const applied = build({ text: 'stored' });
        const applying = applied.persistor.hydrate();
        await tick();
        expect(applied.singleListenerSnapshotSource.isMarked).toBe(true);
        expect(applied.singleListenerSnapshotSource.isWatched).toBe(false);
        applied.testPersistBackend.openGate();
        await applying;
        expect(applied.singleListenerSnapshotSource.isMarked).toBe(false);

        const refused = build({ text: 'stored' });
        const refusing = refused.persistor.hydrate();
        await tick();
        refused.singleListenerSnapshotSource.edit('edited');
        refused.testPersistBackend.openGate();
        await refusing;
        expect(refused.persistOperations).toEqual(['hydrate']);
        expect(refused.singleListenerSnapshotSource.isMarked).toBe(false);
    });

    it('writes nothing for the hydrate itself, and autosaves the first change after start()', async () => {
        const { persistor, singleListenerSnapshotSource, testPersistBackend, persistOperations, readStoredValue } =
            build({ text: 'stored' });

        const hydrating = persistor.hydrate();
        await tick();
        testPersistBackend.openGate();
        await hydrating;
        persistor.start();
        await tick();
        expect(readStoredValue()).toBeUndefined();

        singleListenerSnapshotSource.edit('after');
        await tick();
        expect(readStoredValue()).toEqual({ text: 'after' });
        expect(persistOperations).toEqual([]);

        persistor.destroy();
    });

    it('leaves the started resource guarding the next hydrate of the same persistor', async () => {
        const { persistor, singleListenerSnapshotSource, testPersistBackend, persistOperations } =
            build({ text: 'stored' });

        const hydrating = persistor.hydrate();
        await tick();
        testPersistBackend.openGate();
        await hydrating;
        persistor.start();
        expect(singleListenerSnapshotSource.readSnapshot()).toEqual({ text: 'stored' });

        testPersistBackend.closeGate();
        const secondHydrating = persistor.hydrate();
        await tick();
        singleListenerSnapshotSource.edit('edited');
        testPersistBackend.openGate();
        await secondHydrating;

        expect(singleListenerSnapshotSource.readSnapshot()).toEqual({ text: 'edited' });
        expect(persistOperations).toEqual(['hydrate']);

        persistor.destroy();
    });
});

describe('hydrate against an effect-driven source written while the read is in flight, with no frame run', () => {
    it('refuses on a single entity source instead of clobbering the write', async () => {
        const db = new OIMDB();
        const singleEntityService = createOIMSingleEntityService<TSettings>(db);
        const singleEntityStoreSlot = singleEntityService.createStoreSlot(db);
        singleEntityService.slotContentService.upsertEntity(singleEntityStoreSlot, { theme: 'dark' });
        db.flush();
        const persistOperations: TOIMPersistOperation[] = [];
        const testPersistBackend = new OIMTestPersistBackend();
        testPersistBackend.closeGate();
        const persistor = new OIMPersistor({
            persistBackend: testPersistBackend,
            persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
            onPersistError: (_error, persistErrorContext) => { persistOperations.push(persistErrorContext.persistOperation); },
        });
        persistor.addPersistResource(new OIMPersistResourceSnapshot({
            persistSnapshotSource: new OIMPersistSnapshotSourceSingleEntityDriven<TSettings>({
                channelMap: db, singleSlotService: singleEntityService, entityStoreSlot: singleEntityStoreSlot,
            }),
            persistSnapshotStrategy: testPersistBackend.createSnapshotStrategy<TSettings>({
                storageKey: 'settings', storedSnapshot: { theme: 'stored' },
            }),
            persistCodec: new OIMPersistCodecIdentity<TSettings>(),
        }));

        const hydrating = persistor.hydrate();
        await tick();
        singleEntityService.slotContentService.updateEntity(singleEntityService.getSingleSlot(singleEntityStoreSlot), { theme: 'typed' });
        testPersistBackend.openGate();
        await hydrating;

        expect(persistOperations).toEqual(['hydrate']);
        expect(singleEntityService.findSingleSlot(singleEntityStoreSlot)?.entity).toEqual({ theme: 'typed' });
    });

    it('refuses on a bucket source when a member nothing else holds is written', async () => {
        const db = new OIMDB();
        const userEntityService = createOIMEntityService<TUser>(db, { keyOf: user => user.id });
        const userEntityStoreSlot = userEntityService.createStoreSlot(db);
        const userBucketService = createOIMBucketService<
            TUserSlot, TOIMStoreKey, TUserSlots, OIMSlotContentBucketServiceSetDriven<TUserSlot>
        >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TUserSlot>() });
        const userBucketStoreSlot = userBucketService.createStoreSlot(db);
        const bucketSlot = userBucketService.holdSlotByKey(userBucketStoreSlot, 'all');
        const userSlot = userEntityService.slotContentService.upsertEntity(userEntityStoreSlot, { id: 'u1', name: 'Ada' });
        userBucketService.slotContentService.writeBucketMemberSlots(bucketSlot, [userSlot]);
        db.flush();
        const persistOperations: TOIMPersistOperation[] = [];
        const testPersistBackend = new OIMTestPersistBackend<TOIMStoreKey, TUser>();
        testPersistBackend.storeRecords({ records: [{ key: 'u1', entity: { id: 'u1', name: 'Stored' } }] });
        testPersistBackend.closeGate();
        const persistor = new OIMPersistor({
            persistBackend: testPersistBackend,
            persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
            onPersistError: (_error, persistErrorContext) => { persistOperations.push(persistErrorContext.persistOperation); },
        });
        persistor.addPersistResource(new OIMPersistResourceRecords({
            persistRecordSource: new OIMPersistRecordSourceBucketDriven({
                channelMap: db,
                entityCollectionService: userEntityService,
                entityStoreSlot: userEntityStoreSlot,
                slotContentBucketService: userBucketService.slotContentService,
                bucketSlot,
            }),
            persistRecordsStrategy: testPersistBackend.createRecordsStrategy(),
        }));

        const hydrating = persistor.hydrate();
        await tick();
        userEntityService.slotContentService.updateEntity(userEntityService.getSlotByKey(userEntityStoreSlot, 'u1'), { name: 'Typed' });
        testPersistBackend.openGate();
        await hydrating;

        expect(persistOperations).toEqual(['hydrate']);
        expect(userEntityService.slotContentService.findEntityByKey(userEntityStoreSlot, 'u1')?.name).toBe('Typed');
    });
});
