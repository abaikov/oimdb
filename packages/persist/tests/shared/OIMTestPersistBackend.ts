import type {
    IOIMPersistBackend,
    IOIMPersistRecordsStrategy,
    IOIMPersistSnapshotStrategy,
    IOIMPersistWriteBatch,
    TOIMPersistRecords,
    TOIMPersistRecordsDelta,
} from '../../src';

class OIMTestPersistWriteBatch<TKey, TEntity extends object> implements IOIMPersistWriteBatch {
    private readonly testPersistBackend: OIMTestPersistBackend<TKey, TEntity>;
    private readonly labels: string[] = [];
    private readonly backendWritePreparers: (() => () => void)[] = [];

    public constructor(testPersistWriteBatchOptions: { readonly testPersistBackend: OIMTestPersistBackend<TKey, TEntity> }) {
        this.testPersistBackend = testPersistWriteBatchOptions.testPersistBackend;
    }

    public addLabel(label: string): void {
        this.labels.push(label);
    }

    public addBackendWrite(prepareBackendWrite: () => () => void): void {
        this.backendWritePreparers.push(prepareBackendWrite);
    }

    public commit(): Promise<void> {
        return this.testPersistBackend.commitBackendWrites(this.labels.join('+'), this.backendWritePreparers);
    }
}

class OIMTestPersistSnapshotStrategy<TKey, TEntity extends object, TSnapshot>
implements IOIMPersistSnapshotStrategy<OIMTestPersistBackend<TKey, TEntity>, OIMTestPersistWriteBatch<TKey, TEntity>, TSnapshot> {
    public readonly writtenSnapshots: TSnapshot[] = [];
    private readonly testPersistBackend: OIMTestPersistBackend<TKey, TEntity>;
    private readonly storageKey: string;
    private storedSnapshot: TSnapshot | undefined;
    private writeSnapshotCount = 0;
    private readSnapshotError: Error | undefined = undefined;
    private deleteSnapshotError: Error | undefined = undefined;

    public constructor(testPersistSnapshotStrategyOptions: {
        readonly testPersistBackend: OIMTestPersistBackend<TKey, TEntity>;
        readonly storageKey: string;
        readonly storedSnapshot?: TSnapshot | undefined;
    }) {
        this.testPersistBackend = testPersistSnapshotStrategyOptions.testPersistBackend;
        this.storageKey = testPersistSnapshotStrategyOptions.storageKey;
        this.storedSnapshot = testPersistSnapshotStrategyOptions.storedSnapshot;
    }

    public failReadSnapshot(readSnapshotError: Error): void {
        this.readSnapshotError = readSnapshotError;
    }

    public failDeleteSnapshot(deleteSnapshotError: Error): void {
        this.deleteSnapshotError = deleteSnapshotError;
    }

    public async readSnapshot(testPersistBackend: OIMTestPersistBackend<TKey, TEntity>): Promise<TSnapshot | undefined> {
        await testPersistBackend.passReadGate();
        if (this.readSnapshotError !== undefined) throw this.readSnapshotError;
        return this.storedSnapshot;
    }

    public writeSnapshot(testPersistWriteBatch: OIMTestPersistWriteBatch<TKey, TEntity>, snapshot: TSnapshot): void {
        this.writeSnapshotCount++;
        testPersistWriteBatch.addLabel(`${this.storageKey}${this.writeSnapshotCount}`);
        testPersistWriteBatch.addBackendWrite(() => {
            const item = this.testPersistBackend.serializeValue(snapshot);
            return () => {
                this.testPersistBackend.itemByStorageKey.set(this.storageKey, item);
                this.storedSnapshot = snapshot;
                this.writtenSnapshots.push(snapshot);
            };
        });
    }

    public deleteSnapshot(testPersistWriteBatch: OIMTestPersistWriteBatch<TKey, TEntity>): void {
        if (this.deleteSnapshotError !== undefined) throw this.deleteSnapshotError;
        testPersistWriteBatch.addLabel('clear');
        testPersistWriteBatch.addBackendWrite(() => () => {
            this.testPersistBackend.itemByStorageKey.delete(this.storageKey);
            this.testPersistBackend.clearedStorageKeys.push(this.storageKey);
            this.storedSnapshot = undefined;
        });
    }
}

