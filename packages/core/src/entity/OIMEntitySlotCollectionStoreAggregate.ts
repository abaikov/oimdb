import type { TOIMStoreKey } from '../store/types/TOIMStoreKey';
import type { TOIMEntitySlot } from './types/TOIMEntitySlot';
import type { TOIMColumnName } from '../column/types/TOIMColumnName';
import type { OIMEntityContentService } from './OIMEntityContentService';
import type { OIMWritableSlotCollectionService } from '../slot/OIMWritableSlotCollectionService';
import { OIMWritableSlotCollectionStoreAggregate } from '../slot/OIMWritableSlotCollectionStoreAggregate';
import { OIMSlotCollectionBucketService } from '../bucket/OIMSlotCollectionBucketService';
import { getOIMBucketMemberSlotEntities } from '../bucket/utils/getOIMBucketMemberSlotEntities';

export class OIMEntitySlotCollectionStoreAggregate<TEntity extends object, TColumnName extends TOIMColumnName<TEntity> = TOIMColumnName<TEntity>>
    extends OIMWritableSlotCollectionStoreAggregate<
        TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey, TColumnName>, Map<TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey, TColumnName>>, TEntity, Partial<TEntity>,
        OIMWritableSlotCollectionService<
            TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey, TColumnName>, Map<TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey, TColumnName>>, TEntity,
            OIMEntityContentService<TEntity, TOIMStoreKey, TColumnName>
        >
    > {
    public getEntities(): TEntity[] {
        return getOIMBucketMemberSlotEntities(OIMSlotCollectionBucketService.INSTANCE.getBucketSlot(this.storeSlot).getBucketMemberSlots());
    }

    public getEntityCount(): number {
        return OIMSlotCollectionBucketService.INSTANCE.getBucketSlot(this.storeSlot).getBucketMemberSlotCount();
    }
}
