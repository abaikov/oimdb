import type { IOIMSlotSubscriptionListener } from '../../slot/interfaces/IOIMSlotSubscriptionListener';
import type { TOIMColumnSlotOwnerOptions } from '../../column/types/TOIMColumnSlotOwnerOptions';
import type { IOIMSlotReleasePolicy } from '../../collector/interfaces/IOIMSlotReleasePolicy';
import type { OIMPushColumnSlotOwner } from '../../column/OIMPushColumnSlotOwner';
import type { TOIMColumnSlot } from '../../column/types/TOIMColumnSlot';
import type { TOIMComputedColumnSlot } from '../../column/types/TOIMComputedColumnSlot';
import type { TOIMBucketSlot } from '../../bucket/types/TOIMBucketSlot';
import type { TOIMComputedSlot } from './TOIMComputedSlot';
import type { IOIMStoreSlotListener } from '../../slot/interfaces/IOIMStoreSlotListener';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { IOIMSlotStoreService } from '../../store/interfaces/IOIMSlotStoreService';
import type { OIMBucketContentService } from '../../bucket/OIMBucketContentService';
import type { OIMSlotCollectionService } from '../../slot/OIMSlotCollectionService';

export type TOIMBucketMemoComputedServiceOptions<TKey extends NonNullable<unknown>, TBucketMemberSlot extends TOIMSlot, TSlots, TBucketStore, TComputedStore> = {
    bucketCollectionService: OIMSlotCollectionService<
        TKey, TOIMBucketSlot<TSlots, TKey>, TBucketStore, OIMBucketContentService<TBucketMemberSlot, TSlots>,
        string, TOIMColumnSlot, OIMPushColumnSlotOwner, readonly TBucketMemberSlot[]
    >;
    slotStoreService: IOIMSlotStoreService<TKey, TOIMComputedSlot<readonly TBucketMemberSlot[], TKey>, TComputedStore>;
    columnSlotOwnerOptions: TOIMColumnSlotOwnerOptions<TOIMComputedColumnSlot, string>;
    slotSubscriptionListener?: IOIMSlotSubscriptionListener | undefined;
    slotReleasePolicy: IOIMSlotReleasePolicy;
    storeSlotListener: IOIMStoreSlotListener;
};