export class OIMTestPersistBackend<TKey = unknown, TEntity extends object = object>
implements IOIMPersistBackend<OIMTestPersistWriteBatch<TKey, TEntity>> {
    public readonly serializeValue: (value: unknown) => string;
    public readonly itemByStorageKey = new Map<string, string>();
    public readonly clearedStorageKeys: string[] = [];
    public readonly entityByKey = new Map<TKey, TEntity>();
    public readonly writtenPersistRecordsList: TOIMPersistRecords<TKey, TEntity>[] = [];
    public readonly writtenPersistRecordsDeltas: TOIMPersistRecordsDelta<TKey, TEntity>[] = [];
    public readonly backendLog: string[] = [];
    public commitCount = 0;
    private isRecordsStored = false;
    private failingCommitCount = 0;
    private isGateOpen = true;
    private readonly gateOpenedListeners: (() => void)[] = [];

    public constructor(testPersistBackendOptions: { readonly serializeValue?: ((value: unknown) => string) | undefined } = {}) {
        this.serializeValue = testPersistBackendOptions.serializeValue ?? (value => JSON.stringify(value));
    }

    public createWriteBatch(): OIMTestPersistWriteBatch<TKey, TEntity> {
        return new OIMTestPersistWriteBatch({ testPersistBackend: this });
    }

    public createSnapshotStrategy<TSnapshot>(testPersistSnapshotStrategyOptions: {
        readonly storageKey: string;
        readonly storedSnapshot?: TSnapshot | undefined;
    }): OIMTestPersistSnapshotStrategy<TKey, TEntity, TSnapshot> {
        return new OIMTestPersistSnapshotStrategy<TKey, TEntity, TSnapshot>({
            testPersistBackend: this,
            storageKey: testPersistSnapshotStrategyOptions.storageKey,
            storedSnapshot: testPersistSnapshotStrategyOptions.storedSnapshot,
        });
    }

    public createRecordsStrategy(): IOIMPersistRecordsStrategy<
        OIMTestPersistBackend<TKey, TEntity>, OIMTestPersistWriteBatch<TKey, TEntity>, TKey, TEntity
    > {
        return {
            readRecords: testPersistBackend => testPersistBackend.readStoredRecords(),
            readRecordsOfKeys: (_testPersistBackend, keys) => {
                const records: { key: TKey; entity: TEntity }[] = [];
                for (const key of keys) {
                    const entity = this.entityByKey.get(key);
                    if (entity !== undefined) records.push({ key, entity: { ...entity } });
                }
                return Promise.resolve({ records });
            },
            writeRecords: (testPersistWriteBatch, persistRecords) => {
                const storedPersistRecords = {
                    records: persistRecords.records.map(persistRecord => ({ key: persistRecord.key, entity: { ...persistRecord.entity } })),
                };
                testPersistWriteBatch.addBackendWrite(() => () => {
                    this.writtenPersistRecordsList.push(persistRecords);
                    this.storeRecords(storedPersistRecords);
                });
            },
            writeRecordsDelta: (testPersistWriteBatch, persistRecordsDelta) => {
                const writtenPersistRecordsDelta: TOIMPersistRecordsDelta<TKey, TEntity> = {
                    upserts: persistRecordsDelta.upserts.map(persistRecord => ({ key: persistRecord.key, entity: persistRecord.entity })),
                    deletedKeys: [...persistRecordsDelta.deletedKeys],
                };
                const storedUpserts = persistRecordsDelta.upserts.map(persistRecord => ({
                    key: persistRecord.key, entity: { ...persistRecord.entity },
                }));
                testPersistWriteBatch.addBackendWrite(() => () => {
                    this.writtenPersistRecordsDeltas.push(writtenPersistRecordsDelta);
                    for (const persistRecord of storedUpserts) this.entityByKey.set(persistRecord.key, persistRecord.entity);
                    for (const key of writtenPersistRecordsDelta.deletedKeys) this.entityByKey.delete(key);
                    this.isRecordsStored = true;
                });
            },
            deleteRecords: testPersistWriteBatch => {
                testPersistWriteBatch.addBackendWrite(() => () => {
                    this.entityByKey.clear();
                    this.isRecordsStored = false;
                });
            },
        };
    }

    public storeRecords(persistRecords: TOIMPersistRecords<TKey, TEntity>): void {
        this.entityByKey.clear();
        for (const persistRecord of persistRecords.records) this.entityByKey.set(persistRecord.key, { ...persistRecord.entity });
        this.isRecordsStored = true;
    }

    public async readStoredRecords(): Promise<TOIMPersistRecords<TKey, TEntity> | undefined> {
        await this.passReadGate();
        if (!this.isRecordsStored) return undefined;
        return { records: this.readStoredEntities().map(([key, entity]) => ({ key, entity })) };
    }

    public readStoredEntities(): [TKey, TEntity][] {
        return Array.from(this.entityByKey, ([key, entity]): [TKey, TEntity] => [key, { ...entity }]);
    }

    public readWrittenRecordsKeys(): TKey[][] {
        return this.writtenPersistRecordsList.map(persistRecords => persistRecords.records.map(persistRecord => persistRecord.key).sort());
    }

    public readWrittenDeltaKeys(): TKey[][] {
        return this.writtenPersistRecordsDeltas.map(persistRecordsDelta => [
            ...persistRecordsDelta.upserts.map(persistRecord => persistRecord.key),
            ...persistRecordsDelta.deletedKeys,
        ].sort());
    }

    public readWrittenDeltaUpsertAndDeletedKeys(): { upserts: TKey[]; deletedKeys: TKey[] }[] {
        return this.writtenPersistRecordsDeltas.map(persistRecordsDelta => ({
            upserts: persistRecordsDelta.upserts.map(persistRecord => persistRecord.key).sort(),
            deletedKeys: [...persistRecordsDelta.deletedKeys].sort(),
        }));
    }

    public failNextCommits(failingCommitCount: number): void {
        this.failingCommitCount = failingCommitCount;
    }

    public closeGate(): void {
        this.isGateOpen = false;
    }

    public openGate(): void {
        this.isGateOpen = true;
        for (const onGateOpened of this.gateOpenedListeners.splice(0)) onGateOpened();
    }

    public async passReadGate(): Promise<void> {
        this.backendLog.push('read:start');
        await this.waitForOpenGate();
        this.backendLog.push('read:end');
    }

    public async commitBackendWrites(label: string, backendWritePreparers: readonly (() => () => void)[]): Promise<void> {
        this.commitCount++;
        this.backendLog.push(`${label}:start`);
        const backendWriteAppliers = backendWritePreparers.map(prepareBackendWrite => prepareBackendWrite());
        await this.waitForOpenGate();
        await Promise.resolve();
        if (this.failingCommitCount > 0) {
            this.failingCommitCount--;
            throw new Error('write failed');
        }
        for (const applyBackendWrite of backendWriteAppliers) applyBackendWrite();
        this.backendLog.push(`${label}:end`);
    }

    private waitForOpenGate(): Promise<void> {
        if (this.isGateOpen) return Promise.resolve();
        return new Promise<void>(resolve => { this.gateOpenedListeners.push(resolve); });
    }
}
