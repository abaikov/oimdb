import { OIMEffectService } from '@oimdb/core';
import type {
    IOIMChannelMap, TOIMBucketSlot, TOIMDefaultSlotStore, TOIMDisposer, TOIMEffect, TOIMEntitySlot, TOIMSlot, TOIMStoreKey,
    TOIMStoreSlot,
} from '@oimdb/core';
import type { IOIMPersistRecordSource } from './interfaces/IOIMPersistRecordSource';
import type { IOIMPersistSourceChangeMark } from './interfaces/IOIMPersistSourceChangeMark';
import { OIMPersistRestoredEntities } from './OIMPersistRestoredEntities';
import { OIMPersistSourceChangeMarkSlotDriven } from './OIMPersistSourceChangeMarkSlotDriven';
import type { TOIMPersistEntityCollectionService } from './types/TOIMPersistEntityCollectionService';
import type { TOIMPersistRecords } from './types/TOIMPersistRecords';
import type { TOIMPersistRecordsDelta } from './types/TOIMPersistRecordsDelta';
import type { TOIMPersistRecordSourceBucketDrivenOptions } from './types/TOIMPersistRecordSourceBucketDrivenOptions';
import { oimAssertOneChannel } from './utils/oimAssertOneChannel';
import { oimFindEntitySlotsByKeys } from './utils/oimFindEntitySlotsByKeys';
import { oimUpsertPersistRecords } from './utils/oimUpsertPersistRecords';
import { oimReadRecordsDeltaOfEntitySlots } from './utils/oimReadRecordsDeltaOfEntitySlots';
import { oimReadRecordsOfEntitySlots } from './utils/oimReadRecordsOfEntitySlots';

type TOIMBucketMemberSlotEffect = {
    readonly effect: TOIMEffect;
    seenInSyncPass: number;
};

export class OIMPersistRecordSourceBucketDriven<
    TKey extends TOIMStoreKey, TEntity extends object, TSlots, TBucketKey,
    TEntityStore = TOIMDefaultSlotStore<TKey, TOIMEntitySlot<TEntity, TKey>>,
