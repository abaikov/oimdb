import { OIMEffectService } from '@oimdb/core';
import type { IOIMChannelMap, TOIMDisposer, TOIMEntitySlot, TOIMSingleSlotStoreSlot } from '@oimdb/core';
import type { IOIMPersistSnapshotSource } from './interfaces/IOIMPersistSnapshotSource';
import type { IOIMPersistSourceChangeMark } from './interfaces/IOIMPersistSourceChangeMark';
import { OIMPersistRestoredEntities } from './OIMPersistRestoredEntities';
import { OIMPersistSourceChangeMarkSlotDriven } from './OIMPersistSourceChangeMarkSlotDriven';
import type { TOIMPersistSingleEntityService } from './types/TOIMPersistSingleEntityService';
import type { TOIMPersistSnapshotSourceSingleEntityDrivenOptions } from './types/TOIMPersistSnapshotSourceSingleEntityDrivenOptions';
import { oimAssertOneChannel } from './utils/oimAssertOneChannel';

export class OIMPersistSnapshotSourceSingleEntityDriven<TEntity extends object> implements IOIMPersistSnapshotSource<TEntity> {
    private readonly channelMap: IOIMChannelMap;
    private readonly singleSlotService: TOIMPersistSingleEntityService<TEntity>;
    private readonly entityStoreSlot: TOIMSingleSlotStoreSlot<TOIMEntitySlot<TEntity, void>, Partial<TEntity>>;
    private readonly persistRestoredEntities = new OIMPersistRestoredEntities<undefined, TEntity>();

    public constructor(
        persistSnapshotSourceSingleEntityDrivenOptions: TOIMPersistSnapshotSourceSingleEntityDrivenOptions<TEntity>,
    ) {
        this.channelMap = persistSnapshotSourceSingleEntityDrivenOptions.channelMap;
        this.singleSlotService = persistSnapshotSourceSingleEntityDrivenOptions.singleSlotService;
        this.entityStoreSlot = persistSnapshotSourceSingleEntityDrivenOptions.entityStoreSlot;
        oimAssertOneChannel(this.channelMap, this.entityStoreSlot, 'OIMPersistSnapshotSourceSingleEntityDriven');
    }

    public readSnapshot(): TEntity {
        const entity = this.singleSlotService.findSingleSlot(this.entityStoreSlot)?.entity;
        if (entity === undefined) {
            throw new Error(
                'OIMPersistSnapshotSourceSingleEntityDriven.readSnapshot: the single entity holds no value. '
                + 'Upsert its entity before the persistor reads it.',
            );
        }
        return entity;
    }

    public writeSnapshot(entity: TEntity): void {
        this.persistRestoredEntities.rememberRestoredEntity(undefined, entity);
        this.singleSlotService.slotContentService.upsertEntity(this.entityStoreSlot, entity);
    }

    public subscribeSnapshotChanged(onSnapshotChanged: () => void): TOIMDisposer {
        const entitySlot = this.singleSlotService.getSingleSlot(this.entityStoreSlot);
        const persistRestoredEntities = this.persistRestoredEntities;
        const disposer = OIMEffectService.INSTANCE.subscribeEffect(this.channelMap, [entitySlot], [], () => {
            if (persistRestoredEntities.isRestoredEntity(undefined, entitySlot.entity)) return;
            onSnapshotChanged();
        });
        try {
            if (!persistRestoredEntities.isRestoredEntity(undefined, entitySlot.entity)) onSnapshotChanged();
        } catch (failure) {
            disposer();
            throw failure;
        }
        return disposer;
    }

    public markSourceChanges(): IOIMPersistSourceChangeMark {
        return new OIMPersistSourceChangeMarkSlotDriven({
            channelClock: this.channelMap.defaultChannelSlot.clock,
            slots: [this.singleSlotService.getSingleSlot(this.entityStoreSlot)],
        });
    }
}
