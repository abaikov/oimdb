import type { OIMBucketContentService } from '../bucket/OIMBucketContentService';
import type { TOIMColumnSlot } from '../column/types/TOIMColumnSlot';
import type { TOIMBucketSlot } from '../bucket/types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../entity/types/TOIMEntitySlot';
import type { TOIMIndexStoreSlot } from './types/TOIMIndexStoreSlot';
import type { OIMSlotCollectionIndexService } from './OIMSlotCollectionIndexService';
import { OIMSlotCollectionStoreAggregate } from '../slot/OIMSlotCollectionStoreAggregate';

export class OIMSlotCollectionIndexStoreAggregate<
    TKey extends NonNullable<unknown>, TEntity extends object, TSlots, TSourceKey extends NonNullable<unknown>, TSourceStore,
    TBucketSlot extends TOIMBucketSlot<TSlots, TKey>, TStore,
    TSlotService extends OIMSlotCollectionIndexService<
        TKey, TEntity, TSlots, TSourceKey, TSourceStore, OIMBucketContentService<TOIMEntitySlot<TEntity>, TSlots, TKey>, TBucketSlot, TStore
    >,
> extends OIMSlotCollectionStoreAggregate<TKey, TBucketSlot, TStore, readonly TOIMEntitySlot<TEntity>[], TSlotService> {
    declare public readonly storeSlot: TOIMIndexStoreSlot<
        TStore, TBucketSlot, readonly TOIMEntitySlot<TEntity>[], TOIMEntitySlot<TEntity, TSourceKey>, Partial<TEntity>, TKey, TSourceStore, TSlotService
    >;

    public getEntitiesByKey(key: TKey): (TEntity | undefined)[] {
        return this.slotService.getEntitiesByKey(this.storeSlot, key);
    }

    public getSlotsByKeys(keys: readonly TKey[]): TBucketSlot[] {
        return this.slotService.getSlotsByKeys(this.storeSlot, keys);
    }

    public holdSlotsByKeys(keys: readonly TKey[]): TBucketSlot[] {
        return this.slotService.holdSlotsByKeys(this.storeSlot, keys);
    }

    public getAnyBucketColumnByKey(key: TKey): TOIMColumnSlot {
        return this.slotService.getAnyBucketColumnByKey(this.storeSlot, key);
    }

    public holdAnyBucketColumnByKey(key: TKey): TOIMColumnSlot {
        return this.slotService.holdAnyBucketColumnByKey(this.storeSlot, key);
    }

    public getBucketColumnByKey(key: TKey, columnName: string): TOIMColumnSlot {
        return this.slotService.getBucketColumnByKey(this.storeSlot, key, columnName);
    }

    public holdBucketColumnByKey(key: TKey, columnName: string): TOIMColumnSlot {
        return this.slotService.holdBucketColumnByKey(this.storeSlot, key, columnName);
    }

    public disposeIndexStoreSlot(): void {
        this.slotService.disposeIndexStoreSlot(this.storeSlot);
    }
}