> implements IOIMPersistRecordSource<TKey, TEntity> {
    private readonly channelMap: IOIMChannelMap;
    private readonly entityCollectionService: TOIMPersistEntityCollectionService<TKey, TEntity, TEntityStore>;
    private readonly entityStoreSlot: TOIMStoreSlot<TEntityStore, TOIMEntitySlot<TEntity, TKey>, Partial<TEntity>>;
    private readonly slotContentBucketService:
        TOIMPersistRecordSourceBucketDrivenOptions<TKey, TEntity, TSlots, TBucketKey, TEntityStore>['slotContentBucketService'];
    private readonly bucketSlot: TOIMBucketSlot<TSlots, TBucketKey>;
    private readonly persistRestoredEntities = new OIMPersistRestoredEntities<TKey, TEntity>();
    private readonly entitySlotChangedListeners = new Set<(entitySlot: TOIMEntitySlot<TEntity, TKey>) => void>();
    private readonly bucketMemberSlotEffectByEntitySlot = new Map<TOIMEntitySlot<TEntity, TKey>, TOIMBucketMemberSlotEffect>();
    private bucketEffect: TOIMEffect | undefined = undefined;
    private syncPass = 0;

    private readonly syncBucketMemberSlotEffects = (): void => {
        const syncPass = ++this.syncPass;
        const bucketMemberSlotEffectByEntitySlot = this.bucketMemberSlotEffectByEntitySlot;
        for (const entitySlot of this.readBucketMemberSlots()) {
            const bucketMemberSlotEffect = bucketMemberSlotEffectByEntitySlot.get(entitySlot);
            if (bucketMemberSlotEffect !== undefined) {
                bucketMemberSlotEffect.seenInSyncPass = syncPass;
                continue;
            }
            const effect = OIMEffectService.INSTANCE.createEffect(this.channelMap, [entitySlot], [], () => {
                if (this.persistRestoredEntities.isRestoredEntity(entitySlot.key, entitySlot.entity)) return;
                this.notifyEntitySlotChangedListeners(entitySlot);
            });
            bucketMemberSlotEffectByEntitySlot.set(entitySlot, { effect, seenInSyncPass: syncPass });
            if (this.persistRestoredEntities.isRestoredEntity(entitySlot.key, entitySlot.entity)) continue;
            this.notifyEntitySlotChangedListeners(entitySlot);
        }
        for (const [entitySlot, bucketMemberSlotEffect] of bucketMemberSlotEffectByEntitySlot) {
            if (bucketMemberSlotEffect.seenInSyncPass === syncPass) continue;
            bucketMemberSlotEffectByEntitySlot.delete(entitySlot);
            try {
                if (!this.persistRestoredEntities.takeRestoredDeletion(entitySlot.key)) this.notifyEntitySlotChangedListeners(entitySlot);
            } finally {
                OIMEffectService.INSTANCE.disposeEffect(bucketMemberSlotEffect.effect);
            }
        }
    };

    public constructor(
        persistRecordSourceBucketDrivenOptions: TOIMPersistRecordSourceBucketDrivenOptions<
            TKey, TEntity, TSlots, TBucketKey, TEntityStore
        >,
    ) {
        this.channelMap = persistRecordSourceBucketDrivenOptions.channelMap;
        this.entityCollectionService = persistRecordSourceBucketDrivenOptions.entityCollectionService;
        this.entityStoreSlot = persistRecordSourceBucketDrivenOptions.entityStoreSlot;
        this.slotContentBucketService = persistRecordSourceBucketDrivenOptions.slotContentBucketService;
        this.bucketSlot = persistRecordSourceBucketDrivenOptions.bucketSlot;
        oimAssertOneChannel(this.channelMap, this.entityStoreSlot, 'OIMPersistRecordSourceBucketDriven');
        oimAssertOneChannel(this.channelMap, this.bucketSlot.storeSlot, 'OIMPersistRecordSourceBucketDriven');
    }

    public readSnapshot(): TOIMPersistRecords<TKey, TEntity> {
        return oimReadRecordsOfEntitySlots<TKey, TEntity>(this.readBucketMemberSlots());
    }

    public writeSnapshot(persistRecords: TOIMPersistRecords<TKey, TEntity>): void {
        const records = persistRecords.records;
        for (let i = 0; i < records.length; i++) {
            this.persistRestoredEntities.rememberRestoredEntity(records[i].key, records[i].entity);
        }
        const restoredEntitySlots = this.entityCollectionService.slotContentService.upsertEntities(
            this.entityStoreSlot, records.map(record => record.entity),
        );
        this.slotContentBucketService.writeBucketMemberSlots(this.bucketSlot, restoredEntitySlots);
    }

    public subscribeSnapshotChanged(onSnapshotChanged: () => void): TOIMDisposer {
        return this.subscribeEntitySlotChanged(() => { onSnapshotChanged(); });
    }

    public subscribeEntitySlotChanged(
        onEntitySlotChanged: (entitySlot: TOIMEntitySlot<TEntity, TKey>) => void,
    ): TOIMDisposer {
        const entitySlotChangedListeners = this.entitySlotChangedListeners;
        entitySlotChangedListeners.add(onEntitySlotChanged);
        if (this.bucketEffect === undefined) {
            try {
                this.syncBucketMemberSlotEffects();
                this.bucketEffect = OIMEffectService.INSTANCE.createEffect(
                    this.channelMap, [this.bucketSlot], [], this.syncBucketMemberSlotEffects,
                );
            } catch (error) {
                entitySlotChangedListeners.delete(onEntitySlotChanged);
                this.disposeBucketMemberSlotEffects();
                throw error;
            }
        } else {
            for (const entitySlot of this.bucketMemberSlotEffectByEntitySlot.keys()) {
                if (this.persistRestoredEntities.isRestoredEntity(entitySlot.key, entitySlot.entity)) continue;
                onEntitySlotChanged(entitySlot);
            }
        }
        return () => {
            if (!entitySlotChangedListeners.delete(onEntitySlotChanged)) return;
            if (entitySlotChangedListeners.size === 0) this.disposeBucketAndMemberSlotEffects();
        };
    }

    public markSourceChanges(): IOIMPersistSourceChangeMark {
        const slots: TOIMSlot[] = [this.bucketSlot];
        for (const entitySlot of this.readBucketMemberSlots()) slots.push(entitySlot);
        return new OIMPersistSourceChangeMarkSlotDriven({ channelClock: this.channelMap.defaultChannelSlot.clock, slots });
    }

    public markEntitySlotChanges(entitySlots: Iterable<TOIMEntitySlot<TEntity, TKey>>): IOIMPersistSourceChangeMark {
        return new OIMPersistSourceChangeMarkSlotDriven({ channelClock: this.channelMap.defaultChannelSlot.clock, slots: entitySlots });
    }

    public readRecordsDelta(
        entitySlots: ReadonlySet<TOIMEntitySlot<TEntity, TKey>>,
    ): TOIMPersistRecordsDelta<TKey, TEntity> {
        return oimReadRecordsDeltaOfEntitySlots(
            entitySlots, this.bucketEffect !== undefined ? this.hasBucketMemberSlotEffect : this.isBucketMemberSlot,
        );
    }

    public findEntitySlotsByKeys(keys: readonly TKey[]): ReadonlySet<TOIMEntitySlot<TEntity, TKey>> {
        return oimFindEntitySlotsByKeys(this.entityCollectionService, this.entityStoreSlot, keys);
    }

    public loadRecords(persistRecords: TOIMPersistRecords<TKey, TEntity>): void {
        const records = persistRecords.records;
        for (let i = 0; i < records.length; i++) {
            this.persistRestoredEntities.rememberRestoredEntity(records[i].key, records[i].entity);
        }
        const loadedEntitySlots = oimUpsertPersistRecords(this.entityCollectionService, this.entityStoreSlot, records)
            .filter(entitySlot => !this.isBucketMemberSlot(entitySlot));
        if (loadedEntitySlots.length !== 0) this.slotContentBucketService.addBucketMemberSlots(this.bucketSlot, loadedEntitySlots);
    }

    public unloadKeys(keys: readonly TKey[]): void {
        const entitySlots = this.findEntitySlotsByKeys(keys);
        for (const entitySlot of entitySlots) {
            if (this.isBucketMemberSlot(entitySlot)) this.persistRestoredEntities.rememberRestoredEntity(entitySlot.key, undefined);
        }
        if (entitySlots.size === 0) return;
        this.entityCollectionService.slotContentService.deleteEntities(this.entityStoreSlot, Array.from(entitySlots));
    }

    private readonly isBucketMemberSlot = (entitySlot: TOIMEntitySlot<TEntity, TKey>): boolean =>
        this.slotContentBucketService.hasBucketMemberSlot(this.bucketSlot, entitySlot);

    private readonly hasBucketMemberSlotEffect = (entitySlot: TOIMEntitySlot<TEntity, TKey>): boolean =>
        this.bucketMemberSlotEffectByEntitySlot.has(entitySlot);

    private readBucketMemberSlots(): Iterable<TOIMEntitySlot<TEntity, TKey>> {
        return this.slotContentBucketService.getBucketMemberSlots(this.bucketSlot);
    }

    private notifyEntitySlotChangedListeners(entitySlot: TOIMEntitySlot<TEntity, TKey>): void {
        for (const onEntitySlotChanged of this.entitySlotChangedListeners) onEntitySlotChanged(entitySlot);
    }

    private disposeBucketAndMemberSlotEffects(): void {
        const bucketEffect = this.bucketEffect;
        if (bucketEffect === undefined) return;
        this.bucketEffect = undefined;
        OIMEffectService.INSTANCE.disposeEffect(bucketEffect);
        this.disposeBucketMemberSlotEffects();
    }

    private disposeBucketMemberSlotEffects(): void {
        for (const bucketMemberSlotEffect of this.bucketMemberSlotEffectByEntitySlot.values()) {
            OIMEffectService.INSTANCE.disposeEffect(bucketMemberSlotEffect.effect);
        }
        this.bucketMemberSlotEffectByEntitySlot.clear();
    }
}
