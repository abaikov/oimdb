import type { TOIMEntityColumnName, TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';
import type { createOIMEntitySlotCollectionStoreAggregate } from '@oimdb/core';

export class OIMEntityCollection<TEntity extends object, TColumnName extends TOIMEntityColumnName<TEntity> = TOIMEntityColumnName<TEntity>> {
    public constructor(
        public readonly slotCollectionStoreAggregate: ReturnType<typeof createOIMEntitySlotCollectionStoreAggregate<TEntity, TColumnName>>,
    ) {}

    public upsertEntityByKey(key: TOIMStoreKey, entity: TEntity): TOIMEntitySlot<TEntity, TOIMStoreKey> {
        return this.slotCollectionStoreAggregate.writeSlotContentByKey(key, entity);
    }

    public updateEntityByKey(key: TOIMStoreKey, patch: Partial<TEntity>): boolean {
        const entitySlot = this.slotCollectionStoreAggregate.findSlotByKey(key);
        if (entitySlot === undefined || entitySlot.entity === undefined) return false;
        entitySlot.updateEntity(patch);
        return true;
    }

    public getEntityByKey(key: TOIMStoreKey): TEntity | undefined {
        return this.slotCollectionStoreAggregate.getSlotByKey(key).entity;
    }

    public deleteEntityByKey(key: TOIMStoreKey): boolean {
        const entitySlot = this.slotCollectionStoreAggregate.findSlotByKey(key);
        if (entitySlot === undefined || entitySlot.entity === undefined) return false;
        entitySlot.clearSlotContent();
        return true;
    }

    public getSlotByKey(key: TOIMStoreKey): TOIMEntitySlot<TEntity, TOIMStoreKey> {
        return this.slotCollectionStoreAggregate.getSlotByKey(key);
    }
}
