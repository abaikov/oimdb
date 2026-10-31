import type { TOIMEntitySlot } from '@oimdb/core';

export class OIMSortedEntityIndex<
    TEntity extends object, TKey extends NonNullable<unknown>,
    TSortedComputedService extends {
        computedCollectionService: { getSlotByKey(storeSlot: TSortedStoreSlot, key: TKey): { readonly value: readonly TOIMEntitySlot<TEntity>[] } };
    },
    TSortedStoreSlot,
> {
    public constructor(
        public readonly sortedComputedService: TSortedComputedService,
        public readonly sortedStoreSlot: TSortedStoreSlot,
    ) {}

    public getEntitiesByKey(key: TKey): TEntity[] {
        const entities: TEntity[] = [];
        for (const entitySlot of this.sortedComputedService.computedCollectionService.getSlotByKey(this.sortedStoreSlot, key).value) {
            const entity = entitySlot.entity;
            if (entity !== undefined) entities.push(entity);
        }
        return entities;
    }

    public getSlotByKey(key: TKey): ReturnType<TSortedComputedService['computedCollectionService']['getSlotByKey']> {
        return this.sortedComputedService.computedCollectionService.getSlotByKey(this.sortedStoreSlot, key) as ReturnType<TSortedComputedService['computedCollectionService']['getSlotByKey']>;
    }
}
