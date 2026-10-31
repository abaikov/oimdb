import type { TOIMEntityContentSlot } from '@oimdb/core';

export class OIMSingleEntity<TEntity extends object> {
    public constructor(
        public readonly singleSlotStoreAggregate: { writeSingleSlotContent(entity: TEntity): TOIMEntityContentSlot<TEntity>; findSingleSlot(): TOIMEntityContentSlot<TEntity> | undefined; getSingleSlot(): TOIMEntityContentSlot<TEntity> },
    ) {}

    public upsertEntity(entity: TEntity): TOIMEntityContentSlot<TEntity> {
        return this.singleSlotStoreAggregate.writeSingleSlotContent(entity);
    }

    public updateEntity(patch: Partial<TEntity>): boolean {
        const entitySlot = this.singleSlotStoreAggregate.findSingleSlot();
        if (entitySlot === undefined || entitySlot.entity === undefined) return false;
        entitySlot.updateEntity(patch);
        return true;
    }

    public getEntity(): TEntity | undefined {
        return this.singleSlotStoreAggregate.getSingleSlot().entity;
    }

    public deleteEntity(): boolean {
        const entitySlot = this.singleSlotStoreAggregate.findSingleSlot();
        if (entitySlot === undefined || entitySlot.entity === undefined) return false;
        entitySlot.clearSlotContent();
        return true;
    }

    public getSlot(): TOIMEntityContentSlot<TEntity> {
        return this.singleSlotStoreAggregate.getSingleSlot();
    }
}
