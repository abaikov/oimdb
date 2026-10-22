import type { TOIMEntitySlot } from '@oimdb/core';
import type { TOIMPersistHydrateReconcile } from '../reconcile/types/TOIMPersistHydrateReconcile';
import type { IOIMPersistRecordSource } from '../source/interfaces/IOIMPersistRecordSource';
import type { IOIMPersistSourceChangeMark } from '../source/interfaces/IOIMPersistSourceChangeMark';
import type { TOIMPersistRecords } from '../source/types/TOIMPersistRecords';
import type { IOIMPersistRecordsStrategy } from '../strategy/interfaces/IOIMPersistRecordsStrategy';
import type { IOIMPersistResource } from './interfaces/IOIMPersistResource';
import { OIMPersistSourceSilencer } from './OIMPersistSourceSilencer';
import { OIMPersistSourceSubscription } from './OIMPersistSourceSubscription';
import type { TOIMPersistResourceRecordsOptions } from './types/TOIMPersistResourceRecordsOptions';
import { oimHydratePersistResource } from './utils/oimHydratePersistResource';

export class OIMPersistResourceRecords<TPersistBackend, TWriteBatch, TKey, TEntity extends object>
implements IOIMPersistResource<TPersistBackend, TWriteBatch> {
    private readonly persistRecordSource: IOIMPersistRecordSource<TKey, TEntity>;
    private readonly persistRecordsStrategy: IOIMPersistRecordsStrategy<TPersistBackend, TWriteBatch, TKey, TEntity>;
    private readonly persistHydrateReconcile: TOIMPersistHydrateReconcile<TOIMPersistRecords<TKey, TEntity>> | undefined;
    private readonly persistSourceSilencer = new OIMPersistSourceSilencer();
    private readonly persistSourceSubscription = new OIMPersistSourceSubscription();
    private pendingEntitySlots = new Set<TOIMEntitySlot<TEntity, TKey>>();
    private inFlightEntitySlots = new Set<TOIMEntitySlot<TEntity, TKey>>();
    private readonly unloadedKeys = new Set<TKey>();
    private writtenEntitySlots: ReadonlySet<TOIMEntitySlot<TEntity, TKey>> = new Set();
    private writtenKeysChangeMark: IOIMPersistSourceChangeMark | undefined = undefined;

    public constructor(
        persistResourceRecordsOptions: TOIMPersistResourceRecordsOptions<TPersistBackend, TWriteBatch, TKey, TEntity>,
    ) {
        this.persistRecordSource = persistResourceRecordsOptions.persistRecordSource;
        this.persistRecordsStrategy = persistResourceRecordsOptions.persistRecordsStrategy;
        this.persistHydrateReconcile = persistResourceRecordsOptions.persistHydrateReconcile;
    }

    public start(onPersistResourceDirty: () => void): void {
        this.persistSourceSubscription.subscribeSource(() => this.persistRecordSource.subscribeEntitySlotChanged(entitySlot => {
            if (this.persistSourceSilencer.isSourceSilenced) return;
            this.addPendingEntitySlot(entitySlot);
            onPersistResourceDirty();
        }));
    }

    public stop(): void {
        this.persistSourceSubscription.unsubscribeSource();
    }

    public hasPendingWrite(): boolean {
        return this.pendingEntitySlots.size !== 0;
    }

    public writePendingWrite(writeBatch: TWriteBatch): void {
        const pendingEntitySlots = this.pendingEntitySlots;
        this.pendingEntitySlots = this.inFlightEntitySlots;
        this.inFlightEntitySlots = pendingEntitySlots;
        this.persistRecordsStrategy.writeRecordsDelta(writeBatch, this.persistRecordSource.readRecordsDelta(pendingEntitySlots));
    }

    public writeEverything(writeBatch: TWriteBatch): void {
        this.movePendingIntoInFlight();
        const persistRecords = this.persistRecordSource.readSnapshot();
        if (this.unloadedKeys.size === 0) {
            this.persistRecordsStrategy.writeRecords(writeBatch, persistRecords);
            return;
        }
        this.persistRecordsStrategy.writeRecordsDelta(writeBatch, {
            upserts: persistRecords.records,
            deletedKeys: this.persistRecordSource.readRecordsDelta(this.inFlightEntitySlots).deletedKeys,
        });
    }

    public hasUnwrittenChangeOfKeys(keys: readonly TKey[]): boolean {
        const keySet = new Set(keys);
        for (const entitySlot of this.pendingEntitySlots) {
            if (keySet.has(entitySlot.key)) return true;
        }
        const writtenKeysChangeMark = this.writtenKeysChangeMark;
        if (writtenKeysChangeMark !== undefined && writtenKeysChangeMark.isSourceChangedSinceMark()) return true;
        const writtenEntitySlots = this.writtenEntitySlots;
        const currentEntitySlots = this.persistRecordSource.findEntitySlotsByKeys(keys);
        if (currentEntitySlots.size !== writtenEntitySlots.size) return true;
        for (const entitySlot of currentEntitySlots) {
            if (!writtenEntitySlots.has(entitySlot)) return true;
        }
        return false;
    }

    public writeKeys(writeBatch: TWriteBatch, keys: readonly TKey[]): void {
        this.movePendingIntoInFlight();
        const persistRecordsStrategy = this.persistRecordsStrategy;
        const persistRecordSource = this.persistRecordSource;
        persistRecordsStrategy.writeRecordsDelta(writeBatch, persistRecordSource.readRecordsDelta(this.inFlightEntitySlots));
        this.disposeWrittenKeysChangeMark();
        const writtenEntitySlots = persistRecordSource.findEntitySlotsByKeys(keys);
        this.writtenEntitySlots = writtenEntitySlots;
        this.writtenKeysChangeMark = persistRecordSource.markEntitySlotChanges(writtenEntitySlots);
        persistRecordsStrategy.writeRecordsDelta(writeBatch, persistRecordSource.readRecordsDelta(writtenEntitySlots));
    }

    public disposeWrittenKeysChangeMark(): void {
        const writtenKeysChangeMark = this.writtenKeysChangeMark;
        if (writtenKeysChangeMark === undefined) return;
        this.writtenKeysChangeMark = undefined;
        this.writtenEntitySlots = new Set();
        writtenKeysChangeMark.dispose();
    }

    public deleteEverything(writeBatch: TWriteBatch): void {
        this.unloadedKeys.clear();
        this.persistRecordsStrategy.deleteRecords(writeBatch);
    }

    public onPersistWriteCommitted(): void {
        const inFlightEntitySlots = this.inFlightEntitySlots;
        if (inFlightEntitySlots.size === 0) return;
        const pendingEntitySlots = this.pendingEntitySlots;
        for (const entitySlot of inFlightEntitySlots) {
            if (!pendingEntitySlots.has(entitySlot)) entitySlot.owner.unholdSlot(entitySlot);
        }
        inFlightEntitySlots.clear();
    }

    public onPersistWriteFailed(): void {
        const inFlightEntitySlots = this.inFlightEntitySlots;
        if (inFlightEntitySlots.size === 0) return;
        const pendingEntitySlots = this.pendingEntitySlots;
        for (const entitySlot of inFlightEntitySlots) pendingEntitySlots.add(entitySlot);
        inFlightEntitySlots.clear();
    }

    public dropPendingWrite(): void {
        const pendingEntitySlots = this.pendingEntitySlots;
        for (const entitySlot of pendingEntitySlots) this.deletePendingEntitySlot(entitySlot);
    }

    public unloadKeys(keys: readonly TKey[]): void {
        const keySet = new Set(keys);
        const pendingEntitySlots = this.pendingEntitySlots;
        for (const entitySlot of pendingEntitySlots) {
            if (keySet.has(entitySlot.key)) this.deletePendingEntitySlot(entitySlot);
        }
        for (const key of keySet) this.unloadedKeys.add(key);
        this.persistSourceSilencer.changeSourceSilently(() => { this.persistRecordSource.unloadKeys(keys); });
    }

    public async loadKeys(persistBackend: TPersistBackend, keys: readonly TKey[]): Promise<void> {
        const persistRecordSource = this.persistRecordSource;
        const storedPersistRecords = await this.persistRecordsStrategy.readRecordsOfKeys(persistBackend, keys);
        const keysChangedInMemory = new Set<TKey>();
        for (const entitySlot of persistRecordSource.findEntitySlotsByKeys(keys)) {
            if (entitySlot.entity !== undefined) keysChangedInMemory.add(entitySlot.key);
        }
        for (const entitySlot of this.pendingEntitySlots) keysChangedInMemory.add(entitySlot.key);
        for (const entitySlot of this.inFlightEntitySlots) keysChangedInMemory.add(entitySlot.key);
        const records = storedPersistRecords.records.filter(record => !keysChangedInMemory.has(record.key));
        this.persistSourceSilencer.changeSourceSilently(() => { persistRecordSource.loadRecords({ records }); });
        for (let i = 0; i < keys.length; i++) this.unloadedKeys.delete(keys[i]);
    }

    public async hydrate(persistBackend: TPersistBackend): Promise<void> {
        await oimHydratePersistResource({
            persistSnapshotSource: this.persistRecordSource,
            persistSourceSilencer: this.persistSourceSilencer,
            persistHydrateReconcile: this.persistHydrateReconcile,
            readStoredSnapshot: () => this.persistRecordsStrategy.readRecords(persistBackend),
            resourceName: 'OIMPersistResourceRecords',
        });
        this.unloadedKeys.clear();
    }

    private addPendingEntitySlot(entitySlot: TOIMEntitySlot<TEntity, TKey>): void {
        const pendingEntitySlots = this.pendingEntitySlots;
        if (pendingEntitySlots.has(entitySlot)) return;
        if (!this.inFlightEntitySlots.has(entitySlot)) entitySlot.owner.holdSlot(entitySlot);
        pendingEntitySlots.add(entitySlot);
    }

    private deletePendingEntitySlot(entitySlot: TOIMEntitySlot<TEntity, TKey>): void {
        this.pendingEntitySlots.delete(entitySlot);
        if (!this.inFlightEntitySlots.has(entitySlot)) entitySlot.owner.unholdSlot(entitySlot);
    }

    private movePendingIntoInFlight(): void {
        const pendingEntitySlots = this.pendingEntitySlots;
        if (pendingEntitySlots.size === 0) return;
        const inFlightEntitySlots = this.inFlightEntitySlots;
        for (const entitySlot of pendingEntitySlots) inFlightEntitySlots.add(entitySlot);
        pendingEntitySlots.clear();
    }
}
