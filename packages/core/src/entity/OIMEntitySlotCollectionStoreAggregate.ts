import type { TOIMStoreKey } from '../store/types/TOIMStoreKey';
import type { TOIMEntitySlot } from './types/TOIMEntitySlot';
import type { TOIMEntityColumnName } from './types/TOIMEntityColumnName';
import type { OIMEntityContentService } from './OIMEntityContentService';
import type { OIMWritableSlotCollectionService } from '../slot/OIMWritableSlotCollectionService';
import { OIMWritableSlotCollectionStoreAggregate } from '../slot/OIMWritableSlotCollectionStoreAggregate';
import { OIMSlotCollectionBucketService } from '../bucket/OIMSlotCollectionBucketService';
import { oimGetBucketMemberSlotEntities } from '../bucket/utils/oimGetBucketMemberSlotEntities';

export class OIMEntitySlotCollectionStoreAggregate<TEntity extends object, TColumnName extends TOIMEntityColumnName<TEntity> = TOIMEntityColumnName<TEntity>>
    extends OIMWritableSlotCollectionStoreAggregate<
        TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey, TColumnName>, Map<TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey, TColumnName>>, TEntity, Partial<TEntity>,
        OIMWritableSlotCollectionService<
            TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey, TColumnName>, Map<TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey, TColumnName>>, TEntity,
            OIMEntityContentService<TEntity, TOIMStoreKey, TColumnName>
        >
    > {
    public getEntities(): TEntity[] {
        return oimGetBucketMemberSlotEntities(OIMSlotCollectionBucketService.INSTANCE.getBucketSlot(this.storeSlot).getBucketMemberSlots());
    }

    public getEntityCount(): number {
        return OIMSlotCollectionBucketService.INSTANCE.getBucketSlot(this.storeSlot).getBucketMemberSlotCount();
    }
}
