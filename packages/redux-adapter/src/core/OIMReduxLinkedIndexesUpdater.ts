import type { TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';
import type { TOIMReduxLinkedIndex } from '../types/TOIMReduxLinkedIndex';

export class OIMReduxLinkedIndexesUpdater<TEntity extends object> {
    public constructor(private readonly keyOf: (entity: TEntity) => TOIMStoreKey) {}

    public updateLinkedIndexesForEntities<TLinkedEntity extends object, TBucketStore, TLinkedEntityStore>(
        linkedIndexes: ReadonlyArray<TOIMReduxLinkedIndex<TEntity, TLinkedEntity, TBucketStore, TLinkedEntityStore>>,
        updatedEntities: readonly TEntity[]
    ): void {
        if (linkedIndexes.length === 0) return;

        for (let i = 0; i < updatedEntities.length; i++) {
            const entity = updatedEntities[i];
            const storeKey = this.keyOf(entity);

            for (let j = 0; j < linkedIndexes.length; j++) {
                const linkedIndex = linkedIndexes[j];
                const rowPks = entity[linkedIndex.fieldName] as unknown as
                    | readonly TOIMStoreKey[]
                    | undefined;
                const linkedEntitySlots: TOIMEntitySlot<TLinkedEntity, TOIMStoreKey>[] = [];
                for (const linkedStoreKey of rowPks ?? []) {
                    linkedEntitySlots.push(
                        linkedIndex.linkedEntityService.getSlotByKey(linkedIndex.linkedEntityStoreSlot, linkedStoreKey),
                    );
                }
                const bucketService = linkedIndex.bucketService;
                bucketService.slotContentService.writeBucketMemberSlots(
                    bucketService.getSlotByKey(linkedIndex.bucketStoreSlot, storeKey), linkedEntitySlots,
                );
            }
        }
    }

    /**
     * Keys and not entities, because a removed entity is gone from the state the
     * caller holds. They must come from the runtime's own slots or from `keyOf`,
     * never from a record's stringified key.
     */
    public removeLinkedIndexesByKeys<TLinkedEntity extends object, TBucketStore, TLinkedEntityStore>(
        linkedIndexes: ReadonlyArray<TOIMReduxLinkedIndex<TEntity, TLinkedEntity, TBucketStore, TLinkedEntityStore>>,
        removedPks: readonly TOIMStoreKey[]
    ): void {
        if (linkedIndexes.length === 0 || removedPks.length === 0) return;

        for (let i = 0; i < removedPks.length; i++) {
            const storeKey = removedPks[i];
            for (let j = 0; j < linkedIndexes.length; j++) {
                const linkedIndex = linkedIndexes[j];
                const bucketService = linkedIndex.bucketService;
                bucketService.slotContentService.writeBucketMemberSlots(bucketService.getSlotByKey(linkedIndex.bucketStoreSlot, storeKey), []);
            }
        }
    }
}
