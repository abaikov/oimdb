import type { IOIMSlotReleasePolicy } from '../../../engine/collector/interfaces/IOIMSlotReleasePolicy';
import type { OIMPushColumnSlotOwner } from '../../../engine/column/OIMPushColumnSlotOwner';
import type { TOIMColumnSlot } from '../../../engine/column/types/TOIMColumnSlot';
import type { TOIMComputedColumnSlot } from '../../../engine/column/types/TOIMComputedColumnSlot';
import type { TOIMBucketSlot } from '../../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMComputedSlot } from '../../../engine/computed/types/TOIMComputedSlot';
import type { IOIMStoreSlotListener } from '../../../engine/slot/interfaces/IOIMStoreSlotListener';
import type { TOIMSlot } from '../../../engine/slot/types/TOIMSlot';
import type { IOIMSlotStoreService } from '../../../engine/store/interfaces/IOIMSlotStoreService';
import type { OIMSlotContentBucketService } from '../../bucket/OIMSlotContentBucketService';
import type { OIMSlotCollectionService } from '../../slot/OIMSlotCollectionService';

export type TOIMBucketMemoComputedServiceOptions<TKey extends NonNullable<unknown>, TBucketMemberSlot extends TOIMSlot, TSlots, TBucketStore, TComputedStore> = {
    bucketCollectionService: OIMSlotCollectionService<
        TKey, TOIMBucketSlot<TSlots, TKey>, TBucketStore, OIMSlotContentBucketService<TBucketMemberSlot, TSlots>,
        string, TOIMColumnSlot, OIMPushColumnSlotOwner, readonly TBucketMemberSlot[]
    >;
    computedSlotStoreService: IOIMSlotStoreService<TKey, TOIMComputedSlot<readonly TBucketMemberSlot[], TKey>, TComputedStore>;
    columnSlotStoreService: IOIMSlotStoreService<string, TOIMComputedColumnSlot>;
    slotReleasePolicy: IOIMSlotReleasePolicy;
    storeSlotListener: IOIMStoreSlotListener;
};
