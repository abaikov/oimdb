import type { TOIMDefaultSlotStore, TOIMDisposer, TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot } from '@oimdb/core';
import type { IOIMPersistRecordSource } from './interfaces/IOIMPersistRecordSource';
import type { IOIMPersistSourceChangeMark } from './interfaces/IOIMPersistSourceChangeMark';
import type { OIMPersistEntityWriter } from './OIMPersistEntityWriter';
import { OIMPersistSourceChangeMarkSlotDriven } from './OIMPersistSourceChangeMarkSlotDriven';
import { OIMPersistSourceChangeMarkSubscriptionDriven } from './OIMPersistSourceChangeMarkSubscriptionDriven';
import type { TOIMPersistEntityCollectionService } from './types/TOIMPersistEntityCollectionService';
import type { TOIMPersistRecords } from './types/TOIMPersistRecords';
import type { TOIMPersistRecordsDelta } from './types/TOIMPersistRecordsDelta';
import type { TOIMPersistRecordSourceCollectionOptions } from './types/TOIMPersistRecordSourceCollectionOptions';
import { oimFindEntitySlotsByKeys } from './utils/oimFindEntitySlotsByKeys';
import { oimUpsertPersistRecords } from './utils/oimUpsertPersistRecords';
import { oimReadRecordsDeltaOfEntitySlots } from './utils/oimReadRecordsDeltaOfEntitySlots';
import { oimReadRecordsOfEntitySlots } from './utils/oimReadRecordsOfEntitySlots';

const oimIsAlwaysSourceEntitySlot = (): boolean => true;

export class OIMPersistRecordSourceCollectionWriteDriven<
    TKey extends TOIMStoreKey, TEntity extends object, TStore = TOIMDefaultSlotStore<TKey, TOIMEntitySlot<TEntity, TKey>>,
> implements IOIMPersistRecordSource<TKey, TEntity> {
    protected readonly entityCollectionService: TOIMPersistEntityCollectionService<TKey, TEntity, TStore>;
    protected readonly entityStoreSlot: TOIMStoreSlot<TStore, TOIMEntitySlot<TEntity, TKey>, Partial<TEntity>>;
    protected readonly persistEntityWriter: OIMPersistEntityWriter<TEntity, TKey>;

    public constructor(
        persistRecordSourceCollectionOptions: TOIMPersistRecordSourceCollectionOptions<TKey, TEntity, TStore>,
    ) {
        this.entityCollectionService = persistRecordSourceCollectionOptions.entityCollectionService;
        this.entityStoreSlot = persistRecordSourceCollectionOptions.entityStoreSlot;
        this.persistEntityWriter = persistRecordSourceCollectionOptions.persistEntityWriter;
    }

    public readSnapshot(): TOIMPersistRecords<TKey, TEntity> {
        return oimReadRecordsOfEntitySlots<TKey, TEntity>(this.entityCollectionService.getSlots(this.entityStoreSlot));
    }

    public writeSnapshot(persistRecords: TOIMPersistRecords<TKey, TEntity>): void {
        const entityCollectionService = this.entityCollectionService;
        const slotContentEntityService = entityCollectionService.slotContentService;
        const entityStoreSlot = this.entityStoreSlot;
        const restoredEntitySlots = new Set<TOIMEntitySlot<TEntity, TKey>>(
            slotContentEntityService.upsertEntities(entityStoreSlot, persistRecords.records.map(record => record.entity)),
        );
        const entitySlots = Array.from(entityCollectionService.getSlots(entityStoreSlot));
        for (let i = 0; i < entitySlots.length; i++) {
            const entitySlot = entitySlots[i];
            if (entitySlot.entity !== undefined && !restoredEntitySlots.has(entitySlot)) slotContentEntityService.deleteEntity(entitySlot);
        }
    }

    public subscribeSnapshotChanged(onSnapshotChanged: () => void): TOIMDisposer {
        return this.subscribeEntitySlotChanged(() => { onSnapshotChanged(); });
    }

    public subscribeEntitySlotChanged(
        onEntitySlotChanged: (entitySlot: TOIMEntitySlot<TEntity, TKey>) => void,
    ): TOIMDisposer {
        const entityStoreSlot = this.entityStoreSlot;
        return this.persistEntityWriter.subscribeEntitySlotWritten(entitySlot => {
            if (entitySlot.storeSlot === entityStoreSlot) onEntitySlotChanged(entitySlot);
        });
    }

    public markEntitySlotChanges(entitySlots: Iterable<TOIMEntitySlot<TEntity, TKey>>): IOIMPersistSourceChangeMark {
        return new OIMPersistSourceChangeMarkSlotDriven({
            channelClock: this.entityStoreSlot.channelSlot.clock, slots: entitySlots,
        });
    }

    public markSourceChanges(): IOIMPersistSourceChangeMark {
        return new OIMPersistSourceChangeMarkSubscriptionDriven({
            subscribeSourceChanged: onSourceChanged => this.subscribeEntitySlotChanged(() => { onSourceChanged(); }),
        });
    }

    public readRecordsDelta(
        entitySlots: ReadonlySet<TOIMEntitySlot<TEntity, TKey>>,
    ): TOIMPersistRecordsDelta<TKey, TEntity> {
        return oimReadRecordsDeltaOfEntitySlots(entitySlots, oimIsAlwaysSourceEntitySlot);
    }

    public findEntitySlotsByKeys(keys: readonly TKey[]): ReadonlySet<TOIMEntitySlot<TEntity, TKey>> {
        return oimFindEntitySlotsByKeys(this.entityCollectionService, this.entityStoreSlot, keys);
    }

    public loadRecords(persistRecords: TOIMPersistRecords<TKey, TEntity>): void {
        oimUpsertPersistRecords(this.entityCollectionService, this.entityStoreSlot, persistRecords.records);
    }

    public unloadKeys(keys: readonly TKey[]): void {
        const entitySlots = this.findEntitySlotsByKeys(keys);
        if (entitySlots.size === 0) return;
        this.entityCollectionService.slotContentService.deleteEntities(this.entityStoreSlot, Array.from(entitySlots));
    }
}
