import type { TOIMEntitySlot } from '@oimdb/core';

export class OIMEntityIndex<
    TEntity extends object, TKey extends NonNullable<unknown>,
    TIndexStoreAggregate extends {
        getSlotByKey(key: TKey): {
            getBucketMemberSlots(): Iterable<TOIMEntitySlot<TEntity>>;
            getBucketMemberSlotCount(): number;
        };
    },
> {
    public constructor(public readonly indexStoreAggregate: TIndexStoreAggregate) {}

    public getEntitiesByKey(key: TKey): TEntity[] {
        const entities: TEntity[] = [];
        for (const entitySlot of this.indexStoreAggregate.getSlotByKey(key).getBucketMemberSlots()) {
            const entity = entitySlot.entity;
            if (entity !== undefined) entities.push(entity);
        }
        return entities;
    }

    public getEntityCountByKey(key: TKey): number {
        return this.indexStoreAggregate.getSlotByKey(key).getBucketMemberSlotCount();
    }

    public getSlotByKey(key: TKey): ReturnType<TIndexStoreAggregate['getSlotByKey']> {
        return this.indexStoreAggregate.getSlotByKey(key) as ReturnType<TIndexStoreAggregate['getSlotByKey']>;
    }
}
